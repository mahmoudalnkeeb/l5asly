import type {
  RecommendedMoment,
  SummaryDepth,
  SummaryLanguage,
  SummaryNote,
  SummarySection,
  TranscriptSegment,
  WatchVerdict,
  ViewerProfile,
  PersonalizedGuidance,
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
  viewerProfile?: ViewerProfile;
}

export interface GeneratedSummary {
  title: string;
  overview: string;
  viewerAnswer: string;
  caveats: string[];
  sections: SummarySection[];
  notes: SummaryNote[];
  recommendedMoments: RecommendedMoment[];
  personalizedGuidance?: PersonalizedGuidance;
}

export interface VerdictInput {
  transcript: string;
  durationSeconds: number;
  expectation?: string;
  viewerProfile?: ViewerProfile;
  language?: SummaryLanguage;
}

export interface TranscriptionProvider {
  transcribe(
    input: MediaInput,
    language: SummaryLanguage,
  ): Promise<TranscriptionResult>;
}

export interface SummaryProvider {
  summarize(input: SummaryGenerationInput): Promise<GeneratedSummary>;
}

export interface VerdictProvider {
  decide(input: VerdictInput): Promise<WatchVerdict>;
}
