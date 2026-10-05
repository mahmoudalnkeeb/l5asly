import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type { Logger } from "pino";

import type {
  CreateUrlSummaryInput,
  SummaryJob,
  SummaryListItem,
  SummaryOptions,
  SummaryResult,
  WatchVerdict,
  SummaryLanguage,
  JobStep,
  RetryInfo,
} from "@l5sly/contracts";
import { isYouTubeUrl } from "@l5sly/contracts";

import { AppError, NotFoundError } from "../../errors.js";
import { MediaPreparer, type PreparedMedia } from "./media-preparer.js";
import type {
  GeneratedSummary,
  MediaInput,
  SummaryProvider,
  TranscriptionProvider,
  VerdictProvider,
  TranscriptionResult,
} from "./providers/provider-contracts.js";
import { RETRY_MEDIA_RETENTION_MS } from "./summary-checkpoint.js";
import {
  SummaryRepository,
  type StoredSummaryJob,
} from "./summary-repository.js";
import type { YoutubeDownloader } from "./youtube-downloader.js";

export interface UploadedSummaryInput {
  originalName: string;
  path: string;
  mimeType: string;
  options: SummaryOptions;
}

export class SummaryService {
  private readonly recoveryInProgress = new Set<string>();
  constructor(
    private readonly repository: SummaryRepository,
    private readonly mediaPreparer: MediaPreparer,
    private readonly transcriptionProvider: TranscriptionProvider,
    private readonly summaryProvider: SummaryProvider,
    private readonly verdictProvider: VerdictProvider,
    private readonly log: Logger,
    private readonly youtubeDownloader?: YoutubeDownloader,
  ) {}

  createFromUrl(input: CreateUrlSummaryInput): SummaryJob {
    const url = new URL(input.url);
    const sourceName = url.hostname.replace(/^www\./, "");

    const job = this.repository.create({
      id: randomUUID(),
      sourceType: "url",
      sourceName,
      sourceUrl: input.url,
      options: {
        language: input.language,
        sourceLanguage: input.sourceLanguage ?? input.language,
        viewerProfile: input.viewerProfile,
        depth: input.depth,
        expectation: input.expectation,
      },
    });

    return this.toPublicJob(job);
  }

  createFromUpload(input: UploadedSummaryInput): SummaryJob {
    const job = this.repository.create({
      id: randomUUID(),
      sourceType: "upload",
      sourceName: input.originalName,
      sourcePath: input.path,
      sourceMimeType: input.mimeType,
      options: input.options,
    });

    return this.toPublicJob(job);
  }

  findById(id: string): SummaryJob {
    const job = this.repository.findById(id) ?? this.throwNotFound(id);
    return this.toPublicJob(job);
  }

  listRecent(limit = 30): SummaryListItem[] {
    return this.repository.listRecent(limit);
  }

  cancel(id: string): SummaryJob {
    this.findById(id);
    this.repository.cancel(id);
    return this.findById(id);
  }

  async retry(
    id: string,
    upload?: { path: string; mimeType: string },
  ): Promise<SummaryJob> {
    this.beginRecovery(id);
    try {
      const job = this.repository.findById(id) ?? this.throwNotFound(id);
      if (job.status !== "failed") {
        throw new AppError({
          message: "Only failed jobs can be retried.",
          statusCode: 409,
          code: "JOB_NOT_FAILED",
        });
      }
      const retryInfo = this.getRetryInfo(job);
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
      if (!this.repository.retry(id, retryInfo.fromStep, replacementUpload)) {
        throw new AppError({
          message: "This job is already being retried.",
          statusCode: 409,
          code: "RETRY_CONFLICT",
        });
      }
      return this.findById(id);
    } finally {
      this.recoveryInProgress.delete(id);
    }
  }

  async delete(id: string): Promise<void> {
    this.beginRecovery(id);
    try {
      const job = this.repository.findById(id) ?? this.throwNotFound(id);
      if (job.status === "queued" || job.status === "processing") {
        throw new AppError({
          message: "Cancel this job before deleting it.",
          statusCode: 409,
          code: "JOB_ACTIVE",
        });
      }
      await this.removeJobMedia(job);
      this.repository.delete(id);
    } finally {
      this.recoveryInProgress.delete(id);
    }
  }

