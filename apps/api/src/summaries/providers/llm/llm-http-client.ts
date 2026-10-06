import { HttpClientModule } from "@nestjs/http-client";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";

export const LLM_HTTP_CLIENT = "llm";

// Chat completions are POST requests, which are never safe to repeat, so retries stay off.
export const llmHttpClient = HttpClientModule.registerAsync({
  name: LLM_HTTP_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => ({
    baseUrl: config.llmBaseUrl,
    headers: config.llmApiKey
      ? { authorization: `Bearer ${config.llmApiKey}` }
      : {},
    timeout: config.llmTimeoutMs,
    retry: false,
  }),
});
