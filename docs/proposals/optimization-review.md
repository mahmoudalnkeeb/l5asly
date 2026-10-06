# Optimization opportunities (draft for review)

None of these are implemented. The NestJS migration kept the existing behavior on purpose, so each item below is a separate decision. Line references are for the `refactor/nestjs-pnpm` branch.

Priority reflects expected impact against risk: **P1** is a clear win with low risk, **P2** is worth doing once the numbers confirm it, and **P3** is optional.

## Database reads

### P1. The library list loads every full result to show three fields

`SummaryRepository.listRecent` ([summary.repository.ts:250](../../apps/api/src/summaries/summary.repository.ts)) runs `SELECT *` for 30 rows. Each row's `result_json` holds the whole brief and the full timestamped transcript, and each one is parsed with `JSON.parse` and validated with Zod, only to read `title`, `verdict`, and `durationSeconds`. The library page polls this every 1.5 s while any job is active ([library-page.tsx:39](../../apps/web/src/pages/library-page.tsx)).

- **Option A:** select only the list columns, and read the three result fields with `json_extract(result_json, '$.title')` and similar expressions. Check that Turso supports `json_extract`.
- **Option B:** store `title`, `verdict_json`, and `duration_seconds` in their own columns when a job completes. This adds a schema upgrade and a backfill for existing rows.
- **Risk:** low. The response shape stays the same.

### P1. The cancellation check reads and parses the whole job

`SummaryPipeline.ensureNotCancelled` ([summary-pipeline.service.ts:346](../../apps/api/src/summaries/services/summary-pipeline.service.ts)) calls `findById`, which runs `SELECT *` and parses the result, the profile, and the error details. It runs after every step, about 8 times per job.

- **Change:** add `SummaryRepository.findStatus(id)`, which runs `SELECT status FROM summary_jobs WHERE id = ?`.
- **Risk:** very low.

### P1. Media cleanup makes N+1 queries

`SummariesService.cleanupExpiredMedia` ([summaries.service.ts:170](../../apps/api/src/summaries/services/summaries.service.ts)) loads every failed job with `SELECT *`, then runs `findById` and `getCheckpoint` again for each one. That is 1 + 2N queries, plus result parsing for jobs that have nothing to clean up.

- **Change:** run one query that joins `summary_checkpoints` and returns only the IDs, paths, and `mediaExpiresAt` of failed jobs. Keep the per-job status re-check right before deleting files, because it guards against a retry that starts during cleanup.
- **Risk:** low. The existing cleanup tests cover the race.

### P2. Every job poll runs two or three queries

The job page polls `GET /api/summaries/:id` every 900 ms while a job runs ([summary-page.tsx:36](../../apps/web/src/pages/summary-page.tsx)). Each poll runs `SELECT *` and parses `result_json`. For a failed job, `toPublicJob` → `getRetryInfo` ([summaries.service.ts:300](../../apps/api/src/summaries/services/summaries.service.ts)) also reads the checkpoint, which can contain the full transcript, and calls `existsSync`. `cancel` makes three queries where one `UPDATE … RETURNING` plus one read would do.

- **Change:** fold this into the P1 list and status work. Read the checkpoint only for failed jobs, which is already the case, and select only what `getRetryInfo` needs.
- **Larger option:** see "Push progress instead of polling" below.

### P2. Checkpoints rewrite the full transcript on every save

`saveCheckpoint` ([summary.repository.ts:143](../../apps/api/src/summaries/summary.repository.ts)) serializes and Zod-validates the whole checkpoint, including the full transcription. The pipeline saves up to 5 times per job, 3 of them concurrently (summary, verdict, timeline), and `getCheckpoint` parses the whole checkpoint again.

- **Change:** store each step in its own column, or in a `(summary_id, step)` row, so a save writes only its own step.
- **Risk:** medium. This needs a schema change and a migration for existing checkpoints.

### P3. Statements are prepared on every call

