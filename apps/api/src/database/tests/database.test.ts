import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { connect } from "@tursodatabase/database";
import { describe, expect, it } from "vitest";

import { SummaryRepository } from "../../summaries/summary.repository.js";
import { openDatabase } from "../database.js";

describe("database upgrades", () => {
  it("adds language and profile columns without losing older jobs, and is repeatable", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5asly-migration-"));
    const databasePath = path.join(testDirectory, "test.db");
    const id = randomUUID();
    let database = await openDatabase(databasePath);
    try {
      await new SummaryRepository(database).create({
        id,
        source: {
          type: "public_video",
          name: "talk.mp4",
          url: "https://example.com/talk.mp4",
        },
        options: { language: "Arabic", depth: "quick" },
      });
      await database.exec(
        "ALTER TABLE summary_jobs DROP COLUMN source_language; ALTER TABLE summary_jobs DROP COLUMN viewer_profile_json; ALTER TABLE summary_jobs DROP COLUMN failed_step; ALTER TABLE summary_jobs DROP COLUMN error_code; ALTER TABLE summary_jobs DROP COLUMN error_details_json; ALTER TABLE summary_jobs DROP COLUMN attempt; ALTER TABLE summary_jobs DROP COLUMN stage_started_at;",
      );
      await database.close();
      database = await openDatabase(databasePath);
      const job = await new SummaryRepository(database).findById(id);
      expect(job?.options.sourceLanguage).toBe("Arabic");
      expect(job?.options.viewerProfile).toBeUndefined();
      expect(job?.source.name).toBe("talk.mp4");
      expect(job?.attempt).toBe(1);
      expect(job?.failedStep).toBeNull();
      await database.close();
      database = await openDatabase(databasePath);
      expect((await new SummaryRepository(database).findById(id))?.id).toBe(id);
    } finally {
      await database.close();
      await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it("reclassifies legacy link sources and keeps their checkpoints", async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), "l5asly-migration-"));
    const databasePath = path.join(testDirectory, "test.db");
    const ids = {
      upload: randomUUID(),
      youtube: randomUUID(),
      audio: randomUUID(),
      video: randomUUID(),
    };
    await createLegacyDatabase(databasePath, [
      [ids.upload, "upload", "lecture.mp4", null],
      [ids.youtube, "url", "youtube.com", "https://www.youtube.com/watch?v=abc123"],
      [ids.audio, "url", "example.com", "https://example.com/files/Episode%2012.mp3"],
      [ids.video, "url", "cdn.example.com", "https://cdn.example.com/talk.mp4?token=1"],
    ]);

    let database = await openDatabase(databasePath);
    try {
      const repository = new SummaryRepository(database);
      expect((await repository.findById(ids.upload))?.source).toEqual({
        type: "upload",
        name: "lecture.mp4",
      });
      expect((await repository.findById(ids.youtube))?.source).toEqual({
        type: "youtube",
        name: "youtube.com",
        url: "https://www.youtube.com/watch?v=abc123",
      });
      expect((await repository.findById(ids.audio))?.source).toEqual({
        type: "public_audio",
        name: "Episode 12.mp3",
        url: "https://example.com/files/Episode%2012.mp3",
      });
      expect((await repository.findById(ids.video))?.source).toEqual({
        type: "public_video",
        name: "talk.mp4",
        url: "https://cdn.example.com/talk.mp4?token=1",
      });
      expect(await repository.getCheckpoint(ids.youtube)).toEqual({
        mediaExpiresAt: "2026-01-01T00:00:00.000Z",
      });
      await expect(
        database.run(
          "UPDATE summary_jobs SET source_type = 'url' WHERE id = ?",
          ids.video,
        ),
      ).rejects.toThrow(/CHECK constraint/);

      await database.close();
      database = await openDatabase(databasePath);
      expect(
        (await new SummaryRepository(database).findById(ids.audio))?.source.type,
      ).toBe("public_audio");
    } finally {
      await database.close();
      await rm(testDirectory, { recursive: true, force: true });
    }
  });
});

type LegacyRow = [
  id: string,
  sourceType: "upload" | "url",
  sourceName: string,
  sourceUrl: string | null,
];

// The schema as it was before link sources were split by media type.
async function createLegacyDatabase(
  databasePath: string,
  rows: LegacyRow[],
): Promise<void> {
  const database = await connect(databasePath);
  await database.exec(`
    CREATE TABLE summary_jobs (
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
    CREATE TABLE summary_checkpoints (
      summary_id TEXT PRIMARY KEY REFERENCES summary_jobs(id) ON DELETE CASCADE,
      checkpoint_json TEXT NOT NULL
    );
  `);
  const timestamp = new Date().toISOString();
  for (const [id, sourceType, sourceName, sourceUrl] of rows) {
    await database.run(
      "INSERT INTO summary_jobs (id, status, source_type, source_name, source_url, language, depth, stage, created_at, updated_at) VALUES (?, 'failed', ?, ?, ?, 'English', 'quick', 'Processing failed', ?, ?)",
      id,
      sourceType,
      sourceName,
      sourceUrl,
      timestamp,
      timestamp,
    );
    await database.run(
      "INSERT INTO summary_checkpoints (summary_id, checkpoint_json) VALUES (?, ?)",
      id,
      JSON.stringify({ mediaExpiresAt: "2026-01-01T00:00:00.000Z" }),
    );
  }
  await database.close();
}
