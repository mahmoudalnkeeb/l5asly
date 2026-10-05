import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

  return database;
}
