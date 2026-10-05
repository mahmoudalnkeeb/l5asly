import type { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import {
  jobStatusSchema,
  jobStepSchema,
  summaryDepthSchema,
  summaryLanguageSchema,
  viewerProfileSchema,
  summaryResultSchema,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
  type SummaryResult,
  type JobStep,
} from "@l5sly/contracts";
import {
  summaryCheckpointSchema,
  type SummaryCheckpoint,
} from "./summary-checkpoint.js";

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  source_type: z.enum(["upload", "url"]),
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
  sourceUrl?: string;
  sourcePath?: string;
  sourceMimeType?: string;
}

export interface CreateSummaryRecord {
  id: string;
  sourceType: "upload" | "url";
  sourceName: string;
  sourceUrl?: string;
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

function mapRow(row: SummaryRow): StoredSummaryJob {
  return {
    id: row.id,
    status: row.status,
    source: {
      type: row.source_type,
      name: row.source_name,
    },
    sourceUrl: row.source_url ?? undefined,
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

export class SummaryRepository {
  constructor(private readonly database: DatabaseSync) {}

  getCheckpoint(id: string): SummaryCheckpoint {
    const row = this.database
      .prepare(
        "SELECT checkpoint_json FROM summary_checkpoints WHERE summary_id = ?",
      )
      .get(id);
    if (!row) return {};
    const stored = z.object({ checkpoint_json: z.string() }).parse(row);
    return summaryCheckpointSchema.parse(JSON.parse(stored.checkpoint_json));
  }

  saveCheckpoint(id: string, checkpoint: SummaryCheckpoint): void {
    const valid = summaryCheckpointSchema.parse(checkpoint);
    this.database
      .prepare(
        "INSERT INTO summary_checkpoints (summary_id, checkpoint_json) VALUES (?, ?) ON CONFLICT(summary_id) DO UPDATE SET checkpoint_json = excluded.checkpoint_json",
      )
      .run(id, JSON.stringify(valid));
  }

  clearCheckpoint(id: string): void {
    this.database
      .prepare("DELETE FROM summary_checkpoints WHERE summary_id = ?")
      .run(id);
  }

  retry(
    id: string,
    fromStep: JobStep,
    upload?: { path: string; mimeType: string; mediaExpiresAt: string },
  ): boolean {
    const progress =
      fromStep === "summary" ? 68 : fromStep === "transcription" ? 34 : 0;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const retried =
        this.database
          .prepare(
            "UPDATE summary_jobs SET status = 'queued', progress = ?, stage = 'Waiting to retry', error_message = NULL, failed_step = NULL, error_code = NULL, error_details_json = NULL, attempt = attempt + 1, updated_at = ?, stage_started_at = NULL WHERE id = ? AND status = 'failed'",
          )
          .run(progress, new Date().toISOString(), id).changes === 1;
      if (retried && upload) {
        this.replaceUpload(id, upload);
        this.clearCheckpoint(id);
        this.saveCheckpoint(id, { mediaExpiresAt: upload.mediaExpiresAt });
      }
      this.database.exec("COMMIT");
      return retried;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  replaceUpload(id: string, input: { path: string; mimeType: string }): void {
    this.database
      .prepare(
        "UPDATE summary_jobs SET source_path = ?, source_mime_type = ? WHERE id = ?",
      )
      .run(input.path, input.mimeType, id);
  }

  delete(id: string): void {
    this.database.prepare("DELETE FROM summary_jobs WHERE id = ?").run(id);
  }

  listFailed(): StoredSummaryJob[] {
    return summaryRowSchema
      .array()
      .parse(
        this.database
          .prepare("SELECT * FROM summary_jobs WHERE status = 'failed'")
          .all(),
      )
      .map(mapRow);
  }

  create(record: CreateSummaryRecord): StoredSummaryJob {
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        `
        INSERT INTO summary_jobs (
          id, status, source_type, source_name, source_url, source_path, source_mime_type,
          language, depth, expectation, source_language, viewer_profile_json, progress, stage, created_at, updated_at
        ) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Waiting to start', ?, ?)
      `,
      )
      .run(
        record.id,
        record.sourceType,
        record.sourceName,
        record.sourceUrl ?? null,
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

    return (
      this.findById(record.id) ?? this.throwMissingCreatedRecord(record.id)
    );
  }

  findById(id: string): StoredSummaryJob | null {
    const row = this.database
      .prepare("SELECT * FROM summary_jobs WHERE id = ?")
      .get(id);

    return row ? mapRow(summaryRowSchema.parse(row)) : null;
  }

  listRecent(limit: number): SummaryListItem[] {
    const rows = summaryRowSchema
      .array()
      .parse(
        this.database
          .prepare(
            "SELECT * FROM summary_jobs ORDER BY created_at DESC LIMIT ?",
          )
          .all(limit),
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

  updateProgress(id: string, progress: number, stage: string): void {
    this.database
      .prepare(
        `
        UPDATE summary_jobs
        SET status = 'processing', progress = ?, stage = ?, updated_at = ?, stage_started_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `,
      )
      .run(
        progress,
        stage,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
  }

  complete(id: string, result: SummaryResult): void {
    this.database
      .prepare(
        `
        UPDATE summary_jobs
        SET status = 'completed', progress = 100, stage = 'Summary ready', result_json = ?, updated_at = ?
        WHERE id = ? AND status != 'cancelled'
      `,
      )
      .run(JSON.stringify(result), new Date().toISOString(), id);
  }

  fail(
    id: string,
    message: string,
    failure?: {
      step: JobStep;
      code: string;
      details?: Record<string, string[]>;
    },
  ): void {
    this.database
      .prepare(
        `
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing failed', error_message = ?, updated_at = ?, failed_step = ?, error_code = ?, error_details_json = ?
        WHERE id = ? AND status != 'cancelled'
      `,
      )
      .run(
        message,
        new Date().toISOString(),
        failure?.step ?? null,
        failure?.code ?? null,
        failure?.details ? JSON.stringify(failure.details) : null,
        id,
      );
  }

  cancel(id: string): void {
    this.database
      .prepare(
        `
        UPDATE summary_jobs
        SET status = 'cancelled', stage = 'Cancelled', updated_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `,
      )
      .run(new Date().toISOString(), id);
  }

  failInterruptedJobs(): void {
    this.database
      .prepare(
        `
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing interrupted',
            error_message = 'The server restarted before processing finished.', updated_at = ?,
            failed_step = CASE WHEN progress >= 68 THEN 'summary' WHEN progress >= 34 THEN 'transcription' ELSE 'media' END,
            error_code = 'JOB_INTERRUPTED'
        WHERE status IN ('queued', 'processing')
      `,
      )
      .run(new Date().toISOString());
  }

  private throwMissingCreatedRecord(id: string): never {
    throw new Error(`Summary ${id} was created but could not be read back.`);
  }
}
