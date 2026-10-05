import { z } from "zod";

import type { WatchVerdict } from "@l5sly/contracts";

import { ProviderError, ProviderTimeoutError } from "../../../errors.js";
import type { VerdictInput, VerdictProvider } from "./provider-contracts.js";
import { isTimeoutError } from "./provider-timeout.js";

const jevResponseSchema = z.object({
  answers: z.object({
    watch: z.object({
      noul: z.number().min(0).max(1),
    }),
    relevance: z.object({
      score: z.number().min(0).max(2),
    }),
  }),
});

const JEV_TRANSCRIPT_CHARACTER_LIMIT = 60_000;

export class JevVerdictProvider implements VerdictProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
    },
  ) {}

  async decide(input: VerdictInput): Promise<WatchVerdict> {
    const expectation = input.expectation ?? "The viewer did not provide a specific goal.";
    const state = [
      `Video duration: ${Math.round(input.durationSeconds)} seconds.`,
      `Viewer goal: ${expectation}`,
      "Transcript:",
      input.transcript.slice(0, JEV_TRANSCRIPT_CHARACTER_LIMIT),
    ].join("\n\n");

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/systemone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          state,
          questions: {
            watch: {
              type: "noul",
              instructions: "Should this viewer spend time watching this video based on the transcript, duration, and viewer goal?",
            },
            relevance: {
              type: "score",
              instructions: "How directly does the video address the viewer goal?",
              criteria: ["Low relevance", "Some relevant sections", "Strong relevance"],
            },
          },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ProviderTimeoutError("The watch-verdict provider", this.options.timeoutMs, error);
      }

      throw new ProviderError("The watch-verdict provider could not be reached.", error);
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new ProviderError(`The watch-verdict provider returned status ${response.status}: ${responseText.slice(0, 240)}`);
    }

    const parsed = jevResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ProviderError("The watch-verdict provider returned an invalid response.", parsed.error);
    }

    return this.mapVerdict(parsed.data.answers.watch.noul, parsed.data.answers.relevance.score);
  }

  private mapVerdict(watchProbability: number, relevanceScore: number): WatchVerdict {
    if (watchProbability >= 0.72 && relevanceScore >= 1.35) {
      return {
        recommendation: "watch",
        confidence: watchProbability,
        headline: "This is worth watching",
        reason: "The video closely matches your goal and sustains enough useful detail to justify the full runtime.",
      };
    }

    if (watchProbability >= 0.4 || relevanceScore >= 0.8) {
      return {
        recommendation: "watch-key-moments",
        confidence: Math.max(watchProbability, relevanceScore / 2),
        headline: "Watch the key chapters",
        reason: "The video contains useful sections, but you can skip the surrounding context and focus on the recommended moments.",
      };
    }

    return {
      recommendation: "skip",
      confidence: 1 - watchProbability,
      headline: "Read the brief instead",
      reason: "The video does not match your goal closely enough to justify the full runtime.",
    };
  }
}
