import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";
import { z } from "zod";

export const SUMMARY_QUEUE = "summaries";
export const PROCESS_SUMMARY_JOB = "process-summary";
export const CLEANUP_EXPIRED_MEDIA_JOB = "cleanup-expired-media";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export const processSummaryJobSchema = z.object({
  summaryId: z.string().uuid(),
});

export type ProcessSummaryJobData = z.infer<typeof processSummaryJobSchema>;

// Abstract so tests can swap in an in-process queue.
export abstract class SummaryQueue {
  abstract enqueue(summaryId: string): Promise<void>;
}

@Injectable()
export class BullSummaryQueue
  extends SummaryQueue
  implements OnApplicationBootstrap
{
  constructor(@InjectQueue(SUMMARY_QUEUE) private readonly queue: Queue) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CLEANUP_EXPIRED_MEDIA_JOB,
      { every: CLEANUP_INTERVAL_MS },
      { name: CLEANUP_EXPIRED_MEDIA_JOB },
    );
  }

  override async enqueue(summaryId: string): Promise<void> {
    const data: ProcessSummaryJobData = { summaryId };
    // The summary ID is the job ID, so a summary that is already waiting is not added twice.
    await this.queue.add(PROCESS_SUMMARY_JOB, data, {
      jobId: summaryId,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
