import { Module } from "@nestjs/common";
import { getHttpClientToken, type HttpClient } from "@nestjs/http-client";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import {
  YoutubeDownloader,
  YtDlpYoutubeDownloader,
} from "../media/youtube-downloader.js";
import {
  DEEPGRAM_HTTP_CLIENT,
  deepgramHttpClient,
} from "./speech-to-text/deepgram-http-client.js";
import { DeepgramTranscriptionProvider } from "./speech-to-text/deepgram-transcription.provider.js";
import { JEV_HTTP_CLIENT, jevHttpClient } from "./systemone/jev-http-client.js";
import { JevProvider } from "./systemone/jev.provider.js";
import { LLM_HTTP_CLIENT, llmHttpClient } from "./llm/llm-http-client.js";
import { OpenAiSummaryProvider } from "./llm/openai-summary.provider.js";
import {
  MockInsightProvider,
  MockSummaryProvider,
  MockTranscriptionProvider,
  MockVerdictProvider,
  MockVideoMetadataSource,
} from "./mock/mock-providers.js";
import {
  InsightProvider,
  SummaryProvider,
  TranscriptionProvider,
  VerdictProvider,
  VideoMetadataSource,
} from "./provider-contracts.js";

function isLive(config: AppConfig): boolean {
  return config.providerMode === "live";
}

@Module({
  imports: [deepgramHttpClient, jevHttpClient, llmHttpClient],
  providers: [
    {
      provide: TranscriptionProvider,
      inject: [APP_CONFIG, getHttpClientToken(DEEPGRAM_HTTP_CLIENT)],
      useFactory: (config: AppConfig, http: HttpClient) =>
        isLive(config)
          ? new DeepgramTranscriptionProvider(http)
          : new MockTranscriptionProvider(),
    },
    {
      provide: SummaryProvider,
      inject: [APP_CONFIG, getHttpClientToken(LLM_HTTP_CLIENT)],
      useFactory: (config: AppConfig, http: HttpClient) =>
        isLive(config)
          ? new OpenAiSummaryProvider(http, config.llmModel)
          : new MockSummaryProvider(),
    },
    {
      // One Jev client answers both the verdict and the insight questions.
      provide: JevProvider,
      inject: [APP_CONFIG, getHttpClientToken(JEV_HTTP_CLIENT)],
      useFactory: (config: AppConfig, http: HttpClient) =>
        new JevProvider(http, config.jevModel),
    },
    {
      provide: VerdictProvider,
      inject: [APP_CONFIG, JevProvider],
      useFactory: (config: AppConfig, jev: JevProvider) =>
        isLive(config) ? jev : new MockVerdictProvider(),
    },
    {
      provide: InsightProvider,
      inject: [APP_CONFIG, JevProvider],
      useFactory: (config: AppConfig, jev: JevProvider) =>
        isLive(config) ? jev : new MockInsightProvider(),
    },
    {
      // yt-dlp both downloads YouTube audio and reads video metadata.
      provide: YtDlpYoutubeDownloader,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new YtDlpYoutubeDownloader({
          downloadDirectory: config.uploadDirectory,
          executablePath: config.ytdlpPath,
          timeoutMs: config.ytdlpTimeoutMs,
        }),
    },
    {
      // Mock mode has no downloader, so YouTube URLs go to the transcriber as plain URLs.
      provide: YoutubeDownloader,
      inject: [APP_CONFIG, YtDlpYoutubeDownloader],
      useFactory: (config: AppConfig, downloader: YtDlpYoutubeDownloader) =>
        isLive(config) ? downloader : null,
    },
    {
      provide: VideoMetadataSource,
      inject: [APP_CONFIG, YtDlpYoutubeDownloader],
      useFactory: (config: AppConfig, downloader: YtDlpYoutubeDownloader) =>
        isLive(config) ? downloader : new MockVideoMetadataSource(),
    },
  ],
  exports: [
    TranscriptionProvider,
    SummaryProvider,
    VerdictProvider,
    InsightProvider,
    YoutubeDownloader,
    VideoMetadataSource,
  ],
})
export class SummaryProvidersModule {}
