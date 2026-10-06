import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { catchError, type Observable } from "rxjs";

import { removeUploadedFile } from "./upload-options.js";

// Pipes run inside interceptors, so this also removes files rejected by pipes.
// List it after FileInterceptor.
@Injectable()
export class DiscardRejectedUploadInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(DiscardRejectedUploadInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError(async (error: unknown) => {
        if (request.file) {
          await this.discard(request.file);
        }
        throw error;
      }),
    );
  }

  // Keeps the original request error when the file cannot be removed.
  private async discard(file: Express.Multer.File): Promise<void> {
    try {
      await removeUploadedFile(file);
    } catch (cleanupError) {
      this.logger.warn(
        { err: cleanupError, path: file.path },
        "Rejected upload could not be removed",
      );
    }
  }
}
