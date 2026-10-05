import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiSummaryProvider } from "./openai-summary-provider.js";
import type { SummaryGenerationInput } from "./provider-contracts.js";

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
  return new OpenAiSummaryProvider({
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    model: "test-model",
    timeoutMs: 1000,
  });
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
    const provider = new OpenAiSummaryProvider({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      model: "test-model",
      timeoutMs: 1000,
    });
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
    const provider = new OpenAiSummaryProvider({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      model: "test-model",
      timeoutMs: 1000,
    });
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
