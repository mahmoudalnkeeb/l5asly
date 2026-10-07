import type {
  RecommendedMoment,
  SummaryDepth,
  SummaryLanguage,
  SummaryNote,
  SummarySection,
  TimelineWindow,
  TranscriptSegment,
  WatchVerdict,
  ViewerProfile,
  PersonalizedGuidance,
} from "@l5asly/contracts";

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

// The provider contracts are abstract classes so they can serve as injection tokens.
export abstract class TranscriptionProvider {
  abstract transcribe(
    input: MediaInput,
    language: SummaryLanguage,
  ): Promise<TranscriptionResult>;
}

export abstract class SummaryProvider {
  abstract summarize(input: SummaryGenerationInput): Promise<GeneratedSummary>;
}

export abstract class VerdictProvider {
  abstract decide(input: VerdictInput): Promise<WatchVerdict>;
}

export interface TimelineInput {
  segments: TranscriptSegment[];
  durationSeconds: number;
  expectation?: string;
  viewerProfile?: ViewerProfile;
}

export type SectionSupport = NonNullable<SummarySection["support"]>;

export interface GroundingInput {
  transcript: string;
  sections: SummarySection[];
}

export interface VideoMetadata {
  title: string;
  channel: string | null;
  durationSeconds: number | null;
  description: string;
  chapters: Array<{ title: string; startSeconds: number }>;
  thumbnailUrl: string | null;
  // The language code YouTube reports for the video, such as "en" or "ar-EG".
  languageCode: string | null;
}

export interface PrecheckInput {
  metadata: VideoMetadata;
  expectation?: string;
  viewerProfile?: ViewerProfile;
  language: SummaryLanguage;
}

// Optional enrichment on top of the core pipeline. Failures here never fail a job.
export abstract class InsightProvider {
  abstract scoreTimeline(input: TimelineInput): Promise<TimelineWindow[]>;
  // Returns null when the transcript is too long to check reliably.
  abstract checkGrounding(input: GroundingInput): Promise<SectionSupport[] | null>;
  abstract precheck(input: PrecheckInput): Promise<WatchVerdict>;
}

export abstract class VideoMetadataSource {
  abstract fetchMetadata(url: string): Promise<VideoMetadata>;
}
