import type {
  SummaryLanguage,
  TimelineWindow,
  WatchVerdict,
} from "@l5sly/contracts";

import type {
  GeneratedSummary,
  GroundingInput,
  InsightProvider,
  MediaInput,
  PrecheckInput,
  SectionSupport,
  TimelineInput,
  SummaryGenerationInput,
  SummaryProvider,
  TranscriptionProvider,
  TranscriptionResult,
  VerdictInput,
  VerdictProvider,
  VideoMetadata,
  VideoMetadataSource,
} from "../provider-contracts.js";
import { buildTranscriptWindows } from "../shared/transcript-segments.js";
import { buildWatchVerdict } from "../shared/watch-verdict.js";

const sampleTranscript: TranscriptionResult = {
  text: [
    "We tend to talk about AI as a production tool, but production is only one part of creative work.",
    "The bottleneck moves from making a version to judging whether that version says something worth keeping.",
    "Let the system create breadth. Give a person the responsibility to narrow it with a clear standard.",
    "Small teams should measure what they learned from exploration, not simply how many assets they produced.",
    "The advantage is not infinite output. It is reaching a considered answer with less wasted motion.",
  ].join(" "),
  segments: [
    {
      startSeconds: 0,
      endSeconds: 318,
      text: "We tend to talk about AI as a production tool, but production is only one part of creative work.",
    },
    {
      startSeconds: 318,
      endSeconds: 584,
      text: "The bottleneck moves from making a version to judging whether that version says something worth keeping.",
    },
    {
      startSeconds: 584,
      endSeconds: 846,
      text: "Let the system create breadth. Give a person the responsibility to narrow it with a clear standard.",
    },
    {
      startSeconds: 846,
      endSeconds: 1040,
      text: "Small teams should measure what they learned from exploration, not simply how many assets they produced.",
    },
    {
      startSeconds: 1040,
      endSeconds: 1122,
      text: "The advantage is not infinite output. It is reaching a considered answer with less wasted motion.",
    },
  ],
  durationSeconds: 1122,
  detectedLanguage: "en",
};

async function simulateProviderDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 450));
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(
    _input: MediaInput,
    language: SummaryLanguage,
  ): Promise<TranscriptionResult> {
    await simulateProviderDelay();
    if (language === "Arabic") {
      const lines = [
        "الذكاء الاصطناعي أداة للإنتاج، لكن الإنتاج ليس كل العمل الإبداعي.",
        "التحدي هو الحكم على جودة الفكرة واختيار ما يستحق الاحتفاظ به.",
        "استخدم النظام لاقتراح عدة اتجاهات، ثم اختر وفق معيار واضح.",
        "على الفرق الصغيرة قياس ما تعلمته، وليس عدد المواد المنتجة.",
        "الفائدة هي الوصول لإجابة مدروسة مع تقليل العمل الضائع.",
      ];
      return {
        ...sampleTranscript,
        text: lines.join(" "),
        detectedLanguage: "ar",
        segments: sampleTranscript.segments.map((segment, index) => ({
          ...segment,
          text: lines[index] ?? lines[0] ?? "",
        })),
      };
    }
    return sampleTranscript;
  }
}

export class MockSummaryProvider implements SummaryProvider {
  async summarize(input: SummaryGenerationInput): Promise<GeneratedSummary> {
    await simulateProviderDelay();
    const audienceContext = input.expectation
      ? `The viewer asked: ${input.expectation}`
      : "The viewer did not provide a specific learning goal.";

    const personalizedGuidance = {
      relevance: input.viewerProfile?.goals
        ? `Consider this workflow against your goal: ${input.viewerProfile.goals}`
        : "Use the workflow to evaluate AI-generated options, not just produce more of them.",
      prerequisites: [],
      nextSteps: [
        "Write one quality standard and use it to review a small set of generated options.",
      ],
    };
    if (input.language === "Arabic") {
      return {
        title: "العمل الإبداعي في عصر الذكاء الاصطناعي",
        overview: "تزداد أهمية الذوق والحكم عندما يصبح إنتاج الأفكار أسرع.",
        viewerAnswer: input.expectation
          ? `طلبت معرفة: ${input.expectation}. يوضح هذا المثال أهمية معيار واضح لتقييم العمل.`
          : "استخدم الذكاء الاصطناعي لتوسيع الخيارات، ثم قيّمها بمعيار واضح.",
        caveats: ["هذا مثال تجريبي لعرض المنتج، وليس تحليلاً للفيديو المدخل."],
        sections: [
          {
            title: "تحديد الجودة",
            body: "حدد معياراً واضحاً للعمل الجيد قبل توليد الخيارات.",
          },
          {
            title: "اختيار اتجاه",
            body: "ولّد عدة اتجاهات، ثم اختر أفضلها وفق المعيار.",
          },
        ],
        notes: [
          {
            category: "طريقة",
            title: "معيار الجودة",
            detail: "معيار واضح أفضل من إنتاج خيارات بلا نهاية.",
          },
          {
            category: "فريق",
            title: "مسؤولية التحرير",
            detail: "يحتاج الاختيار النهائي إلى مسؤول واضح.",
          },
          {
            category: "قياس",
            title: "التعلم",
            detail: "قِس ما تعلمه الفريق بدلاً من عدد المخرجات.",
          },
        ],
        recommendedMoments: [
          {
            startSeconds: 584,
            title: "اختيار الاتجاه",
            reason: "يوضح طريقة عملية لتقييم الخيارات.",
          },
        ],
        personalizedGuidance: {
          relevance: input.viewerProfile?.goals
            ? `اربط هذا الأسلوب بهدفك: ${input.viewerProfile.goals}`
            : "يفيدك هذا الأسلوب في تقييم الخيارات بدلاً من زيادة الإنتاج فقط.",
          prerequisites: [],
          nextSteps: [
            "اكتب معياراً للجودة ثم استخدمه لتقييم مجموعة صغيرة من الخيارات.",
          ],
        },
      };
    }

    return {
      personalizedGuidance,
      title: "How creative work survives the age of AI",
      overview:
        "AI changes the cost of making things, but it does not remove the need for taste, judgment, or a clear point of view.",
      viewerAnswer: audienceContext,
      caveats: [
        "This sample demonstrates the product flow and is not an independently verified analysis.",
      ],
      sections: [
        {
          title: "The value moves upstream",
          body: "When production becomes faster, choosing what deserves to exist becomes more important. Teams should define quality before generation begins.",
        },
        {
          title: "Small teams gain leverage",
          body: "A small team can explore more directions without expanding headcount when AI handles repetitive production and people own the final decision.",
        },
        {
          title: "A practical operating model",
          body: "Write a standard for good work, generate several approaches, compare them against the standard, and keep one person responsible for the final edit.",
        },
      ],
      notes: [
        {
          category: "Strategy",
          title: "Define quality before prompting",
          detail:
            "A clear review standard produces better output than a longer prompt.",
        },
        {
          category: "Workflow",
          title: "Generate wide, edit narrow",
          detail:
            "Use AI for breadth, then make fewer and sharper human decisions.",
        },
        {
          category: "Team",
          title: "Keep one accountable editor",
          detail:
            "Shared generation still needs clear ownership of the final result.",
        },
        {
          category: "Measure",
          title: "Track learning, not volume",
          detail:
            "More options help only when the team learns which choices work.",
        },
        {
          category: "Context",
          title: "Connect the brief to the goal",
          detail: audienceContext,
        },
      ],
      recommendedMoments: [
        {
          startSeconds: 318,
          title: "Why judgment becomes the bottleneck",
          reason: "This section explains the central argument.",
        },
        {
          startSeconds: 584,
          title: "A workflow for AI-assisted exploration",
          reason: "This is the most practical part of the talk.",
        },
        {
          startSeconds: 846,
          title: "What small teams should measure",
          reason: "This section turns the idea into a useful team metric.",
        },
      ],
    };
  }
}

