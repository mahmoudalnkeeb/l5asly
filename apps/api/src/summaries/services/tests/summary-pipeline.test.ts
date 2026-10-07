import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SummaryLanguage,
  TimelineWindow,
  WatchVerdict,
} from "@l5sly/contracts";

import { PinoLogger } from "nestjs-pino";

import {
  ProviderError,
  ProviderTimeoutError,
  SummaryFormatError,
} from "../../../common/errors.js";
import { openDatabase, type Database } from "../../../database/database.js";
import { SummaryQueue } from "../../jobs/summary-queue.js";
import { MediaPreparer } from "../../media/media-preparer.js";
import type {
  DownloadedMedia,
  YoutubeDownloader,
} from "../../media/youtube-downloader.js";
import type {
  GeneratedSummary,
  GroundingInput,
  InsightProvider,
  MediaInput,
  PrecheckInput,
  SectionSupport,
  SummaryGenerationInput,
  SummaryProvider,
  TimelineInput,
  TranscriptionProvider,
  TranscriptionResult,
  VerdictInput,
  VerdictProvider,
} from "../../providers/provider-contracts.js";
import { SummaryRepository } from "../../summary.repository.js";
import { SummariesService } from "../summaries.service.js";
import { SummaryPipeline } from "../summary-pipeline.service.js";

const transcription: TranscriptionResult = {
  text: "The speaker explains one useful technique with a concrete example.",
  segments: [
    {
      startSeconds: 0,
      endSeconds: 30,
      text: "The speaker explains one useful technique with a concrete example.",
    },
  ],
  durationSeconds: 30,
  detectedLanguage: "en",
};

const generatedSummary: GeneratedSummary = {
  title: "One useful technique",
  overview: "A short explanation with one concrete example.",
  viewerAnswer: "The useful technique is explained directly.",
  caveats: [],
  sections: [
    { title: "Technique", body: "The speaker describes the technique." },
    { title: "Example", body: "The speaker gives a concrete example." },
  ],
  notes: [
    {
      category: "Method",
      title: "Use the technique",
      detail: "Apply it to the example.",
    },
    {
      category: "Evidence",
      title: "Concrete example",
      detail: "The transcript includes an example.",
    },
    {
      category: "Scope",
      title: "Narrow topic",
      detail: "The video covers one technique.",
    },
  ],
  recommendedMoments: [
    {
      startSeconds: 0,
      title: "The useful section",
      reason: "It contains the technique and example.",
    },
  ],
};

const verdict: WatchVerdict = {
  recommendation: "watch",
  confidence: 0.8,
  headline: "Worth watching",
  reason: "The video directly answers the viewer's question.",
};

class SuccessfulTranscriptionProvider implements TranscriptionProvider {
  lastInput?: MediaInput;
  lastLanguage?: SummaryLanguage;

  async transcribe(
    input: MediaInput,
    language: SummaryLanguage,
  ): Promise<TranscriptionResult> {
    this.lastInput = input;
    this.lastLanguage = language;
    return transcription;
  }
}

class StubYoutubeDownloader implements YoutubeDownloader {
  requestedUrl?: string;

  constructor(private readonly mediaPath: string) {}

  async download(url: string, _jobId: string): Promise<DownloadedMedia> {
    this.requestedUrl = url;
    return {
      path: this.mediaPath,
      mimeType: "audio/webm",
      title: "How rivers shape valleys",
    };
  }
}

class SuccessfulSummaryProvider implements SummaryProvider {
  lastInput?: SummaryGenerationInput;
  async summarize(input: SummaryGenerationInput): Promise<GeneratedSummary> {
    this.lastInput = input;
    return generatedSummary;
  }
}

class FailingSummaryProvider implements SummaryProvider {
  async summarize(_input: SummaryGenerationInput): Promise<GeneratedSummary> {
    throw new ProviderError("The summary provider failed.");
  }
}

class SuccessfulVerdictProvider implements VerdictProvider {
  lastInput?: VerdictInput;
  async decide(input: VerdictInput): Promise<WatchVerdict> {
    this.lastInput = input;
    return verdict;
  }
}

