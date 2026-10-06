import type { TranscriptSegment } from "@l5sly/contracts";

const MAX_COMBINED_CHARACTERS = 260;
const MAX_COMBINED_DURATION_SECONDS = 22;
const MAX_GAP_SECONDS = 1.25;
const MIN_COMPLETE_SEGMENT_CHARACTERS = 24;

export function compactTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const compacted: TranscriptSegment[] = [];

  for (const segment of segments) {
    const current = compacted.at(-1);
    if (!current || !shouldMerge(current, segment)) {
      compacted.push({ ...segment, text: segment.text.trim() });
      continue;
    }

    current.endSeconds = segment.endSeconds;
    current.text = `${current.text} ${segment.text.trim()}`;
  }

  return compacted;
}

function shouldMerge(current: TranscriptSegment, next: TranscriptSegment): boolean {
  const gap = next.startSeconds - current.endSeconds;
  const combinedDuration = next.endSeconds - current.startSeconds;
  const combinedCharacters = current.text.length + next.text.length + 1;
  const hasSameSpeaker = current.speaker === next.speaker;
  const hasCompleteThought = current.text.length >= MIN_COMPLETE_SEGMENT_CHARACTERS
    && /[.!?]["')\]]?$/u.test(current.text.trim());

  return hasSameSpeaker
    && gap <= MAX_GAP_SECONDS
    && combinedDuration <= MAX_COMBINED_DURATION_SECONDS
    && combinedCharacters <= MAX_COMBINED_CHARACTERS
    && !hasCompleteThought;
}

const MAX_TIMELINE_WINDOWS = 12;
const MIN_TIMELINE_WINDOW_SECONDS = 60;

export interface TranscriptWindow {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

// Splits the transcript into evenly timed windows so each can be scored for relevance.
// Windows without speech keep empty text so the timeline still covers the full video.
export function buildTranscriptWindows(
  segments: TranscriptSegment[],
  durationSeconds: number,
): TranscriptWindow[] {
  const lastEnd = segments.at(-1)?.endSeconds ?? 0;
  const totalSeconds = Math.max(durationSeconds, lastEnd);
  if (totalSeconds <= 0 || segments.length === 0) {
    return [];
  }

  const windowCount = Math.min(
    MAX_TIMELINE_WINDOWS,
    Math.max(1, Math.floor(totalSeconds / MIN_TIMELINE_WINDOW_SECONDS)),
  );
  const windowSeconds = totalSeconds / windowCount;
  const windows: TranscriptWindow[] = [];
  for (let index = 0; index < windowCount; index += 1) {
    windows.push({
      startSeconds: Math.round(index * windowSeconds),
      endSeconds: Math.round((index + 1) * windowSeconds),
      text: "",
    });
  }

  for (const segment of segments) {
    const index = Math.min(
      windowCount - 1,
      Math.floor(segment.startSeconds / windowSeconds),
    );
    const window = windows[index];
    if (window) {
      window.text = window.text ? `${window.text} ${segment.text}` : segment.text;
    }
  }

  return windows;
}
