import type { WatchVerdict } from "@l5sly/contracts";

import type {
  GeneratedSummary,
  MediaInput,
  SummaryGenerationInput,
  SummaryProvider,
  TranscriptionProvider,
  TranscriptionResult,
  VerdictInput,
  VerdictProvider,
} from "./provider-contracts.js";

const sampleTranscript: TranscriptionResult = {
  text: [
    "We tend to talk about AI as a production tool, but production is only one part of creative work.",
    "The bottleneck moves from making a version to judging whether that version says something worth keeping.",
    "Let the system create breadth. Give a person the responsibility to narrow it with a clear standard.",
    "Small teams should measure what they learned from exploration, not simply how many assets they produced.",
    "The advantage is not infinite output. It is reaching a considered answer with less wasted motion.",
  ].join(" "),
  segments: [
    { startSeconds: 0, endSeconds: 318, text: "We tend to talk about AI as a production tool, but production is only one part of creative work." },
    { startSeconds: 318, endSeconds: 584, text: "The bottleneck moves from making a version to judging whether that version says something worth keeping." },
    { startSeconds: 584, endSeconds: 846, text: "Let the system create breadth. Give a person the responsibility to narrow it with a clear standard." },
    { startSeconds: 846, endSeconds: 1040, text: "Small teams should measure what they learned from exploration, not simply how many assets they produced." },
    { startSeconds: 1040, endSeconds: 1122, text: "The advantage is not infinite output. It is reaching a considered answer with less wasted motion." },
  ],
  durationSeconds: 1122,
  detectedLanguage: "en",
};

async function simulateProviderDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 450));
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(_input: MediaInput): Promise<TranscriptionResult> {
    await simulateProviderDelay();
    return sampleTranscript;
  }
}

export class MockSummaryProvider implements SummaryProvider {
  async summarize(input: SummaryGenerationInput): Promise<GeneratedSummary> {
    await simulateProviderDelay();
    const audienceContext = input.expectation
      ? `The viewer asked: ${input.expectation}`
      : "The viewer did not provide a specific learning goal.";

    return {
      title: "How creative work survives the age of AI",
      overview:
        "AI changes the cost of making things, but it does not remove the need for taste, judgment, or a clear point of view.",
      viewerAnswer: audienceContext,
      caveats: ["This sample demonstrates the product flow and is not an independently verified analysis."],
      sections: [
        {
          title: "The value moves upstream",
          body:
            "When production becomes faster, choosing what deserves to exist becomes more important. Teams should define quality before generation begins.",
        },
        {
          title: "Small teams gain leverage",
          body:
            "A small team can explore more directions without expanding headcount when AI handles repetitive production and people own the final decision.",
        },
        {
          title: "A practical operating model",
          body:
            "Write a standard for good work, generate several approaches, compare them against the standard, and keep one person responsible for the final edit.",
        },
      ],
      notes: [
        { category: "Strategy", title: "Define quality before prompting", detail: "A clear review standard produces better output than a longer prompt." },
        { category: "Workflow", title: "Generate wide, edit narrow", detail: "Use AI for breadth, then make fewer and sharper human decisions." },
        { category: "Team", title: "Keep one accountable editor", detail: "Shared generation still needs clear ownership of the final result." },
        { category: "Measure", title: "Track learning, not volume", detail: "More options help only when the team learns which choices work." },
        { category: "Context", title: "Connect the brief to the goal", detail: audienceContext },
      ],
      recommendedMoments: [
        { startSeconds: 318, title: "Why judgment becomes the bottleneck", reason: "This section explains the central argument." },
        { startSeconds: 584, title: "A workflow for AI-assisted exploration", reason: "This is the most practical part of the talk." },
        { startSeconds: 846, title: "What small teams should measure", reason: "This section turns the idea into a useful team metric." },
      ],
    };
  }
}

export class MockVerdictProvider implements VerdictProvider {
  async decide(input: VerdictInput): Promise<WatchVerdict> {
    await simulateProviderDelay();
    const hasExpectation = Boolean(input.expectation?.trim());

    return {
      recommendation: "watch-key-moments",
      confidence: hasExpectation ? 0.84 : 0.72,
      headline: "Watch the key chapters",
      reason: hasExpectation
        ? "The recommended sections directly address your goal. The opening can be skipped."
        : "The middle of the video contains the strongest practical ideas. The opening repeats familiar context.",
    };
  }
}
