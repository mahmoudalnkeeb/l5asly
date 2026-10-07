import { describe, expect, it } from "vitest";

import type { SummaryListItem } from "@l5asly/contracts";
import { estimateBriefSeconds, formatBriefEstimate } from "./brief-estimate";

function finishedBrief(
  durationSeconds: number,
  processingSeconds: number,
): SummaryListItem {
  const createdAt = new Date("2026-10-01T10:00:00.000Z");
  const updatedAt = new Date(createdAt.getTime() + processingSeconds * 1000);
  return {
    id: crypto.randomUUID(),
    status: "completed",
    source: { type: "upload", name: "talk.mp4" },
    progress: 100,
    stage: "Completed",
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    title: "A talk",
    verdict: null,
    durationSeconds,
  };
}

describe("estimateBriefSeconds", () => {
  it("scales the median processing rate of recent briefs to the new video", () => {
    const recent = [
      finishedBrief(600, 60),
      finishedBrief(1200, 120),
      // A retried job that waited a day must not drag the estimate up.
      finishedBrief(600, 86_400),
    ];

    expect(estimateBriefSeconds(recent, 1800)).toBe(180);
  });

  it("gives no estimate until there are enough finished briefs", () => {
    const failed = { ...finishedBrief(600, 60), status: "failed" as const };
    const recent = [finishedBrief(600, 60), finishedBrief(600, 60), failed];

    expect(estimateBriefSeconds(recent, 1800)).toBeNull();
  });
});

describe("formatBriefEstimate", () => {
  it("rounds to whole minutes and names short waits", () => {
    expect(formatBriefEstimate(45)).toBe("Brief in under a minute");
    expect(formatBriefEstimate(170)).toBe("Brief in about 3 min");
  });
});
