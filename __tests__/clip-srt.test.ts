import { describe, it, expect } from "vitest";

import { formatSrtTime } from "@/lib/clip/time";
import { editableTitlesToSrt, segmentsToSrt } from "@/lib/clip/srt";

describe("clip SRT export", () => {
  it("formats SRT timestamps", () => {
    expect(formatSrtTime(90_123)).toBe("00:01:30,123");
  });

  it("builds transcript SRT", () => {
    const srt = segmentsToSrt([
      { startMs: 0, endMs: 2000, text: "こんにちは" },
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
    expect(srt).toContain("こんにちは");
  });

  it("builds editable title SRT", () => {
    const srt = editableTitlesToSrt([
      {
        id: "1",
        startMs: 0,
        endMs: 60_000,
        text: "オープニング",
        topicLabel: "開始",
        sourceSegmentIds: [],
      },
    ]);
    expect(srt).toContain("オープニング");
  });
});
