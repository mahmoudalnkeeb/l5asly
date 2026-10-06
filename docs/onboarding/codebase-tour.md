# Codebase tour

The repository is a pnpm workspace with three packages. This page shows where things live, so you can find the code for any feature in a minute or two.

```text
apps/
  api/            @l5sly/api       NestJS 12 API and queue worker
  web/            @l5sly/web       React 19 single-page app
packages/
  contracts/      @l5sly/contracts Zod schemas and types shared by api and web
bin/              yt-dlp.exe for live YouTube downloads on Windows
docs/             these docs
compose.yaml      local Redis
```

Workspace packages depend on each other with `workspace:*`. The API and the web app both import `@l5sly/contracts`, which is built to `packages/contracts/dist`. The root scripts always build it first.

## `packages/contracts`: the shared language

`packages/contracts/src/index.ts` defines every value that crosses the HTTP boundary: request schemas such as `createUrlSummarySchema`, response shapes such as `summaryJobSchema`, enums such as `SUMMARY_DEPTHS`, and the error envelope `apiErrorSchema`. TypeScript types are derived from the schemas with `z.infer`.

The API validates requests with these schemas, and the web app validates responses with them. A field added here is therefore type-checked on both sides. Change the contract first, then fix what the compiler reports.

## `apps/api`: the NestJS API

```text
src/
  main.ts                 creates the Nest app and starts listening
  app.module.ts           root module: config, logging, database, BullMQ, static files, summaries
  app.setup.ts            HTTP settings (helmet, CORS, body limit, /api prefix), shared with the e2e tests
  config/                 environment validation, exposed as the APP_CONFIG token
  common/                 errors, exception filter, response envelope interceptor, Zod pipe, request IDs
  database/               Turso connection and schema upgrades, exposed as the DATABASE token
  health/                 GET /api/health
  summaries/              the only feature module
    summaries.module.ts
    summaries.controller.ts       HTTP routing only
    summary.repository.ts         all SQL for summary jobs and checkpoints
    summary-checkpoint.ts         checkpoint schema and the media retention period
    summary-id-param.decorator.ts
    services/                     SummariesService, SummaryPipeline, PrecheckService
    jobs/                         SummaryQueue contract, BullMQ producer, worker
    uploads/                      multer options, upload pipes, cleanup interceptor
    media/                        FFmpeg audio extraction, yt-dlp downloader
    providers/                    external AI services, see below
```

Which file to open:

| You want to change… | Start in |
| --- | --- |
| A route, status code, or request validation | `summaries/summaries.controller.ts` |
| A business rule, such as when a job can be retried or deleted | `summaries/services/summaries.service.ts` |
| A processing step or its progress messages | `summaries/services/summary-pipeline.service.ts` |
| SQL or the stored row shape | `summaries/summary.repository.ts` |
| A table or column | `database/database.ts` |
| How jobs are queued or consumed | `summaries/jobs/` |
| File upload handling | `summaries/uploads/` |
| The summary prompt or the output schema | `summaries/providers/llm/` |
| Error response shapes | `common/api-exception.filter.ts` |

### Providers

`summaries/providers/` is grouped by capability, not by vendor:

```text
providers/
  summary-providers.module.ts   binds each contract to its live or mock implementation
  provider-contracts.ts         abstract classes the rest of the module depends on
  speech-to-text/               Deepgram transcription
  systemone/                    Jev verdict, timeline, grounding, and precheck questions
  llm/                          OpenAI-compatible summary generation, prompt, output schema
  mock/                         deterministic providers used when PROVIDER_MODE=mock
  shared/                       helpers used by more than one provider
```

[Providers](../architecture/providers.md) explains how this works.

## `apps/web`: the React app

```text
src/
  main.tsx               providers: theme, React Query, notifications, viewer profile, router
  app.tsx                routes, each page lazy-loaded
  pages/                 one component per route
  features/summaries/    form, processing, result, and failure views
  features/profile/      viewer profile stored in localStorage
  components/            app shell, theme, notifications, logo
  lib/api-client.ts      every call to the API, validated with the contracts
```

See the [Frontend guide](../guides/frontend.md).

## Where tests live

Tests sit in a `tests/` folder next to the code they cover, for example `summaries/providers/systemone/tests/` and `summaries/services/tests/`. The API's end-to-end tests are in `summaries/tests/`. The web app keeps its tests next to the components, as `*.test.ts(x)`. See [Testing](../guides/testing.md).

## Naming conventions

- Files use kebab-case. NestJS building blocks use a role suffix: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.pipe.ts`, `*.interceptor.ts`, `*.processor.ts`, `*.provider.ts`, `*.decorator.ts`.
- Group files by kind in a folder only when there are several of the same kind (for example `services/`). A single pipe or interceptor stays next to the code that uses it.
- Imports use explicit `.js` extensions because the API compiles to native ES modules.
