import { existsSync } from "node:fs";

import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { Logger } from "pino";

import type {
  JobStep,
  SummaryLanguage,
  SummaryResult,
  TimelineWindow,
  WatchVerdict,
} from "@l5sly/contracts";

import { AppError } from "../../common/errors.js";
import { MediaPreparer, type PreparedMedia } from "../media/media-preparer.js";
import { YoutubeDownloader } from "../media/youtube-downloader.js";
import {
  InsightProvider,
  SummaryProvider,
  TranscriptionProvider,
  VerdictProvider,
  type GeneratedSummary,
  type MediaInput,
  type SectionSupport,
  type TranscriptionResult,
} from "../providers/provider-contracts.js";
import { RETRY_MEDIA_RETENTION_MS } from "../summary-checkpoint.js";
import {
  SummaryRepository,
  type StoredSummaryJob,
} from "../summary.repository.js";

// Each finished step is checkpointed so a retry can resume from it.
@Injectable()
export class SummaryPipeline {
  constructor(
    private readonly repository: SummaryRepository,
    private readonly mediaPreparer: MediaPreparer,
    private readonly transcriptionProvider: TranscriptionProvider,
    private readonly summaryProvider: SummaryProvider,
    private readonly verdictProvider: VerdictProvider,
    private readonly insightProvider: InsightProvider,
    // null in mock mode, where YouTube URLs are passed to the transcriber as is.
    @Inject(YoutubeDownloader)
    private readonly youtubeDownloader: YoutubeDownloader | null,
    @InjectPinoLogger(SummaryPipeline.name)
    private readonly logger: PinoLogger,
  ) {}

  // Tracked in memory rather than read from the queue: after a restart, Redis can
  // still report the dead process's job as active until its lock expires.
  private readonly runningIds = new Set<string>();

  isRunning(id: string): boolean {
    return this.runningIds.has(id);
  }

  async process(id: string): Promise<void> {
    this.runningIds.add(id);
    try {
      await this.runJob(id);
    } finally {
      this.runningIds.delete(id);
    }
  }

  private async runJob(id: string): Promise<void> {
    const job = await this.repository.findById(id);
    if (!job || job.status !== "queued") {
      return;
    }

    const checkpoint = await this.repository.getCheckpoint(id);
    let preparedMedia = checkpoint.preparedMedia;
    let failedStep: JobStep = "media";
    let retainMediaForRetry = false;
    const jobLog = this.logger.logger.child({ jobId: id, operation: "summarize-video" });

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
          await this.repository.updateProgress(id, 12, "Preparing media");
          if (job.source.type === "youtube" && this.youtubeDownloader) {
            await this.repository.updateProgress(
              id,
              18,
              "Downloading audio from YouTube",
            );
          }
          mediaInput = await this.createMediaInput(job, id);
          preparedMedia = mediaInput.preparedMedia;
          await this.ensureNotCancelled(id);
          checkpoint.preparedMedia = preparedMedia;
          checkpoint.mediaExpiresAt = new Date(
            Date.now() + RETRY_MEDIA_RETENTION_MS,
          ).toISOString();
          await this.repository.saveCheckpoint(id, checkpoint);
        }

