import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isYouTubeUrl,
  summaryJobSchema,
  summaryListItemSchema,
} from "@l5sly/contracts";

import { buildApplication, type ApplicationRuntime } from "./bootstrap.js";
import type { AppConfig } from "./config.js";
import { SummaryRepository } from "./modules/summaries/summary-repository.js";

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
  runtime.close();
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

  it("rejects unsupported languages and invalid profiles", async () => {
    for (const fields of [
      { language: "French" },
      { sourceLanguage: "Spanish" },
      {
        viewerProfile: {
          background: "x".repeat(501),
          knowledge: "",
          goals: "",
          preferences: "",
        },
      },
    ]) {
      await request(runtime.app)
        .post("/api/summaries/url")
        .send({
          url: "https://example.com/video.mp4",
          language: "English",
          depth: "quick",
          ...fields,
        })
        .expect(400);
    }
    const malformed = await request(runtime.app)
      .post("/api/summaries/upload")
      .field("language", "English")
      .field("depth", "quick")
      .field("viewerProfile", "not-json")
      .attach("video", Buffer.from("media"), {
        filename: "test.mp4",
        contentType: "video/mp4",
      })
      .expect(400);
    expect(malformed.body.error.code).toBe("INVALID_PROFILE");
  });

  it("rejects a YouTube page without a video identifier", async () => {
    const response = await request(runtime.app)
      .post("/api/summaries/url")
      .send({
        url: "https://www.youtube.com/watch",
        language: "English",
        depth: "quick",
      })
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
      const response = await request(runtime.app)
        .get(`/api/summaries/${jobId}`)
        .expect(200);
      const job = summaryJobSchema.parse(response.body.data);
      if (job.status === "completed") {
        completedJob = job;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(completedJob?.result?.title).toBe(
      "How creative work survives the age of AI",
    );
    expect(completedJob?.result?.verdict.recommendation).toBe(
      "watch-key-moments",
    );

    const listResponse = await request(runtime.app)
      .get("/api/summaries")
      .expect(200);
    const summaries = summaryListItemSchema
      .array()
      .parse(listResponse.body.data);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(jobId);
  });

  it("retries a saved summary checkpoint through the API and deletes all job data", async () => {
    const repository = new SummaryRepository(runtime.database);
    const id = randomUUID();
    repository.create({
      id,
      sourceType: "url",
      sourceName: "example.com",
      sourceUrl: "https://example.com/video.mp4",
      options: {
        language: "English",
        depth: "quick",
        expectation: "What matters?",
      },
    });
    repository.updateProgress(id, 68, "Generating summary");
    repository.saveCheckpoint(id, {
      transcription: {
        text: "Judgment matters.",
        segments: [
          { startSeconds: 0, endSeconds: 30, text: "Judgment matters." },
        ],
        durationSeconds: 30,
        detectedLanguage: "en",
      },
    });
    repository.fail(id, "Invalid model output.", {
      step: "summary",
      code: "SUMMARY_INVALID_FORMAT",
      details: { notes: ["invalid_type"] },
    });

    const failure = await request(runtime.app)
      .get(`/api/summaries/${id}`)
      .expect(200);
    expect(failure.body.data.retryInfo).toMatchObject({
      fromStep: "summary",
      requiresUpload: false,
    });
    expect(failure.body.data).not.toHaveProperty("transcription");
    const retry = await request(runtime.app)
      .post(`/api/summaries/${id}/retry`)
      .expect(202);
    expect(summaryJobSchema.parse(retry.body.data)).toMatchObject({
      id,
      status: "queued",
      progress: 68,
      attempt: 2,
      error: null,
    });
    await request(runtime.app).post(`/api/summaries/${id}/retry`).expect(409);
    await request(runtime.app).delete(`/api/summaries/${id}`).expect(409);
    const deadline = Date.now() + 5000;
    while (
      Date.now() < deadline &&
      repository.findById(id)?.status !== "completed"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(repository.findById(id)?.status).toBe("completed");
    await request(runtime.app).delete(`/api/summaries/${id}`).expect(204);
    await request(runtime.app).get(`/api/summaries/${id}`).expect(404);
    expect(repository.getCheckpoint(id)).toEqual({});
  });

  it("rejects invalid retry IDs and removes rejected multipart media", async () => {
    const before = await readdir(testDirectory);
    await request(runtime.app)
      .post("/api/summaries/not-a-job/retry")
      .attach("video", Buffer.from("audio"), {
        filename: "source.webm",
        contentType: "audio/webm",
      })
      .expect(400);
    expect(await readdir(testDirectory)).toEqual(before);
    await request(runtime.app)
      .post(`/api/summaries/${randomUUID()}/retry`)
      .expect(404);
  });

  it("requires a replacement file for an older upload whose media was removed", async () => {
    const repository = new SummaryRepository(runtime.database);
    const id = randomUUID();
    repository.create({
      id,
      sourceType: "upload",
      sourceName: "old.mp4",
      sourcePath: path.join(testDirectory, "missing.mp4"),
      sourceMimeType: "video/mp4",
      options: { language: "English", depth: "quick" },
    });
    repository.fail(id, "Legacy failure.");
    const response = await request(runtime.app)
      .post(`/api/summaries/${id}/retry`)
      .expect(409);
    expect(response.body.error.code).toBe("REUPLOAD_REQUIRED");
    await request(runtime.app).delete(`/api/summaries/${id}`).expect(204);
  });
});
