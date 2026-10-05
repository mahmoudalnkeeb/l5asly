import { z } from "zod";

import {
  apiErrorSchema,
  summaryJobSchema,
  summaryListItemSchema,
  type CreateUrlSummaryInput,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
} from "@l5sly/contracts";

const errorResponseSchema = z.object({ error: apiErrorSchema });
const jobResponseSchema = z.object({ data: summaryJobSchema });
const summaryListResponseSchema = z.object({ data: z.array(summaryListItemSchema) });

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Record<string, string[]>;

  constructor(options: {
    message: string;
    code: string;
    requestId?: string;
    details?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "The server could not be reached. Check that the API is running.",
    });
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiClientError(parsedError.data.error);
    }
    throw new ApiClientError({
      code: "HTTP_ERROR",
      message: `The server returned status ${response.status}.`,
    });
  }

  return body;
}

function parseResponse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "INVALID_RESPONSE",
      message: "The server returned a response this app could not read. Please try again.",
    });
  }

  return parsed.data;
}

export async function createUrlSummary(input: CreateUrlSummaryInput): Promise<SummaryJob> {
  const body = await request("/api/summaries/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse(jobResponseSchema, body).data;
}

export async function createUploadSummary(input: {
  file: File;
  options: SummaryOptions;
}): Promise<SummaryJob> {
  const form = new FormData();
  form.append("video", input.file);
  form.append("language", input.options.language);
  form.append("depth", input.options.depth);
  if (input.options.expectation) {
    form.append("expectation", input.options.expectation);
  }

  const body = await request("/api/summaries/upload", {
    method: "POST",
    body: form,
  });

  return parseResponse(jobResponseSchema, body).data;
}

export async function getSummary(summaryId: string): Promise<SummaryJob> {
  const body = await request(`/api/summaries/${encodeURIComponent(summaryId)}`);
  return parseResponse(jobResponseSchema, body).data;
}

export async function listSummaries(): Promise<SummaryListItem[]> {
  const body = await request("/api/summaries");
  return parseResponse(summaryListResponseSchema, body).data;
}

export async function cancelSummary(summaryId: string): Promise<SummaryJob> {
  const body = await request(`/api/summaries/${encodeURIComponent(summaryId)}/cancel`, {
    method: "POST",
  });
  return parseResponse(jobResponseSchema, body).data;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
