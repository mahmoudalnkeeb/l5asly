import { describe, expect, it } from "vitest";

import { describeUrlSource } from "../url-source.js";

describe("describeUrlSource", () => {
  it("marks YouTube links and waits for the real title", () => {
    expect(describeUrlSource("https://youtu.be/abc123")).toEqual({
      type: "youtube",
      name: "YouTube video",
    });
  });

  it("names public files after the decoded file name", () => {
    expect(
      describeUrlSource(
        "https://cdn.example.com/podcasts/%D8%AD%D9%84%D9%82%D8%A9.MP3",
      ),
    ).toEqual({ type: "public_audio", name: "حلقة.MP3" });
    expect(
      describeUrlSource("https://example.com/media/talk.mp4?token=abc"),
    ).toEqual({ type: "public_video", name: "talk.mp4" });
  });

  it("treats unknown formats as video and falls back to the host name", () => {
    expect(describeUrlSource("https://www.example.com/")).toEqual({
      type: "public_video",
      name: "example.com",
    });
    expect(describeUrlSource("https://example.com/stream/%E0%A4%A")).toEqual({
      type: "public_video",
      name: "%E0%A4%A",
    });
  });
});
