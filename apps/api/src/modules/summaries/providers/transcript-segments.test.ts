import { describe, expect, it } from "vitest";

import {
  buildTranscriptWindows,
  compactTranscriptSegments,
} from "./transcript-segments.js";

describe("compactTranscriptSegments", () => {
  it("joins fragments while preserving readable sentence boundaries", () => {
    const result = compactTranscriptSegments([
      { startSeconds: 0, endSeconds: 2, text: "This is a" },
      { startSeconds: 2.2, endSeconds: 4, text: "fragmented sentence." },
      {
        startSeconds: 4.4,
        endSeconds: 12,
        text: "This complete thought is intentionally long enough to remain a separate transcript line for readers.",
      },
      { startSeconds: 12.3, endSeconds: 14, text: "A new thought." },
    ]);

    expect(result).toEqual([
      { startSeconds: 0, endSeconds: 4, text: "This is a fragmented sentence." },
      {
        startSeconds: 4.4,
        endSeconds: 12,
        text: "This complete thought is intentionally long enough to remain a separate transcript line for readers.",
      },
      { startSeconds: 12.3, endSeconds: 14, text: "A new thought." },
    ]);
  });

  it("does not combine different speakers", () => {
    const result = compactTranscriptSegments([
      { startSeconds: 0, endSeconds: 1, text: "Question", speaker: 0 },
      { startSeconds: 1.1, endSeconds: 2, text: "Answer", speaker: 1 },
    ]);

    expect(result).toHaveLength(2);
  });
});

describe("buildTranscriptWindows", () => {
  it("groups segments into evenly timed windows and keeps silent ones", () => {
    const windows = buildTranscriptWindows(
      [
        { startSeconds: 0, endSeconds: 30, text: "Intro." },
        { startSeconds: 30, endSeconds: 60, text: "Context." },
        { startSeconds: 200, endSeconds: 240, text: "Method." },
      ],
      240,
    );

    expect(windows).toEqual([
      { startSeconds: 0, endSeconds: 60, text: "Intro. Context." },
      { startSeconds: 60, endSeconds: 120, text: "" },
      { startSeconds: 120, endSeconds: 180, text: "" },
      { startSeconds: 180, endSeconds: 240, text: "Method." },
    ]);
  });

  it("caps very long videos at twelve windows", () => {
    const segments = Array.from({ length: 120 }, (_, index) => ({
      startSeconds: index * 60,
      endSeconds: index * 60 + 60,
      text: `Line ${index}.`,
    }));

    expect(buildTranscriptWindows(segments, 7_200)).toHaveLength(12);
  });

  it("returns no windows for an empty transcript", () => {
    expect(buildTranscriptWindows([], 0)).toEqual([]);
  });
});
