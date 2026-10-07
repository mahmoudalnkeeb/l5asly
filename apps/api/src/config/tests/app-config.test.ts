import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../app-config.js";

const apiDirectory = fileURLToPath(new URL("../../../", import.meta.url));

describe("loadConfig", () => {
  it("uses the yt-dlp binary that pnpm install downloads by default", () => {
    const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

    expect(loadConfig({}).ytdlpPath).toBe(
      path.join(apiDirectory, "bin", binaryName),
    );
  });

  it("keeps a yt-dlp command name from YTDLP_PATH as is", () => {
    expect(loadConfig({ YTDLP_PATH: "yt-dlp" }).ytdlpPath).toBe("yt-dlp");
  });
});
