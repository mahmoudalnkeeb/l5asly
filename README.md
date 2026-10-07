# L5asly

[![Check](https://github.com/mahmoudalnkeeb/l5asly/actions/workflows/check.yml/badge.svg)](https://github.com/mahmoudalnkeeb/l5asly/actions/workflows/check.yml) [![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/mahmoudalnakeeb)

L5asly tells you whether a video is worth your time, and if it isn't, what it says.

You give it a video upload or a public video URL, and optionally the question you want answered. It transcribes the video and writes a short brief that answers your question first. It also gives a verdict (watch it, watch only the key moments, or skip it), a timeline of which parts matter to you, and the full timestamped transcript. For YouTube links, a quick check gives a provisional verdict in a few seconds, from the title, description and chapters alone, before anything is downloaded.

## Quick start

You need Node.js 24 or newer, pnpm 12, and Docker to run Redis.

```bash
pnpm install
cp .env.example .env
docker compose up -d redis
pnpm dev
```

Open `http://localhost:5173`. The app starts in mock mode, which returns built-in sample results, so the whole flow works without any API keys. Paste the sample URL from the create page, or upload any audio or video file, and follow the job from the queue to the result.

## How a video gets summarized

The API never processes a video inside the request. It stores a job, puts it on a Redis queue, and returns right away. A worker then prepares the audio (downloading it from YouTube, or extracting it from a video file with FFmpeg) and transcribes it with Deepgram. Then it runs three things at once: an LLM writes the brief, and Jev scores the verdict and the timeline. The web app polls the job until it finishes, so you can close the page and reopen the job later from Library.

Every step saves its output before the next one starts. That's what makes failures cheap: if the brief fails, retrying it reuses the saved transcript instead of downloading and transcribing the video again.

## What you can configure per video

### Language

L5asly supports Arabic and English. Video language is the language spoken in the video. Transcription uses it as is and never translates. Summary language, under Advanced options, sets the language of the brief and verdict. An Arabic lecture can get an English brief and still keep its Arabic transcript.

### Your profile and your question

The Profile page stores your background, what you already know, your goals, and how you like things explained. It lives in your browser's local storage; there's no account and no sync between devices. Each job keeps a snapshot of the profile when it's created, so later edits don't change old summaries. Don't put anything sensitive in it, because it's sent to the AI services.

The question you ask about a specific video wins over your saved goals. The brief answers that question instead of recapping the whole video, and it says so when the video doesn't contain the answer. Very long transcripts are sampled evenly across the video, and the brief tells you when that happened.

### The verdict

Jev doesn't just answer "watch or skip". It asks whether the video answers your question, how much of it is filler, and whether it assumes background your profile says you don't have. The verdict's reason is written from those answers. It also scores up to 12 timed parts of the video for the relevance timeline, and checks each key point of the brief against the transcript. Points it can't find are marked "Not found in transcript".

The timeline and that check are extras. If either one fails, the job still completes without it.

## When something fails

A failed job shows what went wrong and what a retry will do. A retry keeps the same job, question, languages, and profile snapshot, and starts again from the step that failed. Media from a failed job is kept for 24 hours. After that, if the retry still needs the media, you'll be asked to select the same file again. Saved transcripts are kept until you delete the job. If the server restarts mid-job, the job is marked as interrupted and you can retry it.

## Using the real services

Set `PROVIDER_MODE=live` in `.env` and fill in the keys:

```text
DEEPGRAM_API_KEY=
LLM_API_KEY=
LLM_BASE_URL=https://backend.sovereigneg.com/v1
LLM_MODEL=gpt-oss-20b
JEV_API_KEY=
JEV_BASE_URL=https://backend.sovereigneg.com/v1
JEV_MODEL=jev-1.13
```

The API checks the keys at startup and won't start if one is missing. Keys stay on the server and never appear in logs.

The LLM endpoint must support strict structured output (`response_format` with a `json_schema` and `strict: true`). L5asly relies on it to get a brief in a known shape. If the endpoint rejects it, jobs fail with `SUMMARY_SCHEMA_REJECTED` instead of falling back to output that hasn't been checked.

YouTube audio is downloaded on the API host with [yt-dlp](https://github.com/yt-dlp/yt-dlp). `pnpm install` downloads the right yt-dlp build for your OS and CPU into `apps/api/bin`, checks it against a pinned SHA-256 checksum, and the API uses it by default. Set `YTDLP_PATH` only if you want a different binary. Every setting, with its default and allowed range, is in [docs/reference/configuration.md](docs/reference/configuration.md).

## Running in production

Each service has its own Docker image, and `compose.yaml` runs them together:

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8080`. Compose runs three containers:

- `web`: nginx serves the built React app and proxies `/api` to the API. It's the only service exposed to the host besides Redis.
- `api`: the NestJS API and the queue worker in one process. The database and uploads live in the `api-data` volume.
- `redis`: the BullMQ queue, with `maxmemory-policy noeviction` and its data in the `redis-data` volume.

Provider keys and `PROVIDER_MODE` come from `.env`. Compose overrides the settings that differ inside a container, such as `REDIS_URL` and `DATABASE_PATH`. To run the API outside Docker, you need a Redis server with `maxmemory-policy noeviction` (BullMQ requires it) and persistent disk for `DATABASE_PATH` and `UPLOAD_DIR`. The API serves only `/api`, so put something in front of it that serves `apps/web/dist` and proxies `/api`, like `apps/web/nginx.conf` does.

One limitation to know before deploying: the database file, uploaded media, and some job locking all live on one host, so you can't run several API instances behind a load balancer yet. [docs/proposals/optimization-review.md](docs/proposals/optimization-review.md) lists this and other known gaps.

## Contributing

`pnpm check` typechecks, tests, and builds every package. The tests don't need Redis, network access, or API keys.

The repository is a pnpm workspace. The NestJS API and the React app share their request and response schemas through `packages/contracts`, so a change to the API's shape is type-checked on both sides. Start with the [contributor docs](docs/README.md). They walk through setup, the codebase, the architecture, and the [HTTP API](docs/reference/http-api.md). [AGENTS.md](AGENTS.md) is the coding standard.

The stack: React 19, Vite, TanStack Query, and Material UI on the web side; NestJS 12, BullMQ on Redis, and Turso (an embedded SQLite-compatible database) on the API side; Deepgram, an OpenAI-compatible LLM, and Jev for the AI work; Vitest throughout.

## Support

L5asly is free and built in my spare time. If it saves you a few hours of video, you can buy me a coffee on Ko-fi:

[![Support me on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20L5asly-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/mahmoudalnakeeb)
