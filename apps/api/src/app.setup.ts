import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import type { AppConfig } from "./config/app-config.js";

// HTTP settings shared by main.ts and the end-to-end tests.
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
): void {
  app.useLogger(app.get(Logger));
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.enableCors({ origin: config.clientOrigin });
  app.useBodyParser("json", { limit: "1mb" });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
}