  async cleanupExpiredMedia(): Promise<void> {
    for (const failedJob of this.repository.listFailed()) {
      const job = this.repository.findById(failedJob.id);
      // A previous cleanup await may have allowed another job to be retried.
      if (
        !job ||
        job.status !== "failed" ||
        this.recoveryInProgress.has(job.id)
      )
        continue;
      const checkpoint = this.repository.getCheckpoint(job.id);
      const expiresAt =
        checkpoint.mediaExpiresAt ??
        new Date(
          Date.parse(job.createdAt) + RETRY_MEDIA_RETENTION_MS,
        ).toISOString();
      if (Date.parse(expiresAt) > Date.now()) continue;
      this.recoveryInProgress.add(job.id);
      try {
        await this.removeJobMedia(job);
        this.repository.saveCheckpoint(job.id, {
          ...checkpoint,
          preparedMedia: undefined,
          mediaExpiresAt: undefined,
        });
      } catch (error) {
        this.log.warn(
          { jobId: job.id, err: error },
          "Expired retry media could not be removed",
        );
      } finally {
        this.recoveryInProgress.delete(job.id);
      }
    }
  }

  async process(id: string): Promise<void> {
    const job = this.repository.findById(id);
    if (!job || job.status !== "queued") {
      return;
    }

    const checkpoint = this.repository.getCheckpoint(id);
    let preparedMedia = checkpoint.preparedMedia;
    let failedStep: JobStep = "media";
    let retainMediaForRetry = false;
    const jobLog = this.log.child({ jobId: id, operation: "summarize-video" });

    try {
      let transcription: TranscriptionResult;
      if (checkpoint.transcription) {
        transcription = checkpoint.transcription;
      } else {
        let mediaInput: { input: MediaInput; preparedMedia?: PreparedMedia };
        if (
          checkpoint.preparedMedia &&
          existsSync(checkpoint.preparedMedia.path) &&
          Date.parse(checkpoint.mediaExpiresAt ?? "") > Date.now()
        ) {
          preparedMedia = checkpoint.preparedMedia;
          mediaInput = {
            input: {
              kind: "file",
              path: preparedMedia.path,
              mimeType: preparedMedia.mimeType,
            },
            preparedMedia,
          };
        } else {
          this.repository.updateProgress(id, 12, "Preparing media");
          if (
            job.sourceUrl &&
            isYouTubeUrl(job.sourceUrl) &&
            this.youtubeDownloader
          ) {
            this.repository.updateProgress(
              id,
              18,
              "Downloading audio from YouTube",
            );
          }
          mediaInput = await this.createMediaInput(job, id);
          preparedMedia = mediaInput.preparedMedia;
          this.ensureNotCancelled(id);
          checkpoint.preparedMedia = preparedMedia;
          checkpoint.mediaExpiresAt = new Date(
            Date.now() + RETRY_MEDIA_RETENTION_MS,
          ).toISOString();
          this.repository.saveCheckpoint(id, checkpoint);
        }

        failedStep = "transcription";
        this.repository.updateProgress(id, 34, "Transcribing speech");
        transcription = await this.runProviderCall(
          jobLog,
          "transcription",
          () =>
            this.transcriptionProvider.transcribe(
              mediaInput.input,
              job.options.sourceLanguage ?? job.options.language,
            ),
        );
        this.ensureNotCancelled(id);
        checkpoint.transcription = transcription;
        this.repository.saveCheckpoint(id, checkpoint);
      }

      failedStep = "summary";
      this.repository.updateProgress(
        id,
        68,
        "Generating the brief - this can take several minutes",
      );
      const [summaryResult, verdictResult] = await Promise.allSettled([
        (async () => {
          if (checkpoint.summary) return checkpoint.summary;
          const summary = await this.runProviderCall(jobLog, "summary", () =>
            this.summaryProvider.summarize({
              transcript: transcription,
              language: job.options.language,
              depth: job.options.depth,
              expectation: job.options.expectation,
              viewerProfile: job.options.viewerProfile,
            }),
          );
          this.ensureNotCancelled(id);
          checkpoint.summary = summary;
          this.repository.saveCheckpoint(id, checkpoint);
          return summary;
        })(),
        (async () => {
          if (checkpoint.verdict) return checkpoint.verdict;
          const verdict = await this.runProviderCall(jobLog, "verdict", () =>
            this.verdictProvider.decide({
              transcript: transcription.text,
              durationSeconds: transcription.durationSeconds,
              expectation: job.options.expectation,
              viewerProfile: job.options.viewerProfile,
              language: job.options.language,
            }),
          );
          this.ensureNotCancelled(id);
          checkpoint.verdict = verdict;
          this.repository.saveCheckpoint(id, checkpoint);
          return verdict;
        })(),
      ]);
      this.ensureNotCancelled(id);

      if (summaryResult.status === "rejected") {
        throw summaryResult.reason;
      }

      let generatedSummary = summaryResult.value;
      let verdict: WatchVerdict;

      if (verdictResult.status === "fulfilled") {
        verdict = verdictResult.value;
      } else {
        const fallbackCaveat =
          job.options.language === "Arabic"
            ? "خدمة تقييم المشاهدة غير متاحة؛ التوصية الحالية مبدئية."
            : "The dedicated watch-verdict service was unavailable, so the recommendation is provisional.";
        generatedSummary = {
          ...generatedSummary,
          caveats: [fallbackCaveat, ...generatedSummary.caveats].slice(0, 4),
        };
        verdict = this.createFallbackVerdict(
          generatedSummary,
          job.options.language,
        );
        jobLog.warn(
          { err: verdictResult.reason, provider: "verdict" },
          "Using a fallback watch verdict",
        );
      }

      const result: SummaryResult = {
        ...generatedSummary,
        verdict,
        transcript: transcription.segments,
        durationSeconds: transcription.durationSeconds,
        sourceLanguage: transcription.detectedLanguage,
      };

      this.repository.complete(id, result);
      this.repository.clearCheckpoint(id);
      jobLog.info({ status: "completed" }, "Summary job completed");
    } catch (error) {
      if (error instanceof AppError && error.code === "JOB_CANCELLED") {
        jobLog.info({ status: "cancelled" }, "Summary job cancelled");
        return;
      }

      const message =
        error instanceof AppError
          ? error.message
          : "The video could not be processed. Please try again.";
      retainMediaForRetry = !checkpoint.transcription;
      this.repository.fail(id, message, {
        step: failedStep,
        code: error instanceof AppError ? error.code : "PROCESSING_ERROR",
        details: error instanceof AppError ? error.details : undefined,
      });
      jobLog.error({ err: error }, "Summary job failed");
    } finally {
      if (!retainMediaForRetry || !this.repository.findById(id)) {
        await this.cleanupMedia(job, preparedMedia, jobLog);
      }
    }
  }

