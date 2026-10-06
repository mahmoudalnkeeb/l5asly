# Getting started

This guide takes you from a fresh clone to a running app with passing checks. The default setup uses mock providers, so you don't need any API keys.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 24 or newer | Runs the API, the web build, and the tests |
| pnpm | 12 | Workspace package manager (the version is pinned in the root `package.json`) |
| Redis | the version in `compose.yaml` (Redis 8) | Stores the BullMQ job queue |
| Docker | any recent version | Optional. Runs Redis locally through `compose.yaml` |

You don't need Python or a C/C++ toolchain. Turso and FFmpeg ship as prebuilt binaries.

## First run

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d redis
pnpm dev
```

`pnpm dev` builds the shared contracts and the API, then starts two processes:

- the API on `http://localhost:4000`, rebuilt by `tsc --watch` and restarted by `node --watch`;
- the web app on `http://localhost:5173`, served by Vite, which proxies `/api` to the API.

Open `http://localhost:5173`. Use the built-in sample URL, or upload any audio or video file, and you'll get a full mock summary.

## Checks to run before you push

```powershell
pnpm check
```

`pnpm check` runs `pnpm typecheck`, then `pnpm test`, then `pnpm build`. The API tests need no Redis and no network. See [Testing](../guides/testing.md).

To work on one package:

```powershell
pnpm --filter @l5sly/api test
pnpm --filter @l5sly/web dev
```

## Live providers

Mock mode exercises the whole product flow with fixed results. To call the real services, set `PROVIDER_MODE=live` in `.env` and fill in the keys. The API refuses to start if a required key is missing. Every variable is described in [Configuration](../reference/configuration.md).

Live YouTube processing also needs `yt-dlp`. The repository ships `bin/yt-dlp.exe` for Windows, and `.env.example` already points to it. On other systems, install `yt-dlp` and set `YTDLP_PATH`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The API prints repeated `ECONNREFUSED ... :6379` errors and never starts listening | Redis is not running. Start it with `docker compose up -d redis`, or set `REDIS_URL` to a reachable Redis. |
| The web app shows "The server could not be reached" | The API is not running on port 4000, or it is still waiting for Redis. |
| A dependency with native binaries fails after a fresh install | pnpm runs install scripts only for the packages listed under `allowBuilds` in `pnpm-workspace.yaml`. Add the package there only if it really needs its install script. |
| Startup fails with `... is required when PROVIDER_MODE is live` | Set the missing key in `.env`, or switch back to `PROVIDER_MODE=mock`. |
| A YouTube job fails with "The yt-dlp executable was not found" | Set `YTDLP_PATH` to a valid `yt-dlp` binary. |

Local data lives in `./data` (the database file and uploads). Delete that folder to start from an empty library.
