import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getQueueToken } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isYouTubeUrl,
  precheckResultSchema,
  summaryJobSchema,
  summaryListItemSchema,
} from "@l5sly/contracts";

import { AppModule } from "../../app.module.js";
import { configureApp } from "../../app.setup.js";
import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { SummaryJobsProcessor } from "../jobs/summary-jobs.processor.js";
import { SUMMARY_QUEUE, SummaryQueue } from "../jobs/summary-queue.js";
import { SummaryPipeline } from "../services/summary-pipeline.service.js";
import { SummaryRepository } from "../summary.repository.js";

@Injectable()
class InMemorySummaryQueue extends SummaryQueue {
  private readonly pendingIds: string[] = [];
  private isDraining = false;

  constructor(private readonly pipeline: SummaryPipeline) {
    super();
  }

  override async enqueue(summaryId: string): Promise<void> {
    if (!this.pendingIds.includes(summaryId)) {
      this.pendingIds.push(summaryId);
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      let summaryId = this.pendingIds.shift();
      while (summaryId) {
        await this.pipeline.process(summaryId);
        summaryId = this.pendingIds.shift();
      }
    } finally {
      this.isDraining = false;
    }
  }
}

let app: NestExpressApplication;
let repository: SummaryRepository;
let testDirectory: string;

beforeAll(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "l5sly-api-"));
  const config: AppConfig = {
    nodeEnv: "test",
    port: 4000,
    logLevel: "silent",
    clientOrigin: "http://localhost:5173",
    databasePath: ":memory:",
    redisUrl: "redis://localhost:6379",
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
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    // No Redis in tests: drop the BullMQ queue and worker, keep everything else real.
    .overrideProvider(getQueueToken(SUMMARY_QUEUE))
    .useValue({})
    .overrideProvider(SummaryJobsProcessor)
    .useValue({})
    .overrideProvider(SummaryQueue)
    .useClass(InMemorySummaryQueue)
    .compile();

  app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app, config);
  await app.init();
  repository = app.get(SummaryRepository);
});

