import { describe, expect, it } from "vitest";

import { compactTranscriptSegments } from "./transcript-segments.js";

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
