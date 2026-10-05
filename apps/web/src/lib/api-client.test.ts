import { afterEach, describe, expect, it, vi } from "vitest";

import { getErrorMessage, listSummaries } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client errors", () => {
  it("hides validation details from malformed server responses", async () => {
    const response = new Response(JSON.stringify({ data: [{ invalid: true }] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(listSummaries()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "The server returned a response this app could not read. Please try again.",
    });
  });

  it("does not expose unexpected internal error messages", () => {
    expect(getErrorMessage(new Error("Internal parser stack details"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
