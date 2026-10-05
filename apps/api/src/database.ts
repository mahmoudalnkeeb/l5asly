import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export function createDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS summary_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
      source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url')),
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
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS summary_jobs_created_at_idx
      ON summary_jobs (created_at DESC);
  `);

  const columns = z
    .array(z.object({ name: z.string() }))
    .parse(database.prepare("PRAGMA table_info(summary_jobs)").all());
  if (!columns.some((column) => column.name === "source_language")) {
    database.exec("ALTER TABLE summary_jobs ADD COLUMN source_language TEXT");
  }
  if (!columns.some((column) => column.name === "viewer_profile_json")) {
    database.exec(
      "ALTER TABLE summary_jobs ADD COLUMN viewer_profile_json TEXT",
    );
  }
  for (const [name, definition] of [
    ["failed_step", "TEXT"],
    ["error_code", "TEXT"],
    ["error_details_json", "TEXT"],
    ["attempt", "INTEGER NOT NULL DEFAULT 1"],
    ["stage_started_at", "TEXT"],
  ]) {
    if (!columns.some((column) => column.name === name)) {
      database.exec(
        `ALTER TABLE summary_jobs ADD COLUMN ${name} ${definition}`,
      );
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS summary_checkpoints (
      summary_id TEXT PRIMARY KEY REFERENCES summary_jobs(id) ON DELETE CASCADE,
      checkpoint_json TEXT NOT NULL
    );
  `);
  return database;
}
