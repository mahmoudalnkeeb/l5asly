# Providers

"Providers" here means the external AI services the pipeline calls, not Nest providers in general. They live in `apps/api/src/summaries/providers/`, grouped by what they do rather than by vendor.

## Contracts

`provider-contracts.ts` defines abstract classes. The rest of the code depends only on these:

| Contract | Method(s) | Used by | Live implementation | Folder |
| --- | --- | --- | --- | --- |
| `TranscriptionProvider` | `transcribe(media, language)` | Pipeline | `DeepgramTranscriptionProvider` | `speech-to-text/` |
| `SummaryProvider` | `summarize(input)` | Pipeline | `OpenAiSummaryProvider` | `llm/` |
| `VerdictProvider` | `decide(input)` | Pipeline | `JevProvider` | `systemone/` |
| `InsightProvider` | `scoreTimeline`, `checkGrounding`, `precheck` | Pipeline, `PrecheckService` | `JevProvider` | `systemone/` |
| `VideoMetadataSource` | `fetchMetadata(url)` | `PrecheckService` | `YtDlpYoutubeDownloader` | `../media/` |
| `YoutubeDownloader` | `download(url, jobId)` | Pipeline | `YtDlpYoutubeDownloader`, or `null` in mock mode | `../media/` |

The contracts are abstract classes rather than interfaces because Nest uses them as injection tokens. A service asks for `TranscriptionProvider` in its constructor and receives whichever implementation the module selected.

`InsightProvider` methods are optional enrichment. The pipeline catches their failures and still completes the job (see [Summary jobs](summary-jobs.md#processing-steps)).

## Mock and live mode

`SummaryProvidersModule` (`summary-providers.module.ts`) reads `PROVIDER_MODE` once and registers a factory for each contract:

```ts
{
  provide: TranscriptionProvider,
  inject: [APP_CONFIG, getHttpClientToken(DEEPGRAM_HTTP_CLIENT)],
  useFactory: (config: AppConfig, http: HttpClient) =>
    isLive(config)
      ? new DeepgramTranscriptionProvider(http)
      : new MockTranscriptionProvider(),
}
```

The module exports only the contracts, so `SummariesModule` never imports a vendor class. Mock implementations in `mock/mock-providers.ts` return fixed results, which makes the whole product flow work without keys or network access.

## Capability folders

Each folder holds everything for one capability: the HTTP client registration, the provider, its helpers, and its tests.

### `speech-to-text/`: Deepgram

- `deepgram-http-client.ts` registers the `deepgram` HTTP client: base URL, `Token` authorization, timeout from `DEEPGRAM_TIMEOUT_MS`.
- `deepgram-transcription.provider.ts` posts the file (or the URL) to `/v1/listen` with the `nova-3` model. It always sends an explicit language, because Deepgram's language detection doesn't support Arabic. It rejects an "Arabic" transcript that contains no Arabic script, so a summary is never written from the wrong language.

### `systemone/`: Jev

- `jev-http-client.ts` registers the `jev` client against `JEV_BASE_URL`.
- `jev.provider.ts` sends a `state` (context text) and a set of questions to `/systemone`. Answers are either `noul` (0 to 1) or `score` (0 to 2). One instance implements both `VerdictProvider` and `InsightProvider`:
  - `decide` and `precheck` ask the watch questions, and `shared/watch-verdict.ts` turns the answers into a recommendation and a reason.
  - `scoreTimeline` splits the transcript into timed windows (`shared/transcript-segments.ts`) and scores each one.
  - `checkGrounding` asks whether each key point is supported by the transcript. It returns `null` for transcripts longer than the Jev input limit, so content Jev never saw isn't flagged as unsupported.

### `llm/`: summary generation

- `llm-http-client.ts` registers the `llm` client against `LLM_BASE_URL`.
- `openai-summary.provider.ts` calls `/chat/completions` with strict structured output. It maps provider failures to specific error codes: `SUMMARY_SCHEMA_REJECTED`, `SUMMARY_REFUSED`, and `SUMMARY_INVALID_FORMAT` (see [Error codes](../reference/error-codes.md)).
- `summary-output-schema.ts` is the Zod schema of the model's answer. The same schema generates the request's JSON Schema (through the `zodResponseFormat` helper from the `openai` package) and validates the response.
- `summary-prompt.ts` holds the system prompt and the depth-specific instructions and limits.
- `summary-quality.ts` post-processes the model output. It applies the depth limits, and it sets each recommended moment's timestamp from the transcript segment that contains the moment's quoted evidence. Moments with no matching segment are dropped.

Long transcripts are sampled across the whole timeline, and the brief gets a caveat that says so.

### `shared/`

Helpers used by more than one capability, or by the mocks too: `transcript-segments.ts`, `viewer-context.ts` (formats the viewer profile and question as data for prompts), `watch-verdict.ts`, and `http-provider-errors.ts`.

## HTTP calls

All outbound HTTP goes through `@nestjs/http-client`, one named client per capability. Rules:

- **Retries are off.** Every provider call is a POST request, and repeating it could duplicate costly work. The pipeline's checkpoint and retry flow handles failures instead.
- **Timeouts come from configuration** and apply to each attempt.
- **Errors are mapped.** `shared/http-provider-errors.ts` turns client errors into application errors: `HttpTimeoutError` becomes `PROVIDER_TIMEOUT`, and an error status, a network failure, or invalid JSON becomes `PROVIDER_ERROR`. The error message includes the upstream status and at most 240 characters of the response body.
- **Responses are validated** with Zod before use, since the type argument of `http.post<T>()` isn't checked at runtime.

## Adding or replacing a provider

To swap the vendor behind an existing capability, for example a different speech-to-text service:

1. Add a client registration and a provider class to the capability's folder, implementing the existing contract.
2. In `summary-providers.module.ts`, import the new client and change the live branch of the factory.
3. Add any new keys to [configuration](../reference/configuration.md).
4. Add tests in the folder's `tests/` directory that stub `fetch` (see [Testing](../guides/testing.md#testing-http-providers)).

To add a new capability, add a contract to `provider-contracts.ts`, a mock to `mock/`, a capability folder with the live implementation, a factory and an export in `SummaryProvidersModule`, and only then inject the contract where it is needed.
