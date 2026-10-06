import { HttpClient } from "@nestjs/http-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JevProvider } from "../jev.provider.js";

const provider = new JevProvider(
  new HttpClient({ baseUrl: "https://jev.example.com/v1", timeout: 1_000, retry: false }),
  "jev-test",
);

interface JevRequestBody {
  state: string;
  questions: Record<string, { type: string }>;
}

function mockJevAnswers(answers: Record<string, unknown>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ answers }));
}

function readRequestBody(
  fetchMock: ReturnType<typeof mockJevAnswers>,
): JevRequestBody {
  const init = fetchMock.mock.calls[0]?.[1];
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  const body: JevRequestBody = JSON.parse(init.body);
  return body;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JevProvider", () => {
  it("skips a video that does not answer the viewer's question and explains why", async () => {
    const fetchMock = mockJevAnswers({
      watch: { noul: 0.6 },
      relevance: { score: 1.2 },
      density: { score: 0.4 },
      padding: { noul: 0.8 },
      knowledge_gap: { noul: 0.1 },
      answers_question: { noul: 0.1 },
    });

    const verdict = await provider.decide({
      transcript: "An intro, a sponsor read and some unrelated stories.",
      durationSeconds: 900,
      expectation: "How do I configure Postgres replication?",
      language: "English",
    });

    expect(Object.keys(readRequestBody(fetchMock).questions)).toContain(
      "answers_question",
    );
    expect(verdict).toMatchObject({
      recommendation: "skip",
      headline: "This video doesn't answer your question",
      signals: {
        answersQuestion: 0.1,
        informationDensity: 0.2,
        padding: 0.8,
        knowledgeGap: 0.1,
      },
    });
    expect(verdict.reason).toContain("does not appear to answer");
    expect(verdict.reason).toContain("filler");
  });

  it("does not ask whether the question is answered when no question was given", async () => {
    const fetchMock = mockJevAnswers({
      watch: { noul: 0.9 },
      relevance: { score: 1.8 },
      density: { score: 1.6 },
      padding: { noul: 0.1 },
      knowledge_gap: { noul: 0.1 },
    });

    const verdict = await provider.decide({
      transcript: "A dense walkthrough.",
      durationSeconds: 600,
      language: "English",
    });

    expect(Object.keys(readRequestBody(fetchMock).questions)).not.toContain(
      "answers_question",
    );
    expect(verdict.recommendation).toBe("watch");
    expect(verdict.signals?.answersQuestion).toBeNull();
  });

  it("rejects a response that omits a requested answer", async () => {
    mockJevAnswers({ watch: { noul: 0.9 } });

    await expect(
      provider.decide({ transcript: "Text", durationSeconds: 60 }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("scores each timed part of the transcript", async () => {
    const fetchMock = mockJevAnswers({
      part_0: { score: 0 },
      part_1: { score: 2 },
    });

    const timeline = await provider.scoreTimeline({
      segments: [
        { startSeconds: 0, endSeconds: 60, text: "Welcome back." },
        { startSeconds: 60, endSeconds: 120, text: "Here is the method." },
      ],
      durationSeconds: 120,
    });

    expect(Object.keys(readRequestBody(fetchMock).questions)).toEqual([
      "part_0",
      "part_1",
    ]);
    expect(timeline).toEqual([
      { startSeconds: 0, endSeconds: 60, relevance: 0 },
      { startSeconds: 60, endSeconds: 120, relevance: 1 },
    ]);
  });

  it("keeps silent parts on the timeline without asking Jev about them", async () => {
    const fetchMock = mockJevAnswers({
      part_0: { score: 1 },
      part_2: { score: 2 },
    });

    const timeline = await provider.scoreTimeline({
      segments: [
        { startSeconds: 0, endSeconds: 50, text: "Opening remarks." },
        { startSeconds: 130, endSeconds: 180, text: "The key demo." },
      ],
      durationSeconds: 180,
    });

    expect(Object.keys(readRequestBody(fetchMock).questions)).toEqual([
      "part_0",
      "part_2",
    ]);
    expect(timeline.map((window) => window.relevance)).toEqual([0.5, 0, 1]);
  });

  it("flags key points the transcript does not support", async () => {
    mockJevAnswers({ point_0: { noul: 0.9 }, point_1: { noul: 0.2 } });

    const support = await provider.checkGrounding({
      transcript: "The speaker recommends weekly backups.",
      sections: [
        { title: "Backups", body: "Run backups weekly." },
        { title: "Cost", body: "Backups cost $40 per month." },
      ],
    });

    expect(support).toEqual(["supported", "unsupported"]);
  });

  it("skips the grounding check when the transcript is too long to read in full", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const support = await provider.checkGrounding({
      transcript: "word ".repeat(20_000),
      sections: [{ title: "Point", body: "Detail." }],
    });

    expect(support).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a precheck verdict from public metadata", async () => {
    const fetchMock = mockJevAnswers({
      watch: { noul: 0.5 },
      relevance: { score: 1 },
      density: { score: 1 },
      padding: { noul: 0.2 },
      knowledge_gap: { noul: 0.7 },
    });

    const verdict = await provider.precheck({
      metadata: {
        title: "Kubernetes in 100 seconds",
        channel: null,
        durationSeconds: null,
        description: "A fast overview.",
        chapters: [],
      },
      language: "Arabic",
    });

    const state = readRequestBody(fetchMock).state;
    expect(state).toContain("Kubernetes in 100 seconds");
    expect(state).toContain("Video duration: unknown.");
    expect(verdict.recommendation).toBe("watch-key-moments");
    expect(verdict.reason).toBe(
      "يفترض الفيديو معرفة مسبقة قد لا تتوفر لديك بعد.",
    );
  });

  it("reports the upstream status and the start of its body when Jev rejects a request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("model overloaded", { status: 503 }),
    );

    await expect(
      provider.decide({ transcript: "Text.", durationSeconds: 60 }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The Jev provider returned status 503: model overloaded",
    });
  });

  it("reports a timeout when Jev does not answer in time", async () => {
    const slowProvider = new JevProvider(
      new HttpClient({
        baseUrl: "https://jev.example.com/v1",
        timeout: 20,
        retry: false,
      }),
      "jev-test",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );

    await expect(
      slowProvider.decide({ transcript: "Text.", durationSeconds: 60 }),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("reports an unreachable Jev host as a provider error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed"),
    );

    await expect(
      provider.decide({ transcript: "Text.", durationSeconds: 60 }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The Jev provider could not be reached.",
    });
  });
});
