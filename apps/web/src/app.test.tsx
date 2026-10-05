import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./app";
import { ThemeProvider } from "./components/theme-provider";

describe("App", () => {
  it("renders the summary creation workflow", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/"]}>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Know what a video says before you watch it." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload video" })).toHaveAttribute("data-state", "active");
  });
});
