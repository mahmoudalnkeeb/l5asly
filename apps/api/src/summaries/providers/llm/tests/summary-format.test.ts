import { HttpClient } from "@nestjs/http-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { SummaryGenerationInput } from "../../provider-contracts.js";
import { OpenAiSummaryProvider } from "../openai-summary.provider.js";

const input: SummaryGenerationInput = {
  language: "Arabic",
  depth: "study",
  expectation: "What is Strapi?",
  transcript: {
    text: "Strapi is a content management system.",
    segments: [
      {
        startSeconds: 0,
        endSeconds: 20,
        text: "Strapi is a content management system.",
      },
    ],
    durationSeconds: 20,
    detectedLanguage: "en",
  },
};
const answer = {
  title: "ما هو Strapi؟",
  overview: "نظام إدارة محتوى.",
  viewerAnswer: "Strapi نظام لإدارة المحتوى يوفر واجهات برمجة للمحتوى.",
  sections: [],
  notes: [],
  caveats: [],
  recommendedMoments: [],
  personalizedGuidance: null,
};

afterEach(() => vi.unstubAllGlobals());

function respond(
  content: string,
  finishReason = "stop",
): OpenAiSummaryProvider {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [{ message: { content }, finish_reason: finishReason }],
      }),
    ),
  );
  return new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
}

