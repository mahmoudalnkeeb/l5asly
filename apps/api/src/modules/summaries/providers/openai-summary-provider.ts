import OpenAI from "openai";
import { z } from "zod";

import { ProviderError, ProviderTimeoutError } from "../../../errors.js";
import type {
  GeneratedSummary,
  SummaryGenerationInput,
  SummaryProvider,
} from "./provider-contracts.js";
import { isTimeoutError } from "./provider-timeout.js";
import { finalizeGeneratedSummary } from "./summary-quality.js";

const generatedSummarySchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  viewerAnswer: z.string().min(1).optional(),
  caveats: z.array(z.string().min(1)).max(6).default([]),
  sections: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
    }),
  ).min(2).max(8),
  notes: z.array(
    z.object({
      category: z.string().min(1),
      title: z.string().min(1),
      detail: z.string().min(1),
    }),
  ).min(3).max(10),
  recommendedMoments: z.array(
    z.object({
      startSeconds: z.number().nonnegative(),
      title: z.string().min(1),
      reason: z.string().min(1),
      evidenceText: z.string().min(1).optional(),
    }),
  ).max(8),
});

const TRANSCRIPT_CHARACTER_LIMIT = 90_000;

export class OpenAiSummaryProvider implements SummaryProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
    },
  ) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      maxRetries: 0,
      timeout: options.timeoutMs,
    });
  }

  async summarize(input: SummaryGenerationInput): Promise<GeneratedSummary> {
    const transcript = this.formatTranscript(input);
    const expectation = input.expectation ?? "No specific viewer goal was provided.";
    const depthInstructions = this.getDepthInstructions(input.depth);

    let content: string | null;
    try {
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        max_tokens: this.getMaxTokens(input.depth),
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You turn video transcripts into accurate reading briefs.",
              "Return only valid JSON with these keys: title, overview, viewerAnswer, caveats, sections, notes, recommendedMoments.",
              "viewerAnswer must answer every part of the viewer goal in 1 to 3 plain-language sentences before adding background. If asked whether a video is useful or hype, give a clear judgment and name the concrete useful information.",
              "Include 1 to 3 caveats when the transcript relies on anecdotes, promotional framing, missing comparisons, or claims without demonstrated evidence. Use an empty array only when no meaningful limitation is visible.",
              "sections is an array of objects with title and body.",
              "notes is an array of objects with category, title, and detail.",
              "recommendedMoments is an array of objects with startSeconds, title, reason, and evidenceText.",
              "For every recommended moment, evidenceText must be an exact 6 to 14 word excerpt copied from one transcript line. The server uses it to resolve the real timestamp.",
              "Every recommended timestamp must be copied from that evidence line's bracketed timestamp, and its reason must explain its value for the viewer goal.",
              "Separate what the speaker claims from what the transcript demonstrates. Attribute opinions, predictions, superlatives, and performance claims to the speaker.",
              "Do not describe a result as proven, flawless, reliable, or better than humans unless the transcript supplies concrete comparative evidence.",
              "Preserve relative dates exactly as spoken. Never convert phrases such as this year or last March into a calendar year.",
              "Do not invent facts, names, timestamps, product details, or claims that are not supported by the transcript.",
              "Prefer specific information and evidence over hype, repetition, or trend commentary.",
              "Omit generic intro, repetition, and chronology unless they are necessary to understand the useful conclusion.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Write the result in ${input.language}.`,
              `Summary depth: ${input.depth}.`,
              depthInstructions,
              `Viewer goal: ${expectation}`,
              `Video duration: ${Math.round(input.transcript.durationSeconds)} seconds.`,
              "Transcript:",
              transcript,
            ].join("\n\n"),
          },
        ],
      });
      content = response.choices[0]?.message.content ?? null;
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ProviderTimeoutError("The summary provider", this.options.timeoutMs, error);
      }

      throw new ProviderError("The language model could not create the summary.", error);
    }

    if (!content) {
      throw new ProviderError("The language model returned an empty summary.");
    }

    const json = this.extractJson(content);
    const parsed = generatedSummarySchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError("The language model returned an invalid summary format.", parsed.error);
    }

    return finalizeGeneratedSummary(parsed.data, input);
  }

  private getDepthInstructions(depth: SummaryGenerationInput["depth"]): string {
    if (depth === "quick") {
      return "Quick format: overview under 90 words, 2 to 3 sections, 3 to 5 notes, and 2 to 4 recommended moments.";
    }

    if (depth === "detailed") {
      return "Detailed format: overview under 150 words, 4 to 6 sections, 4 to 8 notes, and 3 to 6 recommended moments.";
    }

    return "Study format: overview under 200 words, 5 to 8 sections, 6 to 10 notes, and 4 to 8 recommended moments.";
  }

  private getMaxTokens(depth: SummaryGenerationInput["depth"]): number {
    if (depth === "quick") {
      return 4_096;
    }

    if (depth === "detailed") {
      return 6_144;
    }

    return 8_192;
  }

  private formatTranscript(input: SummaryGenerationInput): string {
    const formatted = input.transcript.segments
      .map((segment) => `[${Math.floor(segment.startSeconds)}s] ${segment.text}`)
      .join("\n");

    return formatted.slice(0, TRANSCRIPT_CHARACTER_LIMIT);
  }

  private extractJson(content: string): unknown {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new ProviderError("The language model did not return JSON.");
    }

    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch (error) {
      throw new ProviderError("The language model returned malformed JSON.", error);
    }
  }
}
