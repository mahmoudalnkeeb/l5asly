import { openAsBlob } from "node:fs";

import { z } from "zod";

import type { TranscriptSegment } from "@l5sly/contracts";

import { ProviderError, ProviderTimeoutError } from "../../../errors.js";
import type {
  MediaInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "./provider-contracts.js";
import { isTimeoutError } from "./provider-timeout.js";
import { compactTranscriptSegments } from "./transcript-segments.js";

const deepgramResponseSchema = z.object({
  metadata: z.object({
    duration: z.number().nonnegative().optional(),
  }).optional(),
  results: z.object({
    channels: z.array(
      z.object({
        alternatives: z.array(
          z.object({
            transcript: z.string(),
            detected_language: z.string().optional(),
          }),
        ),
      }),
    ),
    utterances: z.array(
      z.object({
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        transcript: z.string().min(1),
        speaker: z.number().int().nonnegative().optional(),
      }),
    ).optional(),
  }),
});

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      timeoutMs: number;
    },
  ) {}

  async transcribe(input: MediaInput): Promise<TranscriptionResult> {
    const endpoint = new URL("https://api.deepgram.com/v1/listen");
    endpoint.searchParams.set("model", "nova-3");
    endpoint.searchParams.set("smart_format", "true");
    endpoint.searchParams.set("punctuate", "true");
    endpoint.searchParams.set("utterances", "true");
    endpoint.searchParams.set("detect_language", "true");

    const request = await this.createRequest(input);
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.options.apiKey}`,
          "Content-Type": request.contentType,
        },
        body: request.body,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ProviderTimeoutError("Deepgram", this.options.timeoutMs, error);
      }

      throw new ProviderError("Deepgram could not be reached.", error);
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new ProviderError(`Deepgram rejected the media with status ${response.status}: ${responseText.slice(0, 240)}`);
    }

    const parsed = deepgramResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ProviderError("Deepgram returned an unexpected transcription response.", parsed.error);
    }

    const alternative = parsed.data.results.channels[0]?.alternatives[0];
    if (!alternative?.transcript.trim()) {
      throw new ProviderError("No speech was detected in the supplied media.");
    }

    const durationSeconds = parsed.data.metadata?.duration ?? 0;
    const segments = this.mapSegments(parsed.data.results.utterances, alternative.transcript, durationSeconds);

    return {
      text: alternative.transcript,
      segments,
      durationSeconds,
      detectedLanguage: alternative.detected_language ?? "unknown",
    };
  }

  private async createRequest(input: MediaInput): Promise<{ body: BodyInit; contentType: string }> {
    if (input.kind === "url") {
      return {
        body: JSON.stringify({ url: input.url }),
        contentType: "application/json",
      };
    }

    return {
      body: await openAsBlob(input.path, { type: input.mimeType }),
      contentType: input.mimeType,
    };
  }

  private mapSegments(
    utterances: z.infer<typeof deepgramResponseSchema>["results"]["utterances"],
    transcript: string,
    durationSeconds: number,
  ): TranscriptSegment[] {
    if (!utterances?.length) {
      return [{ startSeconds: 0, endSeconds: durationSeconds, text: transcript }];
    }

    return compactTranscriptSegments(
      utterances.map((utterance) => ({
        startSeconds: utterance.start,
        endSeconds: utterance.end,
        text: utterance.transcript,
        speaker: utterance.speaker,
      })),
    );
  }
}
