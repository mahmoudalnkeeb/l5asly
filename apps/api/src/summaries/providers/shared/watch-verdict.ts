import type {
  SummaryLanguage,
  VerdictSignals,
  WatchVerdict,
} from "@l5sly/contracts";

export interface VerdictScores {
  watchProbability: number;
  // How directly the video addresses the viewer goal, from 0 to 1.
  relevance: number;
  signals: VerdictSignals;
}

const UNANSWERED_QUESTION_THRESHOLD = 0.25;
const HIGH_SIGNAL = 0.65;
const LOW_SIGNAL = 0.35;
const MAX_REASON_SENTENCES = 3;

export function buildWatchVerdict(
  scores: VerdictScores,
  language: SummaryLanguage,
): WatchVerdict {
  const isArabic = language === "Arabic";
  const { watchProbability, relevance, signals } = scores;

  if (
    signals.answersQuestion !== null &&
    signals.answersQuestion < UNANSWERED_QUESTION_THRESHOLD
  ) {
    return {
      recommendation: "skip",
      confidence: 1 - signals.answersQuestion,
      headline: isArabic
        ? "الفيديو لا يجيب عن سؤالك"
        : "This video doesn't answer your question",
      reason: describeSignals(signals, language, "skip"),
      signals,
    };
  }

  if (watchProbability >= 0.72 && relevance >= 0.675) {
    return {
      recommendation: "watch",
      confidence: watchProbability,
      headline: isArabic ? "الفيديو يستحق المشاهدة" : "This is worth watching",
      reason: describeSignals(signals, language, "watch"),
      signals,
    };
  }

  if (watchProbability >= 0.4 || relevance >= 0.4) {
    return {
      recommendation: "watch-key-moments",
      confidence: Math.max(watchProbability, relevance),
      headline: isArabic ? "شاهد المقاطع المهمة" : "Watch the key chapters",
      reason: describeSignals(signals, language, "watch-key-moments"),
      signals,
    };
  }

  return {
    recommendation: "skip",
    confidence: 1 - watchProbability,
    headline: isArabic ? "اكتفِ بالملخص" : "Read the brief instead",
    reason: describeSignals(signals, language, "skip"),
    signals,
  };
}

function describeSignals(
  signals: VerdictSignals,
  language: SummaryLanguage,
  recommendation: WatchVerdict["recommendation"],
): string {
  const text = language === "Arabic" ? arabicText : englishText;
  const sentences: string[] = [];

  if (signals.answersQuestion !== null) {
    if (signals.answersQuestion >= HIGH_SIGNAL) {
      sentences.push(text.answersQuestion);
    } else if (signals.answersQuestion < LOW_SIGNAL) {
      sentences.push(text.missesQuestion);
    } else {
      sentences.push(text.partlyAnswersQuestion);
    }
  }
  if (signals.informationDensity >= HIGH_SIGNAL) {
    sentences.push(text.dense);
  } else if (signals.informationDensity < LOW_SIGNAL) {
    sentences.push(text.thin);
  }
  if (signals.padding >= HIGH_SIGNAL) {
    sentences.push(text.padded);
  }
  if (signals.knowledgeGap >= HIGH_SIGNAL) {
    sentences.push(text.knowledgeGap);
  }

  if (sentences.length === 0) {
    return text.fallback[recommendation];
  }
  return sentences.slice(0, MAX_REASON_SENTENCES).join(" ");
}

const englishText = {
  answersQuestion: "It directly answers your question.",
  partlyAnswersQuestion: "It only partly answers your question.",
  missesQuestion: "It does not appear to answer your question.",
  dense: "The content is dense with useful detail.",
  thin: "Much of it is light on concrete detail.",
  padded: "Expect a lot of intro, filler or repetition.",
  knowledgeGap: "It assumes background you may not have yet.",
  fallback: {
    watch:
      "The video closely matches your goal and sustains enough useful detail to justify the full runtime.",
    "watch-key-moments":
      "The video contains useful sections, but you can skip the surrounding context and focus on the recommended moments.",
    skip: "The video does not match your goal closely enough to justify the full runtime.",
  },
};

const arabicText: typeof englishText = {
  answersQuestion: "يجيب الفيديو عن سؤالك بشكل مباشر.",
  partlyAnswersQuestion: "يجيب الفيديو عن سؤالك جزئياً فقط.",
  missesQuestion: "لا يبدو أن الفيديو يجيب عن سؤالك.",
  dense: "المحتوى غني بالتفاصيل المفيدة.",
  thin: "جزء كبير من المحتوى يفتقر إلى تفاصيل عملية.",
  padded: "توقع مقدمات طويلة أو حشواً أو تكراراً.",
  knowledgeGap: "يفترض الفيديو معرفة مسبقة قد لا تتوفر لديك بعد.",
  fallback: {
    watch: "الفيديو مرتبط بهدفك ويحتوي على تفاصيل مفيدة تستحق وقت المشاهدة.",
    "watch-key-moments":
      "بعض المقاطع مرتبطة بهدفك؛ يمكنك التركيز على اللحظات الموصى بها وتجاوز بقية السياق.",
    skip: "الفيديو غير مرتبط بهدفك بما يكفي لتبرير مشاهدة مدته كاملة.",
  },
};
