import type { PrecheckRequest, PrecheckResult } from "@l5sly/contracts";

import type {
  InsightProvider,
  VideoMetadataSource,
} from "./providers/provider-contracts.js";

// Gives a fast watch verdict from public metadata, before any download or transcription.
export class PrecheckService {
  constructor(
    private readonly metadataSource: VideoMetadataSource,
    private readonly insightProvider: InsightProvider,
  ) {}

  async check(input: PrecheckRequest): Promise<PrecheckResult> {
    const metadata = await this.metadataSource.fetchMetadata(input.url);
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
}
