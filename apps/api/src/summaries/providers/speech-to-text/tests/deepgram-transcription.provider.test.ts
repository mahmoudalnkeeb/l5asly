import { HttpClient } from "@nestjs/http-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepgramTranscriptionProvider } from "../deepgram-transcription.provider.js";

afterEach(() => vi.unstubAllGlobals());

const provider = new DeepgramTranscriptionProvider(
  new HttpClient({
    baseUrl: "https://api.deepgram.com",
    timeout: 1000,
    retry: false,
  }),
);
const media = { kind: "url", url: "https://example.com/audio.wav" } as const;

function transcriptionResponse(
  text: string,
  detectedLanguage?: string,
): Response {
  return Response.json({
    metadata: { duration: 20 },
    results: {
      channels: [
        {
          detected_language: detectedLanguage,
          alternatives: [{ transcript: text }],
        },
      ],
      utterances: [{ start: 0, end: 20, transcript: text }],
    },
  });
}

describe("DeepgramTranscriptionProvider", () => {
  it("requests Arabic explicitly and retains Arabic speech and channel metadata", async () => {
    const text = "هنبني موقع باستخدام Strapi ونتعلم ربط المقالات بالفئات.";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(transcriptionResponse(text, "ar-EG"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider.transcribe(media, "Arabic");
    const endpoint = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(endpoint.searchParams.get("language")).toBe("ar");
    expect(endpoint.searchParams.has("detect_language")).toBe(false);
    expect(endpoint.searchParams.get("model")).toBe("nova-3");
    expect(result.text).toBe(text);
    expect(result.segments[0]?.text).toBe(text);
    expect(result.detectedLanguage).toBe("ar-EG");
  });

  it("uses the requested English language when detection metadata is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(transcriptionResponse("Build a website.")),
    );
    expect((await provider.transcribe(media, "English")).detectedLanguage).toBe(
      "en",
    );
  });

  it("rejects English-only fragments from an Arabic video instead of generating a misleading brief", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          transcriptionResponse("Node.js. Front end. Articles."),
        ),
    );
    await expect(provider.transcribe(media, "Arabic")).rejects.toThrow(
      "Arabic transcription returned no Arabic speech",
    );
  });
});
