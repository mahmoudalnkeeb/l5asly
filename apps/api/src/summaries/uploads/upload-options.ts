import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";

import type { MulterModuleOptions } from "@nestjs/platform-express";
import { fileTypeFromFile } from "file-type";
import multer from "multer";

import { AppError } from "../../common/errors.js";

export function createUploadOptions(options: {
  uploadDirectory: string;
  maxUploadBytes: number;
}): MulterModuleOptions {
  mkdirSync(options.uploadDirectory, { recursive: true });

  return {
    storage: multer.diskStorage({
      destination: options.uploadDirectory,
      filename: (_request, file, callback) => {
        const extension = path
          .extname(file.originalname)
          .toLowerCase()
          .slice(0, 12);
        callback(null, `${randomUUID()}${extension}`);
      },
    }),
    limits: {
      fileSize: options.maxUploadBytes,
      files: 1,
    },
    fileFilter: (_request, file, callback) => {
      if (isMediaMimeType(file.mimetype)) {
        callback(null, true);
        return;
      }
      callback(
        new AppError({
          message: "The uploaded file must contain video or audio.",
          statusCode: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
        }),
        false,
      );
    },
  };
}

// Reads the type from the file content, because the client-declared type can be wrong.
export async function detectMediaMimeType(
  file: Express.Multer.File,
): Promise<string | null> {
  const detectedType = await fileTypeFromFile(file.path);
  const mimeType = detectedType?.mime ?? file.mimetype;
  return isMediaMimeType(mimeType) ? mimeType : null;
}

export async function removeUploadedFile(
  file: Express.Multer.File,
): Promise<void> {
  try {
    await unlink(file.path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function isMediaMimeType(mimeType: string): boolean {
  return mimeType.startsWith("video/") || mimeType.startsWith("audio/");
}
