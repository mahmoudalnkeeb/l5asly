import type {
  PersonalizedGuidance,
  RecommendedMoment,
  SummaryNote,
  SummarySection,
} from "@l5sly/contracts";

import type {
  GeneratedSummary,
  SummaryGenerationInput,
} from "../provider-contracts.js";
import { getSummaryOutputLimits } from "./summary-prompt.js";

interface DraftRecommendedMoment extends RecommendedMoment {
  evidenceText?: string;
}

interface SummaryDraft {
  title: string;
  overview: string;
  viewerAnswer?: string;
  caveats: string[];
  sections: SummarySection[];
  notes: SummaryNote[];
  recommendedMoments: DraftRecommendedMoment[];
  personalizedGuidance?: PersonalizedGuidance;
}

export function finalizeGeneratedSummary(
  draft: SummaryDraft,
  input: SummaryGenerationInput,
): GeneratedSummary {
  const limits = getSummaryOutputLimits(input);

  return {
    title: draft.title,
    personalizedGuidance: draft.personalizedGuidance,
    overview: draft.overview,
    viewerAnswer: draft.viewerAnswer?.trim() || draft.overview,
    caveats: uniqueStrings(draft.caveats).slice(0, 4),
    sections: draft.sections.slice(0, limits.sections),
    notes: draft.notes.slice(0, limits.notes),
    recommendedMoments: groundMoments(
      draft.recommendedMoments,
      input,
      limits.moments,
    ),
  };
}

function groundMoments(
  moments: DraftRecommendedMoment[],
  input: SummaryGenerationInput,
  limit: number,
): RecommendedMoment[] {
  if (!input.transcript.segments.length) {
    return [];
  }

  const grounded: RecommendedMoment[] = [];
  const orderedMoments = [...moments].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  );

  for (const moment of orderedMoments) {
    if (!moment.evidenceText) {
      continue;
    }

    const anchoredStart = findEvidenceStart(
      moment.evidenceText,
      input.transcript.segments,
    );
    if (
      anchoredStart === undefined ||
      anchoredStart > input.transcript.durationSeconds
    ) {
      continue;
    }

    if (grounded.some((existing) => existing.startSeconds === anchoredStart)) {
      continue;
    }

    grounded.push({
      startSeconds: anchoredStart,
      title: moment.title,
      reason: moment.reason,
    });
  }

  grounded.sort((left, right) => left.startSeconds - right.startSeconds);
  return selectEvenly(grounded, limit);
}

function findEvidenceStart(
  evidenceText: string,
  segments: SummaryGenerationInput["transcript"]["segments"],
): number | undefined {
  const normalizedEvidence = normalizeForMatching(evidenceText);
  if (!normalizedEvidence) {
    return undefined;
  }

  return segments.find((segment) =>
    normalizeForMatching(segment.text).includes(normalizedEvidence),
  )?.startSeconds;
}

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function selectEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }

  if (limit === 1) {
    return [items[0]].filter((item): item is T => item !== undefined);
  }

  const selected: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    const itemIndex = Math.round((index * (items.length - 1)) / (limit - 1));
    const item = items[itemIndex];
    if (item !== undefined) {
      selected.push(item);
    }
  }

  return selected;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}
