import { z } from "zod";

import {
  personalizedGuidanceSchema,
  recommendedMomentSchema,
  summaryNoteSchema,
  summarySectionSchema,
} from "@l5sly/contracts";

// Structured output requires every key. Empty lists and null guidance represent absence.
export const summaryOutputSchema = z.strictObject({
  title: z.string().min(1).describe("Concise title for the relevant subject."),
  overview: z
    .string()
    .min(1)
    .describe("Brief context, not a duplicate of the answer."),
  viewerAnswer: z
    .string()
    .min(1)
    .describe(
      "A direct, grounded answer customized to the supplied question and profile.",
    ),
  caveats: z
    .array(z.string().min(1))
    .max(4)
    .describe(
      "Plain-text limitations. Each entry must be a string, never an object. Use [] when none are justified.",
    ),
  sections: z
    .array(summarySectionSchema.pick({ title: true, body: true }).strict())
    .describe("Relevant key points. Use [] when no points are supported."),
  notes: z
    .array(summaryNoteSchema.strict())
    .describe("Useful source notes. Use [] when unnecessary."),
  recommendedMoments: z
    .array(
      recommendedMomentSchema
        .extend({
          evidenceText: z
            .string()
            .min(1)
            .describe(
              "An exact original-language excerpt from one transcript line; never translated.",
            ),
        })
        .strict(),
    )
    .describe(
      "Only transcript-grounded moments. Use [] when none are supported.",
    ),
  personalizedGuidance: personalizedGuidanceSchema
    .extend({
      relevance: personalizedGuidanceSchema.shape.relevance.describe(
        "One sentence explaining why this video matters for the viewer's question and goals; not a single word such as 'high'.",
      ),
      prerequisites: z
        .array(personalizedGuidanceSchema.shape.prerequisites.element.strict())
        .max(6),
      nextSteps: personalizedGuidanceSchema.shape.nextSteps.describe(
        "Up to four plain-text practical recommendations. Every entry must be a string, never an object. Use [] when none are justified.",
      ),
    })
    .strict()
    .nullable()
    .describe(
      "Guidance grounded in the supplied profile and question, or null when personalization is unjustified.",
    ),
});
