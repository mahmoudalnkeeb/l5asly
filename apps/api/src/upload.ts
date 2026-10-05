import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import multer from "multer";

import { AppError } from "./errors.js";

export function createUploadMiddleware(options: {
  uploadDirectory: string;
  maxUploadBytes: number;
}): multer.Multer {
  mkdirSync(options.uploadDirectory, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: options.uploadDirectory,
      filename: (_request, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase().slice(0, 12);
        callback(null, `${randomUUID()}${extension}`);
      },
    }),
    limits: {
      fileSize: options.maxUploadBytes,
      files: 1,
    },
    fileFilter: (_request, file, callback) => {
      const isAccepted = file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/");
      if (isAccepted) {
        callback(null, true);
        return;
      }
      callback(new AppError({
        message: "The uploaded file must contain video or audio.",
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      }));
    },
  });
}
