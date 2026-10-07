import path from "node:path";

import { isYouTubeUrl, type UrlSourceType } from "@l5asly/contracts";

// Shown until the downloader reports the real video title.
export const YOUTUBE_PLACEHOLDER_NAME = "YouTube video";

// A public link is classified by its file extension, because the API never fetches
// arbitrary URLs itself. Anything that is not a known audio format is treated as video.
const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".amr",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".ogg",
  ".opus",
  ".wav",
  ".weba",
  ".wma",
]);

export interface UrlSourceDetails {
  type: UrlSourceType;
  name: string;
}

export function describeUrlSource(sourceUrl: string): UrlSourceDetails {
  if (isYouTubeUrl(sourceUrl)) {
    return { type: "youtube", name: YOUTUBE_PLACEHOLDER_NAME };
  }

  const url = new URL(sourceUrl);
  const fileName = getFileName(url);
  const extension = path.extname(fileName ?? "").toLowerCase();

  return {
    type: AUDIO_EXTENSIONS.has(extension) ? "public_audio" : "public_video",
    name: fileName ?? url.hostname.replace(/^www\./, ""),
  };
}

function getFileName(url: URL): string | null {
  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (!lastSegment) {
    return null;
  }

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    // Malformed percent-encoding: the raw segment is still a usable name.
    return lastSegment;
  }
}
