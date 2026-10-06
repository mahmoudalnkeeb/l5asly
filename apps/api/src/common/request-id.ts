import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export function assignRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const header = request.headers["x-request-id"];
  const requestId = typeof header === "string" && header ? header : randomUUID();
  response.setHeader("x-request-id", requestId);
  return requestId;
}

// pino-http stores the ID from assignRequestId on the request as `id`.
export function readRequestId(request: IncomingMessage): string {
  return typeof request.id === "string" ? request.id : "unknown";
}
