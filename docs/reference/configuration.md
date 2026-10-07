# Configuration

The API reads its configuration from environment variables once, at startup, in `apps/api/src/config/app-config.ts`. Variables are validated with Zod and converted to typed values, then exposed through the `APP_CONFIG` injection token. An invalid value stops startup with an error that names the variable.

`.env` is loaded from the repository root. Start from `.env.example`. Relative paths in `DATABASE_PATH`, `UPLOAD_DIR`, and `YTDLP_PATH` are resolved from the repository root, not from the current directory.

## General

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `4000` | HTTP port |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `DATABASE_PATH` | `./data/l5asly.db` | Turso database file. `:memory:` is used in tests |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection. Redis must use `maxmemory-policy noeviction` |
| `UPLOAD_DIR` | `./data/uploads` | Uploads and temporary media. Created when missing |
| `MAX_UPLOAD_MB` | `1024` | Largest accepted upload |
| `PROVIDER_MODE` | `mock` | `mock` uses built-in fixed results. `live` calls the services below |

## Live providers

In `live` mode, `DEEPGRAM_API_KEY`, `LLM_API_KEY`, and `JEV_API_KEY` are required. Startup fails when any of them is missing.

| Variable | Default | Allowed range | Notes |
| --- | --- | --- | --- |
| `DEEPGRAM_API_KEY` | none | | Speech-to-text |
| `DEEPGRAM_TIMEOUT_MS` | `300000` | 1,000 to 900,000 | Per request |
| `LLM_API_KEY` | none | | Summary generation |
| `LLM_BASE_URL` | `https://backend.sovereigneg.com/v1` | | OpenAI-compatible endpoint. It must support strict `json_schema` structured output |
| `LLM_MODEL` | `gpt-oss-20b` | | |
| `LLM_TIMEOUT_MS` | `480000` | 1,000 to 900,000 | Per request |
| `JEV_API_KEY` | none | | SystemOne verdict, timeline, grounding, and precheck |
| `JEV_BASE_URL` | `https://backend.sovereigneg.com/v1` | | |
| `JEV_MODEL` | `jev-1.13` | | |
| `JEV_TIMEOUT_MS` | `90000` | 1,000 to 900,000 | Per request |
| `YTDLP_PATH` | `apps/api/bin/yt-dlp(.exe)` | | The binary `pnpm install` downloads. Set it to a command name on `PATH` or a path to use another one |
| `YTDLP_TIMEOUT_MS` | `900000` | 10,000 to 1,800,000 | Per download or metadata lookup |

Keys are only ever read by the server. They are sent as `authorization` headers by the named HTTP clients and never logged.

## Install time

This variable is read by `apps/api/scripts/install-yt-dlp.mjs` during `pnpm install`, not by the API.

| Variable | Default | Notes |
| --- | --- | --- |
| `YTDLP_SKIP_DOWNLOAD` | unset | Set to `1` to skip the yt-dlp download, for example in a container that installs yt-dlp itself or in a mock-only CI job |

## Adding a variable

1. Add it to `environmentSchema` with a type and, when sensible, a default.
2. Add the typed field to `AppConfig` and map it in `loadConfig()`.
3. Add it to `.env.example` and to this page.
4. Read it through `@Inject(APP_CONFIG)` or a factory provider's `inject: [APP_CONFIG]`. Don't read `process.env` anywhere else.
5. Add the field to the `AppConfig` object in `summaries/tests/summaries.e2e.test.ts`.
