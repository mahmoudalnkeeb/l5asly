import { unlink } from "node:fs/promises";

import { fileTypeFromFile } from "file-type";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import {
  createUrlSummarySchema,
  precheckRequestSchema,
  summaryOptionsSchema,
  type ApiResponse,
  type PrecheckResult,
  type SummaryJob,
  type SummaryListItem,
} from "@l5sly/contracts";

import { AppError } from "../../errors.js";
import { PrecheckService } from "./precheck-service.js";
import { SummaryJobRunner } from "./summary-job-runner.js";
import { SummaryService } from "./summary-service.js";

const summaryIdSchema = z.string().uuid();

export function createSummaryRouter(options: {
  summaryService: SummaryService;
  jobRunner: SummaryJobRunner;
  precheckService: PrecheckService;
  upload: multer.Multer;
}): Router {
  const router = Router();

  router.post("/precheck", async (request, response) => {
    const input = precheckRequestSchema.parse(request.body);
    const result = await options.precheckService.check(input);
    const body: ApiResponse<PrecheckResult> = { data: result };
    response.json(body);
  });

  router.post("/url", async (request, response) => {
    const input = createUrlSummarySchema.parse(request.body);
    const job = options.summaryService.createFromUrl(input);
    options.jobRunner.enqueue(job.id);

    const body: ApiResponse<SummaryJob> = { data: job };
    response.status(202).json(body);
  });

  router.post(
    "/upload",
    options.upload.single("video"),
    async (request, response) => {
      const file = request.file;
      if (!file) {
        throw new AppError({
          message: "Choose a video or audio file to continue.",
          statusCode: 400,
          code: "FILE_REQUIRED",
        });
      }

      try {
        const detectedType = await fileTypeFromFile(file.path);
        const mimeType = detectedType?.mime ?? file.mimetype;
        if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) {
          throw new AppError({
            message: "The uploaded file must contain video or audio.",
            statusCode: 415,
            code: "UNSUPPORTED_MEDIA_TYPE",
          });
        }

        const parsedOptions = summaryOptionsSchema.parse({
          language: request.body.language,
          sourceLanguage: request.body.sourceLanguage,
          viewerProfile: parseProfileField(request.body.viewerProfile),
          depth: request.body.depth,
          expectation: request.body.expectation,
        });
        const job = options.summaryService.createFromUpload({
          originalName: file.originalname,
          path: file.path,
          mimeType,
          options: parsedOptions,
        });
        options.jobRunner.enqueue(job.id);

        const body: ApiResponse<SummaryJob> = { data: job };
        response.status(202).json(body);
      } catch (error) {
        await unlink(file.path).catch(() => undefined);
        throw error;
      }
    },
  );

  router.get("/", (_request, response) => {
    const summaries = options.summaryService.listRecent();
    const body: ApiResponse<SummaryListItem[]> = { data: summaries };
    response.json(body);
  });

  router.get("/:summaryId", (request, response) => {
    const summaryId = summaryIdSchema.parse(request.params.summaryId);
    const job = options.summaryService.findById(summaryId);
    const body: ApiResponse<SummaryJob> = { data: job };
    response.json(body);
  });

  router.post("/:summaryId/cancel", (request, response) => {
    const summaryId = summaryIdSchema.parse(request.params.summaryId);
    const job = options.summaryService.cancel(summaryId);
    const body: ApiResponse<SummaryJob> = { data: job };
    response.json(body);
  });

  router.post(
    "/:summaryId/retry",
    options.upload.single("video"),
    async (request, response) => {
      const file = request.file;
      try {
        const id = summaryIdSchema.parse(request.params.summaryId);
        if (options.jobRunner.isProcessing(id)) {
          throw new AppError({
            message:
              "The previous attempt is finishing cleanup. Try again in a moment.",
            statusCode: 409,
            code: "JOB_BUSY",
          });
        }
        let upload: { path: string; mimeType: string } | undefined;
        if (file) {
          const detectedType = await fileTypeFromFile(file.path);
          const mimeType = detectedType?.mime ?? file.mimetype;
          if (
            !mimeType.startsWith("video/") &&
            !mimeType.startsWith("audio/")
          ) {
            throw new AppError({
              message: "Select a video or audio file.",
              statusCode: 415,
              code: "UNSUPPORTED_MEDIA_TYPE",
            });
          }
          upload = { path: file.path, mimeType };
        }
        const job = await options.summaryService.retry(id, upload);
        options.jobRunner.enqueue(id);
        const body: ApiResponse<SummaryJob> = { data: job };
        response.status(202).json(body);
      } catch (error) {
        if (file)
          await unlink(file.path).catch((cleanupError: unknown) => {
            if (
              cleanupError instanceof Error &&
              "code" in cleanupError &&
              cleanupError.code === "ENOENT"
            )
              return;
            throw cleanupError;
          });
        throw error;
      }
    },
  );

  router.delete("/:summaryId", async (request, response) => {
    const id = summaryIdSchema.parse(request.params.summaryId);
    if (options.jobRunner.isProcessing(id)) {
      throw new AppError({
        message: "Wait for the current attempt to finish before deleting it.",
        statusCode: 409,
        code: "JOB_BUSY",
      });
    }
    await options.summaryService.delete(id);
    response.status(204).end();
  });

  return router;
}

function parseProfileField(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AppError({
      message: "The viewer profile must be valid JSON.",
      statusCode: 400,
      code: "INVALID_PROFILE",
    });
  }
  try {
    const profile: unknown = JSON.parse(value);
    return profile;
  } catch {
    throw new AppError({
      message: "The viewer profile must be valid JSON.",
      statusCode: 400,
      code: "INVALID_PROFILE",
    });
  }
}