class TimedOutVerdictProvider implements VerdictProvider {
  async decide(_input: VerdictInput): Promise<WatchVerdict> {
    throw new ProviderTimeoutError("The watch-verdict provider", 1_000);
  }
}

const timeline: TimelineWindow[] = [
  { startSeconds: 0, endSeconds: 15, relevance: 0.2 },
  { startSeconds: 15, endSeconds: 30, relevance: 0.9 },
];

class StubInsightProvider implements InsightProvider {
  async scoreTimeline(_input: TimelineInput): Promise<TimelineWindow[]> {
    return timeline;
  }

  async checkGrounding(input: GroundingInput): Promise<SectionSupport[]> {
    return input.sections.map((_section, index) =>
      index === 0 ? "supported" : "unsupported",
    );
  }

  async precheck(_input: PrecheckInput): Promise<WatchVerdict> {
    return verdict;
  }
}

class FailingInsightProvider implements InsightProvider {
  async scoreTimeline(_input: TimelineInput): Promise<TimelineWindow[]> {
    throw new ProviderError("Timeline scoring failed.");
  }

  async checkGrounding(_input: GroundingInput): Promise<SectionSupport[]> {
    throw new ProviderTimeoutError("The Jev provider", 1_000);
  }

  async precheck(_input: PrecheckInput): Promise<WatchVerdict> {
    throw new ProviderError("Precheck failed.");
  }
}

// These tests run the pipeline by hand, so queued jobs only need to be accepted.
class NoopSummaryQueue extends SummaryQueue {
  override async enqueue(_summaryId: string): Promise<void> {}
}

const databases: Database[] = [];
const silentLogger = new PinoLogger({ pinoHttp: { level: "silent" } });

afterEach(async () => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) {
    await database.close();
  }
});

