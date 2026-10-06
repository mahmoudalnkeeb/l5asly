import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { SummariesService } from "../services/summaries.service.js";
import { SummaryPipeline } from "../services/summary-pipeline.service.js";
import {
  CLEANUP_EXPIRED_MEDIA_JOB,
  PROCESS_SUMMARY_JOB,
  SUMMARY_QUEUE,
  processSummaryJobSchema,
} from "./summary-queue.js";

// One worker with the default concurrency of 1, so summaries run one at a time.
@Processor(SUMMARY_QUEUE)
export class SummaryJobsProcessor extends WorkerHost {
  constructor(
    private readonly pipeline: SummaryPipeline,
    private readonly summaries: SummariesService,
    @InjectPinoLogger(SummaryJobsProcessor.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PROCESS_SUMMARY_JOB: {
        const { summaryId } = processSummaryJobSchema.parse(job.data);
        await this.pipeline.process(summaryId);
        return;
      }
      case CLEANUP_EXPIRED_MEDIA_JOB:
        await this.summaries.cleanupExpiredMedia();
        return;
      default:
        throw new Error(`Unknown job "${job.name}" in the ${SUMMARY_QUEUE} queue.`);
    }
  }

  // The pipeline records its own failures on the summary, so this only sees unexpected errors.
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { err: error, queueJobId: job?.id, queueJobName: job?.name },
      "Summary queue job failed",
    );
  }
}
