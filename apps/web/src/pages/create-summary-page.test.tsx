import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SummaryListItem } from "@l5asly/contracts";
import { NotificationProvider } from "@/components/notifications";
import { ThemeProvider } from "@/components/theme-provider";
import { ViewerProfileProvider } from "@/features/profile/viewer-profile";
import { CreateSummaryPage } from "./create-summary-page";

function skippedVideo(durationSeconds: number): SummaryListItem {
  // Created an hour ago, so always within the past week.
  const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    id: crypto.randomUUID(),
    status: "completed",
    source: { type: "upload", name: "talk.mp4" },
    progress: 100,
    stage: "Completed",
    createdAt,
    updatedAt: createdAt,
    title: "A long talk",
    verdict: {
      recommendation: "skip",
      confidence: 0.9,
      headline: "Skip it",
      reason: "It repeats the brief.",
    },
    durationSeconds,
  };
}

function renderPage(recentSummaries: SummaryListItem[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ data: recentSummaries }),
    ),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <ThemeProvider defaultTheme="light">
      <NotificationProvider>
        <QueryClientProvider client={queryClient}>
          <ViewerProfileProvider>
            <MemoryRouter>
              <CreateSummaryPage />
            </MemoryRouter>
          </ViewerProfileProvider>
        </QueryClientProvider>
      </NotificationProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateSummaryPage", () => {
  it("shows the time this week's skip verdicts saved", async () => {
    renderPage([skippedVideo(3600), skippedVideo(1200)]);

    expect(
      await screen.findByText(/2 videos flagged as skips this week saved you/),
    ).toHaveTextContent("1h 20m");
  });

  it("says nothing about saved time before anything was skipped", async () => {
    renderPage([]);

    await screen.findByRole("heading", { name: "Is this video worth your time?" });
    // Let the empty list arrive before checking that nothing appeared.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/flagged as skips/)).not.toBeInTheDocument();
  });
});
