import { HttpClient } from "@nestjs/http-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { summaryResultSchema } from "@l5sly/contracts";

import type { TranscriptionResult } from "../../provider-contracts.js";
import {
  formatSummaryTranscript,
  OpenAiSummaryProvider,
} from "../openai-summary.provider.js";
import {
  getSummaryTaskInstructions,
  getSummaryOutputLimits,
  SUMMARY_SYSTEM_PROMPT,
} from "../summary-prompt.js";

afterEach(() => vi.unstubAllGlobals());

describe("summary context", () => {
  const transcript: TranscriptionResult = {
    text: "Create articles and link each article to one category.",
    segments: [
      {
        startSeconds: 0,
        endSeconds: 20,
        text: "Create articles and link each article to one category.",
      },
    ],
    durationSeconds: 20,
    detectedLanguage: "en",
  };

  const draft = {
    title: "Content relationships",
    overview: "Create articles linked to categories.",
    viewerAnswer: "The tutorial uses a category relation for articles.",
    caveats: [],
    sections: [
      { title: "Articles", body: "Create articles." },
      { title: "Relations", body: "Link each article to one category." },
    ],
    notes: [
      { category: "Model", title: "Articles", detail: "Store articles." },
      { category: "Model", title: "Categories", detail: "Organize content." },
      {
        category: "Relation",
        title: "Many to one",
        detail: "Link multiple articles to a category.",
      },
    ],
    recommendedMoments: [],
    personalizedGuidance: {
      relevance: "Practice content modeling for your API work.",
      prerequisites: [
        {
          topic: "JavaScript",
          reason: "Read the setup code.",
          status: "already-known",
        },
      ],
      nextSteps: ["Model an article-to-category relationship."],
    },
  };
  it("sends saved knowledge and the current question to the model and returns preparation advice", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(draft) },
            finish_reason: "stop",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const summaryProvider = new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
    const summary = await summaryProvider.summarize({
      transcript,
      language: "English",
      depth: "quick",
      expectation: "Which relationships are used?",
      viewerProfile: {
        background: "Backend developer",
        knowledge: "JavaScript and SQL",
        goals: "Learn content modeling",
        preferences: "Explain trade-offs",
      },
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string")
      throw new Error("Expected serialized model request.");
    expect(body).toContain("Backend developer");
    expect(body).toContain("JavaScript and SQL");
    expect(body).toContain("Which relationships are used?");
    expect(body).toContain("takes priority over general saved goals");
    expect(body).toContain(
      "Do not summarize the entire video unless the question asks for it",
    );
    expect(body).toContain("Never invent personal experience");
    expect(body).toContain("Personalized Answer");
    expect(body).toContain("full available transcript");
    expect(summary.personalizedGuidance).toEqual(draft.personalizedGuidance);
  });

  it.each([
    {
      name: "one relevant point without filler",
      answer: "Each article links to one category.",
      sections: [
        {
          title: "Article relation",
          body: "Several articles can share a category.",
        },
      ],
      caveats: [],
    },
    {
      name: "missing information without invented points",
      answer: "The deployment platform and hosting steps are not specified.",
      sections: [],
      caveats: ["Deployment details are not provided."],
    },
  ])(
    "accepts $name using the existing output contract",
    async ({ answer, sections, caveats }) => {
      const focusedDraft = {
        ...draft,
        viewerAnswer: answer,
        sections,
        caveats,
        notes: [],
        recommendedMoments: [],
        personalizedGuidance: {
          relevance: "Only content modeling is covered.",
          prerequisites: [],
          nextSteps: [],
        },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          Response.json({
            choices: [{ message: { content: JSON.stringify(focusedDraft) } }],
          }),
        ),
      );
      const summaryProvider = new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
      const result = await summaryProvider.summarize({
        transcript,
        language: "English",
        depth: "quick",
        expectation: "How is the category related, and where is it deployed?",
      });
      expect(result.viewerAnswer).toBe(answer);
      expect(result.sections).toEqual(sections);
      expect(result.notes).toEqual([]);
      expect(result.personalizedGuidance?.nextSteps).toEqual([]);
      expect(
        summaryResultSchema.safeParse({
          ...result,
          transcript: transcript.segments,
          durationSeconds: transcript.durationSeconds,
          sourceLanguage: "en",
          verdict: {
            recommendation: "skip",
            confidence: 0.8,
            headline: "Read the answer",
            reason: "The question is only partly covered.",
          },
        }).success,
      ).toBe(true);
    },
  );

  it("uses question relevance rather than video length to set quick-summary limits", () => {
    const input = {
      transcript: { ...transcript, durationSeconds: 7200 },
      language: "English",
      depth: "quick",
      expectation: "What is the article relationship?",
    } as const;
    expect(getSummaryOutputLimits(input).sections).toBe(3);
    expect(
      getSummaryOutputLimits({ ...input, expectation: undefined }).sections,
    ).toBe(6);
    expect(getSummaryTaskInstructions(input)).toContain(
      "upper limits, not quotas",
    );
    expect(getSummaryTaskInstructions({ ...input, depth: "study" })).toContain(
      "do not add unrelated study material",
    );
    expect(SUMMARY_SYSTEM_PROMPT).toContain(
      "If the profile is absent or insufficient, write neutrally",
    );
    expect(SUMMARY_SYSTEM_PROMPT).toContain("Never turn speculation into fact");
    expect(SUMMARY_SYSTEM_PROMPT).toContain("Do not copy large passages");
  });

  it("keeps short transcripts complete", () => {
    expect(formatSummaryTranscript(transcript)).toEqual({
      text: "[0s] Create articles and link each article to one category.",
      sampled: false,
    });
  });

  it("passes Arabic style preferences and preserves original Arabic evidence for an English answer", async () => {
    const speech =
      "ربط المقالات بالفئات يسمح بتنظيم المحتوى وعرضه بطريقة واضحة.";
    const arabicTranscript = {
      text: speech,
      durationSeconds: 60,
      detectedLanguage: "ar",
      segments: [{ startSeconds: 42.5, endSeconds: 60, text: speech }],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...draft,
                  notes: [],
                  recommendedMoments: [
                    {
                      startSeconds: 42,
                      title: "Category relationship",
                      reason: "Explains how content is organized.",
                      evidenceText: speech,
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const summaryProvider = new OpenAiSummaryProvider(
      new HttpClient({ baseUrl: "https://example.com/v1", timeout: 1000, retry: false }),
      "test-model",
    );
    const summary = await summaryProvider.summarize({
      transcript: arabicTranscript,
      language: "English",
      depth: "quick",
      expectation: "How is content organized?",
      viewerProfile: {
        background: "مطوّر backend",
        knowledge: "SQL",
        goals: "علاقات البيانات",
        preferences:
          "Simple explanations; use Egyptian Arabic when the output language is Arabic.",
      },
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string")
      throw new Error("Expected serialized model request.");
    expect(body).toContain("Output language: English.");
    expect(body).toContain(
      "use Egyptian Arabic when the output language is Arabic",
    );
    expect(body).toContain(speech);
    expect(body).toContain("never translate this excerpt");
    expect(summary.recommendedMoments[0]?.startSeconds).toBe(42.5);
  });

  it("samples long videos across the timeline instead of dropping the ending", () => {
    const longTranscript = {
      ...transcript,
      segments: Array.from({ length: 100 }, (_, index) => ({
        startSeconds: index * 60,
        endSeconds: index * 60 + 50,
        text: `Topic ${index}: ${"details ".repeat(30)}`,
      })),
    };
    const formatted = formatSummaryTranscript(longTranscript, 3000);
    expect(formatted.sampled).toBe(true);
    expect(formatted.text.length).toBeLessThanOrEqual(3000);
    expect(formatted.text).toContain("[0s]");
    expect(formatted.text).toContain("[5940s] Topic 99");
    expect(formatted.text).toMatch(/\[(2|3)\d{3}s\]/);
  });
});
