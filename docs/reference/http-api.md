# HTTP API

Every route is under `/api`. Request and response shapes are defined in `packages/contracts/src/index.ts`, which is the source of truth. This page summarizes them.

## Envelopes

A successful response with a body:

```json
{ "data": { } }
```

An error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid values.",
    "requestId": "8f0c6a3e-…",
    "details": { "url": ["Invalid URL"] }
  }
}
```

`details` is present only for field-level problems. Every response carries an `x-request-id` header. Send your own `x-request-id` to correlate a request with the server logs. All error codes are listed in [Error codes](error-codes.md).

## Endpoints

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | `200` | Service status and provider mode |
| `POST` | `/api/summaries/preview` | `200` | Public details of a YouTube link: title, channel, length, thumbnail. No job is created |
| `POST` | `/api/summaries/precheck` | `200` | Quick watch verdict for a YouTube link, from metadata only. No job is created |
| `POST` | `/api/summaries/url` | `202` | Create and queue a job from a public URL |
| `POST` | `/api/summaries/upload` | `202` | Create and queue a job from an uploaded file |
| `GET` | `/api/summaries` | `200` | The 30 most recent jobs |
| `GET` | `/api/summaries/:id` | `200` | One job, with its progress, result, or failure |
| `POST` | `/api/summaries/:id/cancel` | `200` | Cancel a queued or processing job |
| `POST` | `/api/summaries/:id/retry` | `202` | Retry a failed job |
| `DELETE` | `/api/summaries/:id` | `204` | Delete a finished, failed, or cancelled job and its files |

`:id` must be a UUID. Anything else returns `400 VALIDATION_ERROR`.

## Requests

### Summary options

Shared by the URL and upload endpoints (`summaryOptionsSchema`):

| Field | Type | Notes |
| --- | --- | --- |
| `language` | `"English"` \| `"Arabic"` | Language of the written brief and verdict |
| `sourceLanguage` | `"English"` \| `"Arabic"` | Spoken language of the video. Defaults to `language` |
| `depth` | `"quick"` \| `"detailed"` \| `"study"` | Length and detail of the brief |
| `expectation` | string, at most 240 characters | Optional. The viewer's question for this video |
| `viewerProfile` | `{ background, knowledge, goals, preferences }` | Optional. A snapshot is stored with the job |

### `POST /api/summaries/url`

JSON body: summary options plus `url` (HTTP or HTTPS). A YouTube host without a video identifier is rejected.

```json
{
  "url": "https://www.youtube.com/watch?v=abc123",
  "language": "English",
  "depth": "quick",
  "expectation": "Is this useful for a designer?"
}
```

### `POST /api/summaries/upload`

`multipart/form-data`:

- `video`: required, one audio or video file, at most `MAX_UPLOAD_MB`. The type is checked against the file content, not just the declared type.
- The summary option fields, as text. Send `viewerProfile` as a JSON string.

A rejected request deletes the uploaded file.

### `POST /api/summaries/preview`

JSON body: `url` (must be a YouTube video URL). Returns `{ title, channel, durationSeconds, thumbnailUrl, spokenLanguage }`. `thumbnailUrl` is an HTTPS URL or `null`. `spokenLanguage` is `"English"` or `"Arabic"` when YouTube reports one of them, otherwise `null`. The web app uses it to preset the spoken language unless the viewer has picked one.

### `POST /api/summaries/precheck`

JSON body: `url` (must be a YouTube video URL), `language`, and optionally `expectation` and `viewerProfile`. Returns `{ title, channel, durationSeconds, verdict }`.

The preview and the quick check share one metadata lookup per link, cached in memory for 10 minutes. A failed lookup is not cached.

### `POST /api/summaries/:id/retry`

No body, or `multipart/form-data` with a `video` field. Send the file only when the job's `retryInfo.requiresUpload` is `true`. Otherwise the request is rejected with `UPLOAD_NOT_NEEDED`.

## Responses

### Summary job

`GET /api/summaries/:id`, and the create, cancel, and retry endpoints, return a `SummaryJob`:

| Field | Notes |
| --- | --- |
| `id`, `status`, `source`, `options` | `status` is `queued`, `processing`, `completed`, `failed`, or `cancelled`. See [Source](#source) |
| `progress`, `stage`, `stageStartedAt` | Progress from 0 to 100, and the human-readable step |
| `result` | `null` until the job completes. Then it holds the title, overview, viewer answer, sections, notes, recommended moments, verdict, timeline, transcript, and duration |
| `error`, `errorCode`, `failedStep`, `errorDetails` | Set when the job is `failed` |
| `retryInfo` | Present only when the job is `failed`: `{ fromStep, requiresUpload, reason }` |
| `attempt`, `createdAt`, `updatedAt` | |

Poll this endpoint while the job is `queued` or `processing`. The web app polls every 900 ms.

### Summary list item

### Source

`source.type` says where the media came from:

| `type` | Meaning | `name` | `url` |
| --- | --- | --- | --- |
| `upload` | A file sent to `POST /api/summaries/upload` | The uploaded file name | Absent |
| `youtube` | A YouTube video link | `YouTube video` until the download reports the real title, then that title | The submitted link |
| `public_video` | Any other link | The file name from the URL path, or the host name when the path has none | The submitted link |
| `public_audio` | A link whose path ends in a known audio extension (`.mp3`, `.m4a`, `.wav`, ...) | Same as `public_video` | The submitted link |

The API never fetches a public link to classify it, so the audio/video split follows the file extension, and anything unrecognized is `public_video`.

`GET /api/summaries` returns a lighter shape: `id`, `status`, `source`, `progress`, `stage`, `title`, `verdict`, `durationSeconds`, `createdAt`, and `updatedAt`.
