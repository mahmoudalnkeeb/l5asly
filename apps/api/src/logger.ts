import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.VITEST ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "deepgramApiKey",
      "llmApiKey",
      "jevApiKey",
    ],
    censor: "[redacted]",
  },
});
