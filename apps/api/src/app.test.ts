import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isYouTubeUrl, summaryJobSchema, summaryListItemSchema } from "@l5sly/contracts";

import { buildApplication, type ApplicationRuntime } from "./bootstrap.js";
import type { AppConfig } from "./config.js";

let runtime: ApplicationRuntime;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "l5sly-api-"));
  const config: AppConfig = {
    nodeEnv: "test",
    port: 4000,
    clientOrigin: "http://localhost:5173",
    databasePath: ":memory:",
    uploadDirectory: testDirectory,
    maxUploadBytes: 10 * 1024 * 1024,
    providerMode: "mock",
    deepgramTimeoutMs: 1_000,
    llmBaseUrl: "https://example.com/v1",
    llmModel: "test-model",
    llmTimeoutMs: 1_000,
    jevBaseUrl: "https://example.com/v1",
    jevModel: "test-verdict",
    jevTimeoutMs: 1_000,
    ytdlpPath: "yt-dlp",
    ytdlpTimeoutMs: 10_000,
  };
  runtime = buildApplication(config);
});

afterAll(async () => {
  runtime.database.close();
  await rm(testDirectory, { recursive: true, force: true });
});

describe("summary API", () => {
  it("recognizes supported YouTube URL formats", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc123?t=30")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/shorts/abc123")).toBe(true);
    expect(isYouTubeUrl("https://example.com/watch?v=abc123")).toBe(false);
  });

  it("reports service health", async () => {
    const response = await request(runtime.app).get("/api/health").expect(200);
    expect(response.body.data).toEqual({ status: "ok", providerMode: "mock" });
  });

  it("rejects invalid URL input", async () => {
    const response = await request(runtime.app)
      .post("/api/summaries/url")
      .send({ url: "not-a-url", language: "English", depth: "quick" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("rejects a YouTube page without a video identifier", async () => {
    const response = await request(runtime.app)
      .post("/api/summaries/url")
      .send({ url: "https://www.youtube.com/watch", language: "English", depth: "quick" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("processes and persists a summary job", async () => {
    const createResponse = await request(runtime.app)
      .post("/api/summaries/url")
      .send({
        url: "https://www.youtube.com/watch?v=abc123",
        language: "English",
        depth: "quick",
        expectation: "I want practical team advice.",
      })
      .expect(202);

    const createdJob = summaryJobSchema.parse(createResponse.body.data);
    expect(createResponse.body.data).not.toHaveProperty("sourceUrl");
    const jobId = createdJob.id;
    let completedJob;
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const response = await request(runtime.app).get(`/api/summaries/${jobId}`).expect(200);
      const job = summaryJobSchema.parse(response.body.data);
      if (job.status === "completed") {
        completedJob = job;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(completedJob?.result?.title).toBe("How creative work survives the age of AI");
    expect(completedJob?.result?.verdict.recommendation).toBe("watch-key-moments");

    const listResponse = await request(runtime.app).get("/api/summaries").expect(200);
    const summaries = summaryListItemSchema.array().parse(listResponse.body.data);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(jobId);
  });
});
