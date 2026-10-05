import type { Logger } from "pino";

import { SummaryService } from "./summary-service.js";

export class SummaryJobRunner {
  private readonly pendingJobIds: string[] = [];
  private isRunning = false;
  private activeJobId: string | null = null;

  constructor(
    private readonly summaryService: SummaryService,
    private readonly log: Logger,
  ) {}

  enqueue(jobId: string): void {
    if (this.pendingJobIds.includes(jobId)) return;
    this.pendingJobIds.push(jobId);
    void this.drain();
  }

  isProcessing(jobId: string): boolean {
    return this.activeJobId === jobId;
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
          this.activeJobId = jobId;
          await this.summaryService.process(jobId);
          this.activeJobId = null;
        }
      }
    } catch (error) {
      this.log.error({ error }, "Summary job runner stopped unexpectedly");
    } finally {
      this.activeJobId = null;
      this.isRunning = false;
      if (this.pendingJobIds.length > 0) {
        void this.drain();
      }
    }
  }
}
