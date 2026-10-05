import { z } from "zod";

export const SUMMARY_LANGUAGES = ["English", "Arabic", "French", "Spanish"] as const;
export const SUMMARY_DEPTHS = ["quick", "detailed", "study"] as const;
export const JOB_STATUSES = ["queued", "processing", "completed", "failed", "cancelled"] as const;
export const MAX_EXPECTATION_LENGTH = 240;

export const summaryLanguageSchema = z.enum(SUMMARY_LANGUAGES);
export const summaryDepthSchema = z.enum(SUMMARY_DEPTHS);
export const jobStatusSchema = z.enum(JOB_STATUSES);

export const summaryOptionsSchema = z.object({
  language: summaryLanguageSchema,
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

export const createUrlSummarySchema = summaryOptionsSchema.extend({
  url: z
    .url()
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "Only HTTP and HTTPS video URLs are supported.",
    ),
}).superRefine((input, context) => {
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

export const watchVerdictSchema = z.object({
  recommendation: z.enum(["watch", "watch-key-moments", "skip"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().min(1),
  reason: z.string().min(1),
});

export const summaryResultSchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  viewerAnswer: z.string().min(1).default("The summary above contains the main takeaway."),
  caveats: z.array(z.string().min(1)).max(4).default([]),
  sections: z.array(summarySectionSchema).min(1),
  notes: z.array(summaryNoteSchema).min(1),
  recommendedMoments: z.array(recommendedMomentSchema),
  transcript: z.array(transcriptSegmentSchema).min(1),
  verdict: watchVerdictSchema,
  durationSeconds: z.number().nonnegative(),
  sourceLanguage: z.string().min(1),
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const summaryListItemSchema = summaryJobSchema.pick({
  id: true,
  status: true,
  source: true,
  progress: true,
  stage: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().nullable(),
  verdict: watchVerdictSchema.nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
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
export type CreateUrlSummaryInput = z.infer<typeof createUrlSummarySchema>;
export type SummarySection = z.infer<typeof summarySectionSchema>;
export type SummaryNote = z.infer<typeof summaryNoteSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type RecommendedMoment = z.infer<typeof recommendedMomentSchema>;
export type WatchVerdict = z.infer<typeof watchVerdictSchema>;
export type SummaryResult = z.infer<typeof summaryResultSchema>;
export type SummaryJob = z.infer<typeof summaryJobSchema>;
export type SummaryListItem = z.infer<typeof summaryListItemSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: ApiError;
}
