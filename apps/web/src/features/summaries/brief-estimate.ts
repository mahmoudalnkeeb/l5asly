import type { SummaryListItem } from "@l5asly/contracts";

// Fewer finished briefs than this say too little about how fast this
// installation is, so no estimate is shown.
const MIN_SAMPLES = 3;

// Seconds of processing per second of video, for each finished brief.
function getProcessingRatios(items: SummaryListItem[]): number[] {
  const ratios: number[] = [];
  for (const item of items) {
    if (item.status !== "completed" || !item.durationSeconds) {
      continue;
    }
    const processingMs =
      Date.parse(item.updatedAt) - Date.parse(item.createdAt);
    if (processingMs > 0) {
      ratios.push(processingMs / 1000 / item.durationSeconds);
    }
  }
  return ratios;
}

function getMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

// Estimates how long a brief of a video this long will take, from how long
// recent briefs took relative to their length. The median keeps one retried
// job, which counts its whole wait, from skewing the estimate.
export function estimateBriefSeconds(
  recentSummaries: SummaryListItem[],
  durationSeconds: number,
): number | null {
  const ratios = getProcessingRatios(recentSummaries);
  if (ratios.length < MIN_SAMPLES) {
    return null;
  }
  return Math.round(getMedian(ratios) * durationSeconds);
}

export function formatBriefEstimate(seconds: number): string {
  if (seconds < 60) {
    return "Brief in under a minute";
  }
  return `Brief in about ${Math.round(seconds / 60)} min`;
}
