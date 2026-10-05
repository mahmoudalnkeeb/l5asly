import type {
  RecommendedMoment,
  SummaryDepth,
  SummaryLanguage,
  SummaryNote,
  SummarySection,
  TranscriptSegment,
  WatchVerdict,
} from "@l5sly/contracts";

export type MediaInput =
  | {
      kind: "file";
      path: string;
      mimeType: string;
    }
  | {
      kind: "url";
      url: string;
    };

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  durationSeconds: number;
  detectedLanguage: string;
}

export interface SummaryGenerationInput {
  transcript: TranscriptionResult;
  language: SummaryLanguage;
  depth: SummaryDepth;
  expectation?: string;
}

export interface GeneratedSummary {
  title: string;
  overview: string;
  viewerAnswer: string;
  caveats: string[];
  sections: SummarySection[];
  notes: SummaryNote[];
  recommendedMoments: RecommendedMoment[];
}

export interface VerdictInput {
  transcript: string;
  durationSeconds: number;
  expectation?: string;
}

export interface TranscriptionProvider {
  transcribe(input: MediaInput): Promise<TranscriptionResult>;
}

export interface SummaryProvider {
  summarize(input: SummaryGenerationInput): Promise<GeneratedSummary>;
}

export interface VerdictProvider {
  decide(input: VerdictInput): Promise<WatchVerdict>;
}
