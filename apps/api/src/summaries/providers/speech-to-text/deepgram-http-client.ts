import { HttpClientModule } from "@nestjs/http-client";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";

export const DEEPGRAM_HTTP_CLIENT = "deepgram";

// Transcription requests are POST requests, which are never safe to repeat, so retries stay off.
export const deepgramHttpClient = HttpClientModule.registerAsync({
  name: DEEPGRAM_HTTP_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => ({
    baseUrl: "https://api.deepgram.com",
    headers: config.deepgramApiKey
      ? { authorization: `Token ${config.deepgramApiKey}` }
      : {},
    timeout: config.deepgramTimeoutMs,
    retry: false,
  }),
});
