import { HttpClientModule } from "@nestjs/http-client";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";

export const JEV_HTTP_CLIENT = "jev";

// Jev questions are POST requests, which are never safe to repeat, so retries stay off.
export const jevHttpClient = HttpClientModule.registerAsync({
  name: JEV_HTTP_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => ({
    baseUrl: config.jevBaseUrl,
    headers: config.jevApiKey
      ? { authorization: `Bearer ${config.jevApiKey}` }
      : {},
    timeout: config.jevTimeoutMs,
    retry: false,
  }),
});
