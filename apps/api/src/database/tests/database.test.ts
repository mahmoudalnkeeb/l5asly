import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
        sourceType: "url",
        sourceName: "example.com",
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
      expect(job?.source.name).toBe("example.com");
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
});
