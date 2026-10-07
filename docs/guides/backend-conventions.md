# Backend conventions

This guide shows how the API uses NestJS. [AGENTS.md](../../AGENTS.md) is the general TypeScript standard; this page covers the patterns specific to this codebase.

## Where logic goes

Pick the Nest building block by the job the code does:

| Job | Building block | Example |
| --- | --- | --- |
| Map a route to a service call, choose the status code | Controller | `SummariesController` |
| Validate or transform one input value | Pipe | `ZodValidationPipe`, `UploadedMediaPipe`, `UploadSummaryOptionsPipe` |
| Work around the handler (before or after it, or on error) | Interceptor | `DiscardRejectedUploadInterceptor`, `ResponseEnvelopeInterceptor` |
| Combine a repeated parameter and its pipe | Param decorator | `@SummaryIdParam()` |
| Turn an exception into an HTTP response | Exception filter | `ApiExceptionFilter` |
| Business rules | Service | `SummariesService`, `SummaryPipeline` |
| SQL | Repository | `SummaryRepository` |
| Background work | BullMQ processor | `SummaryJobsProcessor` |

A controller method should be one line that calls a service. If it grows an `if` or a `try`, the logic probably belongs in a pipe, an interceptor, or the service.

```ts
@Post(":summaryId/retry")
@HttpCode(HttpStatus.ACCEPTED)
@UseInterceptors(FileInterceptor("video"), DiscardRejectedUploadInterceptor)
retry(
  @SummaryIdParam() summaryId: string,
  @UploadedFile(new UploadedMediaPipe({ isRequired: false }))
  media: UploadedMedia | undefined,
): Promise<SummaryJob> {
  return this.summaries.retry(summaryId, media);
}
```

## Validation

- Validate every request at the boundary with the Zod schemas from `@l5asly/contracts`: `@Body(new ZodValidationPipe(schema))`.
- A `ZodError` thrown anywhere becomes a `400 VALIDATION_ERROR` response, with per-field `details`.
- Validate queue payloads (`processSummaryJobSchema`), database rows, and provider responses the same way. TypeScript types are not runtime checks.
- Pipes run inside interceptors. That is why `DiscardRejectedUploadInterceptor`, listed after `FileInterceptor`, also deletes uploads that a pipe rejects.

## Responses

Handlers return plain domain values. `ResponseEnvelopeInterceptor` (registered globally) wraps them as `{ "data": ... }`. A handler that returns nothing, such as a `204` delete, sends no body.

Status codes are set in the controller with `@HttpCode`. Nest returns `201` for `POST` by default, so set the code explicitly.

## Errors

Throw `AppError` (`common/errors.ts`) for expected failures. Give it a stable `code`, a user-safe `message`, and a `statusCode`:

```ts
throw new AppError({
  message: "Only failed jobs can be retried.",
  statusCode: 409,
  code: "JOB_NOT_FAILED",
});
```

The specialized subclasses are `NotFoundError`, `ProviderError`, `ProviderTimeoutError`, and `SummaryFormatError`. Add a new subclass only when callers need to tell that category apart.

`ApiExceptionFilter` turns every exception into `{ "error": { code, message, requestId, details? } }`:

- `AppError` uses its own status and code.
- `ZodError` becomes `400 VALIDATION_ERROR`.
- Nest's `NotFoundException` for unknown routes becomes `404 ROUTE_NOT_FOUND`.
- Multer's file-size error becomes `400 UPLOAD_ERROR` (kept for compatibility with the earlier Express API).
- Anything else is logged and becomes `500 INTERNAL_ERROR`, without internal details.

All codes are listed in [Error codes](../reference/error-codes.md). Add a new code there when you introduce one.

## Dependency injection

- Inject classes by type. For non-class values, use the tokens `APP_CONFIG` and `DATABASE` with `@Inject(TOKEN)`.
- Abstract classes are used as tokens where implementations are swapped: the provider contracts and `SummaryQueue`. Don't add an abstract class unless something actually swaps implementations.
- When construction needs configuration or async work, use a factory provider in the module rather than adding `@Inject(APP_CONFIG)` to a reusable class (see `MediaPreparer` and `SummaryRepository` in `summaries.module.ts`).
- Read configuration only through `APP_CONFIG`. Never read `process.env` outside `config/app-config.ts`.

## Logging

The API logs through `nestjs-pino`. Every HTTP request gets a request ID. It is taken from the `x-request-id` header when the caller sends one, echoed in the response header, and included in error bodies.

```ts
constructor(
  @InjectPinoLogger(SummariesService.name)
  private readonly logger: PinoLogger,
) {}

this.logger.warn({ jobId: job.id, err: error }, "Expired retry media could not be removed");
```

- Pass structured context first and a fixed message second. Use `err` for errors so pino serializes them.
- Include IDs such as `jobId` or `provider`. Never log keys, full transcripts, or viewer profiles.
- `SummaryPipeline` creates a child logger per job (`jobId`, `operation`) and logs the start, duration, and outcome of every provider call.
- `LOG_LEVEL` controls the level. Tests use `silent`.

## Outbound HTTP

Use a named client from `@nestjs/http-client`, registered next to the code that uses it. Never call `fetch` directly or add Axios. [Providers](../architecture/providers.md#http-calls) covers retries, timeouts, and error mapping.

## Adding a module

Nothing has required a second feature module yet. When something does, follow `summaries/`: a `*.module.ts` that imports what it needs, a thin controller, a `services/` folder once there is more than one service, and a `tests/` folder beside the code. Register it in `app.module.ts`.
