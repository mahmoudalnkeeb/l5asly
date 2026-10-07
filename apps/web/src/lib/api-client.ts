import { z } from "zod";

import {
  apiErrorSchema,
  precheckResultSchema,
  summaryJobSchema,
  summaryListItemSchema,
  videoPreviewSchema,
  type CreateUrlSummaryInput,
  type PrecheckRequest,
  type PrecheckResult,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
  type VideoPreview,
} from "@l5asly/contracts";

const errorResponseSchema = z.object({ error: apiErrorSchema });
const jobResponseSchema = z.object({ data: summaryJobSchema });
const precheckResponseSchema = z.object({ data: precheckResultSchema });
const previewResponseSchema = z.object({ data: videoPreviewSchema });
const summaryListResponseSchema = z.object({
  data: z.array(summaryListItemSchema),
});

// Server errors carry a request ID; errors raised in the browser do not.
interface ApiClientErrorOptions {
  message: string;
  code: string;
  requestId?: string;
  details?: Record<string, string[]>;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Record<string, string[]>;

  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

// Error responses from a proxy or crashed server may not be JSON. Returning
// null lets the caller report the HTTP status instead of a parse error.
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    console.warn("Response body was not valid JSON", {
      url: response.url,
      status: response.status,
      error,
    });
    return null;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    // A cancelled query is not a network failure; let the caller see the abort.
    if (init?.signal?.aborted) {
      throw error;
    }
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message:
        "The server could not be reached. Check that the API is running.",
    });
  }

  if (response.ok && response.status === 204) {
    return undefined;
  }
  const body = await readJsonBody(response);
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
      message:
        "The server returned a response this app could not read. Please try again.",
    });
  }

  return parsed.data;
}

export async function createUrlSummary(
  input: CreateUrlSummaryInput,
): Promise<SummaryJob> {
  const body = await request("/api/summaries/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse(jobResponseSchema, body).data;
}

export async function precheckVideo(
  input: PrecheckRequest,
): Promise<PrecheckResult> {
  const body = await request("/api/summaries/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse(precheckResponseSchema, body).data;
}

export async function previewVideo(
  url: string,
  signal?: AbortSignal,
): Promise<VideoPreview> {
  const body = await request("/api/summaries/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });

  return parseResponse(previewResponseSchema, body).data;
}

interface CreateUploadSummaryInput {
  file: File;
  options: SummaryOptions;
}

export async function createUploadSummary(
  input: CreateUploadSummaryInput,
): Promise<SummaryJob> {
  const uploadForm = new FormData();
  uploadForm.append("video", input.file);
  uploadForm.append("language", input.options.language);
  if (input.options.sourceLanguage) {
    uploadForm.append("sourceLanguage", input.options.sourceLanguage);
  }
  if (input.options.viewerProfile) {
    uploadForm.append(
      "viewerProfile",
      JSON.stringify(input.options.viewerProfile),
    );
  }
  uploadForm.append("depth", input.options.depth);
  if (input.options.expectation) {
    uploadForm.append("expectation", input.options.expectation);
  }

  const body = await request("/api/summaries/upload", {
    method: "POST",
    body: uploadForm,
  });

  return parseResponse(jobResponseSchema, body).data;
}

export async function getSummary(
  summaryId: string,
  signal?: AbortSignal,
): Promise<SummaryJob> {
  const body = await request(
    `/api/summaries/${encodeURIComponent(summaryId)}`,
    { signal },
  );
  return parseResponse(jobResponseSchema, body).data;
}

export async function listSummaries(
  signal?: AbortSignal,
): Promise<SummaryListItem[]> {
  const body = await request("/api/summaries", { signal });
  return parseResponse(summaryListResponseSchema, body).data;
}

export async function cancelSummary(summaryId: string): Promise<SummaryJob> {
  const body = await request(
    `/api/summaries/${encodeURIComponent(summaryId)}/cancel`,
    {
      method: "POST",
    },
  );
  return parseResponse(jobResponseSchema, body).data;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export async function retrySummary(
  summaryId: string,
  file?: File,
): Promise<SummaryJob> {
  let body: FormData | undefined;
  if (file) {
    body = new FormData();
    body.append("video", file);
  }
  const responseBody = await request(
    `/api/summaries/${encodeURIComponent(summaryId)}/retry`,
    { method: "POST", body },
  );
  return parseResponse(jobResponseSchema, responseBody).data;
}

export async function deleteSummary(summaryId: string): Promise<void> {
  await request(`/api/summaries/${encodeURIComponent(summaryId)}`, {
    method: "DELETE",
  });
}
