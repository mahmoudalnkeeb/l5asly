import type { DatabaseSync } from "node:sqlite";

import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { logger } from "./logger.js";
import { MediaPreparer } from "./modules/summaries/media-preparer.js";
import { DeepgramTranscriptionProvider } from "./modules/summaries/providers/deepgram-provider.js";
import { JevProvider } from "./modules/summaries/providers/jev-provider.js";
import {
  MockInsightProvider,
  MockSummaryProvider,
  MockTranscriptionProvider,
  MockVerdictProvider,
  MockVideoMetadataSource,
} from "./modules/summaries/providers/mock-providers.js";
import { OpenAiSummaryProvider } from "./modules/summaries/providers/openai-summary-provider.js";
import type {
  InsightProvider,
  SummaryProvider,
  TranscriptionProvider,
  VerdictProvider,
} from "./modules/summaries/providers/provider-contracts.js";
import { PrecheckService } from "./modules/summaries/precheck-service.js";
import { SummaryJobRunner } from "./modules/summaries/summary-job-runner.js";
import { SummaryRepository } from "./modules/summaries/summary-repository.js";
import { SummaryService } from "./modules/summaries/summary-service.js";
import { YtDlpYoutubeDownloader } from "./modules/summaries/youtube-downloader.js";

export interface ApplicationRuntime {
  app: ReturnType<typeof createApp>;
  database: DatabaseSync;
  close: () => void;
}

export function buildApplication(config: AppConfig): ApplicationRuntime {
  const database = createDatabase(config.databasePath);
  const repository = new SummaryRepository(database);
  repository.failInterruptedJobs();

  const providers = createProviders(config);
  const youtubeDownloader =
    config.providerMode === "live"
      ? new YtDlpYoutubeDownloader({
          downloadDirectory: config.uploadDirectory,
          executablePath: config.ytdlpPath,
          timeoutMs: config.ytdlpTimeoutMs,
        })
      : undefined;
  const summaryService = new SummaryService({
    repository,
    mediaPreparer: new MediaPreparer(config.uploadDirectory),
    transcriptionProvider: providers.transcription,
    summaryProvider: providers.summary,
    verdictProvider: providers.verdict,
    insightProvider: providers.insight,
    log: logger,
    youtubeDownloader,
  });
  const precheckService = new PrecheckService(
    youtubeDownloader ?? new MockVideoMetadataSource(),
    providers.insight,
  );
  const jobRunner = new SummaryJobRunner(summaryService, logger);
  const app = createApp({
    config,
    summaryService,
    jobRunner,
    precheckService,
    log: logger,
  });

  void summaryService
    .cleanupExpiredMedia()
    .catch((error: unknown) =>
      logger.error({ err: error }, "Retry media cleanup failed"),
    );
  const cleanupTimer = setInterval(
    () => {
      void summaryService
        .cleanupExpiredMedia()
        .catch((error: unknown) =>
          logger.error({ err: error }, "Retry media cleanup failed"),
        );
    },
    60 * 60 * 1000,
  );
  cleanupTimer.unref();

  return {
    app,
    database,
    close: () => {
      clearInterval(cleanupTimer);
      database.close();
    },
  };
}

function createProviders(config: AppConfig): {
  transcription: TranscriptionProvider;
  summary: SummaryProvider;
  verdict: VerdictProvider;
  insight: InsightProvider;
} {
  if (config.providerMode === "mock") {
    return {
      transcription: new MockTranscriptionProvider(),
      summary: new MockSummaryProvider(),
      verdict: new MockVerdictProvider(),
      insight: new MockInsightProvider(),
    };
  }

  if (!config.deepgramApiKey || !config.llmApiKey || !config.jevApiKey) {
    throw new Error(
      "Live provider credentials are missing from validated configuration.",
    );
  }

  const jev = new JevProvider({
    apiKey: config.jevApiKey,
    baseUrl: config.jevBaseUrl,
    model: config.jevModel,
    timeoutMs: config.jevTimeoutMs,
  });

  return {
    transcription: new DeepgramTranscriptionProvider({
      apiKey: config.deepgramApiKey,
      timeoutMs: config.deepgramTimeoutMs,
    }),
    summary: new OpenAiSummaryProvider({
      apiKey: config.llmApiKey,
      baseUrl: config.llmBaseUrl,
      model: config.llmModel,
      timeoutMs: config.llmTimeoutMs,
    }),
    verdict: jev,
    insight: jev,
  };
}
