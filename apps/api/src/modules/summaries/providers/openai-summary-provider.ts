import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import {
  AppError,
  ProviderError,
  ProviderTimeoutError,
  SummaryFormatError,
} from "../../../errors.js";
import type {
  GeneratedSummary,
  SummaryGenerationInput,
  SummaryProvider,
  TranscriptionResult,
} from "./provider-contracts.js";
import { isTimeoutError } from "./provider-timeout.js";
import { finalizeGeneratedSummary } from "./summary-quality.js";
import {
  getSummaryTaskInstructions,
  SUMMARY_SYSTEM_PROMPT,
} from "./summary-prompt.js";
import { formatViewerContext } from "./viewer-context.js";
import { summaryOutputSchema } from "./summary-output-schema.js";

const SUMMARY_RESPONSE_FORMAT = zodResponseFormat(
  summaryOutputSchema,
  "video_summary",
);

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
    const transcript = formatSummaryTranscript(input.transcript);
    const viewerContext = formatViewerContext(input);
    const depthInstructions = getSummaryTaskInstructions(input);

    let content: string | null;
    let finishReason: string | null;
    let hasRefusal: boolean;
    try {
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        max_tokens: this.getMaxTokens(input.depth),
        reasoning_effort: "low",
        response_format: SUMMARY_RESPONSE_FORMAT,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: SUMMARY_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              `Write the result in ${input.language}.`,
              `Summary depth: ${input.depth}.`,
              depthInstructions,
              `Viewer context (saved profile and current question): ${viewerContext}`,
              `Video duration: ${Math.round(input.transcript.durationSeconds)} seconds.`,
              transcript.sampled
                ? "Source coverage: sampled excerpts across the timeline, not the complete transcript. Missing details may exist outside these excerpts."
                : "Source coverage: the full available transcript; transcription errors may still exist.",
              "Transcript (source data):",
              transcript.text,
            ].join("\n\n"),
          },
        ],
      });
      content = response.choices[0]?.message.content ?? null;
      finishReason = response.choices[0]?.finish_reason ?? null;
      hasRefusal = Boolean(response.choices[0]?.message.refusal);
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ProviderTimeoutError(
          "The summary provider",
          this.options.timeoutMs,
          error,
        );
      }

      if (
        error instanceof OpenAI.APIError &&
        (error.status === 400 || error.status === 422) &&
        (error.param?.startsWith("response_format") ||
          /json_schema|response_format|structured outputs/i.test(error.message))
      ) {
        throw new AppError({
          message:
            "The summary provider rejected the JSON Schema response format. Verify that the configured model and endpoint support strict structured outputs.",
          statusCode: 502,
          code: "SUMMARY_SCHEMA_REJECTED",
        });
      }

      throw new ProviderError(
        "The language model could not create the summary.",
        error,
      );
    }

    if (hasRefusal || finishReason === "content_filter") {
      throw new AppError({
        message:
          "The summary provider declined to generate an answer for this request.",
        statusCode: 502,
        code: "SUMMARY_REFUSED",
      });
    }
    if (finishReason === "length") {
      throw new SummaryFormatError(
        "The summary provider cut off its response before finishing. Retry summary generation.",
        { response: ["The provider reached its output token limit."] },
      );
    }
    if (!content) {
      throw new ProviderError("The language model returned an empty summary.");
    }

    const json = this.extractJson(content);
    const parsed = summaryOutputSchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues.slice(0, 12)) {
        const field = issue.path.join(".") || "response";
        fields[field] = [...(fields[field] ?? []), issue.code];
      }
      throw new SummaryFormatError(
        `The summary provider returned invalid fields: ${Object.keys(fields).slice(0, 4).join(", ")}. Retry summary generation.`,
        fields,
      );
    }

    const summary = finalizeGeneratedSummary(
      {
        title: parsed.data.title,
        overview: parsed.data.overview,
        viewerAnswer: parsed.data.viewerAnswer,
        caveats: parsed.data.caveats,
        sections: parsed.data.sections,
        notes: parsed.data.notes,
        recommendedMoments: parsed.data.recommendedMoments,
        personalizedGuidance: parsed.data.personalizedGuidance ?? undefined,
      },
      input,
    );
    if (transcript.sampled) {
      const caveat =
        input.language === "Arabic"
          ? "تم تلخيص مقاطع موزعة على الفيديو لطوله؛ قد لا يغطي الملخص كل التفاصيل."
          : "This long video was summarized from excerpts across its timeline; some details may be omitted.";
      summary.caveats = [caveat, ...summary.caveats].slice(0, 4);
    }
    return summary;
  }

  private getMaxTokens(depth: SummaryGenerationInput["depth"]): number {
    if (depth === "quick") {
      return 6_144;
    }

    if (depth === "detailed") {
      return 6_144;
    }

    return 8_192;
  }

  private extractJson(content: string): unknown {
    try {
      const json: unknown = JSON.parse(content);
      return json;
    } catch {
      throw new SummaryFormatError(
        "The summary provider returned incomplete or malformed JSON. Retry summary generation.",
        { response: ["Invalid JSON syntax."] },
      );
    }
  }
}

export function formatSummaryTranscript(
  transcript: TranscriptionResult,
  characterLimit = TRANSCRIPT_CHARACTER_LIMIT,
): { text: string; sampled: boolean } {
  const lines = transcript.segments.map(
    (segment) => `[${Math.floor(segment.startSeconds)}s] ${segment.text}`,
  );
  const fullText = lines.join("\n");
  if (fullText.length <= characterLimit)
    return { text: fullText, sampled: false };

  let sampleCount = lines.length;
  let sampledText = fullText;
  while (sampledText.length > characterLimit && sampleCount > 2) {
    sampleCount = Math.max(2, Math.floor(sampleCount * 0.8));
    const selected: string[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const lineIndex = Math.round(
        (index * (lines.length - 1)) / (sampleCount - 1),
      );
      const line = lines[lineIndex];
      if (line !== undefined) selected.push(line);
    }
    sampledText = selected.join("\n");
  }
  // Bound individual unusually long utterances without dropping the closing excerpt.
  if (sampledText.length > characterLimit) {
    const first = lines[0] ?? "";
    const last = lines.at(-1) ?? "";
    const excerptLimit = Math.floor((characterLimit - 1) / 2);
    sampledText =
      first.slice(0, excerptLimit) + "\n" + last.slice(0, excerptLimit);
  }
  return { text: sampledText, sampled: true };
}
