import type { Transaction } from "@tursodatabase/database";
import { z } from "zod";

import {
  jobStatusSchema,
  jobStepSchema,
  sourceTypeSchema,
  summaryDepthSchema,
  summaryLanguageSchema,
  viewerProfileSchema,
  summaryResultSchema,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
  type SummaryResult,
  type SummarySource,
  type JobStep,
} from "@l5asly/contracts";

import type { Database } from "../database/database.js";
import {
  summaryCheckpointSchema,
  type SummaryCheckpoint,
} from "./summary-checkpoint.js";

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  source_type: sourceTypeSchema,
  source_name: z.string().min(1),
  source_url: z.string().nullable(),
  source_path: z.string().nullable(),
  source_mime_type: z.string().nullable(),
  language: summaryLanguageSchema,
  source_language: summaryLanguageSchema.nullable(),
  viewer_profile_json: z.string().nullable(),
  depth: summaryDepthSchema,
  expectation: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  stage: z.string().min(1),
  result_json: z.string().nullable(),
  error_message: z.string().nullable(),
  failed_step: jobStepSchema.nullable(),
  error_code: z.string().nullable(),
  error_details_json: z.string().nullable(),
  attempt: z.number().int().positive(),
  stage_started_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

type SummaryRow = z.infer<typeof summaryRowSchema>;

export interface StoredSummaryJob extends SummaryJob {
  sourcePath?: string;
  sourceMimeType?: string;
}

export interface CreateSummaryRecord {
  id: string;
  source: SummarySource;
  sourcePath?: string;
  sourceMimeType?: string;
  options: SummaryOptions;
}

function parseResult(resultJson: string | null): SummaryResult | null {
  if (!resultJson) {
    return null;
  }

  const storedResult: unknown = JSON.parse(resultJson);
  const result = summaryResultSchema.parse(storedResult);
  const legacyFields = z
    .object({ viewerAnswer: z.string().min(1).optional() })
    .safeParse(storedResult);

  if (legacyFields.success && !legacyFields.data.viewerAnswer) {
    return {
      ...result,
      viewerAnswer: result.overview,
    };
  }

  return result;
}

function mapSource(row: SummaryRow): SummarySource {
  if (row.source_type === "upload") {
    return { type: "upload", name: row.source_name };
  }
  // The table's CHECK constraint guarantees a URL for every link source.
  if (!row.source_url) {
    throw new Error(`Summary ${row.id} is a link source without a URL.`);
  }
  return {
    type: row.source_type,
    name: row.source_name,
    url: row.source_url,
  };
}

