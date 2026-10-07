import { describe, expect, it } from "vitest";

import {
  calculateFocusSeconds,
  formatLanguageLabel,
  formatTimestamp,
} from "./format";

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

describe("calculateFocusSeconds", () => {
  it("adds up only the parts relevant enough to watch", () => {
    expect(
      calculateFocusSeconds([
        { startSeconds: 0, endSeconds: 60, relevance: 0.2 },
        { startSeconds: 60, endSeconds: 180, relevance: 0.9 },
        { startSeconds: 180, endSeconds: 240, relevance: 0.6 },
      ]),
    ).toBe(180);
  });

  it("returns zero when nothing stands out", () => {
    expect(
      calculateFocusSeconds([
        { startSeconds: 0, endSeconds: 60, relevance: 0.1 },
      ]),
    ).toBe(0);
  });
});

describe("formatLanguageLabel", () => {
  it("names language codes, including regional ones", () => {
    expect(formatLanguageLabel("en", "Arabic")).toBe("English");
    expect(formatLanguageLabel("ar-EG", "English")).toBe("Arabic");
    expect(formatLanguageLabel("fr", "English")).toBe("French");
  });

  it("keeps full language names readable", () => {
    expect(formatLanguageLabel("arabic", "English")).toBe("Arabic");
    expect(formatLanguageLabel("french", "English")).toBe("French");
  });

  it("falls back to the requested language when the source is unknown", () => {
    expect(formatLanguageLabel("unknown", "Arabic")).toBe("Arabic");
    expect(formatLanguageLabel("  ", "English")).toBe("English");
  });
});
