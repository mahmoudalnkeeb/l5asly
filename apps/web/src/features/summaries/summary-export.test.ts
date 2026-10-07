import { describe, expect, it } from "vitest";

import type { SummaryResult } from "@l5sly/contracts";
import {
  buildNotesFileName,
  buildNotesText,
  buildSummaryText,
} from "./summary-export";

const result: SummaryResult = {
  title: "A useful video",
  overview: "An overview.",
  viewerAnswer: "Watch the demo.",
  caveats: ["Pricing may have changed."],
  sections: [{ title: "Main idea", body: "A practical explanation." }],
  notes: [{ category: "Workflow", title: "Test first", detail: "Check it." }],
  recommendedMoments: [],
  transcript: [],
  verdict: {
    recommendation: "watch",
    confidence: 0.9,
    headline: "Worth it",
    reason: "Clear demo.",
  },
  personalizedGuidance: {
    relevance: "Matches your goal.",
    prerequisites: [],
    nextSteps: ["Try it yourself."],
  },
  durationSeconds: 60,
  sourceLanguage: "en",
};

describe("summary export", () => {
  it("copies the answer, viewing plan and sections", () => {
    expect(buildSummaryText(result)).toBe(
      [
        "A useful video",
        "",
        "An overview.",
        "",
        "DIRECT ANSWER",
        "Watch the demo.",
        "",
        "VIEWING PLAN",
        "Matches your goal.",
        "",
        "NEXT STEPS",
        "- Try it yourself.",
        "",
        "Main idea",
        "A practical explanation.",
        "",
      ].join("\n"),
    );
  });

  it("includes the verdict, caveats and notes in downloaded notes", () => {
    const text = buildNotesText(result);
    expect(text).toContain("WATCH VERDICT\nWorth it: Clear demo.");
    expect(text).toContain("CAVEATS\n- Pricing may have changed.");
    expect(text).toContain("KEY NOTES\n- Test first: Check it.");
    expect(text).not.toContain("PREPARATION");
  });

  it("names the download after the video without unsafe characters", () => {
    expect(buildNotesFileName('Part 1: "Intro" / Setup?')).toBe(
      "Part 1 Intro Setup - notes.txt",
    );
    expect(buildNotesFileName("مقدمة")).toBe("مقدمة - notes.txt");
    expect(buildNotesFileName(" :: ")).toBe("l5asly-notes.txt");
  });
});
