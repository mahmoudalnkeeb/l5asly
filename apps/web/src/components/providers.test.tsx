import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider, useNotification } from "./notifications";
import { ThemeProvider, useTheme } from "./theme-provider";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" onClick={() => setTheme("dark")}>
      Theme: {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  it("still renders and switches theme when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeVisible();
    expect(document.documentElement).toHaveClass("dark");
  });
});

function ErrorTrigger() {
  const notify = useNotification();
  return (
    <button
      type="button"
      onClick={() => notify({ severity: "error", message: "Upload failed." })}
    >
      Fail
    </button>
  );
}

describe("NotificationProvider", () => {
  it("keeps an error's severity and text while the snackbar closes", () => {
    vi.useFakeTimers();
    render(
      <NotificationProvider>
        <ErrorTrigger />
      </NotificationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed.");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // During the exit transition the alert must not turn into an empty success alert.
    const closingAlert = screen.getByRole("alert");
    expect(closingAlert).toHaveTextContent("Upload failed.");
    expect(closingAlert.className).toContain("colorError");
    act(() => vi.runAllTimers());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
