import { describe, expect, it } from "vitest";

import type { SummaryListItem, WatchVerdict } from "@l5asly/contracts";
import { calculateTimeSaved, formatSavedTime } from "./time-saved";

const now = new Date("2026-10-07T12:00:00.000Z");

function finishedBrief(
  recommendation: WatchVerdict["recommendation"],
  durationSeconds: number,
  createdAt = "2026-10-06T12:00:00.000Z",
): SummaryListItem {
  return {
    id: crypto.randomUUID(),
    status: "completed",
    source: { type: "upload", name: "talk.mp4" },
    progress: 100,
    stage: "Completed",
    createdAt,
    updatedAt: createdAt,
    title: "A talk",
    verdict: {
      recommendation,
      confidence: 0.8,
      headline: "A headline",
      reason: "A reason.",
    },
    durationSeconds,
  };
}

describe("calculateTimeSaved", () => {
  it("adds up the length of this week's skipped videos", () => {
    const recent = [
      finishedBrief("skip", 1200),
      finishedBrief("skip", 2400),
      finishedBrief("watch", 3600),
      finishedBrief("watch-key-moments", 3600),
      // Eight days ago, so outside this week.
      finishedBrief("skip", 3600, "2026-09-29T12:00:00.000Z"),
    ];

    expect(calculateTimeSaved(recent, now)).toEqual({
      skippedVideos: 2,
      savedSeconds: 3600,
    });
  });

  it("ignores jobs that haven't finished", () => {
    const running = { ...finishedBrief("skip", 1200), status: "processing" as const };

    expect(calculateTimeSaved([running], now)).toEqual({
      skippedVideos: 0,
      savedSeconds: 0,
    });
  });
});

describe("formatSavedTime", () => {
  it("uses minutes under an hour and hours with minutes above", () => {
    expect(formatSavedTime(45 * 60)).toBe("45 min");
    expect(formatSavedTime(2 * 3600)).toBe("2h");
    expect(formatSavedTime(6 * 3600 + 20 * 60)).toBe("6h 20m");
  });
});
