# L5asly

L5asly turns a video upload or public video URL into a concise summary, structured notes, a timestamped transcript, and a recommendation on whether the full video is worth watching.

The default setup uses deterministic mock providers, so the complete product flow works locally without credentials. Live mode keeps all provider keys in the API server and connects Deepgram for transcription plus OpenAI-compatible summary and verdict providers.

## Stack

- React 19, Vite, React Router, TanStack Query, React Hook Form
- Material UI components and icons with a shared light/dark theme
- Tailwind CSS 4 for transcript text utilities
- NestJS 12 on Express, Zod, Multer, FFmpeg
- Turso (embedded SQLite-compatible database) for persistence
- BullMQ on Redis for the summary job queue
- @nestjs/http-client for provider HTTP calls, nestjs-pino for logs
- pnpm workspaces
- Shared TypeScript contracts for client and server boundaries
- Vitest, Testing Library, and Supertest

## Run locally

Requirements: Node.js 24 or newer, pnpm 12, and Redis (the job queue). Turso ships prebuilt binaries, so no Python or native compiler toolchain is required. `compose.yaml` starts a local Redis configured for BullMQ.

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d redis
pnpm dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:4000`, and Vite proxies `/api` requests to it.

Mock mode is enabled by default. Use the built-in sample URL or upload an audio/video file to exercise the full queued, processing, result, and library flow.

## Languages and personalized summaries

Only Arabic and English are supported. Set **Video language** to the spoken language before creating a job. Transcription uses that language explicitly and does not translate speech. **Summary language**, under Advanced options, independently controls the written brief and verdict: an Arabic video can produce an English summary while keeping its Arabic transcript.

Open **Profile** to save your background, existing knowledge, learning goals, and explanation preferences once. Edit or clear it whenever needed. It is saved in this browser, without an account or cross-device sync. Each new job stores a snapshot and sends it to the summary and verdict providers. Avoid sensitive information. Existing summaries are not changed by profile edits.

New briefs include a direct answer, personal relevance, preparation, and practical next steps. Your question for a specific video takes priority over saved goals. Long transcripts that exceed the model input budget are sampled across the entire timeline, with an explicit limitation in the brief.

Summary generation follows a question-first analysis guide: understand the question, extract and merge relevant ideas, then reconstruct a natural personalized answer. It does not recap the entire video unless requested, invent user experience, or pad narrow answers to fill section quotas. Key points use `sections`, the personalized answer uses `viewerAnswer`, and optional verification notes use `notes` and grounded `recommendedMoments`. Missing information and unsupported claims remain explicit. The guide and depth limits live in `apps/api/src/summaries/providers/llm/summary-prompt.ts`.

## Watch insights from Jev

Jev answers several structured questions per video, not just the yes/no verdict:

- **Verdict signals.** Whether the video answers your question, how dense it is, how much filler it has, and whether it assumes background your profile lacks. The verdict reason is written from these signals. When a question was asked and the video clearly does not answer it, the verdict is to skip, with a reason that says so.
- **Relevance timeline.** The transcript is split into up to 12 timed parts, each scored for your question and goals in one request. The result page shows where the value is and the time worth watching. Parts without speech count as not relevant and are not sent to Jev.
- **Grounding check.** After the summary is written, Jev checks each key point against the transcript. Points it cannot match are marked "Not found in transcript". The check is skipped for transcripts longer than Jev's input budget, so content it never saw is not flagged as unsupported.
- **Quick check.** For YouTube links, **Quick check** reads only the title, description and chapters through `yt-dlp --dump-single-json` and returns a provisional verdict in seconds. No job is created, and nothing is downloaded or transcribed. `POST /api/summaries/precheck` takes `url`, `language`, and optional `expectation` and `viewerProfile`.

The timeline and grounding check are optional extras: if either fails, the job still completes without it, and the failure is logged. Their results are checkpointed with the summary, so a summary retry does not repeat them unnecessarily. Results saved before these features existed still display normally.

If an older Arabic job contains only English fragments, create it again with **Video language: Arabic** after rebuilding and restarting the server. Missed speech cannot be restored from the old transcript. Database schema upgrades run automatically on startup and preserve existing jobs.

## Quality checks

```powershell
pnpm typecheck
pnpm test
pnpm build
```

`pnpm check` runs all three in sequence. The API tests need no Redis: the end-to-end suite replaces the BullMQ queue with an in-process stand-in.

## Live providers

Set `PROVIDER_MODE=live` in `.env`, then provide:

```text
DEEPGRAM_API_KEY=
LLM_API_KEY=
LLM_BASE_URL=https://backend.sovereigneg.com/v1
LLM_MODEL=gpt-oss-20b
JEV_API_KEY=
JEV_BASE_URL=https://backend.sovereigneg.com/v1
JEV_MODEL=jev-1.13
```

Live mode validates every required credential during startup. Keys are read only by the server and redacted from logs. Rotate any credential that was previously placed in `plan.txt` or another checked-in document before using the live pipeline.

### YouTube URLs

Live YouTube summarization downloads the audio on the API host with [yt-dlp](https://github.com/yt-dlp/yt-dlp), then sends the local audio file to Deepgram. The Windows example configuration uses the bundled `bin/yt-dlp.exe`; on other hosts, install `yt-dlp` and set `YTDLP_PATH` as needed. `YTDLP_TIMEOUT_MS` controls the maximum download time. Temporary media is deleted after successful processing; failed transcription jobs retain media for the retry window below.

## Waiting, failures and recovery

The processing page uses a Material progress spinner, elapsed/current-step timers, and a three-step indicator. Progress reflects completed milestones rather than estimated time. A network refresh failure keeps the last known state visible with a reconnection warning. You can leave the page and reopen the job from Library.

Failed jobs offer **Retry** and **Delete job**. Retries keep the same ID, question, language settings, and original profile snapshot. The server saves checkpoints after media preparation, transcription, summary generation, and verdict generation. A summary retry reuses the saved transcript and any completed verdict instead of downloading/transcribing again. Server restarts mark interrupted jobs as failed while keeping their checkpoints.

Failed-job media is available for retries for 24 hours. Expired media is removed on startup and during hourly cleanup. Saved transcripts remain available for summary retries until the job is deleted. If upload media is missing or expired and there is no transcript, select the same file to retry. Older jobs created before checkpoints were added must restart from their URL or a replacement upload. Deletion removes the job, its checkpoints, and retained media. Active jobs cannot be deleted or retried while processing/cleanup is still running.

Summary requests use strict [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat) with `zodResponseFormat`. The wire contract is defined once in `apps/api/src/summaries/providers/llm/summary-output-schema.ts`: the same Zod schema generates the request's `json_schema` and validates the response. Every field is required, lists with no content use `[]`, and absent guidance uses `null`. `caveats` and `personalizedGuidance.nextSteps` contain only strings; objects and unexpected keys are rejected. Nullable guidance maps back to the existing optional API field without changing saved results.

The configured summary model and endpoint must support `response_format: { type: "json_schema", json_schema: { strict: true, ... } }`. If the provider rejects this response format, the job reports `SUMMARY_SCHEMA_REJECTED`; it never silently falls back to unconstrained JSON mode. Malformed JSON, truncated output, model refusals, and invalid field paths get separate safe diagnostics; raw provider output is not stored in errors. Rebuild and restart the server to activate changes, then use **Retry summary** to reuse a saved transcript.

## Production

```powershell
pnpm build
$env:NODE_ENV = "production"
pnpm start
```

In production, the API also serves the built client from `apps/web/dist`. Configure `PORT`, `CLIENT_ORIGIN`, `DATABASE_PATH`, `REDIS_URL`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, and `LOG_LEVEL` as needed. Redis must use `maxmemory-policy noeviction`, as BullMQ requires.

## API

| Method   | Route                       | Purpose                                                                         |
| -------- | --------------------------- | ------------------------------------------------------------------------------- |
| `GET`    | `/api/health`               | Service and provider-mode health                                                |
| `POST`   | `/api/summaries/url`        | Queue a public URL                                                              |
| `POST`   | `/api/summaries/upload`     | Queue multipart media in the `video` field                                      |
| `GET`    | `/api/summaries`            | List recent summaries                                                           |
| `GET`    | `/api/summaries/:id`        | Read job progress or its result                                                 |
| `POST`   | `/api/summaries/:id/cancel` | Cancel queued or processing work                                                |
| `POST`   | `/api/summaries/:id/retry`  | Retry a failed job; optional multipart `video` if replacement media is required |
| `DELETE` | `/api/summaries/:id`        | Delete a terminal job and retained data; returns `204`                          |

Requests are validated at the transport boundary, and responses use consistent `data` or `error` envelopes with request IDs on errors. The full reference is in [docs/reference/http-api.md](docs/reference/http-api.md).

## Contributing

Start with the [contributor docs](docs/README.md). They cover local setup, a tour of the codebase, the architecture (queue, pipeline, providers, persistence), backend and frontend conventions, testing, and reference pages for the HTTP API, configuration, and error codes. [AGENTS.md](AGENTS.md) defines the coding standard.

```text
apps/api/          NestJS API and queue worker
apps/web/          React application
packages/contracts Shared Zod schemas and TypeScript contracts
docs/              Contributor documentation
```
