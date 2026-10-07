import { SUMMARY_LANGUAGES, type TimelineWindow } from "@l5sly/contracts";

export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

// Created once; building a formatter per library row is comparatively slow.
const createdAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatCreatedAt(createdAt: string): string {
  return createdAtFormatter.format(new Date(createdAt));
}

const languageNames = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
});

// Providers report the spoken language as a code ("en", "ar-EG") or as an
// English name ("english"). Show a readable name, or the fallback when unknown.
export function formatLanguageLabel(
  sourceLanguage: string,
  fallback: string,
): string {
  const language = sourceLanguage.trim();
  if (!language || language.toLocaleLowerCase() === "unknown") {
    return fallback;
  }

  const knownName = SUMMARY_LANGUAGES.find(
    (name) => name.toLocaleLowerCase() === language.toLocaleLowerCase(),
  );
  if (knownName) {
    return knownName;
  }

  // `of` throws for anything that is not a language tag, so only pass it the
  // two- or three-letter base code.
  const baseCode = language.split("-")[0] ?? language;
  if (/^[a-z]{2,3}$/i.test(baseCode)) {
    const displayName = languageNames.of(baseCode);
    if (displayName) {
      return displayName;
    }
  }
  return language.charAt(0).toLocaleUpperCase() + language.slice(1);
}

// Windows at or above this relevance count toward the time worth watching.
const FOCUS_RELEVANCE_THRESHOLD = 0.6;

export function calculateFocusSeconds(timeline: TimelineWindow[]): number {
  let total = 0;
  for (const window of timeline) {
    if (window.relevance >= FOCUS_RELEVANCE_THRESHOLD) {
      total += Math.max(0, window.endSeconds - window.startSeconds);
    }
  }
  return total;
}

interface ContentProps {
  dir: "rtl" | "auto";
  lang?: "ar";
}

// Arabic text needs RTL direction and the Arabic font; other text follows its content.
export function getContentProps(text: string): ContentProps {
  if (/\p{Script=Arabic}/u.test(text)) {
    return { dir: "rtl", lang: "ar" };
  }
  return { dir: "auto" };
}
