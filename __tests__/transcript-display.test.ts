import { describe, expect, it } from "vitest";

import {
  groupTimedLinesBySentence,
  removeTranscriptFillers,
} from "@/lib/clip/transcript-display";

describe("removeTranscriptFillers", () => {
  it("removes common fillers with comma", () => {
    expect(removeTranscriptFillers("あの、今日はいい天気です。")).toBe(
      "今日はいい天気です。",
    );
    expect(removeTranscriptFillers("えっと、次の話題に移ります。")).toBe(
      "次の話題に移ります。",
    );
  });

  it("keeps demonstrative あの before nouns", () => {
    expect(removeTranscriptFillers("あの人は有名です。")).toBe(
      "あの人は有名です。",
    );
  });
});

describe("groupTimedLinesBySentence", () => {
  it("merges lines until a sentence ends with 。", () => {
    const segments = groupTimedLinesBySentence([
      { startMs: 0, endMs: 2000, text: "今日は" },
      { startMs: 2000, endMs: 5000, text: "いい天気です。" },
      { startMs: 6000, endMs: 9000, text: "明日も晴れです。" },
    ]);

    expect(segments).toEqual([
      { startMs: 0, endMs: 5000, text: "今日はいい天気です。" },
      { startMs: 6000, endMs: 9000, text: "明日も晴れです。" },
    ]);
  });

  it("removes fillers before grouping", () => {
    const segments = groupTimedLinesBySentence([
      { startMs: 0, endMs: 6000, text: "あの、こんにちは。" },
    ]);

    expect(segments).toEqual([
      { startMs: 0, endMs: 6000, text: "こんにちは。" },
    ]);
  });

  it("emits trailing text without 。 as one segment", () => {
    const segments = groupTimedLinesBySentence([
      { startMs: 0, endMs: 2000, text: "続きは" },
      { startMs: 2000, endMs: 4000, text: "次回" },
    ]);

    expect(segments).toEqual([
      { startMs: 0, endMs: 4000, text: "続きは次回" },
    ]);
  });

  it("splits multiple sentences within accumulated text", () => {
    const segments = groupTimedLinesBySentence([
      {
        startMs: 0,
        endMs: 8000,
        text: "最初の文。二番目の文。",
      },
    ]);

    expect(segments).toEqual([
      { startMs: 0, endMs: 8000, text: "最初の文。" },
      { startMs: 0, endMs: 8000, text: "二番目の文。" },
    ]);
  });
});
