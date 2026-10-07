import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SummaryListItem } from "@l5sly/contracts";
import { ThemeProvider } from "@/components/theme-provider";
import { LibraryPage } from "./library-page";

function listItem(
  overrides: Partial<SummaryListItem> & Pick<SummaryListItem, "id" | "status">,
): SummaryListItem {
  return {
    source: {
      type: "youtube",
      name: "Source video",
      url: "https://www.youtube.com/watch?v=abc123",
    },
    progress: 100,
    stage: "Completed",
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    title: null,
    verdict: null,
    durationSeconds: 600,
    ...overrides,
  };
}

const summaries: SummaryListItem[] = [
  listItem({
    id: "4f1d7f43-8a9e-4b47-9d0f-1a0c1f5b2a01",
    status: "completed",
    title: "Rate limiting in Node.js",
    verdict: {
      recommendation: "watch-key-moments",
      confidence: 0.8,
      headline: "Watch the Redis section",
      reason: "The middle covers your question.",
    },
  }),
  listItem({
    id: "4f1d7f43-8a9e-4b47-9d0f-1a0c1f5b2a02",
    status: "processing",
    progress: 40,
    stage: "Transcribing audio",
    title: null,
    source: { type: "upload", name: "team-sync.mp4" },
  }),
  listItem({
    id: "4f1d7f43-8a9e-4b47-9d0f-1a0c1f5b2a03",
    status: "failed",
    stage: "Failed",
    title: null,
    source: { type: "upload", name: "podcast-41.mp3" },
  }),
];

function renderLibrary(): void {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: summaries })),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LibraryPage", () => {
  it("groups jobs by what needs doing, with failed jobs first", async () => {
    renderLibrary();

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Needs attention",
      "In progress",
      "Ready to read",
    ]);
    const inProgress = screen.getByRole("region", { name: "In progress" });
    expect(within(inProgress).getByText("team-sync.mp4")).toBeInTheDocument();
    expect(
      within(inProgress).getByText("Transcribing audio · 40%"),
    ).toBeInTheDocument();
  });

  it("filters by status and by search text", async () => {
    renderLibrary();
    await screen.findByText("Rate limiting in Node.js");

    fireEvent.click(screen.getByRole("button", { name: "Ready 1" }));
    expect(screen.getByRole("button", { name: "Ready 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("team-sync.mp4")).not.toBeInTheDocument();
    expect(screen.getByText("Rate limiting in Node.js")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search your library" }),
      { target: { value: "PODCAST" } },
    );
    expect(await screen.findByText("podcast-41.mp3")).toBeInTheDocument();
    expect(
      screen.queryByText("Rate limiting in Node.js"),
    ).not.toBeInTheDocument();
  });

  it("offers a way back when nothing matches", async () => {
    renderLibrary();
    await screen.findByText("Rate limiting in Node.js");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search your library" }),
      { target: { value: "kubernetes" } },
    );
    expect(
      await screen.findByText('No summaries match "kubernetes"'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show all summaries" }),
    );
    expect(screen.getByText("Rate limiting in Node.js")).toBeInTheDocument();
  });
});
