import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrecheckResult, SummaryJob } from "@l5sly/contracts";
import { ThemeProvider } from "@/components/theme-provider";
import { FailedSummaryState } from "./failed-summary-state";
import { getPrecheckQueryKey } from "./precheck-query";
import { ProcessingState } from "./processing-state";

const processingJob: SummaryJob = {
  id: "08f234b1-444d-488b-bf65-f029306383e6",
  status: "processing",
  source: {
    type: "youtube",
    name: "Team rituals that work",
    url: "https://www.youtube.com/watch?v=abc123",
  },
  options: {
    language: "English",
    depth: "quick",
    expectation: "Which rituals fit a remote team?",
  },
  progress: 40,
  stage: "Transcribing audio",
  result: null,
  error: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

const precheck: PrecheckResult = {
  title: "Team rituals that work",
  channel: "Team Talks",
  durationSeconds: 900,
  verdict: {
    recommendation: "watch-key-moments",
    confidence: 0.7,
    headline: "Watch the remote section",
    reason: "Only the second half covers remote teams.",
  },
};

function renderWithClient(children: ReactNode, queryClient: QueryClient): void {
  render(
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("ProcessingState", () => {
  it("shows the question and the quick check's verdict while the job runs", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getPrecheckQueryKey({
        url: "https://www.youtube.com/watch?v=abc123",
        language: "English",
        expectation: "Which rituals fit a remote team?",
      }),
      precheck,
    );
    renderWithClient(
      <ProcessingState
        job={processingJob}
        isCancelling={false}
        onCancel={vi.fn()}
      />,
      queryClient,
    );

    expect(
      screen.getByText("Which rituals fit a remote team?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Provisional verdict" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Verdict: Key moments only" }),
    ).toBeInTheDocument();
  });

  it("leaves out the provisional verdict when no quick check ran", () => {
    renderWithClient(
      <ProcessingState
        job={processingJob}
        isCancelling={false}
        onCancel={vi.fn()}
      />,
      new QueryClient(),
    );

    expect(
      screen.queryByRole("region", { name: "Provisional verdict" }),
    ).not.toBeInTheDocument();
  });
});

describe("FailedSummaryState", () => {
  it("shows which steps a retry keeps and which it runs again", () => {
    const failedJob: SummaryJob = {
      ...processingJob,
      status: "failed",
      progress: 80,
      failedStep: "summary",
      error: "The summary provider timed out.",
      retryInfo: {
        fromStep: "summary",
        requiresUpload: false,
        reason: "Retry reuses the saved transcript.",
      },
    };
    renderWithClient(
      <FailedSummaryState
        job={failedJob}
        isRetrying={false}
        isDeleting={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />,
      new QueryClient(),
    );

    expect(screen.getAllByText("Saved, reused on retry")).toHaveLength(2);
    expect(screen.queryByText("Not started")).not.toBeInTheDocument();
    expect(
      screen.getByText("Retry reuses the saved transcript."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry summary" }),
    ).toBeEnabled();
  });
});
