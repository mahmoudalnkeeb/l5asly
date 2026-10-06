import { z } from "zod";

export const SUMMARY_LANGUAGES = ["English", "Arabic"] as const;
export const SUMMARY_DEPTHS = ["quick", "detailed", "study"] as const;
export const JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export const MAX_EXPECTATION_LENGTH = 240;

export const summaryLanguageSchema = z.enum(SUMMARY_LANGUAGES);
export const summaryDepthSchema = z.enum(SUMMARY_DEPTHS);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const jobStepSchema = z.enum(["media", "transcription", "summary"]);
export const retryInfoSchema = z.object({
  fromStep: jobStepSchema,
  requiresUpload: z.boolean(),
  reason: z.string(),
});

export const viewerProfileSchema = z.object({
  background: z.string().trim().max(500),
  knowledge: z.string().trim().max(1000),
  goals: z.string().trim().max(1000),
  preferences: z.string().trim().max(500),
});

export const summaryOptionsSchema = z.object({
  language: summaryLanguageSchema,
  sourceLanguage: summaryLanguageSchema.optional(),
  viewerProfile: viewerProfileSchema.optional(),
  depth: summaryDepthSchema,
  expectation: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().max(MAX_EXPECTATION_LENGTH).optional(),
  ),
});

const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

function parseHttpUrl(value: string): URL | undefined {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return url;
}

export function isYouTubeHostname(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return YOUTUBE_HOSTNAMES.has(hostname);
}

export function isYouTubeUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!YOUTUBE_HOSTNAMES.has(hostname)) {
    return false;
  }

  if (hostname === "youtu.be") {
    return url.pathname.length > 1;
  }

  if (url.pathname === "/watch") {
    return Boolean(url.searchParams.get("v"));
  }

  return /^\/(?:shorts|live|embed)\/[^/]+/.test(url.pathname);
}

export const createUrlSummarySchema = summaryOptionsSchema
  .extend({
    url: z
      .url()
      .refine(
        (value) => value.startsWith("http://") || value.startsWith("https://"),
        "Only HTTP and HTTPS video URLs are supported.",
      ),
  })
  .superRefine((input, context) => {
    if (isYouTubeHostname(input.url) && !isYouTubeUrl(input.url)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Enter a valid YouTube video URL.",
      });
    }
  });

export const summarySectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  // Set by the grounding check. Absent when the check was skipped or failed.
  support: z.enum(["supported", "unsupported"]).optional(),
});

export const summaryNoteSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
});

export const transcriptSegmentSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string().min(1),
  speaker: z.number().int().nonnegative().optional(),
});

export const recommendedMomentSchema = z.object({
  startSeconds: z.number().nonnegative(),
  title: z.string().min(1),
  reason: z.string().min(1),
});

const probabilitySchema = z.number().min(0).max(1);

export const verdictSignalsSchema = z.object({
  // Null when the viewer did not ask a question for this video.
  answersQuestion: probabilitySchema.nullable(),
  informationDensity: probabilitySchema,
  padding: probabilitySchema,
  knowledgeGap: probabilitySchema,
});

export const watchVerdictSchema = z.object({
  recommendation: z.enum(["watch", "watch-key-moments", "skip"]),
  confidence: probabilitySchema,
  headline: z.string().min(1),
  reason: z.string().min(1),
  signals: verdictSignalsSchema.optional(),
});

export const timelineWindowSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  relevance: probabilitySchema,
});

export const personalizedGuidanceSchema = z.object({
  relevance: z.string().min(1),
  prerequisites: z
    .array(
      z.object({
        topic: z.string().min(1),
        reason: z.string().min(1),
        status: z.enum(["already-known", "learn-first"]),
      }),
    )
    .max(6),
  nextSteps: z.array(z.string().min(1)).max(4),
});

export const summaryResultSchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  viewerAnswer: z
    .string()
    .min(1)
    .default("The summary above contains the main takeaway."),
  caveats: z.array(z.string().min(1)).max(4).default([]),
  sections: z.array(summarySectionSchema),
  notes: z.array(summaryNoteSchema),
  recommendedMoments: z.array(recommendedMomentSchema),
  transcript: z.array(transcriptSegmentSchema).min(1),
  verdict: watchVerdictSchema,
  durationSeconds: z.number().nonnegative(),
  sourceLanguage: z.string().min(1),
  personalizedGuidance: personalizedGuidanceSchema.optional(),
  timeline: z.array(timelineWindowSchema).optional(),
});

export const summaryJobSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  source: z.object({
    type: z.enum(["upload", "url"]),
    name: z.string().min(1),
  }),
  options: summaryOptionsSchema,
  progress: z.number().int().min(0).max(100),
  stage: z.string().min(1),
  result: summaryResultSchema.nullable(),
  error: z.string().nullable(),
  failedStep: jobStepSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorDetails: z.record(z.string(), z.array(z.string())).optional(),
  retryInfo: retryInfoSchema.optional(),
  attempt: z.number().int().positive().optional(),
  stageStartedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const summaryListItemSchema = summaryJobSchema
  .pick({
    id: true,
    status: true,
    source: true,
    progress: true,
    stage: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().nullable(),
    verdict: watchVerdictSchema.nullable(),
    durationSeconds: z.number().nonnegative().nullable(),
  });

export const precheckRequestSchema = z
  .object({
    url: z.url(),
    language: summaryLanguageSchema,
    viewerProfile: viewerProfileSchema.optional(),
    expectation: summaryOptionsSchema.shape.expectation,
  })
  .refine((input) => isYouTubeUrl(input.url), {
    path: ["url"],
    message: "Quick checks are available for YouTube links only.",
  });

export const precheckResultSchema = z.object({
  title: z.string().min(1),
  channel: z.string().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  verdict: watchVerdictSchema,
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.string(), z.array(z.string())).optional(),
});

export type SummaryLanguage = z.infer<typeof summaryLanguageSchema>;
export type SummaryDepth = z.infer<typeof summaryDepthSchema>;
export type SummaryOptions = z.infer<typeof summaryOptionsSchema>;
export type ViewerProfile = z.infer<typeof viewerProfileSchema>;
export type PersonalizedGuidance = z.infer<typeof personalizedGuidanceSchema>;
export type CreateUrlSummaryInput = z.infer<typeof createUrlSummarySchema>;
export type SummarySection = z.infer<typeof summarySectionSchema>;
export type SummaryNote = z.infer<typeof summaryNoteSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type RecommendedMoment = z.infer<typeof recommendedMomentSchema>;
export type WatchVerdict = z.infer<typeof watchVerdictSchema>;
export type VerdictSignals = z.infer<typeof verdictSignalsSchema>;
export type TimelineWindow = z.infer<typeof timelineWindowSchema>;
export type PrecheckRequest = z.infer<typeof precheckRequestSchema>;
export type PrecheckResult = z.infer<typeof precheckResultSchema>;
export type SummaryResult = z.infer<typeof summaryResultSchema>;
export type SummaryJob = z.infer<typeof summaryJobSchema>;
export type JobStep = z.infer<typeof jobStepSchema>;
export type RetryInfo = z.infer<typeof retryInfoSchema>;
export type SummaryListItem = z.infer<typeof summaryListItemSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: ApiError;
}
