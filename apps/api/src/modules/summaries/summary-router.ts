import { unlink } from "node:fs/promises";

import { fileTypeFromFile } from "file-type";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import {
  createUrlSummarySchema,
  summaryOptionsSchema,
  type ApiResponse,
  type SummaryJob,
  type SummaryListItem,
} from "@l5sly/contracts";

import { AppError } from "../../errors.js";
import { SummaryJobRunner } from "./summary-job-runner.js";
import { SummaryService } from "./summary-service.js";

const summaryIdSchema = z.string().uuid();

export function createSummaryRouter(options: {
  summaryService: SummaryService;
  jobRunner: SummaryJobRunner;
  upload: multer.Multer;
}): Router {
  const router = Router();

  router.post("/url", async (request, response) => {
    const input = createUrlSummarySchema.parse(request.body);
    const job = options.summaryService.createFromUrl(input);
    options.jobRunner.enqueue(job.id);

    const body: ApiResponse<SummaryJob> = { data: job };
    response.status(202).json(body);
  });

  router.post("/upload", options.upload.single("video"), async (request, response) => {
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
  });

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

  return router;
}
