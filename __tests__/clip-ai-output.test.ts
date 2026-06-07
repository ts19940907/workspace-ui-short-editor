import { describe, expect, it } from "vitest";

import {
  topicsToTitleLayers,
  whisperSegmentsToTranscript,
} from "@/lib/clip/ai-output";
import {
  applyProofreadToTranscript,
  transcriptToProofreadText,
} from "@/lib/clip/output";
import {
  isValidHttpUrl,
  isYoutubeUrl,
  normalizeSourceUrl,
} from "@/lib/clip/source-url";

describe("source-url helpers", () => {
  it("normalizes youtu.be links", () => {
    expect(normalizeSourceUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("detects YouTube URLs", () => {
    expect(isYoutubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYoutubeUrl("https://example.com/live")).toBe(false);
  });

  it("validates http(s) URLs", () => {
    expect(isValidHttpUrl("https://youtube.com/watch?v=1")).toBe(true);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
  });
});

describe("whisperSegmentsToTranscript", () => {
  it("converts timed segments to transcript segments", () => {
    const segments = whisperSegmentsToTranscript([
      { start: 0, end: 4.2, text: " こんにちは" },
      { start: 4.2, end: 9.5, text: "今日の配信です" },
    ]);

    expect(segments).toEqual([
      {
        id: "seg-1",
        startMs: 0,
        endMs: 4200,
        text: "こんにちは",
      },
      {
        id: "seg-2",
        startMs: 4200,
        endMs: 9500,
        text: "今日の配信です",
      },
    ]);
  });
});

describe("topicsToTitleLayers", () => {
  it("maps AI topics to read-only and editable title layers", () => {
    const layers = topicsToTitleLayers([
      {
        startMs: 0,
        endMs: 60_000,
        topicLabel: "オープニング",
        summaryText: "配信開始の挨拶",
        sourceSegmentIds: ["seg-1"],
      },
    ]);

    expect(layers.readOnlyTitles).toEqual([
      {
        id: "ro-1",
        startMs: 0,
        endMs: 60_000,
        text: "オープニング",
      },
    ]);
    expect(layers.editableTitles[0]?.text).toBe("配信開始の挨拶");
  });
});

describe("transcript proofread helpers", () => {
  const segments = [
    { id: "seg-1", startMs: 0, endMs: 1000, text: "こんにちわ" },
    { id: "seg-2", startMs: 1000, endMs: 2000, text: "今日は晴れです" },
  ];

  it("joins transcript lines for proofread", () => {
    expect(transcriptToProofreadText(segments)).toBe(
      "こんにちわ\n今日は晴れです",
    );
  });

  it("applies corrected lines when counts match", () => {
    const next = applyProofreadToTranscript(
      segments,
      "こんにちは\n今日は晴れです",
    );
    expect(next?.[0]?.text).toBe("こんにちは");
  });

  it("returns null when line counts differ", () => {
    expect(applyProofreadToTranscript(segments, "1行だけ")).toBeNull();
  });
});
