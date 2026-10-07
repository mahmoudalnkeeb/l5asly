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

export function formatCreatedAt(value: string): string {
  return createdAtFormatter.format(new Date(value));
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
  const value = sourceLanguage.trim();
  if (!value || value.toLocaleLowerCase() === "unknown") {
    return fallback;
  }

  const knownName = SUMMARY_LANGUAGES.find(
    (language) => language.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
  if (knownName) {
    return knownName;
  }

  // `of` throws for anything that is not a language tag, so only pass it the
  // two- or three-letter base code.
  const baseCode = value.split("-")[0] ?? value;
  if (/^[a-z]{2,3}$/i.test(baseCode)) {
    const displayName = languageNames.of(baseCode);
    if (displayName) return displayName;
  }
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
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

// Arabic text needs RTL direction and the Arabic font; other text follows its content.
export function getContentProps(text: string): {
  dir: "rtl" | "auto";
  lang?: "ar";
} {
  if (/\p{Script=Arabic}/u.test(text)) {
    return { dir: "rtl", lang: "ar" };
  }
  return { dir: "auto" };
}
