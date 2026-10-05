import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

import type { ApiErrorResponse } from "@l5sly/contracts";

import { AppError } from "../errors.js";

function formatValidationDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "request";
    details[key] = [...(details[key] ?? []), issue.message];
  }

  return details;
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  const body: ApiErrorResponse = {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested route does not exist.",
      requestId: response.locals.requestId,
    },
  };

  response.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId = response.locals.requestId;

  if (error instanceof ZodError) {
    const body: ApiErrorResponse = {
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid values.",
        requestId,
        details: formatValidationDetails(error),
      },
    };
    response.status(400).json(body);
    return;
  }

  if (error instanceof multer.MulterError) {
    const body: ApiErrorResponse = {
      error: {
        code: "UPLOAD_ERROR",
        message: error.code === "LIMIT_FILE_SIZE" ? "The uploaded file is too large." : error.message,
        requestId,
      },
    };
    response.status(400).json(body);
    return;
  }

  if (error instanceof AppError) {
    const body: ApiErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
    };
    response.status(error.statusCode).json(body);
    return;
  }

  request.log.error({ error, requestId }, "Unhandled request error");
  const body: ApiErrorResponse = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    },
  };
  response.status(500).json(body);
};
