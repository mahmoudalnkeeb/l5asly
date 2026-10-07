import type { SummaryListItem } from "@l5asly/contracts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface TimeSaved {
  skippedVideos: number;
  savedSeconds: number;
}

// Counts the videos L5asly said to skip in the past seven days, and their full
// length as the time saved. Partial-watch verdicts are left out, because how
// much of those the viewer skipped isn't known.
export function calculateTimeSaved(
  recentSummaries: SummaryListItem[],
  now: Date,
): TimeSaved {
  const weekStart = now.getTime() - WEEK_MS;
  let skippedVideos = 0;
  let savedSeconds = 0;

  for (const summary of recentSummaries) {
    const isThisWeek = Date.parse(summary.createdAt) >= weekStart;
    const isSkip = summary.verdict?.recommendation === "skip";
    if (summary.status !== "completed" || !isThisWeek || !isSkip) {
      continue;
    }
    skippedVideos += 1;
    savedSeconds += summary.durationSeconds ?? 0;
  }

  return { skippedVideos, savedSeconds };
}

export function formatSavedTime(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}
