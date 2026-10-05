import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import type {
  CreateUrlSummaryInput,
  SummaryJob,
  SummaryListItem,
  SummaryOptions,
  SummaryResult,
  WatchVerdict,
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
} from "./providers/provider-contracts.js";
import { SummaryRepository, type StoredSummaryJob } from "./summary-repository.js";
import type { YoutubeDownloader } from "./youtube-downloader.js";

export interface UploadedSummaryInput {
  originalName: string;
  path: string;
  mimeType: string;
  options: SummaryOptions;
}

export class SummaryService {
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

  async process(id: string): Promise<void> {
    const job = this.repository.findById(id);
    if (!job || job.status === "cancelled") {
      return;
    }

    let preparedMedia: PreparedMedia | undefined;
    const jobLog = this.log.child({ jobId: id, operation: "summarize-video" });

    try {
      this.repository.updateProgress(id, 12, "Preparing media");
      if (job.sourceUrl && isYouTubeUrl(job.sourceUrl) && this.youtubeDownloader) {
        this.repository.updateProgress(id, 18, "Downloading audio from YouTube");
      }
      const mediaInput = await this.createMediaInput(job, id);
      preparedMedia = mediaInput.preparedMedia;

      this.repository.updateProgress(id, 34, "Transcribing speech");
      const transcription = await this.runProviderCall(
        jobLog,
        "transcription",
        () => this.transcriptionProvider.transcribe(mediaInput.input),
      );
      this.ensureNotCancelled(id);

      this.repository.updateProgress(id, 68, "Generating the brief - this can take several minutes");
      const [summaryResult, verdictResult] = await Promise.allSettled([
        this.runProviderCall(
          jobLog,
          "summary",
          () => this.summaryProvider.summarize({
            transcript: transcription,
            language: job.options.language,
            depth: job.options.depth,
            expectation: job.options.expectation,
          }),
        ),
        this.runProviderCall(
          jobLog,
          "verdict",
          () => this.verdictProvider.decide({
            transcript: transcription.text,
            durationSeconds: transcription.durationSeconds,
            expectation: job.options.expectation,
          }),
        ),
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
        const fallbackCaveat = "The dedicated watch-verdict service was unavailable, so the recommendation is provisional.";
        generatedSummary = {
          ...generatedSummary,
          caveats: [fallbackCaveat, ...generatedSummary.caveats].slice(0, 4),
        };
        verdict = this.createFallbackVerdict(generatedSummary);
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
      jobLog.info({ status: "completed" }, "Summary job completed");
    } catch (error) {
      if (error instanceof AppError && error.code === "JOB_CANCELLED") {
        jobLog.info({ status: "cancelled" }, "Summary job cancelled");
        return;
      }

      const message = error instanceof AppError
        ? error.message
        : "The video could not be processed. Please try again.";
      this.repository.fail(id, message);
      jobLog.error({ err: error }, "Summary job failed");
    } finally {
      await this.cleanupMedia(job, preparedMedia, jobLog);
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

      const downloadedMedia = await this.youtubeDownloader.download(job.sourceUrl, jobId);

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
    if (currentJob?.status === "cancelled") {
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

  private createFallbackVerdict(summary: GeneratedSummary): WatchVerdict {
    if (summary.recommendedMoments.length > 0) {
      return {
        recommendation: "watch-key-moments",
        confidence: 0.5,
        headline: "Use the brief and key moments",
        reason: "The dedicated verdict service was unavailable. This provisional recommendation uses the generated brief and its transcript-grounded moments.",
      };
    }

    return {
      recommendation: "skip",
      confidence: 0.5,
      headline: "Start with the brief",
      reason: "The dedicated verdict service was unavailable and no transcript-grounded moments were identified, so start with the written brief.",
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
        depth: job.options.depth,
        expectation: job.options.expectation,
      },
      progress: job.progress,
      stage: job.stage,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
