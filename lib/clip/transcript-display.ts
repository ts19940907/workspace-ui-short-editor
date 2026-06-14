/** 画面表示用の文字起こし整形（タイムライン同期を保つ） */

export type TimedTranscriptLine = {
  startMs: number;
  endMs: number;
  text: string;
};

/** 口語フィラー（「あの、」「えっと」等）。「あの人」のような用法は残す */
const FILLER_PATTERNS: RegExp[] = [
  /^えっと[、，]?\s*/u,
  /^えーと[、，]?\s*/u,
  /^えー[、，]?\s*/u,
  /^あの[、，]\s*/u,
  /^うーん[、，]?\s*/u,
  /^まあ[、，]?\s*/u,
  /(?:[\s、，])えっと[、，]?\s*/gu,
  /(?:[\s、，])えーと[、，]?\s*/gu,
  /(?:[\s、，])えー[、，]?\s*/gu,
  /(?:[\s、，])あの[、，]\s*/gu,
  /(?:[\s、，])うーん[、，]?\s*/gu,
  /(?:[\s、，])まあ[、，]?\s*/gu,
];

export function removeTranscriptFillers(text: string): string {
  let result = text.trim();
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/**
 * タイムスタンプ付き字幕行を、ケバ除去後に「。」で文単位に結合する。
 * startMs / endMs は各行の実タイムスタンプから取る（按分しない）。
 */
export function groupTimedLinesBySentence(
  lines: TimedTranscriptLine[],
): TimedTranscriptLine[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );

  const segments: TimedTranscriptLine[] = [];
  let bufferStartMs: number | null = null;
  let bufferEndMs = 0;
  let bufferText = "";

  const resetBuffer = () => {
    bufferStartMs = null;
    bufferEndMs = 0;
    bufferText = "";
  };

  const emitSentence = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length > 0 && bufferStartMs !== null) {
      segments.push({
        startMs: bufferStartMs,
        endMs: bufferEndMs,
        text: trimmed,
      });
    }
  };

  const flushCompleteSentences = () => {
    while (bufferText.includes("。")) {
      const periodIndex = bufferText.indexOf("。");
      const sentence = bufferText.slice(0, periodIndex + 1);
      emitSentence(sentence);
      bufferText = bufferText.slice(periodIndex + 1);
      if (!bufferText.trim()) {
        resetBuffer();
        return;
      }
    }
  };

  for (const line of sorted) {
    const cleaned = removeTranscriptFillers(line.text);
    if (!cleaned) continue;

    if (bufferStartMs === null) {
      bufferStartMs = line.startMs;
    }
    bufferEndMs = Math.max(bufferEndMs, line.endMs);
    bufferText += cleaned;
    flushCompleteSentences();
  }

  if (bufferText.trim() && bufferStartMs !== null) {
    emitSentence(bufferText);
  }

  return segments;
}
