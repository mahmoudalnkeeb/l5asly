import { describe, expect, it } from "vitest";

import type { SummaryGenerationInput } from "../../provider-contracts.js";
import { finalizeGeneratedSummary } from "../summary-quality.js";

const input: SummaryGenerationInput = {
  language: "English",
  depth: "quick",
  expectation: "What changed, and is this useful or promotional?",
  transcript: {
    text: "A test transcript",
    durationSeconds: 1_000,
    detectedLanguage: "en",
    segments: [0, 118.4, 208.1, 420.2, 590.1, 900.2].map((startSeconds) => ({
      startSeconds,
      endSeconds: startSeconds + 20,
      text: `Segment at ${startSeconds}`,
    })),
  },
};

describe("finalizeGeneratedSummary", () => {
  it("keeps the highest-priority points and grounded moments within quick limits", () => {
    const result = finalizeGeneratedSummary(
      {
        title: "A grounded summary",
        overview:
          "The speaker presents one practical workflow and several broad claims.",
        viewerAnswer: "The workflow is useful, but the evidence is anecdotal.",
        caveats: [
          "Single demonstration",
          "single demonstration",
          "No benchmark",
        ],
        sections: Array.from({ length: 6 }, (_, index) => ({
          title: `Section ${index + 1}`,
          body: `Body ${index + 1}`,
        })),
        notes: Array.from({ length: 7 }, (_, index) => ({
          category: "Evidence",
          title: `Note ${index + 1}`,
          detail: `Detail ${index + 1}`,
        })),
        recommendedMoments: [
          { startSeconds: 0, evidenceText: "Segment at 0" },
          { startSeconds: 120, evidenceText: "Segment at 118.4" },
          { startSeconds: 210, evidenceText: "Segment at 208.1" },
          { startSeconds: 420, evidenceText: "Segment at 420.2" },
          { startSeconds: 590, evidenceText: "Segment at 590.1" },
          { startSeconds: 900, evidenceText: "Segment at 900.2" },
          {
            startSeconds: 5_000,
            evidenceText: "Not present in the transcript",
          },
        ].map((moment) => ({
          ...moment,
          title: `Moment ${moment.startSeconds}`,
          reason: "Relevant to the viewer goal.",
        })),
      },
      input,
    );

    expect(result.sections.map((section) => section.title)).toEqual([
      "Section 1",
      "Section 2",
      "Section 3",
    ]);
    expect(result.notes).toHaveLength(5);
    expect(result.caveats).toEqual(["Single demonstration", "No benchmark"]);
    expect(
      result.recommendedMoments.map((moment) => moment.startSeconds),
    ).toEqual([0, 208.1, 420.2, 900.2]);
  });

  it("falls back to the overview when a model omits the direct answer", () => {
    const result = finalizeGeneratedSummary(
      {
        title: "Fallback",
        overview: "The grounded overview.",
        caveats: [],
        sections: [
          { title: "One", body: "First" },
          { title: "Two", body: "Second" },
        ],
        notes: [
          { category: "Fact", title: "One", detail: "First" },
          { category: "Fact", title: "Two", detail: "Second" },
          { category: "Fact", title: "Three", detail: "Third" },
        ],
        recommendedMoments: [],
      },
      input,
    );

    expect(result.viewerAnswer).toBe("The grounded overview.");
  });

  it("retains long-video coverage when no specific question is supplied", () => {
    const result = finalizeGeneratedSummary(
      {
        title: "Main ideas",
        overview: "A concise brief.",
        viewerAnswer: "Six distinct useful ideas.",
        caveats: [],
        sections: Array.from({ length: 6 }, (_, index) => ({
          title: `Idea ${index}`,
          body: `Reason ${index}`,
        })),
        notes: [],
        recommendedMoments: [],
      },
      {
        ...input,
        expectation: undefined,
        transcript: { ...input.transcript, durationSeconds: 7200 },
      },
    );
    expect(result.sections).toHaveLength(6);
  });

  it("resolves a recommended moment from its verbatim evidence instead of a guessed timestamp", () => {
    const result = finalizeGeneratedSummary(
      {
        title: "Anchored",
        overview: "The workflow appears later than the model guessed.",
        viewerAnswer: "The useful workflow begins in the middle of the video.",
        caveats: [],
        sections: [
          { title: "One", body: "First" },
          { title: "Two", body: "Second" },
        ],
        notes: [
          { category: "Fact", title: "One", detail: "First" },
          { category: "Fact", title: "Two", detail: "Second" },
          { category: "Fact", title: "Three", detail: "Third" },
        ],
        recommendedMoments: [
          {
            startSeconds: 10,
            title: "UltraCode workflow",
            reason: "This is where the concrete workflow starts.",
            evidenceText: "Segment at 208.1",
          },
        ],
      },
      input,
    );

    expect(result.recommendedMoments[0]?.startSeconds).toBe(208.1);
    expect(result.recommendedMoments[0]).not.toHaveProperty("evidenceText");
  });
});
