import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { ZodError } from "zod";

import type { ApiError, ApiErrorResponse } from "@l5asly/contracts";

import { AppError } from "./errors.js";
import { readRequestId } from "./request-id.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ApiExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = readRequestId(request);

    const { status, error } = this.toApiError(exception, requestId);
    const body: ApiErrorResponse = { error };
    response.status(status).json(body);
  }

  private toApiError(
    exception: unknown,
    requestId: string,
  ): { status: number; error: ApiError } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: "VALIDATION_ERROR",
          message: "The request contains invalid values.",
          requestId,
          details: formatValidationDetails(exception),
        },
      };
    }

    if (exception instanceof AppError) {
      return {
        status: exception.statusCode,
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          details: exception.details,
        },
      };
    }

    if (exception instanceof HttpException) {
      return this.fromFrameworkException(exception, requestId);
    }

    this.logger.error({ err: exception, requestId }, "Unhandled request error");
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId,
      },
    };
  }

  // Nest raises these for unknown routes and for upload limits enforced by multer.
  private fromFrameworkException(
    exception: HttpException,
    requestId: string,
  ): { status: number; error: ApiError } {
    const status = exception.getStatus();

    if (status === HttpStatus.NOT_FOUND) {
      return {
        status,
        error: {
          code: "ROUTE_NOT_FOUND",
          message: "The requested route does not exist.",
          requestId,
        },
      };
    }

    // Kept as 400 so the upload contract matches the earlier Express API.
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: "UPLOAD_ERROR",
          message: "The uploaded file is too large.",
          requestId,
        },
      };
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, "Unhandled request error");
    }
    return {
      status,
      error: {
        code: status === HttpStatus.BAD_REQUEST ? "UPLOAD_ERROR" : "REQUEST_ERROR",
        message: exception.message,
        requestId,
      },
    };
  }
}

function formatValidationDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "request";
    details[key] = [...(details[key] ?? []), issue.message];
  }

  return details;
}
