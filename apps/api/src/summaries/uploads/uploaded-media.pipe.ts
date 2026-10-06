import type { PipeTransform } from "@nestjs/common";

import { AppError } from "../../common/errors.js";
import { detectMediaMimeType } from "./upload-options.js";

export interface UploadedMedia {
  originalName: string;
  path: string;
  mimeType: string;
}

// Pair it with DiscardRejectedUploadInterceptor so a rejected file is deleted.
export class UploadedMediaPipe
  implements PipeTransform<Express.Multer.File | undefined, Promise<UploadedMedia | undefined>>
{
  constructor(private readonly options: { isRequired: boolean }) {}

  async transform(
    file: Express.Multer.File | undefined,
  ): Promise<UploadedMedia | undefined> {
    if (!file) {
      if (!this.options.isRequired) {
        return undefined;
      }
      throw new AppError({
        message: "Choose a video or audio file to continue.",
        statusCode: 400,
        code: "FILE_REQUIRED",
      });
    }

    const mimeType = await detectMediaMimeType(file);
    if (!mimeType) {
      throw new AppError({
        message: "The uploaded file must contain video or audio.",
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    }

    return { originalName: file.originalname, path: file.path, mimeType };
  }
}