Turso's `database.get/all/run(sql, ...)` prepares the SQL each time.

- **Change:** prepare the frequently used statements once in the repository. Measure first, because the gain is likely small.

### P3. Stored data is validated on every read

`mapRow` validates `result_json`, the profile, and the error details with Zod on every read, so the cost grows with the size of the result.

- **Trade-off:** keep the validation (it is the safety net for old rows), or validate once when writing. This only matters if the reads above stay hot after the P1 fixes.

## Queue and processing

### P2. Run the cleanup job in its own queue

The hourly `cleanup-expired-media` scheduler shares the `summaries` queue ([summary-queue.ts:26](../../apps/api/src/summaries/jobs/summary-queue.ts)). With a concurrency of 1, cleanup waits behind any running summary, which can take more than 15 minutes. Before the migration, cleanup ran independently on a timer.

- **Change:** add a `maintenance` queue with its own processor.
- **Risk:** low. This brings back the old independence.

### P2. Worker concurrency

Summaries run one at a time, as before ([summary-jobs.processor.ts:14](../../apps/api/src/summaries/jobs/summary-jobs.processor.ts)). The pipeline is almost entirely waiting on I/O: yt-dlp, FFmpeg, Deepgram, the LLM, and Jev. A second queued job therefore waits for the whole first job.

- **Change:** raise `concurrency` to 2–4. Use BullMQ's `limiter` to stay under provider rate limits, and cap concurrent FFmpeg processes.
- **Before this:** `SummariesService.recoveryInProgress` is in memory, so it only protects a single API process. Confirm that it still behaves correctly with concurrent jobs in one process.

### P3. Split the pipeline into a BullMQ flow

Media preparation → transcription → {summary, verdict, timeline} could be parent and child jobs in a flow. Each step would get its own retries, backoff, and observability, and steps could run on different workers (for example, FFmpeg on CPU-heavy hosts).

- **Risk:** high. The checkpoint logic would move into the queue, so this is only worth it if steps need independent scaling.

### P2. Resume interrupted jobs instead of failing them

On startup, `failInterruptedJobs` marks queued and processing jobs as failed, and users then retry them by hand. Jobs are now durable in Redis, and the pipeline already resumes from checkpoints, so interrupted jobs could be re-queued automatically.

- **Risk:** medium. This changes visible behavior, and a job that crashes the process could loop. It needs an attempt cap.

## Client and API

### P2. Push progress instead of polling

Polling every 900 ms (job page) and 1.5 s (library) causes most of the read load above. A Server-Sent Events endpoint fed by BullMQ `QueueEvents` or job progress updates would push stage changes instead.

- **Risk:** medium. It adds a new endpoint and client code. Polling should stay as a fallback.

## Operational items found during the migration (not performance)

These are not optimizations, but they came up during the migration and need a decision:

1. **Startup waits for Redis without a clear error.** With Redis down, `NestFactory.create` blocks during module init, ioredis prints connection errors, and the buffered pino logs never flush. Options: check Redis connectivity at startup and fail fast with a clear message, or add a readiness check.
2. **Creating a job now depends on Redis.** `POST /url` and `POST /upload` insert the row and then `await queue.enqueue()`. If Redis is down, the request fails with a 500 and the queued row is left behind until the next restart marks it failed. Options: enqueue first, or delete the row when enqueueing fails.
3. **`recoveryInProgress` only works within one process.** Running more than one API instance would need a Redis lock (or a database status guard) for retry, delete, and cleanup.
4. **`openai` is kept only for `zodResponseFormat`.** All HTTP now goes through `@nestjs/http-client`. The SDK helper keeps the strict JSON Schema identical to before. Replacing it with `z.toJSONSchema` would drop the dependency, but the generated schema needs a careful comparison first.
5. **`@nestjs/http-client` is at version 0.0.1.** It matches the documentation used here, but pin it exactly and watch for API changes until it reaches 1.0.
