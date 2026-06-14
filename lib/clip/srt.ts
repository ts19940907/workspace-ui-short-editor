import { formatSrtTime } from "@/lib/clip/time";
import type { EditableTitleSegment, ReadOnlyTitleSegment, TranscriptSegment } from "@/lib/clip-schema";

type TimedText = { startMs: number; endMs: number; text: string };

const MIN_CUE_DURATION_MS = 500;
const SRT_BOM = "\uFEFF";

function sanitizeSrtText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
}

/** Premiere 向けにタイムコードを整え、空テキストを除く */
export function prepareTimedTextForSrt(segments: TimedText[]): TimedText[] {
  const results = segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let i = 0; i < results.length; i++) {
    const seg = results[i];
    if (i !== 0) {
      const prevSeg = results[i - 1];
      if (seg.startMs < prevSeg.endMs) {
        seg.startMs = prevSeg.endMs;
        seg.endMs = seg.startMs + (seg.endMs - seg.startMs);
      }
    }
  }
  
  return results
    .filter((seg) => seg.text.length > 0);
}

export function countSrtCues(segments: TimedText[]): number {
  return prepareTimedTextForSrt(segments).length;
}

export function segmentsToSrt(segments: TimedText[]): string {
  const prepared = prepareTimedTextForSrt(segments);
  if (prepared.length === 0) return "";

  const blocks = prepared.map((seg, index) => {
    const start = formatSrtTime(seg.startMs);
    const end = formatSrtTime(seg.endMs);
    return `${index + 1}\r\n${start} --> ${end}\r\n${seg.text}\r\n`;
  });

  return `${SRT_BOM}${blocks.join("\r\n")}`;
}

export function transcriptToSrt(segments: TranscriptSegment[]): string {
  return segmentsToSrt(segments);
}

export function editableTitlesToSrt(segments: EditableTitleSegment[]): string {
  return segmentsToSrt(segments);
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const PREMIERE_README = `Premiere Pro への読み込み手順
========================

1. YouTube からダウンロードした「同じ動画」をシーケンス V1 の 00:00:00:00 から配置する
2. *_transcript.srt … 文字起こし（字幕1行 = 1キュー）
3. *_summary.srt … 編集可能タイトル（話題数と同じキュー数）
4. *_titles_readonly.srt … 編集不可タイトル（参照用）

※ transcript.srt は summary.srt より細かいタイムコードです（件数が多いのが正常です）。
※ 動画 IN 点を 00:00:00:00 に合わせてください。
`;

export type PremiereExportFiles = {
  transcriptSrt: string;
  transcriptCueCount: number;
  summarySrt: string;
  summaryCueCount: number;
  readOnlySrt: string;
  readOnlyCueCount: number;
};

export function buildPremiereExportFiles(
  segments: TranscriptSegment[],
  editableTitles: EditableTitleSegment[],
  readOnlyTitles: ReadOnlyTitleSegment[] = [],
): PremiereExportFiles {
  const transcriptSrt = transcriptToSrt(segments);
  const summarySrt = editableTitlesToSrt(editableTitles);
  const readOnlySrt = readOnlyTitles.length > 0 ? segmentsToSrt(readOnlyTitles) : "";

  return {
    transcriptSrt,
    transcriptCueCount: countSrtCues(segments),
    summarySrt,
    summaryCueCount: countSrtCues(editableTitles),
    readOnlySrt,
    readOnlyCueCount: readOnlyTitles.length > 0 ? countSrtCues(readOnlyTitles) : 0,
  };
}

export function downloadPremiereExport(
  projectTitle: string,
  segments: TranscriptSegment[],
  editableTitles: EditableTitleSegment[],
  readOnlyTitles: ReadOnlyTitleSegment[] = [],
): { transcriptCueCount: number; summaryCueCount: number } {
  const files = buildPremiereExportFiles(segments, editableTitles, readOnlyTitles);
  const safeBase =
    projectTitle.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/gu, "_") || "project";

  if (files.transcriptCueCount > 0) {
    downloadTextFile(
      `${safeBase}_transcript_${files.transcriptCueCount}cue.srt`,
      files.transcriptSrt,
      "application/x-subrip",
    );
  }
  downloadTextFile(
    `${safeBase}_summary_${files.summaryCueCount}cue.srt`,
    files.summarySrt,
    "application/x-subrip",
  );
  if (files.readOnlyCueCount > 0) {
    downloadTextFile(
      `${safeBase}_titles_readonly_${files.readOnlyCueCount}cue.srt`,
      files.readOnlySrt,
      "application/x-subrip",
    );
  }
  downloadTextFile(`${safeBase}_premiere_README.txt`, PREMIERE_README);

  return {
    transcriptCueCount: files.transcriptCueCount,
    summaryCueCount: files.summaryCueCount,
  };
}
