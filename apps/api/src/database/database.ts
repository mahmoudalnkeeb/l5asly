import { mkdirSync } from "node:fs";
import path from "node:path";

import { connect, type Database } from "@tursodatabase/database";
import { z } from "zod";

import { describeUrlSource } from "../summaries/url-source.js";

export type { Database };

export const DATABASE = Symbol("DATABASE");

// Link sources must keep their URL so the UI can point back to the original media.
function createSummaryJobsTableSql(tableName: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
      source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'youtube', 'public_video', 'public_audio')),
      source_name TEXT NOT NULL,
      source_url TEXT,
      source_path TEXT,
      source_mime_type TEXT,
      language TEXT NOT NULL,
      depth TEXT NOT NULL CHECK (depth IN ('quick', 'detailed', 'study')),
      expectation TEXT,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      stage TEXT NOT NULL,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_language TEXT,
      viewer_profile_json TEXT,
      failed_step TEXT,
      error_code TEXT,
      error_details_json TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      stage_started_at TEXT,
      CHECK ((source_type = 'upload') = (source_url IS NULL))
    );
  `;
}

const SUMMARY_JOBS_COLUMNS =
  "id, status, source_type, source_name, source_url, source_path, source_mime_type, language, depth, expectation, progress, stage, result_json, error_message, created_at, updated_at, source_language, viewer_profile_json, failed_step, error_code, error_details_json, attempt, stage_started_at";

export async function openDatabase(databasePath: string): Promise<Database> {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = await connect(databasePath);
  await database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await database.exec(createSummaryJobsTableSql("summary_jobs"));
  await addMissingColumns(database);
  await upgradeSourceTypes(database);
  await database.exec(`
    CREATE INDEX IF NOT EXISTS summary_jobs_created_at_idx
      ON summary_jobs (created_at DESC);

    CREATE TABLE IF NOT EXISTS summary_checkpoints (
      summary_id TEXT PRIMARY KEY REFERENCES summary_jobs(id) ON DELETE CASCADE,
      checkpoint_json TEXT NOT NULL
    );
  `);
  return database;
}

async function addMissingColumns(database: Database): Promise<void> {
  const columns = z
    .array(z.object({ name: z.string() }))
    .parse(await database.all("PRAGMA table_info(summary_jobs)"));
  const addedColumns = [
    ["source_language", "TEXT"],
    ["viewer_profile_json", "TEXT"],
    ["failed_step", "TEXT"],
    ["error_code", "TEXT"],
    ["error_details_json", "TEXT"],
    ["attempt", "INTEGER NOT NULL DEFAULT 1"],
    ["stage_started_at", "TEXT"],
  ];
  for (const [name, definition] of addedColumns) {
    if (!columns.some((column) => column.name === name)) {
      await database.exec(
        `ALTER TABLE summary_jobs ADD COLUMN ${name} ${definition}`,
      );
    }
  }
}

// Older databases only knew 'upload' and 'url'. SQLite cannot change a CHECK
// constraint in place, so the table is rebuilt once and each link is reclassified.
async function upgradeSourceTypes(database: Database): Promise<void> {
  const table = z
    .object({ sql: z.string() })
    .parse(
      await database.get(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'summary_jobs'",
      ),
    );
  if (table.sql.includes("'public_audio'")) {
    return;
  }

  const legacyLinks = z
    .array(
      z.object({ id: z.string(), source_name: z.string(), source_url: z.string() }),
    )
    .parse(
      await database.all(
        "SELECT id, source_name, source_url FROM summary_jobs WHERE source_type = 'url'",
      ),
    );

  // Dropping the old table would otherwise cascade-delete every checkpoint.
  await database.exec("PRAGMA foreign_keys = OFF;");
  try {
    const rebuild = database.transactionAsync(async (transaction) => {
      await transaction.exec(createSummaryJobsTableSql("summary_jobs_upgraded"));
      await transaction.exec(`
        INSERT INTO summary_jobs_upgraded (${SUMMARY_JOBS_COLUMNS})
        SELECT ${SUMMARY_JOBS_COLUMNS.replace(
          "source_type",
          "CASE source_type WHEN 'url' THEN 'public_video' ELSE source_type END",
        )}
        FROM summary_jobs;
      `);
      for (const link of legacyLinks) {
        const source = describeUrlSource(link.source_url);
        // YouTube jobs keep their stored name; only file links gain a better one.
        const name = source.type === "youtube" ? link.source_name : source.name;
        await transaction.run(
          "UPDATE summary_jobs_upgraded SET source_type = ?, source_name = ? WHERE id = ?",
          source.type,
          name,
          link.id,
        );
      }
      await transaction.exec(`
        DROP TABLE summary_jobs;
        ALTER TABLE summary_jobs_upgraded RENAME TO summary_jobs;
      `);
    });
    await rebuild.immediate();
  } finally {
    await database.exec("PRAGMA foreign_keys = ON;");
  }
}
