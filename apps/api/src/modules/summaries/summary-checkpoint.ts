import { z } from "zod";
import {
  summaryResultSchema,
  timelineWindowSchema,
  transcriptSegmentSchema,
  watchVerdictSchema,
} from "@l5sly/contracts";

const generatedSummarySchema = summaryResultSchema.pick({
  title: true,
  overview: true,
  viewerAnswer: true,
  caveats: true,
  sections: true,
  notes: true,
  recommendedMoments: true,
  personalizedGuidance: true,
});

export const summaryCheckpointSchema = z.object({
  preparedMedia: z
    .object({
      path: z.string().min(1),
      mimeType: z.string().min(1),
      shouldDelete: z.boolean(),
      additionalPaths: z.array(z.string()).optional(),
    })
    .optional(),
  mediaExpiresAt: z.iso.datetime().optional(),
  transcription: z
    .object({
      text: z.string().min(1),
      segments: z.array(transcriptSegmentSchema).min(1),
      durationSeconds: z.number().nonnegative(),
      detectedLanguage: z.string().min(1),
    })
    .optional(),
  summary: generatedSummarySchema.optional(),
  verdict: watchVerdictSchema.optional(),
  timeline: z.array(timelineWindowSchema).optional(),
});

export type SummaryCheckpoint = z.infer<typeof summaryCheckpointSchema>;
export const RETRY_MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000;
