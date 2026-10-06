import {
  HttpParseError,
  HttpResponseError,
  HttpTimeoutError,
} from "@nestjs/http-client";

import { ProviderError, ProviderTimeoutError } from "../../../common/errors.js";

export function toProviderError(
  error: unknown,
  messages: { providerName: string; unreachable: string; rejected: string },
): Error {
  if (error instanceof HttpTimeoutError) {
    return new ProviderTimeoutError(messages.providerName, error.timeoutMs, error);
  }

  if (error instanceof HttpResponseError) {
    return new ProviderError(
      `${messages.rejected} ${error.status}: ${describeResponseBody(error.body)}`,
      error,
    );
  }

  if (error instanceof HttpParseError) {
    return new ProviderError(
      `${messages.providerName} returned a response that is not valid JSON.`,
      error,
    );
  }

  return new ProviderError(messages.unreachable, error);
}

function describeResponseBody(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return (text ?? "").slice(0, 240);
}
