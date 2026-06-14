import { describe, expect, it } from "vitest";

import {
  extractYoutubeVideoId,
  normalizeSourceUrl,
} from "@/lib/clip/source-url";
import {
  captionsToTranscriptSegments,
  mergeCaptionLines,
  parseYoutubeCaptionJson3,
  parseYoutubeCaptionXml,
  prepareCaptionSummaryInput,
  splitCaptionsByDuration,
} from "@/lib/clip/youtube-captions";
import { isRetryableGeminiError } from "@/lib/clip/gemini";

describe("extractYoutubeVideoId", () => {
  it("extracts id from watch URLs", () => {
    expect(
      extractYoutubeVideoId("https://www.youtube.com/watch?v=Ed2zs8GZL-E"),
    ).toBe("Ed2zs8GZL-E");
  });

  it("extracts id from youtu.be URLs", () => {
    expect(extractYoutubeVideoId("https://youtu.be/Ed2zs8GZL-E")).toBe(
      "Ed2zs8GZL-E",
    );
    expect(normalizeSourceUrl("https://youtu.be/Ed2zs8GZL-E")).toBe(
      "https://www.youtube.com/watch?v=Ed2zs8GZL-E",
    );
  });
});

describe("caption parsing helpers", () => {
  it("parses classic caption XML", () => {
    const lines = parseYoutubeCaptionXml(
      '<text start="1.5" dur="2.0">こんにちは</text>',
    );
    expect(lines).toEqual([
      { startMs: 1500, endMs: 3500, text: "こんにちは" },
    ]);
  });

  it("parses timedtext format 3", () => {
    const lines = parseYoutubeCaptionXml(
      '<timedtext format="3"><body><p t="760" d="3199"><s>こんにちは</s><s t="80">世界</s></p></body></timedtext>',
    );
    expect(lines).toEqual([
      { startMs: 760, endMs: 3959, text: "こんにちは 世界" },
    ]);
  });

  it("parses caption json3", () => {
    const lines = parseYoutubeCaptionJson3(
      JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 3000,
            segs: [{ utf8: "はじめまして" }],
          },
        ],
      }),
    );
    expect(lines[0]?.text).toBe("はじめまして");
  });

  it("merges caption lines into windows", () => {
    const merged = mergeCaptionLines(
      [
        { startMs: 0, endMs: 5000, text: "A" },
        { startMs: 5000, endMs: 10000, text: "B" },
        { startMs: 25000, endMs: 30000, text: "C" },
      ],
      20_000,
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]?.text).toBe("A B");
    expect(merged[1]?.text).toBe("C");
  });

  it("prepares summary input with duration", () => {
    const prepared = prepareCaptionSummaryInput([
      { startMs: 0, endMs: 5000, text: "導入" },
      { startMs: 60_000, endMs: 65_000, text: "本編" },
    ]);

    expect(prepared.durationMs).toBe(65_000);
    expect(prepared.text).toContain("導入");
  });

  it("converts captions to sentence-based display segments", () => {
    const segments = captionsToTranscriptSegments([
      { startMs: 0, endMs: 6000, text: "あの、こんにちは。" },
      { startMs: 60_000, endMs: 65_000, text: "続きです。" },
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      startMs: 0,
      endMs: 6000,
      text: "こんにちは。",
    });
    expect(segments[1]).toEqual({
      startMs: 60_000,
      endMs: 65_000,
      text: "続きです。",
    });
  });

  it("splits captions into time chunks", () => {
    const chunks = splitCaptionsByDuration(
      [
        { startMs: 0, endMs: 1000, text: "A" },
        { startMs: 599_000, endMs: 600_000, text: "B" },
        { startMs: 601_000, endMs: 602_000, text: "C" },
      ],
      600_000,
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe("gemini retry helpers", () => {
  it("detects retryable overload errors", () => {
    expect(isRetryableGeminiError("The model is overloaded", 503)).toBe(true);
    expect(isRetryableGeminiError("Invalid API key", 401)).toBe(false);
  });
});
