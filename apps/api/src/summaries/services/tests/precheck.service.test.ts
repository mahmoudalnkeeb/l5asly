import { describe, expect, it, vi } from "vitest";

import type { WatchVerdict } from "@l5asly/contracts";

import {
  InsightProvider,
  VideoMetadataSource,
  type VideoMetadata,
} from "../../providers/provider-contracts.js";
import { PrecheckService } from "../precheck.service.js";

const metadata: VideoMetadata = {
  title: "Redis queues explained",
  channel: "Backend weekly",
  durationSeconds: 900,
  description: "How to build a reliable queue.",
  chapters: [],
  thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  languageCode: "ar-EG",
};

const verdict: WatchVerdict = {
  recommendation: "watch",
  confidence: 0.8,
  headline: "Worth watching",
  reason: "It covers the question in depth.",
};

function createService(fetchMetadata: VideoMetadataSource["fetchMetadata"]) {
  const metadataSource: VideoMetadataSource = { fetchMetadata };
  const insightProvider: InsightProvider = {
    scoreTimeline: vi.fn(),
    checkGrounding: vi.fn(),
    precheck: vi.fn().mockResolvedValue(verdict),
  };
  return new PrecheckService(metadataSource, insightProvider);
}

describe("PrecheckService", () => {
  it("previews a link with its thumbnail and supported spoken language", async () => {
    const service = createService(vi.fn().mockResolvedValue(metadata));

    await expect(
      service.preview("https://youtu.be/abc123"),
    ).resolves.toEqual({
      title: "Redis queues explained",
      channel: "Backend weekly",
      durationSeconds: 900,
      thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      spokenLanguage: "Arabic",
    });
  });

  it("leaves the spoken language empty when YouTube names an unsupported one", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({ ...metadata, languageCode: "fr" }),
    );

    const preview = await service.preview("https://youtu.be/abc123");

    expect(preview.spokenLanguage).toBeNull();
  });

  it("shares one metadata lookup between the preview and the quick check", async () => {
    const fetchMetadata = vi.fn().mockResolvedValue(metadata);
    const service = createService(fetchMetadata);
    const url = "https://youtu.be/abc123";

    await Promise.all([
      service.preview(url),
      service.check({ url, language: "English" }),
    ]);

    expect(fetchMetadata).toHaveBeenCalledOnce();
  });

  it("looks a link up again after a failed lookup", async () => {
    const fetchMetadata = vi
      .fn()
      .mockRejectedValueOnce(new Error("YouTube is unreachable"))
      .mockResolvedValueOnce(metadata);
    const service = createService(fetchMetadata);
    const url = "https://youtu.be/abc123";

    await expect(service.preview(url)).rejects.toThrow("YouTube is unreachable");
    await expect(service.preview(url)).resolves.toMatchObject({
      title: "Redis queues explained",
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(2);
  });
});
