import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type {
  CreateUrlSummaryInput,
  RetryInfo,
  SummaryJob,
  SummaryListItem,
  SummaryOptions,
} from "@l5sly/contracts";

import { AppError, NotFoundError } from "../../common/errors.js";
import { SummaryQueue } from "../jobs/summary-queue.js";
import { MediaPreparer } from "../media/media-preparer.js";
import { RETRY_MEDIA_RETENTION_MS } from "../summary-checkpoint.js";
import {
  SummaryRepository,
  type StoredSummaryJob,
} from "../summary.repository.js";
import type { UploadedMedia } from "../uploads/uploaded-media.pipe.js";
import { describeUrlSource } from "../url-source.js";
import { SummaryPipeline } from "./summary-pipeline.service.js";

@Injectable()
export class SummariesService {
  private readonly recoveryInProgress = new Set<string>();

  constructor(
    private readonly repository: SummaryRepository,
    private readonly mediaPreparer: MediaPreparer,
    private readonly queue: SummaryQueue,
    private readonly pipeline: SummaryPipeline,
    @InjectPinoLogger(SummariesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createFromUrl(input: CreateUrlSummaryInput): Promise<SummaryJob> {
    const source = describeUrlSource(input.url);
    const job = await this.repository.create({
      id: randomUUID(),
      source: { type: source.type, name: source.name, url: input.url },
      options: {
        language: input.language,
        sourceLanguage: input.sourceLanguage ?? input.language,
        viewerProfile: input.viewerProfile,
        depth: input.depth,
        expectation: input.expectation,
      },
    });
    await this.queue.enqueue(job.id);

    return this.toPublicJob(job);
  }

  async createFromUpload(
    media: UploadedMedia,
    options: SummaryOptions,
  ): Promise<SummaryJob> {
    const job = await this.repository.create({
      id: randomUUID(),
      source: { type: "upload", name: media.originalName },
      sourcePath: media.path,
      sourceMimeType: media.mimeType,
      options,
    });
    await this.queue.enqueue(job.id);

    return this.toPublicJob(job);
  }

  async findById(id: string): Promise<SummaryJob> {
    const job = await this.findStoredJob(id);
    return this.toPublicJob(job);
  }

  listRecent(limit = 30): Promise<SummaryListItem[]> {
    return this.repository.listRecent(limit);
  }

  async cancel(id: string): Promise<SummaryJob> {
    await this.findStoredJob(id);
    await this.repository.cancel(id);
    return this.findById(id);
  }

  async retry(id: string, upload?: UploadedMedia): Promise<SummaryJob> {
    this.ensureNotProcessing(
      id,
      "The previous attempt is finishing cleanup. Try again in a moment.",
    );
    this.beginRecovery(id);
    try {
      const job = await this.findStoredJob(id);
      if (job.status !== "failed") {
        throw new AppError({
          message: "Only failed jobs can be retried.",
          statusCode: 409,
          code: "JOB_NOT_FAILED",
        });
      }
      const retryInfo = await this.getRetryInfo(job);
      if (retryInfo.requiresUpload && !upload) {
        throw new AppError({
          message:
            "The temporary media is no longer available. Select the same file to retry this job.",
          statusCode: 409,
          code: "REUPLOAD_REQUIRED",
        });
      }
      if (upload && !retryInfo.requiresUpload) {
        throw new AppError({
          message: "This job already has the material needed to retry.",
          statusCode: 400,
          code: "UPLOAD_NOT_NEEDED",
        });
      }
      if (upload) {
        await this.removeJobMedia(job);
      }
      const replacementUpload = upload
        ? {
            path: upload.path,
            mimeType: upload.mimeType,
            mediaExpiresAt: new Date(
              Date.now() + RETRY_MEDIA_RETENTION_MS,
            ).toISOString(),
          }
        : undefined;
      const isRetried = await this.repository.retry(
        id,
        retryInfo.fromStep,
        replacementUpload,
      );
      if (!isRetried) {
        throw new AppError({
          message: "This job is already being retried.",
          statusCode: 409,
          code: "RETRY_CONFLICT",
        });
      }
      await this.queue.enqueue(id);
      return await this.findById(id);
    } finally {
      this.recoveryInProgress.delete(id);
    }
  }

  async delete(id: string): Promise<void> {
    this.ensureNotProcessing(
      id,
      "Wait for the current attempt to finish before deleting it.",
    );
    this.beginRecovery(id);
    try {
      const job = await this.findStoredJob(id);
      if (job.status === "queued" || job.status === "processing") {
        throw new AppError({
          message: "Cancel this job before deleting it.",
          statusCode: 409,
          code: "JOB_ACTIVE",
        });
      }
      await this.removeJobMedia(job);
      await this.repository.delete(id);
    } finally {
      this.recoveryInProgress.delete(id);
    }
  }

  async cleanupExpiredMedia(): Promise<void> {
    for (const failedJob of await this.repository.listFailed()) {
      const job = await this.repository.findById(failedJob.id);
      // A previous cleanup await may have allowed another job to be retried.
      if (
        !job ||
        job.status !== "failed" ||
        this.recoveryInProgress.has(job.id)
      )
        continue;
      const checkpoint = await this.repository.getCheckpoint(job.id);
      const expiresAt =
        checkpoint.mediaExpiresAt ??
        new Date(
          Date.parse(job.createdAt) + RETRY_MEDIA_RETENTION_MS,
        ).toISOString();
      if (Date.parse(expiresAt) > Date.now()) continue;
      this.recoveryInProgress.add(job.id);
      try {
        await this.removeJobMedia(job);
        await this.repository.saveCheckpoint(job.id, {
          ...checkpoint,
          preparedMedia: undefined,
          mediaExpiresAt: undefined,
        });
      } catch (error) {
        this.logger.warn(
          { jobId: job.id, err: error },
          "Expired retry media could not be removed",
        );
      } finally {
        this.recoveryInProgress.delete(job.id);
      }
    }
  }

  private async findStoredJob(id: string): Promise<StoredSummaryJob> {
    const job = await this.repository.findById(id);
    if (!job) {
      throw new NotFoundError(id);
    }
    return job;
  }

  private async getRetryInfo(job: StoredSummaryJob): Promise<RetryInfo> {
    const checkpoint = await this.repository.getCheckpoint(job.id);
    if (checkpoint.transcription) {
      return {
        fromStep: "summary",
        requiresUpload: false,
        reason:
          "Your transcript is saved. Retry summary generation without downloading or transcribing again.",
      };
    }
    if (
      checkpoint.preparedMedia &&
      existsSync(checkpoint.preparedMedia.path) &&
      Date.parse(checkpoint.mediaExpiresAt ?? "") > Date.now()
    ) {
      return {
        fromStep: "transcription",
        requiresUpload: false,
        reason:
          "Prepared audio is saved. Retry transcription without preparing the media again.",
      };
    }
    const expiresAt = checkpoint.mediaExpiresAt
      ? Date.parse(checkpoint.mediaExpiresAt)
      : Date.parse(job.createdAt) + RETRY_MEDIA_RETENTION_MS;
    const requiresUpload =
      job.source.type === "upload" &&
      (!job.sourcePath ||
        !existsSync(job.sourcePath) ||
        expiresAt < Date.now());
    return {
      fromStep: "media",
      requiresUpload,
      reason: requiresUpload
        ? "Temporary media is unavailable. Select the same file to retry this job."
        : "No reusable transcript is saved. This retry starts from the original source.",
    };
  }

  private async removeJobMedia(job: StoredSummaryJob): Promise<void> {
    const checkpoint = await this.repository.getCheckpoint(job.id);
    const paths = new Set<string>(
      checkpoint.preparedMedia?.additionalPaths ?? [],
    );
    if (job.sourcePath) paths.add(job.sourcePath);
    if (checkpoint.preparedMedia) paths.add(checkpoint.preparedMedia.path);
    await Promise.all(
      [...paths].map((mediaPath) => this.mediaPreparer.remove(mediaPath)),
    );
  }

  // The pipeline may still be cleaning up a job whose status already changed.
  private ensureNotProcessing(id: string, message: string): void {
    if (this.pipeline.isRunning(id)) {
      throw new AppError({ message, statusCode: 409, code: "JOB_BUSY" });
    }
  }

  private beginRecovery(id: string): void {
    if (this.recoveryInProgress.has(id)) {
      throw new AppError({
        message: "This job is already being updated. Try again in a moment.",
        statusCode: 409,
        code: "JOB_BUSY",
      });
    }
    this.recoveryInProgress.add(id);
  }

  private async toPublicJob(job: StoredSummaryJob): Promise<SummaryJob> {
    return {
      id: job.id,
      status: job.status,
      source: job.source,
      options: {
        language: job.options.language,
        sourceLanguage: job.options.sourceLanguage,
        viewerProfile: job.options.viewerProfile,
        depth: job.options.depth,
        expectation: job.options.expectation,
      },
      progress: job.progress,
      stage: job.stage,
      result: job.result,
      error: job.error,
      failedStep: job.failedStep,
      errorCode: job.errorCode,
      errorDetails: job.errorDetails,
      attempt: job.attempt,
      stageStartedAt: job.stageStartedAt,
      retryInfo:
        job.status === "failed" ? await this.getRetryInfo(job) : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
