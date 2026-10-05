# L5asly

L5asly turns a video upload or public video URL into a concise summary, structured notes, a timestamped transcript, and a recommendation on whether the full video is worth watching.

The default setup uses deterministic mock providers, so the complete product flow works locally without credentials. Live mode keeps all provider keys in the Express server and connects Deepgram for transcription plus OpenAI-compatible summary and verdict providers.

## Stack

- React 19, Vite, React Router, TanStack Query, React Hook Form
- Tailwind CSS 4 and official shadcn/ui primitives
- Express 5, Zod, SQLite, Multer, FFmpeg
- Shared TypeScript contracts for client and server boundaries
- Vitest, Testing Library, and Supertest

## Run locally

Requirements: Node.js 24 or newer and npm. SQLite is provided by Node.js, so no Python or native compiler toolchain is required.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:4000`, and Vite proxies `/api` requests to it.

Mock mode is enabled by default. Use the built-in sample URL or upload an audio/video file to exercise the full queued, processing, result, and library flow.

## Quality checks

```powershell
npm run typecheck
npm test
npm run build
```

`npm run check` runs all three in sequence.

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

Live YouTube summarization downloads the audio on the API host with [yt-dlp](https://github.com/yt-dlp/yt-dlp), then sends the local audio file to Deepgram. The Windows example configuration uses the bundled `bin/yt-dlp.exe`; on other hosts, install `yt-dlp` and set `YTDLP_PATH` as needed. `YTDLP_TIMEOUT_MS` controls the maximum download time. Temporary YouTube media is removed after the job finishes.

## Production

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

In production, Express serves the built client from `apps/web/dist`. Configure `PORT`, `CLIENT_ORIGIN`, `DATABASE_PATH`, `UPLOAD_DIR`, and `MAX_UPLOAD_MB` as needed.

## API

| Method | Route                       | Purpose                                    |
| ------ | --------------------------- | ------------------------------------------ |
| `GET`  | `/api/health`               | Service and provider-mode health           |
| `POST` | `/api/summaries/url`        | Queue a public URL                         |
| `POST` | `/api/summaries/upload`     | Queue multipart media in the `video` field |
| `GET`  | `/api/summaries`            | List recent summaries                      |
| `GET`  | `/api/summaries/:id`        | Read job progress or its result            |
| `POST` | `/api/summaries/:id/cancel` | Cancel queued or processing work           |

Requests are validated at the transport boundary, and responses use consistent `data` or `error` envelopes with request IDs on errors.

## Project structure

```text
apps/
  api/       Express transport, job runner, persistence, and providers
  web/       React application and shadcn/ui primitives
packages/
  contracts/ Shared Zod schemas and TypeScript contracts
```

SQLite and the in-process job runner are intentionally simple for this MVP. A multi-instance deployment should move jobs to a durable queue and store uploaded media in object storage.
