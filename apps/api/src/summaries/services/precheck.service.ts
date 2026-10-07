import { Injectable } from "@nestjs/common";

import type {
  PrecheckRequest,
  PrecheckResult,
  SummaryLanguage,
  VideoPreview,
} from "@l5asly/contracts";

import {
  InsightProvider,
  VideoMetadataSource,
  type VideoMetadata,
} from "../providers/provider-contracts.js";

// The create form asks for the preview and the quick check of the same link at
// nearly the same time, so both share one metadata lookup per link.
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const METADATA_CACHE_LIMIT = 100;

interface CachedMetadata {
  expiresAt: number;
  metadata: Promise<VideoMetadata>;
}

function toSpokenLanguage(languageCode: string | null): SummaryLanguage | null {
  const code = languageCode?.toLowerCase() ?? "";
  if (code === "en" || code.startsWith("en-")) {
    return "English";
  }
  if (code === "ar" || code.startsWith("ar-")) {
    return "Arabic";
  }
  return null;
}

// Looks at a YouTube link before any download or transcription: public details
// for the preview, and a fast watch verdict from the same metadata.
@Injectable()
export class PrecheckService {
  private readonly metadataCache = new Map<string, CachedMetadata>();

  constructor(
    private readonly metadataSource: VideoMetadataSource,
    private readonly insightProvider: InsightProvider,
  ) {}

  async preview(url: string): Promise<VideoPreview> {
    const metadata = await this.getMetadata(url);
    return {
      title: metadata.title,
      channel: metadata.channel,
      durationSeconds: metadata.durationSeconds,
      thumbnailUrl: metadata.thumbnailUrl,
      spokenLanguage: toSpokenLanguage(metadata.languageCode),
    };
  }

  async check(input: PrecheckRequest): Promise<PrecheckResult> {
    const metadata = await this.getMetadata(input.url);
    const verdict = await this.insightProvider.precheck({
      metadata,
      expectation: input.expectation,
      viewerProfile: input.viewerProfile,
      language: input.language,
    });

    return {
      title: metadata.title,
      channel: metadata.channel,
      durationSeconds: metadata.durationSeconds,
      verdict,
    };
  }

  private getMetadata(url: string): Promise<VideoMetadata> {
    const now = Date.now();
    const cached = this.metadataCache.get(url);
    if (cached && cached.expiresAt > now) {
      return cached.metadata;
    }

    this.metadataCache.delete(url);
    if (this.metadataCache.size >= METADATA_CACHE_LIMIT) {
      // Maps keep insertion order, so the first key is the oldest entry.
      const oldestUrl = this.metadataCache.keys().next().value;
      if (oldestUrl !== undefined) {
        this.metadataCache.delete(oldestUrl);
      }
    }

    const metadata = this.metadataSource.fetchMetadata(url);
    const entry = { expiresAt: now + METADATA_CACHE_TTL_MS, metadata };
    this.metadataCache.set(url, entry);
    // A failed lookup is not cached, so the next request tries again. The
    // caller still receives the rejection through the returned promise.
    metadata.catch(() => {
      if (this.metadataCache.get(url) === entry) {
        this.metadataCache.delete(url);
      }
    });
    return metadata;
  }
}
