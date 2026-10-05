import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

import type { AppConfig } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { SummaryJobRunner } from "./modules/summaries/summary-job-runner.js";
import { createSummaryRouter } from "./modules/summaries/summary-router.js";
import { SummaryService } from "./modules/summaries/summary-service.js";
import { createUploadMiddleware } from "./upload.js";

export function createApp(options: {
  config: AppConfig;
  summaryService: SummaryService;
  jobRunner: SummaryJobRunner;
  log: Logger;
}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: options.config.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);
  app.use(pinoHttp({ logger: options.log }));

  app.get("/api/health", (_request, response) => {
    response.json({
      data: {
        status: "ok",
        providerMode: options.config.providerMode,
      },
    });
  });

  app.use(
    "/api/summaries",
    createSummaryRouter({
      summaryService: options.summaryService,
      jobRunner: options.jobRunner,
      upload: createUploadMiddleware({
        uploadDirectory: options.config.uploadDirectory,
        maxUploadBytes: options.config.maxUploadBytes,
      }),
    }),
  );

  if (options.config.nodeEnv === "production") {
    const clientDirectory = fileURLToPath(new URL("../../web/dist/", import.meta.url));
    app.use(express.static(clientDirectory));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
        response.sendFile(path.join(clientDirectory, "index.html"));
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
