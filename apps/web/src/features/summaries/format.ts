import type { TimelineWindow } from "@l5sly/contracts";

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

export function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
