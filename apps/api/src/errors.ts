export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(options: {
    message: string;
    statusCode: number;
    code: string;
    details?: Record<string, string[]>;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  constructor(summaryId: string) {
    super({
      message: `Summary ${summaryId} was not found.`,
      statusCode: 404,
      code: "SUMMARY_NOT_FOUND",
    });
  }
}

export class ProviderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      message,
      statusCode: 502,
      code: "PROVIDER_ERROR",
      cause,
    });
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(providerName: string, timeoutMs: number, cause?: unknown) {
    const timeoutSeconds = Math.ceil(timeoutMs / 1_000);

    super({
      message: `${providerName} did not respond within ${timeoutSeconds} seconds.`,
      statusCode: 504,
      code: "PROVIDER_TIMEOUT",
      cause,
    });
  }
}

export class SummaryFormatError extends AppError {
  constructor(message: string, details: Record<string, string[]>) {
    super({
      message,
      statusCode: 502,
      code: "SUMMARY_INVALID_FORMAT",
      details,
    });
  }
}
