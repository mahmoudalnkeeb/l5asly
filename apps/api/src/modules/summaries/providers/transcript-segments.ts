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
