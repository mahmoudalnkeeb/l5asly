import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { fileTypeFromFile } from "file-type";
import { z } from "zod";

import { ProviderError, ProviderTimeoutError } from "../../errors.js";
import type {
  VideoMetadata,
  VideoMetadataSource,
} from "./providers/provider-contracts.js";

const ytDlpMetadataSchema = z.object({
  title: z.string().min(1),
  channel: z.string().nullish(),
  uploader: z.string().nullish(),
  duration: z.number().nonnegative().nullish(),
  description: z.string().nullish(),
  chapters: z
    .array(z.object({ title: z.string(), start_time: z.number() }))
    .nullish(),
});

const METADATA_OUTPUT_LIMIT = 20 * 1024 * 1024;

export interface DownloadedMedia {
  path: string;
  mimeType: string;
}

export interface YoutubeDownloader {
  download(url: string, jobId: string): Promise<DownloadedMedia>;
}

interface YoutubeDownloaderOptions {
  downloadDirectory: string;
  executablePath: string;
  timeoutMs: number;
}

export class YtDlpYoutubeDownloader
  implements YoutubeDownloader, VideoMetadataSource
{
  constructor(private readonly options: YoutubeDownloaderOptions) {}

  async fetchMetadata(url: string): Promise<VideoMetadata> {
    const output = await this.runDownloader([
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--dump-single-json",
      url,
    ]);

    let json: unknown;
    try {
      json = JSON.parse(output);
    } catch (error) {
      throw new ProviderError("yt-dlp returned unreadable video details.", error);
    }
    const parsed = ytDlpMetadataSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError(
        "yt-dlp returned incomplete video details.",
        parsed.error,
      );
    }

    return {
      title: parsed.data.title,
      channel: parsed.data.channel ?? parsed.data.uploader ?? null,
      durationSeconds: parsed.data.duration ?? null,
      description: parsed.data.description ?? "",
      chapters: (parsed.data.chapters ?? []).map((chapter) => ({
        title: chapter.title,
        startSeconds: chapter.start_time,
      })),
    };
  }

  async download(url: string, jobId: string): Promise<DownloadedMedia> {
    await mkdir(this.options.downloadDirectory, { recursive: true });

    const outputPrefix = `${jobId}-youtube`;
    const outputTemplate = path.join(
      this.options.downloadDirectory,
      `${outputPrefix}.%(ext)s`,
    );

    try {
      const downloaderArgs = [
        "--no-playlist",
        "--no-progress",
        "--no-warnings",
        "--format",
        "bestaudio/best",
        "--output",
        outputTemplate,
      ];
      downloaderArgs.push(url);

      await this.runDownloader(downloaderArgs);

      const downloadedPath = await this.findDownloadedFile(outputPrefix);
      if (!downloadedPath) {
        throw new ProviderError("yt-dlp completed without producing a media file.");
      }

      const detectedType = await fileTypeFromFile(downloadedPath);
      return {
        path: downloadedPath,
        mimeType: detectedType?.mime ?? "application/octet-stream",
      };
    } catch (error) {
      await this.removeArtifacts(outputPrefix);

      if (error instanceof ProviderError || error instanceof ProviderTimeoutError) {
        throw error;
      }

      throw new ProviderError("The YouTube video could not be downloaded.", error);
    }
  }

  private async runDownloader(args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.options.executablePath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let output = "";
      let errorOutput = "";
      let settled = false;
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.options.timeoutMs);

      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        if (output.length < METADATA_OUTPUT_LIMIT) {
          output += chunk.toString();
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        errorOutput = `${errorOutput}${chunk.toString()}`.slice(-2_000);
      });

      child.once("error", (error: NodeJS.ErrnoException) => {
        settle(() => {
          if (error.code === "ENOENT") {
            reject(new ProviderError(`The yt-dlp executable was not found at "${this.options.executablePath}". Set YTDLP_PATH to a valid executable path.`, error));
            return;
          }
          reject(new ProviderError("yt-dlp could not be started.", error));
        });
      });

      child.once("close", (exitCode: number | null) => {
        settle(() => {
          if (timedOut) {
            reject(new ProviderTimeoutError("YouTube download", this.options.timeoutMs));
            return;
          }

          if (exitCode === 0) {
            resolve(output);
            return;
          }

          if (this.isNetworkUnreachable(errorOutput)) {
            reject(new ProviderError("The API host cannot reach YouTube over HTTPS. Check its firewall, VPN, or network route."));
            return;
          }

          reject(new ProviderError(`yt-dlp could not download the video: ${errorOutput || `exit code ${exitCode}`}`));
        });
      });
    });
  }

  private isNetworkUnreachable(errorOutput: string): boolean {
    return /WinError 10051|network is unreachable|failed to establish a new connection/i.test(errorOutput);
  }

  private async findDownloadedFile(outputPrefix: string): Promise<string | undefined> {
    const entries = await readdir(this.options.downloadDirectory, { withFileTypes: true });
    const candidates: Array<{ path: string; modifiedAt: number }> = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(`${outputPrefix}.`)) {
        continue;
      }

      const candidatePath = path.join(this.options.downloadDirectory, entry.name);
      const details = await stat(candidatePath);
      candidates.push({ path: candidatePath, modifiedAt: details.mtimeMs });
    }

    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
    return candidates[0]?.path;
  }

  private async removeArtifacts(outputPrefix: string): Promise<void> {
    const entries = await readdir(this.options.downloadDirectory, { withFileTypes: true }).catch(() => []);

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.startsWith(`${outputPrefix}.`))
        .map((entry) => unlink(path.join(this.options.downloadDirectory, entry.name)).catch(() => undefined)),
    );
  }
}