function mapRow(row: SummaryRow): StoredSummaryJob {
  return {
    id: row.id,
    status: row.status,
    source: mapSource(row),
    sourcePath: row.source_path ?? undefined,
    sourceMimeType: row.source_mime_type ?? undefined,
    options: {
      language: row.language,
      sourceLanguage: row.source_language ?? row.language,
      viewerProfile: row.viewer_profile_json
        ? viewerProfileSchema.parse(JSON.parse(row.viewer_profile_json))
        : undefined,
      depth: row.depth,
      expectation: row.expectation ?? undefined,
    },
    progress: row.progress,
    stage: row.stage,
    result: parseResult(row.result_json),
    error: row.error_message,
    failedStep: row.failed_step,
    errorCode: row.error_code,
    errorDetails: row.error_details_json
      ? z
          .record(z.string(), z.array(z.string()))
          .parse(JSON.parse(row.error_details_json))
      : undefined,
    attempt: row.attempt,
    stageStartedAt: row.stage_started_at ?? row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type SqlExecutor = Pick<Database, "run" | "get" | "all">;

export class SummaryRepository {
  constructor(private readonly database: Database) {}

  async getCheckpoint(id: string): Promise<SummaryCheckpoint> {
    const row: unknown = await this.database.get(
      "SELECT checkpoint_json FROM summary_checkpoints WHERE summary_id = ?",
      id,
    );
    if (!row) return {};
    const stored = z.object({ checkpoint_json: z.string() }).parse(row);
    return summaryCheckpointSchema.parse(JSON.parse(stored.checkpoint_json));
  }

  async saveCheckpoint(
    id: string,
    checkpoint: SummaryCheckpoint,
  ): Promise<void> {
    await this.writeCheckpoint(this.database, id, checkpoint);
  }

  async clearCheckpoint(id: string): Promise<void> {
    await this.database.run(
      "DELETE FROM summary_checkpoints WHERE summary_id = ?",
      id,
    );
  }

  async retry(
    id: string,
    fromStep: JobStep,
    upload?: { path: string; mimeType: string; mediaExpiresAt: string },
  ): Promise<boolean> {
    const progress =
      fromStep === "summary" ? 68 : fromStep === "transcription" ? 34 : 0;
    // transactionAsync holds the connection, so no other statement can interleave.
    const retryInTransaction = this.database.transactionAsync(
      async (transaction: Transaction) => {
        const update = await transaction.run(
          "UPDATE summary_jobs SET status = 'queued', progress = ?, stage = 'Waiting to retry', error_message = NULL, failed_step = NULL, error_code = NULL, error_details_json = NULL, attempt = attempt + 1, updated_at = ?, stage_started_at = NULL WHERE id = ? AND status = 'failed'",
          progress,
          new Date().toISOString(),
          id,
        );
        const retried = update.changes === 1;
        if (retried && upload) {
          await transaction.run(
            "UPDATE summary_jobs SET source_path = ?, source_mime_type = ? WHERE id = ?",
            upload.path,
            upload.mimeType,
            id,
          );
          await this.writeCheckpoint(transaction, id, {
            mediaExpiresAt: upload.mediaExpiresAt,
          });
        }
        return retried;
      },
    );
    return retryInTransaction.immediate();
  }

  async delete(id: string): Promise<void> {
    await this.database.run("DELETE FROM summary_jobs WHERE id = ?", id);
  }

  async listFailed(): Promise<StoredSummaryJob[]> {
    const rows = summaryRowSchema
      .array()
      .parse(
        await this.database.all(
          "SELECT * FROM summary_jobs WHERE status = 'failed'",
        ),
      );
    return rows.map(mapRow);
  }

  async create(record: CreateSummaryRecord): Promise<StoredSummaryJob> {
    const timestamp = new Date().toISOString();
    await this.database.run(
      `
        INSERT INTO summary_jobs (
          id, status, source_type, source_name, source_url, source_path, source_mime_type,
          language, depth, expectation, source_language, viewer_profile_json, progress, stage, created_at, updated_at
        ) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Waiting to start', ?, ?)
      `,
      record.id,
      record.source.type,
      record.source.name,
      record.source.type === "upload" ? null : record.source.url,
      record.sourcePath ?? null,
      record.sourceMimeType ?? null,
      record.options.language,
      record.options.depth,
      record.options.expectation ?? null,
      record.options.sourceLanguage ?? record.options.language,
      record.options.viewerProfile
        ? JSON.stringify(record.options.viewerProfile)
        : null,
      timestamp,
      timestamp,
    );

    const created = await this.findById(record.id);
    if (!created) {
      throw new Error(
        `Summary ${record.id} was created but could not be read back.`,
      );
    }
    return created;
  }

  async findById(id: string): Promise<StoredSummaryJob | null> {
    const row: unknown = await this.database.get(
      "SELECT * FROM summary_jobs WHERE id = ?",
      id,
    );

    return row ? mapRow(summaryRowSchema.parse(row)) : null;
  }

  async listRecent(limit: number): Promise<SummaryListItem[]> {
    const rows = summaryRowSchema
      .array()
      .parse(
        await this.database.all(
          "SELECT * FROM summary_jobs ORDER BY created_at DESC LIMIT ?",
          limit,
        ),
      );

    return rows.map((row) => {
      const job = mapRow(row);
      return {
        id: job.id,
        status: job.status,
        source: job.source,
        progress: job.progress,
        stage: job.stage,
        title: job.result?.title ?? null,
        verdict: job.result?.verdict ?? null,
        durationSeconds: job.result?.durationSeconds ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    });
  }

  async updateProgress(
    id: string,
    progress: number,
    stage: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.database.run(
      `
        UPDATE summary_jobs
        SET status = 'processing', progress = ?, stage = ?, updated_at = ?, stage_started_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `,
      progress,
      stage,
      timestamp,
      timestamp,
      id,
    );
  }

  async updateSourceName(id: string, name: string): Promise<void> {
    await this.database.run(
      "UPDATE summary_jobs SET source_name = ?, updated_at = ? WHERE id = ?",
      name,
      new Date().toISOString(),
      id,
    );
  }

  async complete(id: string, result: SummaryResult): Promise<void> {
    await this.database.run(
      `
        UPDATE summary_jobs
        SET status = 'completed', progress = 100, stage = 'Summary ready', result_json = ?, updated_at = ?
        WHERE id = ? AND status != 'cancelled'
      `,
      JSON.stringify(result),
      new Date().toISOString(),
      id,
    );
  }

  async fail(
    id: string,
    message: string,
    failure?: {
      step: JobStep;
      code: string;
      details?: Record<string, string[]>;
    },
  ): Promise<void> {
    await this.database.run(
      `
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing failed', error_message = ?, updated_at = ?, failed_step = ?, error_code = ?, error_details_json = ?
        WHERE id = ? AND status != 'cancelled'
      `,
      message,
      new Date().toISOString(),
      failure?.step ?? null,
      failure?.code ?? null,
      failure?.details ? JSON.stringify(failure.details) : null,
      id,
    );
  }

  async cancel(id: string): Promise<void> {
    await this.database.run(
      `
        UPDATE summary_jobs
        SET status = 'cancelled', stage = 'Cancelled', updated_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `,
      new Date().toISOString(),
      id,
    );
  }

  async failInterruptedJobs(): Promise<void> {
    await this.database.run(
      `
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing interrupted',
            error_message = 'The server restarted before processing finished.', updated_at = ?,
            failed_step = CASE WHEN progress >= 68 THEN 'summary' WHEN progress >= 34 THEN 'transcription' ELSE 'media' END,
            error_code = 'JOB_INTERRUPTED'
        WHERE status IN ('queued', 'processing')
      `,
      new Date().toISOString(),
    );
  }

  private async writeCheckpoint(
    executor: SqlExecutor,
    id: string,
    checkpoint: SummaryCheckpoint,
  ): Promise<void> {
    const valid = summaryCheckpointSchema.parse(checkpoint);
    await executor.run(
      "INSERT INTO summary_checkpoints (summary_id, checkpoint_json) VALUES (?, ?) ON CONFLICT(summary_id) DO UPDATE SET checkpoint_json = excluded.checkpoint_json",
      id,
      JSON.stringify(valid),
    );
  }
}