        failedStep = "transcription";
        await this.repository.updateProgress(id, 34, "Transcribing speech");
        transcription = await this.runProviderCall(
          jobLog,
          "transcription",
          () =>
            this.transcriptionProvider.transcribe(
              mediaInput.input,
              job.options.sourceLanguage ?? job.options.language,
            ),
        );
        await this.ensureNotCancelled(id);
        checkpoint.transcription = transcription;
        await this.repository.saveCheckpoint(id, checkpoint);
      }

      failedStep = "summary";
      await this.repository.updateProgress(
        id,
        68,
        "Generating the brief - this can take several minutes",
      );
      const [summaryResult, verdictResult, timelineResult] =
        await Promise.allSettled([
          (async () => {
            if (checkpoint.summary) return checkpoint.summary;
            const draftSummary = await this.runProviderCall(
              jobLog,
              "summary",
              () =>
                this.summaryProvider.summarize({
                  transcript: transcription,
                  language: job.options.language,
                  depth: job.options.depth,
                  expectation: job.options.expectation,
                  viewerProfile: job.options.viewerProfile,
                }),
            );
            await this.ensureNotCancelled(id);
            const summary = await this.checkSummaryGrounding(
              draftSummary,
              transcription.text,
              jobLog,
            );
            await this.ensureNotCancelled(id);
            checkpoint.summary = summary;
            await this.repository.saveCheckpoint(id, checkpoint);
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
            await this.ensureNotCancelled(id);
            checkpoint.verdict = verdict;
            await this.repository.saveCheckpoint(id, checkpoint);
            return verdict;
          })(),
          (async () => {
            if (checkpoint.timeline) return checkpoint.timeline;
            const timeline = await this.runProviderCall(
              jobLog,
              "timeline",
              () =>
                this.insightProvider.scoreTimeline({
                  segments: transcription.segments,
                  durationSeconds: transcription.durationSeconds,
                  expectation: job.options.expectation,
                  viewerProfile: job.options.viewerProfile,
                }),
            );
            await this.ensureNotCancelled(id);
            checkpoint.timeline = timeline;
            await this.repository.saveCheckpoint(id, checkpoint);
            return timeline;
          })(),
        ]);
      await this.ensureNotCancelled(id);

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

      // The timeline is an optional extra; the brief is still useful without it.
      let timeline: TimelineWindow[] | undefined;
      if (timelineResult.status === "fulfilled") {
        timeline = timelineResult.value.length
          ? timelineResult.value
          : undefined;
      } else {
        jobLog.warn(
          { err: timelineResult.reason, provider: "timeline" },
          "Completing the job without a relevance timeline",
        );
      }

      const result: SummaryResult = {
        ...generatedSummary,
        verdict,
        timeline,
        transcript: transcription.segments,
        durationSeconds: transcription.durationSeconds,
        sourceLanguage: transcription.detectedLanguage,
      };

      await this.repository.complete(id, result);
      await this.repository.clearCheckpoint(id);
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
      await this.repository.fail(id, message, {
        step: failedStep,
        code: error instanceof AppError ? error.code : "PROCESSING_ERROR",
        details: error instanceof AppError ? error.details : undefined,
      });
      jobLog.error({ err: error }, "Summary job failed");
    } finally {
      if (!retainMediaForRetry || !(await this.repository.findById(id))) {
        await this.cleanupMedia(job, preparedMedia, jobLog);
      }
    }
  }

  private async createMediaInput(
    job: StoredSummaryJob,
    jobId: string,
  ): Promise<{ input: MediaInput; preparedMedia?: PreparedMedia }> {
    if (job.source.type !== "upload") {
      if (job.source.type !== "youtube" || !this.youtubeDownloader) {
        return {
          input: { kind: "url", url: job.source.url },
        };
      }

      const downloadedMedia = await this.youtubeDownloader.download(
        job.source.url,
        jobId,
      );
      if (downloadedMedia.title) {
        await this.repository.updateSourceName(jobId, downloadedMedia.title);
      }

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

  private async ensureNotCancelled(id: string): Promise<void> {
    const currentJob = await this.repository.findById(id);
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
    provider:
      | "transcription"
      | "summary"
      | "verdict"
      | "timeline"
      | "grounding",
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

  // Grounding is an optional quality check, so a failure keeps the unchecked summary.
  private async checkSummaryGrounding(
    summary: GeneratedSummary,
    transcript: string,
    jobLog: Logger,
  ): Promise<GeneratedSummary> {
    let support: SectionSupport[] | null;
    try {
      support = await this.runProviderCall(jobLog, "grounding", () =>
        this.insightProvider.checkGrounding({
          transcript,
          sections: summary.sections,
        }),
      );
    } catch (error) {
      jobLog.warn(
        { err: error, provider: "grounding" },
        "Keeping the summary without a grounding check",
      );
      return summary;
    }
    if (!support || support.length !== summary.sections.length) {
      return summary;
    }

    return {
      ...summary,
      sections: summary.sections.map((section, index) => ({
        ...section,
        support: support[index],
      })),
    };
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
}
