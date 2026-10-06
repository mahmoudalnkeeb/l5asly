# Testing

Both apps use [Vitest](https://vitest.dev). `pnpm test` runs every suite, and `pnpm check` adds the typecheck and the build. Neither needs Redis, network access, or API keys.

```powershell
pnpm test                                    # all packages
pnpm --filter @l5sly/api test                # API only
pnpm --filter @l5sly/api exec vitest run src/summaries/providers/systemone
pnpm --filter @l5sly/api exec vitest         # watch mode
```

## What to test

Test behavior that matters to users and to the job lifecycle: business rules, failure paths, state transitions, and provider response handling. Mock only external boundaries (HTTP providers, the queue, the clock when needed). Don't mock internal services or the repository. The service tests use a real in-memory Turso database.

Every bug fix should come with a regression test that fails without the fix.

## Where tests live

In the API, tests sit in a `tests/` folder next to the code they cover:

```text
src/database/tests/database.test.ts                         schema upgrades
src/summaries/tests/summaries.e2e.test.ts                   HTTP end to end
src/summaries/services/tests/summary-pipeline.test.ts       service and pipeline behavior
src/summaries/providers/<capability>/tests/*.test.ts        provider request and response handling
src/summaries/providers/shared/tests/*.test.ts              shared helpers
```

`tsconfig.json` includes the tests, so `pnpm typecheck` checks them too. `tsconfig.build.json` leaves them out of `dist`.

In the web app, tests sit next to the code as `*.test.ts(x)` and run in jsdom with Testing Library.

## The API test layers

### End-to-end tests

`summaries/tests/summaries.e2e.test.ts` boots the real `AppModule` with `Test.createTestingModule`, applies the same `configureApp()` as `main.ts`, and sends requests with Supertest. Only three things are replaced:

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(APP_CONFIG).useValue(config)          // mock providers, :memory: database, silent logs
  .overrideProvider(getQueueToken(SUMMARY_QUEUE)).useValue({})
  .overrideProvider(SummaryJobsProcessor).useValue({})    // no BullMQ worker, so no Redis
  .overrideProvider(SummaryQueue).useClass(InMemorySummaryQueue)
```

`InMemorySummaryQueue` runs `SummaryPipeline.process` one job at a time inside the test process, so a test can create a job and poll `GET /api/summaries/:id` until it completes.

Use this layer for routing, validation, status codes, the error envelope, and upload cleanup.

### Service and pipeline tests

`services/tests/summary-pipeline.test.ts` builds `SummariesService` and `SummaryPipeline` directly, with a real in-memory database, stub providers, and a `NoopSummaryQueue`. Tests call `pipeline.process(id)` themselves, which makes multi-step scenarios deterministic: fail at transcription, retry, and check that media preparation didn't run again.

Use this layer for checkpoints, retries, cancellation, cleanup, and fallbacks.

### Testing HTTP providers

Provider tests build the provider with a real `HttpClient` and stub the global `fetch`. `HttpClient` looks up `globalThis.fetch` on every request, so the stub catches all calls:

```ts
const provider = new JevProvider(
  new HttpClient({ baseUrl: "https://jev.example.com/v1", timeout: 1_000, retry: false }),
  "jev-test",
);

vi.spyOn(globalThis, "fetch").mockResolvedValue(
  new Response("model overloaded", { status: 503 }),
);

await expect(provider.decide(input)).rejects.toMatchObject({
  code: "PROVIDER_ERROR",
  message: "The Jev provider returned status 503: model overloaded",
});
```

Give each call its own `Response` (`mockResolvedValueOnce`) when a test makes several requests, because a response body can be read only once. Cover the success path, an error status, a timeout, and an invalid response body.

## Decorators in tests

Nest depends on `experimentalDecorators` and `emitDecoratorMetadata`. Vitest picks both up from `apps/api/tsconfig.json`, which is why that file includes the test folders. A class with Nest decorators in a file that `tsconfig.json` doesn't cover fails to load, with `SyntaxError: Invalid or unexpected token`.

## Testing against real Redis

The automated suites never touch BullMQ. After you change anything in `summaries/jobs/`, check the real queue by hand:

```powershell
docker compose up -d redis
pnpm dev
```

Then create a summary in the UI. Watch it reach `completed`, retry a failed job, and restart the API while a job is running. The job should come back as failed with `JOB_INTERRUPTED`.
