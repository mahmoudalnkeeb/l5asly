import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./format";

describe("formatTimestamp", () => {
  it("formats minute-long timestamps", () => {
    expect(formatTimestamp(318)).toBe("5:18");
  });

  it("formats timestamps longer than an hour", () => {
    expect(formatTimestamp(3_725)).toBe("1:02:05");
  });

  it("does not return negative time", () => {
    expect(formatTimestamp(-10)).toBe("0:00");
  });
});
