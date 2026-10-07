import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SummaryJob,
  SummaryLanguage,
  SummaryResult as SummaryResultData,
} from "@l5sly/contracts";
import { NotificationProvider } from "@/components/notifications";
import { ThemeProvider } from "@/components/theme-provider";
import { ViewerProfileProvider } from "@/features/profile/viewer-profile";
import { ProfilePage } from "@/pages/profile-page";
import { SummaryPage } from "@/pages/summary-page";
import { ProcessingState } from "./processing-state";
import { FailedSummaryState } from "./failed-summary-state";
import { SummaryForm } from "./summary-form";
import { SummaryResult } from "./summary-result";

const result: SummaryResultData = {
  title: "A useful video",
  overview: "An overview of the topic.",
  viewerAnswer: "Watch the practical demonstration.",
  caveats: [],
  sections: [{ title: "Main idea", body: "A practical explanation." }],
  notes: [
    { category: "Workflow", title: "Test first", detail: "Check the result." },
  ],
  recommendedMoments: [
    {
      startSeconds: 15,
      title: "Practical demonstration",
      reason: "Shows the method.",
    },
  ],
  transcript: [
    { startSeconds: 0, endSeconds: 10, text: "Try the first approach." },
    {
      startSeconds: 10,
      endSeconds: 20,
      text: "Try it again, then try another way.",
    },
  ],
  verdict: {
    recommendation: "watch-key-moments",
    confidence: 0.8,
    headline: "Watch the demonstration",
    reason: "The middle is useful.",
  },
  durationSeconds: 20,
  sourceLanguage: "en",
};

const queuedJob: SummaryJob = {
  id: "08f234b1-444d-488b-bf65-f029306383e6",
  status: "queued",
  source: { type: "url", name: "youtube.com" },
  options: { language: "English", depth: "quick" },
  progress: 0,
  stage: "Queued",
  result: null,
  error: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

function renderUi(children: ReactNode, initialEntries = ["/"]): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <ThemeProvider defaultTheme="light">
      <NotificationProvider>
        <QueryClientProvider client={queryClient}>
          <ViewerProfileProvider>
            <MemoryRouter initialEntries={initialEntries}>
              {children}
            </MemoryRouter>
          </ViewerProfileProvider>
        </QueryClientProvider>
      </NotificationProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.removeItem("l5asly-viewer-profile");
});

