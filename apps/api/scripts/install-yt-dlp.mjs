// Only live mode needs yt-dlp, so a failed download warns instead of failing the
// install. A checksum mismatch still fails, because the file gets executed.
import "reflect-metadata";

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HttpClient } from "@nestjs/http-client";

// To upgrade, change the version and copy the matching lines from the release's SHA2-256SUMS.
const YTDLP_VERSION = "2026.08.19";
const ASSET_CHECKSUMS = {
  "yt-dlp.exe": "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
  "yt-dlp_x86.exe": "a8f91bd41452506bc81ebd2f369b186fea0ee7075413ba00cef9fd346a0a5d0c",
  "yt-dlp_arm64.exe": "05b438997bafc3affdfda9d041353c9d73e04dc842207254b655b0887c4445b0",
  "yt-dlp_macos": "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
  "yt-dlp_linux": "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a",
  "yt-dlp_linux_aarch64": "b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc",
  "yt-dlp_musllinux": "f3dec9cfeaf304cec98290fe41c6ad465d4b747d302473559643e7af24929722",
  "yt-dlp_musllinux_aarch64": "17b164c4d258be92bb1ad146cb7c336b783aedb380814aabbcb7d52937f77e57",
};

const binDirectory = fileURLToPath(new URL("../bin/", import.meta.url));
const binaryPath = path.join(
  binDirectory,
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
const versionPath = path.join(binDirectory, "yt-dlp.version");

class ChecksumMismatchError extends Error {}

function selectAsset() {
  const { platform, arch } = process;

  if (platform === "win32") {
    const windowsAssets = {
      x64: "yt-dlp.exe",
      ia32: "yt-dlp_x86.exe",
      arm64: "yt-dlp_arm64.exe",
    };
    return windowsAssets[arch];
  }

  if (platform === "darwin") {
    return "yt-dlp_macos";
  }

  if (platform === "linux") {
    // glibc builds don't run on musl distributions such as Alpine.
    const isMusl = !process.report.getReport().header.glibcVersionRuntime;
    const prefix = isMusl ? "yt-dlp_musllinux" : "yt-dlp_linux";
    const linuxAssets = { x64: prefix, arm64: `${prefix}_aarch64` };
    return linuxAssets[arch];
  }

  return undefined;
}

async function isInstalled(asset) {
  if (!existsSync(binaryPath) || !existsSync(versionPath)) {
    return false;
  }
  const installed = await readFile(versionPath, "utf8");
  return installed.trim() === `${YTDLP_VERSION} ${asset}`;
}

async function download(asset) {
  const http = new HttpClient({ timeout: "5m" });
  const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}`;
  const { data } = await http.get(url, { responseType: "arrayBuffer" });
  const content = Buffer.from(data);

  const checksum = createHash("sha256").update(content).digest("hex");
  if (checksum !== ASSET_CHECKSUMS[asset]) {
    throw new ChecksumMismatchError(
      `The downloaded ${asset} does not match the pinned SHA-256 checksum.`,
    );
  }

  await mkdir(binDirectory, { recursive: true });
  const temporaryPath = `${binaryPath}.download`;
  await writeFile(temporaryPath, content);
  if (process.platform !== "win32") {
    await chmod(temporaryPath, 0o755);
  }
  await rm(binaryPath, { force: true });
  await rename(temporaryPath, binaryPath);
  await writeFile(versionPath, `${YTDLP_VERSION} ${asset}\n`);
}

async function main() {
  if (process.env.YTDLP_SKIP_DOWNLOAD === "1") {
    console.log("yt-dlp: download skipped (YTDLP_SKIP_DOWNLOAD=1).");
    return;
  }

  const asset = selectAsset();
  if (!asset) {
    console.warn(
      `yt-dlp: no standalone build for ${process.platform}-${process.arch}. Install yt-dlp yourself and set YTDLP_PATH for live mode.`,
    );
    return;
  }

  if (await isInstalled(asset)) {
    return;
  }

  try {
    await download(asset);
    console.log(`yt-dlp: installed ${YTDLP_VERSION} (${asset}) to ${binaryPath}`);
  } catch (error) {
    if (error instanceof ChecksumMismatchError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `yt-dlp: download failed (${reason}). Mock mode still works. For live mode, run \`pnpm --filter @l5sly/api run install:yt-dlp\` again or set YTDLP_PATH.`,
    );
  }
}

await main();
