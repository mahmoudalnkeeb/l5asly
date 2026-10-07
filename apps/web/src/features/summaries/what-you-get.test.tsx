import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";
import { WhatYouGet } from "./what-you-get";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WhatYouGet", () => {
  it("cycles the example verdict and types out the example answer", async () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider defaultTheme="light">
        <WhatYouGet />
      </ThemeProvider>,
    );
    const [verdictDemo, briefDemo] = screen.getAllByTestId("benefit-demo");
    if (!verdictDemo || !briefDemo) {
      throw new Error("Expected a demo for every benefit.");
    }

    expect(verdictDemo).toHaveTextContent("Watch it");
    expect(briefDemo).toHaveTextContent(/^$/);

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    // The old verdict finishes leaving before the next one enters.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(within(verdictDemo).getByText("Key moments")).toBeInTheDocument();
    expect(briefDemo).toHaveTextContent("Yes. Minutes 6 to 14 cover it.");
  });

  it("hides the examples from screen readers", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <WhatYouGet />
      </ThemeProvider>,
    );

    for (const demo of screen.getAllByTestId("benefit-demo")) {
      expect(demo).toHaveAttribute("aria-hidden", "true");
    }
  });
});