describe("Summary workflow", () => {
  it("saves a profile once, restores it for editing and uses updates in new requests", async () => {
    renderUi(<ProfilePage />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Role or background" }),
      { target: { value: "Backend developer" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "What you already know" }),
      { target: { value: "SQL and JavaScript" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "What you want to learn" }),
      { target: { value: "Learn Strapi" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(localStorage.getItem("l5asly-viewer-profile")).toContain(
        "Learn Strapi",
      ),
    );
    cleanup();
    renderUi(<ProfilePage />);
    expect(
      screen.getByRole("textbox", { name: "Role or background" }),
    ).toHaveValue("Backend developer");
    fireEvent.change(
      screen.getByRole("textbox", { name: "What you want to learn" }),
      { target: { value: "Build content APIs" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(localStorage.getItem("l5asly-viewer-profile")).toContain(
        "Build content APIs",
      ),
    );
    cleanup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: queuedJob }));
    vi.stubGlobal("fetch", fetchMock);
    renderUi(<SummaryForm />);
    expect(
      screen.getByRole("link", { name: "Edit profile" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste a link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Video URL" }), {
      target: { value: "https://example.com/video.mp4" },
    });
    fireEvent.mouseDown(
      screen.getByRole("combobox", { name: "Video language" }),
    );
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(screen.getByRole("option", { name: "Arabic" }));
    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string")
      throw new Error("Expected a JSON summary request.");
    expect(JSON.parse(body)).toMatchObject({
      sourceLanguage: "Arabic",
      language: "English",
      viewerProfile: {
        goals: "Build content APIs",
        knowledge: "SQL and JavaScript",
      },
    });
    cleanup();
    renderUi(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Clear profile" }));
    expect(localStorage.getItem("l5asly-viewer-profile")).not.toBeNull();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear profile",
      }),
    );
    expect(localStorage.getItem("l5asly-viewer-profile")).toBeNull();
    // The rest of the page is hidden from assistive tech until the dialog closes.
    expect(
      await screen.findByRole("textbox", { name: "Role or background" }),
    ).toHaveValue("");
  });

  it("warns about corrupted profile storage without breaking the summary form", () => {
    localStorage.setItem("l5asly-viewer-profile", "not-json");
    renderUi(<SummaryForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your saved profile could not be read",
    );
    expect(
      screen.getByRole("button", { name: "Create summary" }),
    ).toBeEnabled();
  });

  it("validates a missing file without sending a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    renderUi(<SummaryForm />);

    expect(
      screen.getByRole("button", { name: "Advanced options" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));

    expect(
      await screen.findByText("Choose a video or audio file."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a URL with the current question and default options", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: queuedJob })));
    vi.stubGlobal("fetch", fetchMock);
    renderUi(
      <Routes>
        <Route path="/" element={<SummaryForm />} />
        <Route path="/summaries/:id" element={<p>Job created</p>} />
      </Routes>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Paste a link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Video URL" }), {
      target: { value: "https://youtu.be/-xbzGngfQEw" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your question (optional)" }),
      { target: { value: "Is this useful?" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));

    expect(await screen.findByText("Job created")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/summaries/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://youtu.be/-xbzGngfQEw",
        language: "English",
        sourceLanguage: "English",
        depth: "quick",
        expectation: "Is this useful?",
      }),
    });
  });

  it("runs a quick check for a YouTube link and hides it once the link changes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          title: "Kubernetes in 100 seconds",
          channel: "Fireship",
          durationSeconds: 128,
          verdict: {
            recommendation: "skip",
            confidence: 0.9,
            headline: "This video doesn't answer your question",
            reason: "It does not appear to answer your question.",
            signals: {
              answersQuestion: 0.1,
              informationDensity: 0.8,
              padding: 0.1,
              knowledgeGap: 0.2,
            },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderUi(<SummaryForm />);

    fireEvent.click(screen.getByRole("button", { name: "Paste a link" }));
    expect(
      screen.queryByRole("button", { name: "Quick check" }),
    ).not.toBeInTheDocument();
    const urlField = screen.getByRole("textbox", { name: "Video URL" });
    fireEvent.change(urlField, {
      target: { value: "https://youtu.be/-xbzGngfQEw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quick check" }));

    expect(await screen.findByText("Likely skip")).toBeInTheDocument();
    expect(
      screen.getByText("Doesn't answer your question"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/summaries/precheck",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.change(urlField, {
      target: { value: "https://youtu.be/another" },
    });
    expect(screen.queryByText("Likely skip")).not.toBeInTheDocument();
  });

  it("rejects dropped files that are not media or are over the upload limit", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    renderUi(<SummaryForm />);
    const input = screen.getByLabelText("Choose a video or audio file");

    fireEvent.change(input, {
      target: {
        files: [new File(["%PDF"], "notes.pdf", { type: "application/pdf" })],
      },
    });
    expect(
      await screen.findByText("Choose a video or audio file."),
    ).toBeInTheDocument();

    const largeVideo = new File(["video"], "long.mp4", { type: "video/mp4" });
    Object.defineProperty(largeVideo, "size", { value: 2 * 1024 ** 3 });
    fireEvent.change(input, { target: { files: [largeVideo] } });
    expect(
      await screen.findByText(/This file is larger than 1 GB/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));
    await waitFor(() =>
      expect(screen.getByText(/This file is larger than 1 GB/)).toBeVisible(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the selected file as multipart data", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: queuedJob })));
    vi.stubGlobal("fetch", fetchMock);
    renderUi(<SummaryForm />);
    const file = new File(["video"], "example.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByLabelText("Choose a video or audio file"), {
      target: { files: [file] },
    });
    expect(screen.getByText("example.mp4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    if (!(request?.body instanceof FormData)) {
      throw new Error("Expected a multipart upload request.");
    }
    expect(request.body.get("video")).toBe(file);
    expect(request.body.get("language")).toBe("English");
    expect(request.body.get("depth")).toBe("quick");
  });
});

describe("job recovery and loading", () => {
  const failedJob: SummaryJob = {
    ...queuedJob,
    status: "failed",
    progress: 68,
    stage: "Processing failed",
    error: "Invalid model fields.",
    failedStep: "summary",
    retryInfo: {
      fromStep: "summary",
      requiresUpload: false,
      reason: "Your transcript is saved.",
    },
  };

  it("shows a Material spinner, actual progress and a moving elapsed timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(queuedJob.createdAt));
    renderUi(
      <ProcessingState
        job={{
          ...queuedJob,
          status: "processing",
          progress: 68,
          stage: "Generating summary",
        }}
        isCancelling={false}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Current step in progress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Summary progress" }),
    ).toHaveAttribute("aria-valuenow", "68");
    expect(screen.getByText("Step 3 / 3")).toBeInTheDocument();
    expect(screen.getByText(/Elapsed 0:00/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText(/Elapsed 0:03/)).toBeInTheDocument();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("explains connection failures without hiding the last processing state", () => {
    renderUi(
      <ProcessingState
        job={{ ...queuedJob, status: "processing" }}
        isCancelling={false}
        onCancel={vi.fn()}
        hasConnectionError
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("last known status");
    expect(
      screen.getByRole("progressbar", { name: "Current step in progress" }),
    ).toBeInTheDocument();
  });

  it("retries the failed step and switches to the loading state for the same job", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) =>
        Response.json({
          data:
            init?.method === "POST"
              ? { ...queuedJob, progress: 68, attempt: 2 }
              : failedJob,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderUi(
      <Routes>
        <Route path="/summaries/:summaryId" element={<SummaryPage />} />
      </Routes>,
      [`/summaries/${queuedJob.id}`],
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry summary" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Waiting to start" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/summaries/${queuedJob.id}/retry`,
      { method: "POST", body: undefined },
    );
  });

  it("deletes a failed job and handles an empty 204 response before returning to the library", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) =>
        init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({ data: failedJob }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderUi(
      <Routes>
        <Route path="/summaries/:summaryId" element={<SummaryPage />} />
        <Route path="/library" element={<p>Saved summaries</p>} />
      </Routes>,
      [`/summaries/${queuedJob.id}`],
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete job" }));
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/summaries/${queuedJob.id}`,
      { method: "DELETE" },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete permanently" }),
    );
    expect(await screen.findByText("Saved summaries")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/summaries/${queuedJob.id}`, {
      method: "DELETE",
    });
  });

  it("requires replacement media only when the checkpoint says it is unavailable", () => {
    const onRetry = vi.fn();
    renderUi(
      <FailedSummaryState
        job={{
          ...failedJob,
          retryInfo: {
            fromStep: "media",
            requiresUpload: true,
            reason: "Select the same file.",
          },
        }}
        isRetrying={false}
        isDeleting={false}
        onRetry={onRetry}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Retry processing" }),
    ).toBeDisabled();
    const file = new File(["audio"], "source.webm", { type: "audio/webm" });
    fireEvent.change(screen.getByLabelText("Select media to retry"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));
    expect(onRetry).toHaveBeenCalledWith(file);
  });
});

describe("Summary result", () => {
  it("shows the relevance timeline, verdict signals and unverified points", () => {
    renderResult({
      ...result,
      sections: [
        {
          title: "Main idea",
          body: "A practical explanation.",
          support: "supported",
        },
        { title: "Pricing", body: "It costs $40.", support: "unsupported" },
      ],
      verdict: {
        ...result.verdict,
        signals: {
          answersQuestion: null,
          informationDensity: 0.8,
          padding: 0.7,
          knowledgeGap: 0.1,
        },
      },
      timeline: [
        { startSeconds: 0, endSeconds: 10, relevance: 0.1 },
        { startSeconds: 10, endSeconds: 20, relevance: 0.9 },
      ],
    });

    expect(screen.getByText("Dense content")).toBeInTheDocument();
    expect(screen.getByText("Lots of filler")).toBeInTheDocument();
    expect(screen.getByText(/Focus on/)).toHaveTextContent(
      "Focus on 0:10 of 0:20",
    );
    expect(
      screen.getByRole("listitem", { name: "0:10–0:20, 90% relevant" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not found in transcript")).toHaveLength(1);
  });

  it("renders older results without a timeline or signals", () => {
    renderResult(result);
    expect(
      screen.queryByRole("heading", { name: "Where the value is" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Verdict signals" }),
    ).not.toBeInTheDocument();
  });

  it("handles a concise answer without optional notes or next steps", () => {
    renderResult({
      ...result,
      sections: [],
      notes: [],
      personalizedGuidance: {
        relevance: "Only one answer is needed.",
        prerequisites: [],
        nextSteps: [],
      },
    });
    expect(
      screen.queryByRole("heading", { name: "Next steps" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(
      screen.getByText("No additional source notes for this answer."),
    ).toBeInTheDocument();
  });

  it("puts relevance, prerequisites and next steps into the viewing plan", () => {
    renderResult({
      ...result,
      personalizedGuidance: {
        relevance: "Useful for your content modeling goal.",
        prerequisites: [
          {
            topic: "SQL",
            reason: "Compare the relationship to a foreign key.",
            status: "already-known",
          },
        ],
        nextSteps: ["Model an article with one category."],
      },
    });
    expect(
      screen.getByRole("heading", { name: "Your viewing plan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Useful for your content modeling goal."),
    ).toBeInTheDocument();
    expect(screen.getByText("Already familiar")).toBeInTheDocument();
    expect(
      screen.getByText("Model an article with one category."),
    ).toBeInTheDocument();
  });

  it("highlights every case-insensitive search match and filters other segments", () => {
    const view = renderResult();
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search transcript" }),
      { target: { value: "TRY" } },
    );

    expect(
      Array.from(
        view.container.querySelectorAll("mark"),
        (mark) => mark.textContent,
      ),
    ).toEqual(["Try", "Try", "try"]);
    expect(screen.getByText("2 of 2 segments match.")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search transcript" }),
      { target: { value: "missing" } },
    );
    expect(
      screen.getByText("No transcript lines match that search."),
    ).toBeInTheDocument();
  });

  it("shows a recommended moment within its containing transcript segment", () => {
    renderResult();
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(screen.getByText("Practical demonstration")).toBeInTheDocument();
    expect(
      screen.getByText("Try it again, then try another way."),
    ).toBeInTheDocument();
  });

  it("jumps from a recommended moment or timeline part to its transcript segment", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderResult({
      ...result,
      timeline: [
        { startSeconds: 0, endSeconds: 10, relevance: 0.2 },
        { startSeconds: 10, endSeconds: 20, relevance: 0.9 },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Practical demonstration, jump to transcript at 0:15",
      }),
    );

    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const target = document.getElementById("segment-1");
    expect(target).toHaveTextContent("Try it again, then try another way.");
    expect(target).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Jump to transcript at 0:00" }),
    );
    expect(document.getElementById("segment-0")).toHaveFocus();
  });

  it("scrolls again when the same timeline part is chosen twice", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderResult({
      ...result,
      timeline: [
        { startSeconds: 0, endSeconds: 10, relevance: 0.2 },
        { startSeconds: 10, endSeconds: 20, relevance: 0.9 },
      ],
    });
    const timelinePart = screen.getByRole("button", {
      name: "Jump to transcript at 0:10",
    });

    fireEvent.click(timelinePart);
    fireEvent.click(timelinePart);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(document.getElementById("segment-1")).toHaveFocus();
  });

  it("does not jump back to an old segment when returning to the transcript tab", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderResult();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Practical demonstration, jump to transcript at 0:15",
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("opens the tab named in the URL", () => {
    renderResult(result, "English", ["/?tab=notes"]);
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Key notes" })).toBeVisible();
  });

  it("renders repeated generated titles without dropping sections", () => {
    renderResult({
      ...result,
      sections: [
        { title: "Main idea", body: "First explanation." },
        { title: "Main idea", body: "Second explanation." },
      ],
    });
    expect(screen.getByText("First explanation.")).toBeInTheDocument();
    expect(screen.getByText("Second explanation.")).toBeInTheDocument();
  });

  it("uses RTL content and list spacing for Arabic, including titles beginning with Latin names", () => {
    const arabicResult: SummaryResultData = {
      ...result,
      title: "ByteDosh لبناء نموذج لغوي",
      caveats: [
        "يعتمد الفيديو على ذكر المكونات التقنية دون تقديم مقارنة تفصيلية.",
      ],
      notes: [
        {
          category: "تقنية",
          title: "GPT لبناء النموذج",
          detail: "ملاحظات حول بناء النموذج.",
        },
      ],
      recommendedMoments: [
        {
          startSeconds: 15,
          title: "GPT تقديم النموذج",
          reason: "يوضح طريقة العمل.",
        },
      ],
      transcript: [
        {
          startSeconds: 10,
          endSeconds: 20,
          text: "GPT يساعد في بناء النموذج اللغوي.",
        },
      ],
      sourceLanguage: "ar",
    };
    renderResult(arabicResult, "Arabic");

    expect(
      screen.getByRole("heading", { name: arabicResult.title }),
    ).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("heading", { name: arabicResult.title }),
    ).toHaveAttribute("lang", "ar");
    const caveatList = screen
      .getByText(arabicResult.caveats[0] ?? "")
      .closest("ul");
    expect(caveatList).toHaveAttribute("dir", "rtl");
    expect(caveatList).toHaveStyle({
      paddingInlineStart: "24px",
      paddingInlineEnd: "0",
    });
    expect(screen.getByText("0:15")).toHaveAttribute("dir", "ltr");

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(
      screen.getByRole("heading", { name: "GPT لبناء النموذج" }),
    ).toHaveAttribute("dir", "rtl");
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(
      screen.getByText(arabicResult.transcript[0]?.text ?? ""),
    ).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("0:10")).toHaveAttribute("dir", "ltr");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search transcript" }),
      { target: { value: "النموذج" } },
    );
    expect(
      screen.getByText("النموذج", { selector: "mark" }),
    ).toBeInTheDocument();
  });

  it("keeps an English transcript automatic when the summary language is Arabic", () => {
    renderResult(result, "Arabic");
    fireEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(screen.getByText("Try the first approach.")).toHaveAttribute(
      "dir",
      "auto",
    );
    expect(screen.getByText("Try the first approach.")).not.toHaveAttribute(
      "lang",
      "ar",
    );
  });
});

function renderResult(
  summary: SummaryResultData = result,
  requestedLanguage: SummaryLanguage = "English",
  initialEntries = ["/"],
) {
  return render(
    <ThemeProvider defaultTheme="light">
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <SummaryResult
            result={summary}
            sourceName="example.mp4"
            requestedLanguage={requestedLanguage}
          />
        </MemoryRouter>
      </NotificationProvider>
    </ThemeProvider>,
  );
}
