import {
  HttpResponseError,
  HttpTimeoutError,
  type HttpClient,
} from "@nestjs/http-client";
// Only the schema helper is used from the SDK: it keeps the strict JSON Schema
// that is sent on the wire identical to the one the SDK client used to send.
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  AppError,
  ProviderError,
  ProviderTimeoutError,
  SummaryFormatError,
} from "../../../common/errors.js";
import type {
  GeneratedSummary,
  SummaryGenerationInput,
  SummaryProvider,
  TranscriptionResult,
} from "../provider-contracts.js";
import { formatViewerContext } from "../shared/viewer-context.js";
import { summaryOutputSchema } from "./summary-output-schema.js";
import {
  getOutputLanguageInstruction,
  getSummaryTaskInstructions,
  SUMMARY_SYSTEM_PROMPT,
} from "./summary-prompt.js";
import {
  finalizeGeneratedSummary,
  isSummaryInLanguage,
} from "./summary-quality.js";

type SummaryOutput = z.infer<typeof summaryOutputSchema>;

const SUMMARY_RESPONSE_FORMAT = zodResponseFormat(
  summaryOutputSchema,
  "video_summary",
);

const TRANSCRIPT_CHARACTER_LIMIT = 90_000;

const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullish(),
      message: z.object({
        content: z.string().nullish(),
        refusal: z.string().nullish(),
      }),
    }),
  ),
});

const apiErrorBodySchema = z.object({
  error: z.object({
    message: z.string().optional(),
    param: z.string().nullish(),
  }),
});

export class OpenAiSummaryProvider implements SummaryProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly model: string,
  ) {}

  async summarize(input: SummaryGenerationInput): Promise<GeneratedSummary> {
    const transcript = formatSummaryTranscript(input.transcript);
    let output = await this.requestSummary(input, transcript, {
      isLanguageCorrection: false,
    });
    // Models sometimes drift into the transcript's language; one corrected request usually fixes it.
    if (!isSummaryInLanguage(output, input.language)) {
      output = await this.requestSummary(input, transcript, {
        isLanguageCorrection: true,
      });
    }
    if (!isSummaryInLanguage(output, input.language)) {
      throw new SummaryFormatError(
        `The summary provider did not write the summary in ${input.language}. Retry summary generation.`,
        { response: ["Wrong output language."] },
      );
    }

    const summary = finalizeGeneratedSummary(
      {
        title: output.title,
        overview: output.overview,
        viewerAnswer: output.viewerAnswer,
        caveats: output.caveats,
        sections: output.sections,
        notes: output.notes,
        recommendedMoments: output.recommendedMoments,
        personalizedGuidance: output.personalizedGuidance ?? undefined,
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

  private async requestSummary(
    input: SummaryGenerationInput,
    transcript: { text: string; sampled: boolean },
    options: { isLanguageCorrection: boolean },
  ): Promise<SummaryOutput> {
    const viewerContext = formatViewerContext(input);
    const depthInstructions = getSummaryTaskInstructions(input);
    const languageInstruction = getOutputLanguageInstruction(input.language);
    const closingInstruction = options.isLanguageCorrection
      ? `A previous attempt was written in the wrong language. ${languageInstruction}`
      : languageInstruction;

    let responseBody: unknown;
    try {
      const response = await this.http.post("/chat/completions", {
        json: {
          model: this.model,
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
                languageInstruction,
                `Summary depth: ${input.depth}.`,
                depthInstructions,
                `Viewer context (saved profile and current question): ${viewerContext}`,
                `Video duration: ${Math.round(input.transcript.durationSeconds)} seconds.`,
                transcript.sampled
                  ? "Source coverage: sampled excerpts across the timeline, not the complete transcript. Missing details may exist outside these excerpts."
                  : "Source coverage: the full available transcript; transcription errors may still exist.",
                "Transcript (source data):",
                transcript.text,
                closingInstruction,
              ].join("\n\n"),
            },
          ],
        },
        responseType: "json",
      });
      responseBody = response.data;
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        throw new ProviderTimeoutError(
          "The summary provider",
          error.timeoutMs,
          error,
        );
      }

      if (isResponseFormatRejection(error)) {
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

    const completion = chatCompletionSchema.safeParse(responseBody);
    if (!completion.success) {
      throw new ProviderError(
        "The language model returned an unexpected response.",
        completion.error,
      );
    }
    const choice = completion.data.choices[0];
    const content = choice?.message.content ?? null;
    const finishReason = choice?.finish_reason ?? null;
    const hasRefusal = Boolean(choice?.message.refusal);

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
    return parsed.data;
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

function isResponseFormatRejection(error: unknown): boolean {
  if (
    !(error instanceof HttpResponseError) ||
    (error.status !== 400 && error.status !== 422)
  ) {
    return false;
  }

  const body = apiErrorBodySchema.safeParse(error.body);
  if (!body.success) {
    return false;
  }

  return (
    Boolean(body.data.error.param?.startsWith("response_format")) ||
    /json_schema|response_format|structured outputs/i.test(
      body.data.error.message ?? "",
    )
  );
}
