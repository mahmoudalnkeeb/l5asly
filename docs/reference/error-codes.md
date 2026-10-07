# Error codes

There are two kinds of codes. **Request errors** come back in the `{ "error": ... }` envelope of a failed HTTP request. **Job failure codes** are stored on a failed job, in `errorCode`, and are returned inside a successful `GET /api/summaries/:id` response.

Codes are stable identifiers. The web app and other clients can rely on them, so don't rename one. Add a new code instead, and list it here.

## Request errors

| Code | Status | Raised by | Meaning |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | `ApiExceptionFilter` (any `ZodError`) | A body field, parameter, or option is invalid. See `details` |
| `INVALID_PROFILE` | 400 | `UploadSummaryOptionsPipe` | The multipart `viewerProfile` field is not valid JSON |
| `FILE_REQUIRED` | 400 | `UploadedMediaPipe` | The upload has no `video` file |
| `UPLOAD_ERROR` | 400 | `ApiExceptionFilter` (multer) | The file is too large, or the multipart request is malformed |
| `UPLOAD_NOT_NEEDED` | 400 | `SummariesService.retry` | A file was sent with a retry that doesn't need one |
| `ROUTE_NOT_FOUND` | 404 | `ApiExceptionFilter` | No route matches the path |
| `SUMMARY_NOT_FOUND` | 404 | `NotFoundError` | No job has this ID |
| `JOB_NOT_FAILED` | 409 | `SummariesService.retry` | Only failed jobs can be retried |
| `REUPLOAD_REQUIRED` | 409 | `SummariesService.retry` | The retained media has expired. Send the file again in `video` |
| `RETRY_CONFLICT` | 409 | `SummariesService.retry` | Another retry already changed the job's status |
| `JOB_ACTIVE` | 409 | `SummariesService.delete` | Cancel a queued or processing job before deleting it |
| `JOB_BUSY` | 409 | `SummariesService` | The worker is still finishing the previous attempt, or another retry or delete of the same job is running |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Multer file filter, `UploadedMediaPipe` | The file is not audio or video, by declared type or by content |
| `REQUEST_ERROR` | 4xx | `ApiExceptionFilter` | Another framework-level rejection, using the framework's status |
| `PROVIDER_ERROR` | 502 | `ProviderError` | Precheck only: yt-dlp or SystemOne failed |
| `PROVIDER_TIMEOUT` | 504 | `ProviderTimeoutError` | Precheck only: yt-dlp or SystemOne did not answer in time |
| `INTERNAL_ERROR` | 500 | `ApiExceptionFilter` | An unexpected error. It is logged with the request ID |

## Job failure codes

These are stored when processing fails. The job's `failedStep` tells you which step failed, and `retryInfo` tells you where a retry would resume.

| Code | Typical step | Meaning |
| --- | --- | --- |
| `PROVIDER_ERROR` | any | yt-dlp, FFmpeg, Deepgram, the LLM, or Jev failed. The message includes the upstream status when there is one |
| `PROVIDER_TIMEOUT` | any | A provider call exceeded its configured timeout |
| `SOURCE_MISSING` | `media` | The uploaded file path is missing from the record |
| `SUMMARY_INVALID_FORMAT` | `summary` | The LLM returned malformed or truncated JSON, or fields that don't match the schema. `errorDetails` lists the fields |
| `SUMMARY_SCHEMA_REJECTED` | `summary` | The LLM endpoint doesn't accept strict `json_schema` structured output. Check `LLM_BASE_URL` and `LLM_MODEL` |
| `SUMMARY_REFUSED` | `summary` | The model declined to answer, or a content filter stopped it |
| `JOB_INTERRUPTED` | inferred from progress | The API restarted while the job was queued or processing |
| `PROCESSING_ERROR` | any | An unexpected error. Details are in the logs, under the job's `jobId` |

`JOB_CANCELLED` is used internally to stop the pipeline after a cancellation. It is never stored or returned.

## Web client codes

`apps/web/src/lib/api-client.ts` adds three codes of its own: `NETWORK_ERROR` (the API is unreachable), `HTTP_ERROR` (an error response without the error envelope), and `INVALID_RESPONSE` (a response that doesn't match the contract).
