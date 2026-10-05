import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";
import { ThemeProvider } from "./components/theme-provider";
import { ViewerProfileProvider } from "./features/profile/viewer-profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the summary workflow and navigates between pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ data: [] }))),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/"]}>
            <ViewerProfileProvider>
              <App />
            </ViewerProfileProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Summarize a video" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload video" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No summaries yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Summarize" }));
    expect(
      await screen.findByRole("heading", { name: "Summarize a video" }),
    ).toBeInTheDocument();
  });
});