afterAll(async () => {
  await app.close();
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
    const response = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(response.body.data).toEqual({ status: "ok", providerMode: "mock" });
  });

  it("answers unknown routes with the error envelope and echoes the request ID", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/does-not-exist")
      .set("x-request-id", "test-request-id")
      .expect(404);

    expect(response.headers["x-request-id"]).toBe("test-request-id");
    expect(response.body.error).toEqual({
      code: "ROUTE_NOT_FOUND",
      message: "The requested route does not exist.",
      requestId: "test-request-id",
    });
  });

  it("rejects invalid URL input", async () => {
    const response = await request(app.getHttpServer())
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
      await request(app.getHttpServer())
        .post("/api/summaries/url")
        .send({
          url: "https://example.com/video.mp4",
          language: "English",
          depth: "quick",
          ...fields,
        })
        .expect(400);
    }
    const before = await readdir(testDirectory);
    const malformed = await request(app.getHttpServer())
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
    expect(await readdir(testDirectory)).toEqual(before);
  });

  it("rejects an upload whose content is not media and removes the file", async () => {
    const before = await readdir(testDirectory);
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49,
      0x48, 0x44, 0x52,
    ]);

    const response = await request(app.getHttpServer())
      .post("/api/summaries/upload")
      .field("language", "English")
      .field("depth", "quick")
      .attach("video", pngSignature, {
        filename: "disguised.mp4",
        contentType: "video/mp4",
      })
      .expect(415);

    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(await readdir(testDirectory)).toEqual(before);
  });

  it("requires a file for new uploads", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/summaries/upload")
      .field("language", "English")
      .field("depth", "quick")
      .expect(400);

    expect(response.body.error.code).toBe("FILE_REQUIRED");
  });

  it("returns a quick watch verdict for a YouTube link without creating a job", async () => {
    const before = await request(app.getHttpServer()).get("/api/summaries").expect(200);

    const response = await request(app.getHttpServer())
      .post("/api/summaries/precheck")
      .send({
        url: "https://www.youtube.com/watch?v=abc123",
        language: "English",
        expectation: "Is this useful for a designer?",
      })
      .expect(200);

    expect(precheckResultSchema.parse(response.body.data)).toMatchObject({
      title: "How creative work survives the age of AI",
      verdict: { signals: { answersQuestion: 0.5 } },
    });
    const after = await request(app.getHttpServer()).get("/api/summaries").expect(200);
    expect(after.body.data).toHaveLength(before.body.data.length);
  });

  it("rejects quick checks for non-YouTube links", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/summaries/precheck")
      .send({ url: "https://example.com/video.mp4", language: "English" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a YouTube page without a video identifier", async () => {
    const response = await request(app.getHttpServer())
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
    const createResponse = await request(app.getHttpServer())
      .post("/api/summaries/url")
      .send({
        url: "https://www.youtube.com/watch?v=abc123",
        language: "English",
        depth: "quick",
        expectation: "I want practical team advice.",
      })
      .expect(202);

    const createdJob = summaryJobSchema.parse(createResponse.body.data);
    expect(createdJob.source).toEqual({
      type: "youtube",
      name: "YouTube video",
      url: "https://www.youtube.com/watch?v=abc123",
    });
    expect(createResponse.body.data).not.toHaveProperty("sourcePath");
    const jobId = createdJob.id;
    let completedJob;
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const response = await request(app.getHttpServer())
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
    expect(completedJob?.result?.timeline?.length).toBeGreaterThan(0);
    expect(
      completedJob?.result?.sections.every(
        (section) => section.support === "supported",
      ),
    ).toBe(true);

    const listResponse = await request(app.getHttpServer())
      .get("/api/summaries")
      .expect(200);
    const summaries = summaryListItemSchema
      .array()
      .parse(listResponse.body.data);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(jobId);
  });

  it("retries a saved summary checkpoint through the API and deletes all job data", async () => {
    const id = randomUUID();
    await repository.create({
      id,
      source: {
        type: "public_video",
        name: "video.mp4",
        url: "https://example.com/video.mp4",
      },
      options: {
        language: "English",
        depth: "quick",
        expectation: "What matters?",
      },
    });
    await repository.updateProgress(id, 68, "Generating summary");
    await repository.saveCheckpoint(id, {
      transcription: {
        text: "Judgment matters.",
        segments: [
          { startSeconds: 0, endSeconds: 30, text: "Judgment matters." },
        ],
        durationSeconds: 30,
        detectedLanguage: "en",
      },
    });
    await repository.fail(id, "Invalid model output.", {
      step: "summary",
      code: "SUMMARY_INVALID_FORMAT",
      details: { notes: ["invalid_type"] },
    });

    const failure = await request(app.getHttpServer())
      .get(`/api/summaries/${id}`)
      .expect(200);
    expect(failure.body.data.retryInfo).toMatchObject({
      fromStep: "summary",
      requiresUpload: false,
    });
    expect(failure.body.data).not.toHaveProperty("transcription");
    const retry = await request(app.getHttpServer())
      .post(`/api/summaries/${id}/retry`)
      .expect(202);
    expect(summaryJobSchema.parse(retry.body.data)).toMatchObject({
      id,
      status: "queued",
      progress: 68,
      attempt: 2,
      error: null,
    });
    await request(app.getHttpServer()).post(`/api/summaries/${id}/retry`).expect(409);
    await request(app.getHttpServer()).delete(`/api/summaries/${id}`).expect(409);
    const deadline = Date.now() + 5000;
    while (
      Date.now() < deadline &&
      (await repository.findById(id))?.status !== "completed"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await repository.findById(id))?.status).toBe("completed");
    await request(app.getHttpServer()).delete(`/api/summaries/${id}`).expect(204);
    await request(app.getHttpServer()).get(`/api/summaries/${id}`).expect(404);
    expect(await repository.getCheckpoint(id)).toEqual({});
  });

  it("rejects invalid retry IDs and removes rejected multipart media", async () => {
    const before = await readdir(testDirectory);
    await request(app.getHttpServer())
      .post("/api/summaries/not-a-job/retry")
      .attach("video", Buffer.from("audio"), {
        filename: "source.webm",
        contentType: "audio/webm",
      })
      .expect(400);
    expect(await readdir(testDirectory)).toEqual(before);
    await request(app.getHttpServer())
      .post(`/api/summaries/${randomUUID()}/retry`)
      .expect(404);
  });

  it("requires a replacement file for an older upload whose media was removed", async () => {
    const id = randomUUID();
    await repository.create({
      id,
      source: { type: "upload", name: "old.mp4" },
      sourcePath: path.join(testDirectory, "missing.mp4"),
      sourceMimeType: "video/mp4",
      options: { language: "English", depth: "quick" },
    });
    await repository.fail(id, "Legacy failure.");
    const response = await request(app.getHttpServer())
      .post(`/api/summaries/${id}/retry`)
      .expect(409);
    expect(response.body.error.code).toBe("REUPLOAD_REQUIRED");
    await request(app.getHttpServer()).delete(`/api/summaries/${id}`).expect(204);
  });
});