describe("SummariesService and SummaryPipeline", () => {
  it("does not clean up a stale failed-job snapshot after a retry has started", async () => {
    const { service, repository } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    await repository.saveCheckpoint(job.id, {
      transcription,
      mediaExpiresAt: expiresAt,
    });
    await repository.fail(job.id, "Summary failed.");
    const failedJob = await repository.findById(job.id);
    if (!failedJob) throw new Error("Expected a persisted job.");
    await service.retry(job.id);
    vi.spyOn(repository, "listFailed").mockResolvedValue([failedJob]);
    await service.cleanupExpiredMedia();
    expect((await repository.getCheckpoint(job.id)).mediaExpiresAt).toBe(expiresAt);
    expect((await repository.findById(job.id))?.status).toBe("queued");
  });
  it("retries only summary generation using saved transcription, verdict and original profile", async () => {
    const summarize = vi
      .fn<SummaryProvider["summarize"]>()
      .mockRejectedValueOnce(
        new SummaryFormatError("Invalid model fields.", {
          notes: ["invalid_type"],
        }),
      )
      .mockResolvedValue(generatedSummary);
    const verdictProvider = new SuccessfulVerdictProvider();
    const decide = vi.spyOn(verdictProvider, "decide");
    const { service, repository, transcriptionProvider, pipeline } = await createService(
      { summarize },
      verdictProvider,
    );
    const transcribe = vi.spyOn(transcriptionProvider, "transcribe");
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "Arabic",
      sourceLanguage: "Arabic",
      depth: "study",
      expectation: "What is Strapi?",
      viewerProfile: {
        background: "Backend engineer",
        knowledge: "SQL",
        goals: "System design",
        preferences: "",
      },
    });

    await pipeline.process(job.id);
    expect(await service.findById(job.id)).toMatchObject({
      status: "failed",
      failedStep: "summary",
      errorCode: "SUMMARY_INVALID_FORMAT",
      errorDetails: { notes: ["invalid_type"] },
      retryInfo: { fromStep: "summary", requiresUpload: false },
    });
    expect((await repository.getCheckpoint(job.id)).transcription).toEqual(
      transcription,
    );
    expect((await repository.getCheckpoint(job.id)).verdict).toEqual(verdict);

    const retried = await service.retry(job.id);
    expect(retried).toMatchObject({
      id: job.id,
      status: "queued",
      progress: 68,
      attempt: 2,
      error: null,
      errorCode: null,
      failedStep: null,
    });
    await expect(service.retry(job.id)).rejects.toMatchObject({
      code: "JOB_NOT_FAILED",
    });
    await pipeline.process(job.id);
    await pipeline.process(job.id);
    expect((await service.findById(job.id)).status).toBe("completed");
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[1]?.[0]).toMatchObject({
      expectation: "What is Strapi?",
      viewerProfile: { goals: "System design" },
    });
    expect(await repository.getCheckpoint(job.id)).toEqual({});
  });

  it("retains failed transcription media and retries without preparing audio again", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5asly-retry-"));
    const audioPath = path.join(testDirectory, "source.webm");
    await writeFile(audioPath, "test audio");
    try {
      const { service, repository, transcriptionProvider, pipeline } = await createService(
        new SuccessfulSummaryProvider(),
        new SuccessfulVerdictProvider(),
      );
      const transcribe = vi
        .spyOn(transcriptionProvider, "transcribe")
        .mockRejectedValueOnce(
          new ProviderError("Temporary transcription failure."),
        );
      const prepare = vi.spyOn(MediaPreparer.prototype, "prepare");
      const job = await service.createFromUpload(
        { originalName: "source.webm", path: audioPath, mimeType: "audio/webm" },
        { language: "English", depth: "quick" },
      );
      await pipeline.process(job.id);
      expect(await service.findById(job.id)).toMatchObject({
        failedStep: "transcription",
        retryInfo: { fromStep: "transcription", requiresUpload: false },
      });
      await expect(access(audioPath)).resolves.toBeUndefined();
      expect((await repository.getCheckpoint(job.id)).preparedMedia?.path).toBe(
        audioPath,
      );
      await service.retry(job.id);
      await pipeline.process(job.id);
      expect((await service.findById(job.id)).status).toBe("completed");
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(transcribe).toHaveBeenCalledTimes(2);
      await expect(access(audioPath)).rejects.toThrow();
    } finally {
      await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it("expires retained audio and accepts replacement media for the same job", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5asly-expiry-"));
    const audioPath = path.join(testDirectory, "source.webm");
    const replacementPath = path.join(testDirectory, "replacement.webm");
    await writeFile(audioPath, "test audio");
    try {
      const { service, repository, transcriptionProvider, pipeline } = await createService(
        new SuccessfulSummaryProvider(),
        new SuccessfulVerdictProvider(),
      );
      vi.spyOn(transcriptionProvider, "transcribe").mockRejectedValueOnce(
        new ProviderError("Transcription failed."),
      );
      const job = await service.createFromUpload(
        { originalName: "source.webm", path: audioPath, mimeType: "audio/webm" },
        { language: "English", depth: "quick" },
      );
      await pipeline.process(job.id);
      await repository.saveCheckpoint(job.id, {
        ...(await repository.getCheckpoint(job.id)),
        mediaExpiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      await service.cleanupExpiredMedia();
      await expect(access(audioPath)).rejects.toThrow();
      expect((await service.findById(job.id)).retryInfo).toMatchObject({
        fromStep: "media",
        requiresUpload: true,
      });
      await expect(service.retry(job.id)).rejects.toMatchObject({
        code: "REUPLOAD_REQUIRED",
      });
      await writeFile(replacementPath, "replacement audio");
      await service.retry(job.id, {
        originalName: "replacement.webm",
        path: replacementPath,
        mimeType: "audio/webm",
      });
      await pipeline.process(job.id);
      expect(await service.findById(job.id)).toMatchObject({
        id: job.id,
        status: "completed",
        attempt: 2,
        source: { name: "source.webm" },
      });
      await expect(access(replacementPath)).rejects.toThrow();
    } finally {
      await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it("deletes failed jobs, retained media and checkpoint data", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5asly-delete-"));
    const audioPath = path.join(testDirectory, "source.webm");
    await writeFile(audioPath, "test audio");
    try {
      const { service, repository, transcriptionProvider, pipeline } = await createService(
        new SuccessfulSummaryProvider(),
        new SuccessfulVerdictProvider(),
      );
      vi.spyOn(transcriptionProvider, "transcribe").mockRejectedValueOnce(
        new ProviderError("Transcription failed."),
      );
      const job = await service.createFromUpload(
        { originalName: "source.webm", path: audioPath, mimeType: "audio/webm" },
        { language: "English", depth: "quick" },
      );
      await expect(service.delete(job.id)).rejects.toMatchObject({
        code: "JOB_ACTIVE",
      });
      await pipeline.process(job.id);
      await service.delete(job.id);
      expect(await repository.findById(job.id)).toBeNull();
      expect(await repository.getCheckpoint(job.id)).toEqual({});
      await expect(access(audioPath)).rejects.toThrow();
      await expect(service.retry(job.id)).rejects.toMatchObject({
        code: "SUMMARY_NOT_FOUND",
      });
    } finally {
      await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it("recovers a server interruption using a saved transcript and restarts older URL jobs honestly", async () => {
    const { service, repository, transcriptionProvider, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    const transcribe = vi.spyOn(transcriptionProvider, "transcribe");
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });
    await repository.updateProgress(job.id, 68, "Generating summary");
    await repository.saveCheckpoint(job.id, { transcription });
    await repository.failInterruptedJobs();
    expect(await service.findById(job.id)).toMatchObject({
      errorCode: "JOB_INTERRUPTED",
      retryInfo: { fromStep: "summary" },
    });
    await service.retry(job.id);
    await pipeline.process(job.id);
    expect(transcribe).not.toHaveBeenCalled();
    expect((await service.findById(job.id)).status).toBe("completed");

    const older = await service.createFromUrl({
      url: "https://example.com/older.mp4",
      language: "English",
      depth: "quick",
    });
    await repository.fail(older.id, "Legacy summary failure.");
    expect((await service.findById(older.id)).retryInfo).toMatchObject({
      fromStep: "media",
      requiresUpload: false,
    });
    await service.retry(older.id);
    await pipeline.process(older.id);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("blocks retry and delete only while this process is still running the job", async () => {
    const { service, repository, transcriptionProvider, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    let finishTranscription: () => void = () => {};
    vi.spyOn(transcriptionProvider, "transcribe").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishTranscription = () => resolve(transcription);
        }),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });
    const run = pipeline.process(job.id);
    await vi.waitFor(() => expect(transcriptionProvider.transcribe).toHaveBeenCalled());
    await repository.fail(job.id, "Failed while the worker was still cleaning up.");

    await expect(service.retry(job.id)).rejects.toMatchObject({ code: "JOB_BUSY" });
    await expect(service.delete(job.id)).rejects.toMatchObject({ code: "JOB_BUSY" });

    finishTranscription();
    await run;
    await repository.fail(job.id, "Summary failed.");
    await expect(service.retry(job.id)).resolves.toMatchObject({ status: "queued" });
  });
  it("persists a profile snapshot and separates spoken language from summary language", async () => {
    const summaryProvider = new SuccessfulSummaryProvider();
    const verdictProvider = new SuccessfulVerdictProvider();
    const { service, repository, transcriptionProvider, pipeline } = await createService(
      summaryProvider,
      verdictProvider,
    );
    const viewerProfile = {
      background: "Backend developer",
      knowledge: "SQL",
      goals: "Learn Strapi",
      preferences: "Practical examples",
    };
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      sourceLanguage: "Arabic",
      depth: "quick",
      viewerProfile,
    });
    viewerProfile.goals = "A later profile edit";
    await pipeline.process(job.id);
    expect(transcriptionProvider.lastLanguage).toBe("Arabic");
    expect(summaryProvider.lastInput?.language).toBe("English");
    expect(summaryProvider.lastInput?.viewerProfile?.goals).toBe(
      "Learn Strapi",
    );
    expect(verdictProvider.lastInput?.viewerProfile).toEqual(
      summaryProvider.lastInput?.viewerProfile,
    );
    expect(verdictProvider.lastInput?.language).toBe("English");
    expect((await repository.findById(job.id))?.options.sourceLanguage).toBe("Arabic");
    expect((await repository.findById(job.id))?.options.viewerProfile?.goals).toBe(
      "Learn Strapi",
    );
  });

  it("completes with a provisional verdict when the verdict provider times out", async () => {
    const { repository, service, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new TimedOutVerdictProvider(),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await pipeline.process(job.id);

    const completedJob = await repository.findById(job.id);
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.result?.verdict).toMatchObject({
      recommendation: "watch-key-moments",
      confidence: 0.5,
    });
    expect(completedJob?.result?.caveats[0]).toContain(
      "watch-verdict service was unavailable",
    );
  });

  it("adds the relevance timeline and grounding flags to the result", async () => {
    const { service, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await pipeline.process(job.id);

    const result = (await service.findById(job.id)).result;
    expect(result?.timeline).toEqual(timeline);
    expect(result?.sections.map((section) => section.support)).toEqual([
      "supported",
      "unsupported",
    ]);
  });

  it("completes without a timeline or grounding flags when those checks fail", async () => {
    const { service, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
      null,
      new FailingInsightProvider(),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await pipeline.process(job.id);

    const completed = await service.findById(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.result?.timeline).toBeUndefined();
    expect(completed.result?.sections).toEqual(generatedSummary.sections);
  });

  it("fails the job when summary generation fails", async () => {
    const { repository, service, pipeline } = await createService(
      new FailingSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    const job = await service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await pipeline.process(job.id);

    const failedJob = await repository.findById(job.id);
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error).toBe("The summary provider failed.");
  });

  it("downloads YouTube media before transcription and cleans it up", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5sly-youtube-"));
    const downloadedPath = path.join(testDirectory, "download.webm");
    await writeFile(downloadedPath, "test media");

    const downloader = new StubYoutubeDownloader(downloadedPath);
    const { repository, service, transcriptionProvider, pipeline } = await createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
      downloader,
    );
    const job = await service.createFromUrl({
      url: "https://www.youtube.com/watch?v=abc123",
      language: "English",
      depth: "quick",
    });
    expect(job.source).toEqual({
      type: "youtube",
      name: "YouTube video",
      url: "https://www.youtube.com/watch?v=abc123",
    });

    await pipeline.process(job.id);

    const completedJob = await repository.findById(job.id);
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.source.name).toBe("How rivers shape valleys");
    expect(downloader.requestedUrl).toBe(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(transcriptionProvider.lastInput).toEqual({
      kind: "file",
      path: downloadedPath,
      mimeType: "audio/webm",
    });
    await expect(access(downloadedPath)).rejects.toThrow();
    await rm(testDirectory, { recursive: true, force: true });
  });
});

async function createService(
  summaryProvider: SummaryProvider,
  verdictProvider: VerdictProvider,
  youtubeDownloader: YoutubeDownloader | null = null,
  insightProvider: InsightProvider = new StubInsightProvider(),
): Promise<{
  repository: SummaryRepository;
  service: SummariesService;
  pipeline: SummaryPipeline;
  transcriptionProvider: SuccessfulTranscriptionProvider;
}> {
  const database = await openDatabase(":memory:");
  databases.push(database);
  const repository = new SummaryRepository(database);
  const mediaPreparer = new MediaPreparer(tmpdir());
  const transcriptionProvider = new SuccessfulTranscriptionProvider();
  const pipeline = new SummaryPipeline(
    repository,
    mediaPreparer,
    transcriptionProvider,
    summaryProvider,
    verdictProvider,
    insightProvider,
    youtubeDownloader,
    silentLogger,
  );
  const service = new SummariesService(
    repository,
    mediaPreparer,
    new NoopSummaryQueue(),
    pipeline,
    silentLogger,
  );

  return { repository, service, pipeline, transcriptionProvider };
}
