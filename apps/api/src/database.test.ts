import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createDatabase } from "./database.js";
import { SummaryRepository } from "./modules/summaries/summary-repository.js";

describe("database upgrades", () => {
  it("adds language and profile columns without losing older jobs, and is repeatable", () => {
    const testDirectory = mkdtempSync(path.join(tmpdir(), "l5asly-migration-"));
    const databasePath = path.join(testDirectory, "test.db");
    const id = randomUUID();
    let database = createDatabase(databasePath);
    try {
      new SummaryRepository(database).create({
        id,
        sourceType: "url",
        sourceName: "example.com",
        options: { language: "Arabic", depth: "quick" },
      });
      database.exec(
        "ALTER TABLE summary_jobs DROP COLUMN source_language; ALTER TABLE summary_jobs DROP COLUMN viewer_profile_json; ALTER TABLE summary_jobs DROP COLUMN failed_step; ALTER TABLE summary_jobs DROP COLUMN error_code; ALTER TABLE summary_jobs DROP COLUMN error_details_json; ALTER TABLE summary_jobs DROP COLUMN attempt; ALTER TABLE summary_jobs DROP COLUMN stage_started_at;",
      );
      database.close();
      database = createDatabase(databasePath);
      const job = new SummaryRepository(database).findById(id);
      expect(job?.options.sourceLanguage).toBe("Arabic");
      expect(job?.options.viewerProfile).toBeUndefined();
      expect(job?.source.name).toBe("example.com");
      expect(job?.attempt).toBe(1);
      expect(job?.failedStep).toBeNull();
      database.close();
      database = createDatabase(databasePath);
      expect(new SummaryRepository(database).findById(id)?.id).toBe(id);
    } finally {
      database.close();
      rmSync(testDirectory, { recursive: true, force: true });
    }
  });
});
