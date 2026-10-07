import type { SummaryLanguage } from "@l5asly/contracts";

interface PrecheckKeyInput {
  url: string;
  language: SummaryLanguage;
  expectation: string | undefined;
}

// The create form caches each quick check under this key. The processing page
// builds the same key from the job's options to show that verdict while the
// full summary runs, without asking the API again.
export function getPrecheckQueryKey(input: PrecheckKeyInput) {
  return [
    "precheck",
    input.url.trim(),
    input.language,
    input.expectation?.trim() ?? "",
  ] as const;
}
