import type { Logger } from "pino";

import { SummaryService } from "./summary-service.js";

export class SummaryJobRunner {
  private readonly pendingJobIds: string[] = [];
  private isRunning = false;

  constructor(
    private readonly summaryService: SummaryService,
    private readonly log: Logger,
  ) {}

  enqueue(jobId: string): void {
    this.pendingJobIds.push(jobId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      while (this.pendingJobIds.length > 0) {
        const jobId = this.pendingJobIds.shift();
        if (jobId) {
          await this.summaryService.process(jobId);
        }
      }
    } catch (error) {
      this.log.error({ error }, "Summary job runner stopped unexpectedly");
    } finally {
      this.isRunning = false;
      if (this.pendingJobIds.length > 0) {
        void this.drain();
      }
    }
  }
}
