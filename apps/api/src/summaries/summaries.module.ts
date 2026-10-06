import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DATABASE, type Database } from "../database/database.js";
import { SummaryJobsProcessor } from "./jobs/summary-jobs.processor.js";
import {
  BullSummaryQueue,
  SUMMARY_QUEUE,
  SummaryQueue,
} from "./jobs/summary-queue.js";
import { MediaPreparer } from "./media/media-preparer.js";
import { createUploadOptions } from "./uploads/upload-options.js";
import { SummaryProvidersModule } from "./providers/summary-providers.module.js";
import { PrecheckService } from "./services/precheck.service.js";
import { SummariesService } from "./services/summaries.service.js";
import { SummaryPipeline } from "./services/summary-pipeline.service.js";
import { SummariesController } from "./summaries.controller.js";
import { SummaryRepository } from "./summary.repository.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createUploadOptions({
          uploadDirectory: config.uploadDirectory,
          maxUploadBytes: config.maxUploadBytes,
        }),
    }),
    SummaryProvidersModule,
  ],
  controllers: [SummariesController],
  providers: [
    {
      provide: SummaryRepository,
      inject: [DATABASE],
      // Providers are built before any queue worker starts, so jobs cut off by
      // a restart are marked failed before the worker could pick them up again.
      useFactory: async (database: Database) => {
        const repository = new SummaryRepository(database);
        await repository.failInterruptedJobs();
        return repository;
      },
    },
    {
      provide: MediaPreparer,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MediaPreparer(config.uploadDirectory),
    },
    PrecheckService,
    SummariesService,
    SummaryPipeline,
    { provide: SummaryQueue, useClass: BullSummaryQueue },
    SummaryJobsProcessor,
  ],
})
export class SummariesModule {}
