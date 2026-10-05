import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { WatchVerdict } from "@l5sly/contracts";

import { createDatabase } from "../../database.js";
import { ProviderError, ProviderTimeoutError } from "../../errors.js";
import { logger } from "../../logger.js";
import { MediaPreparer } from "./media-preparer.js";
import type {
  GeneratedSummary,
  MediaInput,
  SummaryGenerationInput,
  SummaryProvider,
  TranscriptionProvider,
  TranscriptionResult,
  VerdictInput,
  VerdictProvider,
} from "./providers/provider-contracts.js";
import { SummaryRepository } from "./summary-repository.js";
import { SummaryService } from "./summary-service.js";
import type { DownloadedMedia, YoutubeDownloader } from "./youtube-downloader.js";

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
    { category: "Method", title: "Use the technique", detail: "Apply it to the example." },
    { category: "Evidence", title: "Concrete example", detail: "The transcript includes an example." },
    { category: "Scope", title: "Narrow topic", detail: "The video covers one technique." },
  ],
  recommendedMoments: [
    { startSeconds: 0, title: "The useful section", reason: "It contains the technique and example." },
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

  async transcribe(input: MediaInput): Promise<TranscriptionResult> {
    this.lastInput = input;
    return transcription;
  }
}

class StubYoutubeDownloader implements YoutubeDownloader {
  requestedUrl?: string;

  constructor(private readonly mediaPath: string) {}

  async download(url: string, _jobId: string): Promise<DownloadedMedia> {
    this.requestedUrl = url;
    return { path: this.mediaPath, mimeType: "audio/webm" };
  }
}

class SuccessfulSummaryProvider implements SummaryProvider {
  async summarize(_input: SummaryGenerationInput): Promise<GeneratedSummary> {
    return generatedSummary;
  }
}

class FailingSummaryProvider implements SummaryProvider {
  async summarize(_input: SummaryGenerationInput): Promise<GeneratedSummary> {
    throw new ProviderError("The summary provider failed.");
  }
}

class SuccessfulVerdictProvider implements VerdictProvider {
  async decide(_input: VerdictInput): Promise<WatchVerdict> {
    return verdict;
  }
}

class TimedOutVerdictProvider implements VerdictProvider {
  async decide(_input: VerdictInput): Promise<WatchVerdict> {
    throw new ProviderTimeoutError("The watch-verdict provider", 1_000);
  }
}

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("SummaryService", () => {
  it("completes with a provisional verdict when the verdict provider times out", async () => {
    const { repository, service } = createService(
      new SuccessfulSummaryProvider(),
      new TimedOutVerdictProvider(),
    );
    const job = service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await service.process(job.id);

    const completedJob = repository.findById(job.id);
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.result?.verdict).toMatchObject({
      recommendation: "watch-key-moments",
      confidence: 0.5,
    });
    expect(completedJob?.result?.caveats[0]).toContain("watch-verdict service was unavailable");
  });

  it("fails the job when summary generation fails", async () => {
    const { repository, service } = createService(
      new FailingSummaryProvider(),
      new SuccessfulVerdictProvider(),
    );
    const job = service.createFromUrl({
      url: "https://example.com/video.mp4",
      language: "English",
      depth: "quick",
    });

    await service.process(job.id);

    const failedJob = repository.findById(job.id);
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.error).toBe("The summary provider failed.");
  });

  it("downloads YouTube media before transcription and cleans it up", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5sly-youtube-"));
    const downloadedPath = path.join(testDirectory, "download.webm");
    await writeFile(downloadedPath, "test media");

    const downloader = new StubYoutubeDownloader(downloadedPath);
    const { repository, service, transcriptionProvider } = createService(
      new SuccessfulSummaryProvider(),
      new SuccessfulVerdictProvider(),
      downloader,
    );
    const job = service.createFromUrl({
      url: "https://www.youtube.com/watch?v=abc123",
      language: "English",
      depth: "quick",
    });

    await service.process(job.id);

    expect(repository.findById(job.id)?.status).toBe("completed");
    expect(downloader.requestedUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(transcriptionProvider.lastInput).toEqual({
      kind: "file",
      path: downloadedPath,
      mimeType: "audio/webm",
    });
    await expect(access(downloadedPath)).rejects.toThrow();
    await rm(testDirectory, { recursive: true, force: true });
  });
});

function createService(
  summaryProvider: SummaryProvider,
  verdictProvider: VerdictProvider,
  youtubeDownloader?: YoutubeDownloader,
): {
  repository: SummaryRepository;
  service: SummaryService;
  transcriptionProvider: SuccessfulTranscriptionProvider;
} {
  const database = createDatabase(":memory:");
  databases.push(database);
  const repository = new SummaryRepository(database);
  const transcriptionProvider = new SuccessfulTranscriptionProvider();
  const service = new SummaryService(
    repository,
    new MediaPreparer(tmpdir()),
    transcriptionProvider,
    summaryProvider,
    verdictProvider,
    logger,
    youtubeDownloader,
  );

  return { repository, service, transcriptionProvider };
}
