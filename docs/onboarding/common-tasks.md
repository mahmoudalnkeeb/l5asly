# Common tasks

Step-by-step guides for the changes contributors make most often. Each one lists the files to touch, in order. Run `pnpm check` when you're done.

## Add an option to summary requests

Example: a new `tone` option that the viewer chooses when creating a summary.

1. **Contract.** Add the field to `summaryOptionsSchema` in `packages/contracts/src/index.ts`. If it's optional, older jobs keep working.
2. **Upload route.** Multipart fields aren't covered by the JSON schema automatically. Add the field to the object built in `summaries/uploads/upload-summary-options.pipe.ts`.
3. **Storage.** Add a column (see [Add a database column](#add-a-database-column)). Then write it in `SummaryRepository.create` and read it in `mapRow`.
4. **Use it.** Pass it from `job.options` to the provider input in `SummaryPipeline`, and use it in the prompt (`providers/llm/summary-prompt.ts`).
5. **Web.** Add it to the form schema and the inputs in `features/summaries/summary-form.tsx`, and to `createUploadSummary` in `lib/api-client.ts`.
6. **Tests.** Extend an e2e test to send the option, and a pipeline test to check that it reaches the provider.

## Add an API endpoint

1. Define the request and response schemas in `@l5sly/contracts` and export their types.
2. Add the business logic to the service (`summaries/services/`). It throws `AppError` for expected failures.
3. Add the route to the controller. It's one line that calls the service, with `@HttpCode` when the status isn't `200`, and input validation through `ZodValidationPipe` or `@SummaryIdParam()`.
4. Add a function to `apps/web/src/lib/api-client.ts` that validates the response with the contract schema.
5. Add an e2e test in `summaries/tests/` for success and for at least one rejected input.
6. Document it in [HTTP API](../reference/http-api.md), and add any new code to [Error codes](../reference/error-codes.md).

You don't need to wrap the response in `{ data }`. `ResponseEnvelopeInterceptor` does that.

## Change the summary prompt or output

- **Wording and depth rules:** `providers/llm/summary-prompt.ts`.
- **Fields the model returns:** `providers/llm/summary-output-schema.ts`. Every key is required for strict structured output, so represent "absent" as an empty list or `null`.
- **The stored result:** if the new field must reach the client, add it to `summaryResultSchema` in the contracts, and map it in `OpenAiSummaryProvider.summarize` and `finalizeGeneratedSummary`.
- **Tests:** `providers/llm/tests/summary-format.test.ts` covers schema handling, and `summary-context.test.ts` covers what is sent to the model.

The mock summary in `providers/mock/mock-providers.ts` must still satisfy the contract, or the e2e tests fail.

## Add a database column

1. Append the column to `addedColumns` in `database/database.ts` (leave `CREATE TABLE` unchanged, as the earlier added columns do). It must be nullable or have a `DEFAULT`.
2. Add it to `summaryRowSchema` and `mapRow` in `summary.repository.ts`, with a fallback for rows written before the column existed.
3. Extend `database/tests/database.test.ts` so that it drops the new column and checks that the upgrade adds it back without losing the row.

[Persistence](../architecture/persistence.md) explains the upgrade rules.

## Add a background job

1. Add a job name constant (and a Zod schema for its data) in `summaries/jobs/summary-queue.ts`.
2. To trigger it from the API, add a method to the `SummaryQueue` contract and to `BullSummaryQueue`, and update `InMemorySummaryQueue` in the e2e test and `NoopSummaryQueue` in the service test. To run it on a schedule, add an `upsertJobScheduler` call in `BullSummaryQueue.onApplicationBootstrap`.
3. Add a `case` to the `switch` in `SummaryJobsProcessor.process` that validates the data and calls a service method.
4. Keep the work in the service, where it can be tested without Redis.

The queue runs one job at a time, so a long new job delays summaries. Consider a separate queue if it can take more than a few seconds.

## Add or replace a provider

See [Providers: adding or replacing a provider](../architecture/providers.md#adding-or-replacing-a-provider).

## Add an environment variable

See [Configuration: adding a variable](../reference/configuration.md#adding-a-variable).

## Investigate a failed job

1. Open the job in the UI, or call `GET /api/summaries/:id`. Check `errorCode`, `failedStep`, `errorDetails`, and `retryInfo`. [Error codes](../reference/error-codes.md) explains each code.
2. Search the API logs for the job ID (`"jobId":"<id>"`). The pipeline logs every provider call with its duration and outcome.
3. For a request error, search the logs for the `requestId` from the error response.
4. Reproduce the failure in a pipeline test with a stub provider that throws the same error. Then fix the problem and keep the test.