  private async createMediaInput(
    job: StoredSummaryJob,
    jobId: string,
  ): Promise<{ input: MediaInput; preparedMedia?: PreparedMedia }> {
    if (job.source.type === "url") {
      if (!job.sourceUrl) {
        throw new AppError({
          message: "The source URL is missing.",
          statusCode: 500,
          code: "SOURCE_MISSING",
        });
      }

      if (!isYouTubeUrl(job.sourceUrl) || !this.youtubeDownloader) {
        return {
          input: { kind: "url", url: job.sourceUrl },
        };
      }

      const downloadedMedia = await this.youtubeDownloader.download(
        job.sourceUrl,
        jobId,
      );

      try {
        const preparedMedia = await this.mediaPreparer.prepare({
          path: downloadedMedia.path,
          mimeType: downloadedMedia.mimeType,
          jobId,
        });

        return {
          input: {
            kind: "file",
            path: preparedMedia.path,
            mimeType: preparedMedia.mimeType,
          },
          preparedMedia: {
            ...preparedMedia,
            additionalPaths: [
              ...(preparedMedia.additionalPaths ?? []),
              downloadedMedia.path,
            ],
          },
        };
      } catch (error) {
        await this.mediaPreparer.remove(downloadedMedia.path);
        throw error;
      }
    }

    if (!job.sourcePath || !job.sourceMimeType) {
      throw new AppError({
        message: "The uploaded media is missing.",
        statusCode: 500,
        code: "SOURCE_MISSING",
      });
    }

    const preparedMedia = await this.mediaPreparer.prepare({
      path: job.sourcePath,
      mimeType: job.sourceMimeType,
      jobId,
    });

    return {
      input: {
        kind: "file",
        path: preparedMedia.path,
        mimeType: preparedMedia.mimeType,
      },
      preparedMedia,
    };
  }