describe("summary response validation", () => {
  it("sends a strict JSON Schema generated from Zod with string-only next steps and caveats", async () => {
    const provider = respond(JSON.stringify(answer));
    await provider.summarize(input);
    const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
    if (typeof body !== "string")
      throw new Error("Expected a JSON model request.");
    const requestBody: unknown = JSON.parse(body);
    expect(requestBody).toMatchObject({
      model: "test-model",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "video_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: expect.arrayContaining([
              "title",
              "overview",
              "viewerAnswer",
              "caveats",
              "sections",
              "notes",
              "recommendedMoments",
              "personalizedGuidance",
            ]),
            properties: {
              caveats: { type: "array", items: { type: "string" } },
              sections: {
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "body"],
                },
              },
              notes: { items: { type: "object", additionalProperties: false } },
              recommendedMoments: {
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: expect.arrayContaining([
                    "startSeconds",
                    "evidenceText",
                  ]),
                },
              },
              personalizedGuidance: {
                anyOf: expect.arrayContaining([
                  { type: "null" },
                  expect.objectContaining({
                    type: "object",
                    additionalProperties: false,
                    required: ["relevance", "prerequisites", "nextSteps"],
                    properties: expect.objectContaining({
                      nextSteps: expect.objectContaining({
                        type: "array",
                        items: expect.objectContaining({ type: "string" }),
                      }),
                      prerequisites: expect.objectContaining({
                        items: expect.objectContaining({
                          additionalProperties: false,
                        }),
                      }),
                    }),
                  }),
                ]),
              },
            },
          },
        },
      },
    });
  });

  it("rejects object entries at the exact nextSteps and caveats paths reported by the user", async () => {
    const provider = respond(
      JSON.stringify({
        ...answer,
        caveats: [
          { title: "Missing details", detail: "Deployment is not covered." },
        ],
        personalizedGuidance: {
          relevance: "مفيد لفهم إدارة المحتوى.",
          prerequisites: [],
          nextSteps: [
            { action: "Model articles." },
            { action: "Configure permissions." },
            { action: "Inspect the generated API." },
          ],
        },
      }),
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_INVALID_FORMAT",
      details: {
        "caveats.0": ["invalid_type"],
        "personalizedGuidance.nextSteps.0": ["invalid_type"],
        "personalizedGuidance.nextSteps.1": ["invalid_type"],
        "personalizedGuidance.nextSteps.2": ["invalid_type"],
      },
    });
  });

  it("preserves valid Arabic string arrays without coercion or losing recommendations", async () => {
    const caveats = ["تفاصيل النشر غير مذكورة."];
    const guidance = {
      relevance: "مفيد لفهم إدارة المحتوى.",
      prerequisites: [],
      nextSteps: ["أنشئ نوع محتوى للمقالات.", "راجع صلاحيات واجهات البرمجة."],
    };
    const provider = respond(
      JSON.stringify({ ...answer, caveats, personalizedGuidance: guidance }),
    );
    const summary = await provider.summarize(input);
    expect(summary.caveats).toEqual(caveats);
    expect(summary.personalizedGuidance).toEqual(guidance);
  });

  it("reports schema rejection without silently downgrading or retrying the request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          {
            error: {
              message: "response_format json_schema is unsupported",
              param: "response_format",
              type: "invalid_request_error",
              code: "unsupported_parameter",
            },
          },
          { status: 400 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_SCHEMA_REJECTED",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("distinguishes a model refusal from a malformed JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({
            choices: [
              {
                message: { content: null, refusal: "Declined." },
                finish_reason: "stop",
              },
            ],
          }),
        ),
    );
    const provider = new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_REFUSED",
    });
  });

  it("does not accept omitted required fields or additional output keys", async () => {
    const provider = respond(
      JSON.stringify({
        title: answer.title,
        overview: answer.overview,
        viewerAnswer: answer.viewerAnswer,
        extra: "Uncontracted output",
      }),
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_INVALID_FORMAT",
      details: { caveats: ["invalid_type"], response: ["unrecognized_keys"] },
    });
  });
  it("accepts a narrow Arabic answer with empty lists and null guidance", async () => {
    const provider = respond(JSON.stringify(answer));
    const summary = await provider.summarize(input);
    expect(summary.viewerAnswer).toBe(answer.viewerAnswer);
    expect(summary.sections).toEqual([]);
    expect(summary.notes).toEqual([]);
    expect(summary.personalizedGuidance).toBeUndefined();
  });

  it("rejects null arrays or omitted guidance fields when a provider ignores the required schema", async () => {
    const provider = respond(
      JSON.stringify({
        ...answer,
        sections: null,
        notes: null,
        caveats: null,
        recommendedMoments: null,
        personalizedGuidance: {
          relevance: "مفيد لفهم إدارة المحتوى.",
          prerequisites: null,
        },
      }),
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_INVALID_FORMAT",
      details: {
        caveats: ["invalid_type"],
        "personalizedGuidance.prerequisites": ["invalid_type"],
        "personalizedGuidance.nextSteps": ["invalid_type"],
      },
    });
  });

  it("reports invalid required fields without exposing model content", async () => {
    const provider = respond(
      JSON.stringify({
        ...answer,
        viewerAnswer: { secret: "private provider content" },
        notes: "not an array",
      }),
    );
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_INVALID_FORMAT",
      details: { viewerAnswer: ["invalid_type"], notes: ["invalid_type"] },
    });
  });

  it("identifies output truncation instead of reporting a generic format failure", async () => {
    const provider = respond('{"title":"Partial', "length");
    await expect(provider.summarize(input)).rejects.toMatchObject({
      code: "SUMMARY_INVALID_FORMAT",
      details: { response: ["The provider reached its output token limit."] },
    });
  });

  describe("output language", () => {
    const englishAnswer = {
      ...answer,
      title: "What is Strapi?",
      overview: "A content management system.",
      viewerAnswer: "Strapi is a headless CMS that exposes your content through an API.",
    };

    function respondInOrder(...contents: string[]): ReturnType<typeof vi.fn<typeof fetch>> {
      const fetchMock = vi.fn<typeof fetch>();
      for (const content of contents) {
        fetchMock.mockResolvedValueOnce(
          Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] }),
        );
      }
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    function readUserPrompt(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
      const body = fetchMock.mock.calls[callIndex]?.[1]?.body;
      if (typeof body !== "string") throw new Error("Expected a JSON model request.");
      const requestBody = z
        .object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) })
        .parse(JSON.parse(body));
      const userMessage = requestBody.messages.find((message) => message.role === "user");
      if (!userMessage) throw new Error("Expected a user message.");
      return userMessage.content;
    }

    function createProvider(): OpenAiSummaryProvider {
      return new OpenAiSummaryProvider(
        new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
        "test-model",
      );
    }

    it("repeats the output language after the transcript", async () => {
      const fetchMock = respondInOrder(JSON.stringify(answer));
      await createProvider().summarize(input);
      const prompt = readUserPrompt(fetchMock, 0);
      const transcriptEnd = prompt.indexOf(input.transcript.segments[0]?.text ?? "");
      expect(prompt.lastIndexOf("Output language: Arabic")).toBeGreaterThan(transcriptEnd);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("asks once more when the summary comes back in the transcript's language", async () => {
      const fetchMock = respondInOrder(JSON.stringify(englishAnswer), JSON.stringify(answer));
      const summary = await createProvider().summarize(input);
      expect(summary.title).toBe(answer.title);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(readUserPrompt(fetchMock, 1)).toContain("A previous attempt was written in the wrong language.");
    });

    it("fails instead of returning a summary in the wrong language", async () => {
      respondInOrder(JSON.stringify(englishAnswer), JSON.stringify(englishAnswer));
      await expect(createProvider().summarize(input)).rejects.toMatchObject({
        code: "SUMMARY_INVALID_FORMAT",
        details: { response: ["Wrong output language."] },
      });
    });
  });

  it.each(["Not JSON", '{"title":"Unfinished"} broken }'])(
    "rejects malformed output: %s",
    async (content) => {
      const provider = respond(content);
      await expect(provider.summarize(input)).rejects.toMatchObject({
        code: "SUMMARY_INVALID_FORMAT",
        details: { response: expect.any(Array) },
      });
    },
  );
});
