import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

import { ProviderError } from "../../errors.js";

const require = createRequire(import.meta.url);
const ffmpegModule: unknown = require("ffmpeg-static");
const ffmpegPath = typeof ffmpegModule === "string" ? ffmpegModule : null;

export interface PreparedMedia {
  path: string;
  mimeType: string;
  shouldDelete: boolean;
  additionalPaths?: string[];
}

export class MediaPreparer {
  constructor(private readonly uploadDirectory: string) {}

  async prepare(input: { path: string; mimeType: string; jobId: string }): Promise<PreparedMedia> {
    if (input.mimeType.startsWith("audio/")) {
      return {
        path: input.path,
        mimeType: input.mimeType,
        shouldDelete: false,
      };
    }

    if (!ffmpegPath) {
      throw new ProviderError("FFmpeg is unavailable, so the uploaded video cannot be prepared.");
    }

    await mkdir(this.uploadDirectory, { recursive: true });
    const outputPath = path.join(this.uploadDirectory, `${input.jobId}-audio.mp3`);
    await this.extractAudio(ffmpegPath, input.path, outputPath);

    return {
      path: outputPath,
      mimeType: "audio/mpeg",
      shouldDelete: true,
    };
  }

  async remove(pathToRemove: string | undefined): Promise<void> {
    if (!pathToRemove) {
      return;
    }

    try {
      await unlink(pathToRemove);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  private async extractAudio(
    executablePath: string,
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn(executablePath, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        "-y",
        outputPath,
      ]);
      let errorOutput = "";

      process.stderr.on("data", (chunk: Buffer) => {
        errorOutput = `${errorOutput}${chunk.toString()}`.slice(-2_000);
      });
      process.once("error", (error: Error) => reject(new ProviderError("FFmpeg could not be started.", error)));
      process.once("close", (exitCode: number | null) => {
        if (exitCode === 0) {
          resolve();
          return;
        }
        reject(new ProviderError(`FFmpeg could not extract audio: ${errorOutput || `exit code ${exitCode}`}`));
      });
    });
  }
}
