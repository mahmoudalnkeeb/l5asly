import type { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import {
  jobStatusSchema,
  summaryDepthSchema,
  summaryLanguageSchema,
  summaryResultSchema,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
  type SummaryResult,
} from "@l5sly/contracts";

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  source_type: z.enum(["upload", "url"]),
  source_name: z.string().min(1),
  source_url: z.string().nullable(),
  source_path: z.string().nullable(),
  source_mime_type: z.string().nullable(),
  language: summaryLanguageSchema,
  depth: summaryDepthSchema,
  expectation: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  stage: z.string().min(1),
  result_json: z.string().nullable(),
  error_message: z.string().nullable(),
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
  const legacyFields = z.object({ viewerAnswer: z.string().min(1).optional() }).safeParse(storedResult);

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
      depth: row.depth,
      expectation: row.expectation ?? undefined,
    },
    progress: row.progress,
    stage: row.stage,
    result: parseResult(row.result_json),
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SummaryRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(record: CreateSummaryRecord): StoredSummaryJob {
    const timestamp = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO summary_jobs (
          id, status, source_type, source_name, source_url, source_path, source_mime_type,
          language, depth, expectation, progress, stage, created_at, updated_at
        ) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Waiting to start', ?, ?)
      `)
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
        timestamp,
        timestamp,
      );

    return this.findById(record.id) ?? this.throwMissingCreatedRecord(record.id);
  }

  findById(id: string): StoredSummaryJob | null {
    const row = this.database
      .prepare("SELECT * FROM summary_jobs WHERE id = ?")
      .get(id);

    return row ? mapRow(summaryRowSchema.parse(row)) : null;
  }

  listRecent(limit: number): SummaryListItem[] {
    const rows = summaryRowSchema.array().parse(
      this.database
        .prepare("SELECT * FROM summary_jobs ORDER BY created_at DESC LIMIT ?")
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
      .prepare(`
        UPDATE summary_jobs
        SET status = 'processing', progress = ?, stage = ?, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `)
      .run(progress, stage, new Date().toISOString(), id);
  }

  complete(id: string, result: SummaryResult): void {
    this.database
      .prepare(`
        UPDATE summary_jobs
        SET status = 'completed', progress = 100, stage = 'Summary ready', result_json = ?, updated_at = ?
        WHERE id = ? AND status != 'cancelled'
      `)
      .run(JSON.stringify(result), new Date().toISOString(), id);
  }

  fail(id: string, message: string): void {
    this.database
      .prepare(`
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing failed', error_message = ?, updated_at = ?
        WHERE id = ? AND status != 'cancelled'
      `)
      .run(message, new Date().toISOString(), id);
  }

  cancel(id: string): void {
    this.database
      .prepare(`
        UPDATE summary_jobs
        SET status = 'cancelled', stage = 'Cancelled', updated_at = ?
        WHERE id = ? AND status IN ('queued', 'processing')
      `)
      .run(new Date().toISOString(), id);
  }

  failInterruptedJobs(): void {
    this.database
      .prepare(`
        UPDATE summary_jobs
        SET status = 'failed', stage = 'Processing interrupted',
            error_message = 'The server restarted before processing finished.', updated_at = ?
        WHERE status IN ('queued', 'processing')
      `)
      .run(new Date().toISOString());
  }

  private throwMissingCreatedRecord(id: string): never {
    throw new Error(`Summary ${id} was created but could not be read back.`);
  }
}
