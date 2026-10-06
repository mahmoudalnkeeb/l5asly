import type { PipeTransform } from "@nestjs/common";

import { summaryOptionsSchema, type SummaryOptions } from "@l5sly/contracts";

import { AppError } from "../../common/errors.js";

// Multipart forms send every field as text, so the viewer profile arrives as a JSON string.
export class UploadSummaryOptionsPipe
  implements PipeTransform<Record<string, unknown>, SummaryOptions>
{
  transform(fields: Record<string, unknown>): SummaryOptions {
    return summaryOptionsSchema.parse({
      language: fields.language,
      sourceLanguage: fields.sourceLanguage,
      viewerProfile: parseProfileField(fields.viewerProfile),
      depth: fields.depth,
      expectation: fields.expectation,
    });
  }
}

function parseProfileField(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw invalidProfileError();
  }
  try {
    const profile: unknown = JSON.parse(value);
    return profile;
  } catch {
    throw invalidProfileError();
  }
}

function invalidProfileError(): AppError {
  return new AppError({
    message: "The viewer profile must be valid JSON.",
    statusCode: 400,
    code: "INVALID_PROFILE",
  });
}