export class MockVerdictProvider implements VerdictProvider {
  async decide(input: VerdictInput): Promise<WatchVerdict> {
    await simulateProviderDelay();
    const hasExpectation = Boolean(input.expectation?.trim());
    const signals = {
      answersQuestion: hasExpectation ? 0.7 : null,
      informationDensity: 0.7,
      padding: 0.3,
      knowledgeGap: 0.2,
    };

    if (input.language === "Arabic") {
      return {
        recommendation: "watch-key-moments",
        confidence: hasExpectation ? 0.84 : 0.72,
        headline: "شاهد المقاطع المهمة",
        reason:
          "ابدأ بالمقاطع المقترحة لفهم طريقة تقييم الخيارات. هذا حكم تجريبي لعرض المنتج.",
        signals,
      };
    }

    return {
      recommendation: "watch-key-moments",
      confidence: hasExpectation ? 0.84 : 0.72,
      headline: "Watch the key chapters",
      reason: hasExpectation
        ? "The recommended sections directly address your goal. The opening can be skipped."
        : "The middle of the video contains the strongest practical ideas. The opening repeats familiar context.",
      signals,
    };
  }
}

// Deterministic relevance curve: weak opening, strongest middle, softer close.
const MOCK_RELEVANCE_CURVE = [0.2, 0.55, 0.9, 0.85, 0.6, 0.35];

export class MockInsightProvider implements InsightProvider {
  async scoreTimeline(input: TimelineInput): Promise<TimelineWindow[]> {
    await simulateProviderDelay();
    const windows = buildTranscriptWindows(
      input.segments,
      input.durationSeconds,
    );
    return windows.map((window, index) => {
      const curveIndex = Math.floor(
        (index / windows.length) * MOCK_RELEVANCE_CURVE.length,
      );
      return {
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
        relevance: window.text ? (MOCK_RELEVANCE_CURVE[curveIndex] ?? 0.5) : 0,
      };
    });
  }

  async checkGrounding(input: GroundingInput): Promise<SectionSupport[]> {
    await simulateProviderDelay();
    return input.sections.map(() => "supported");
  }

  async precheck(input: PrecheckInput): Promise<WatchVerdict> {
    await simulateProviderDelay();
    const hasExpectation = Boolean(input.expectation?.trim());
    return buildWatchVerdict(
      {
        watchProbability: 0.55,
        relevance: 0.6,
        signals: {
          answersQuestion: hasExpectation ? 0.5 : null,
          informationDensity: 0.7,
          padding: 0.7,
          knowledgeGap: 0.2,
        },
      },
      input.language,
    );
  }
}

export class MockVideoMetadataSource implements VideoMetadataSource {
  async fetchMetadata(_url: string): Promise<VideoMetadata> {
    await simulateProviderDelay();
    return {
      title: "How creative work survives the age of AI",
      channel: "Sample channel",
      durationSeconds: sampleTranscript.durationSeconds,
      description:
        "A talk about using AI for breadth while keeping human judgment for the final edit.",
      chapters: [
        { title: "Introduction", startSeconds: 0 },
        { title: "Judgment is the bottleneck", startSeconds: 318 },
        { title: "A practical workflow", startSeconds: 584 },
      ],
    };
  }
}
