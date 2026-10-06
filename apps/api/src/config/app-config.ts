import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironmentFile } from "dotenv";
import { z } from "zod";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
loadEnvironmentFile({ path: path.join(projectRoot, ".env"), quiet: true });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
    DATABASE_PATH: z.string().min(1).default("./data/l5sly.db"),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(1024),
    PROVIDER_MODE: z.enum(["mock", "live"]).default("mock"),
    DEEPGRAM_API_KEY: z.string().min(1).optional(),
    DEEPGRAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(300_000),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_BASE_URL: z.url().default("https://backend.sovereigneg.com/v1"),
    LLM_MODEL: z.string().min(1).default("gpt-oss-20b"),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(480_000),
    JEV_API_KEY: z.string().min(1).optional(),
    JEV_BASE_URL: z.url().default("https://backend.sovereigneg.com/v1"),
    JEV_MODEL: z.string().min(1).default("jev-1.13"),
    JEV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(90_000),
    YTDLP_PATH: z.string().min(1).default("yt-dlp"),
    YTDLP_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(1_800_000).default(900_000),
  })
  .superRefine((environment, context) => {
    if (environment.PROVIDER_MODE !== "live") {
      return;
    }

    const requiredKeys = ["DEEPGRAM_API_KEY", "LLM_API_KEY", "JEV_API_KEY"] as const;

    for (const key of requiredKeys) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          message: `${key} is required when PROVIDER_MODE is live.`,
          path: [key],
        });
      }
    }
  });

type LogLevel = z.infer<typeof environmentSchema>["LOG_LEVEL"];

export const APP_CONFIG = Symbol("APP_CONFIG");

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: LogLevel;
  clientOrigin: string;
  databasePath: string;
  redisUrl: string;
  uploadDirectory: string;
  maxUploadBytes: number;
  providerMode: "mock" | "live";
  deepgramApiKey?: string;
  deepgramTimeoutMs: number;
  llmApiKey?: string;
  llmBaseUrl: string;
  llmModel: string;
  llmTimeoutMs: number;
  jevApiKey?: string;
  jevBaseUrl: string;
  jevModel: string;
  jevTimeoutMs: number;
  ytdlpPath: string;
  ytdlpTimeoutMs: number;
}

function resolveProjectPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function resolveExecutablePath(value: string): string {
  if (path.isAbsolute(value) || value.includes("/") || value.includes("\\")) {
    return resolveProjectPath(value);
  }

  return value;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    clientOrigin: parsed.CLIENT_ORIGIN,
    databasePath: resolveProjectPath(parsed.DATABASE_PATH),
    redisUrl: parsed.REDIS_URL,
    uploadDirectory: resolveProjectPath(parsed.UPLOAD_DIR),
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
    providerMode: parsed.PROVIDER_MODE,
    deepgramApiKey: parsed.DEEPGRAM_API_KEY,
    deepgramTimeoutMs: parsed.DEEPGRAM_TIMEOUT_MS,
    llmApiKey: parsed.LLM_API_KEY,
    llmBaseUrl: parsed.LLM_BASE_URL,
    llmModel: parsed.LLM_MODEL,
    llmTimeoutMs: parsed.LLM_TIMEOUT_MS,
    jevApiKey: parsed.JEV_API_KEY,
    jevBaseUrl: parsed.JEV_BASE_URL,
    jevModel: parsed.JEV_MODEL,
    jevTimeoutMs: parsed.JEV_TIMEOUT_MS,
    ytdlpPath: resolveExecutablePath(parsed.YTDLP_PATH),
    ytdlpTimeoutMs: parsed.YTDLP_TIMEOUT_MS,
  };
}