  private ensureNotCancelled(id: string): void {
    const currentJob = this.repository.findById(id);
    if (!currentJob || currentJob.status === "cancelled") {
      throw new AppError({
        message: "The summary job was cancelled.",
        statusCode: 409,
        code: "JOB_CANCELLED",
      });
    }
  }

  private async runProviderCall<T>(
    jobLog: Logger,
    provider: "transcription" | "summary" | "verdict",
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    jobLog.info({ provider }, "Provider call started");

    try {
      const result = await operation();
      jobLog.info(
        { durationMs: Date.now() - startedAt, provider },
        "Provider call completed",
      );
      return result;
    } catch (error) {
      jobLog.error(
        { durationMs: Date.now() - startedAt, err: error, provider },
        "Provider call failed",
      );
      throw error;
    }
  }

  private createFallbackVerdict(
    summary: GeneratedSummary,
    language: SummaryLanguage,
  ): WatchVerdict {
    const isArabic = language === "Arabic";
    if (summary.recommendedMoments.length > 0) {
      return {
        recommendation: "watch-key-moments",
        confidence: 0.5,
        headline: isArabic
          ? "ابدأ بالملخص والمقاطع المهمة"
          : "Use the brief and key moments",
        reason: isArabic
          ? "خدمة تقييم المشاهدة غير متاحة. هذه توصية مبدئية اعتماداً على الملخص والمقاطع المرتبطة بنص الفيديو."
          : "The dedicated verdict service was unavailable. This provisional recommendation uses the generated brief and its transcript-grounded moments.",
      };
    }

    return {
      recommendation: "skip",
      confidence: 0.5,
      headline: isArabic ? "ابدأ بالملخص المكتوب" : "Start with the brief",
      reason: isArabic
        ? "خدمة تقييم المشاهدة غير متاحة ولم يتم تحديد مقاطع موثوقة؛ ابدأ بالملخص المكتوب."
        : "The dedicated verdict service was unavailable and no transcript-grounded moments were identified, so start with the written brief.",
    };
  }

  private async cleanupMedia(
    job: StoredSummaryJob,
    preparedMedia: PreparedMedia | undefined,
    jobLog: Logger,
  ): Promise<void> {
    const paths = new Set<string>();
    if (job.sourcePath) {
      paths.add(job.sourcePath);
    }
    if (preparedMedia?.shouldDelete) {
      paths.add(preparedMedia.path);
    }
    for (const temporaryPath of preparedMedia?.additionalPaths ?? []) {
      paths.add(temporaryPath);
    }

    const results = await Promise.allSettled(
      [...paths].map((mediaPath) => this.mediaPreparer.remove(mediaPath)),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        jobLog.warn({ err: result.reason }, "Temporary media cleanup failed");
      }
    }
  }

  private throwNotFound(id: string): never {
    throw new NotFoundError(id);
  }

  private getRetryInfo(job: StoredSummaryJob): RetryInfo {
    const checkpoint = this.repository.getCheckpoint(job.id);
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
    const checkpoint = this.repository.getCheckpoint(job.id);
    const paths = new Set<string>(
      checkpoint.preparedMedia?.additionalPaths ?? [],
    );
    if (job.sourcePath) paths.add(job.sourcePath);
    if (checkpoint.preparedMedia) paths.add(checkpoint.preparedMedia.path);
    await Promise.all(
      [...paths].map((mediaPath) => this.mediaPreparer.remove(mediaPath)),
    );
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

  private toPublicJob(job: StoredSummaryJob): SummaryJob {
    return {
      id: job.id,
      status: job.status,
      source: {
        type: job.source.type,
        name: job.source.name,
      },
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
      retryInfo: job.status === "failed" ? this.getRetryInfo(job) : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
