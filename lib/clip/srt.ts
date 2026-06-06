import { formatSrtTime } from "@/lib/clip/time";
import type { EditableTitleSegment, TranscriptSegment } from "@/lib/clip-schema";

type TimedText = { startMs: number; endMs: number; text: string };

export function segmentsToSrt(segments: TimedText[]): string {
  return segments
    .map((seg, index) => {
      const start = formatSrtTime(seg.startMs);
      const end = formatSrtTime(seg.endMs);
      return `${index + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    })
    .join("\n");
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

1. 編集用の動画クリップをタイムラインの V1 に配置する
2. transcript.srt をキャプショントラック 1 に読み込み（文字起こし）
3. summary.srt をキャプショントラック 2 に読み込み（編集可能なタイトル）
4. 編集不可タイトルは Premiere 上でテキスト参照用としてご利用ください

※ 2 本の SRT は同じタイムコード基準です。
`;

export function downloadPremiereExport(
  projectTitle: string,
  segments: TranscriptSegment[],
  editableTitles: EditableTitleSegment[],
): void {
  const safeBase = projectTitle.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/gu, "_") || "project";
  downloadTextFile(`${safeBase}_transcript.srt`, transcriptToSrt(segments), "application/x-subrip");
  downloadTextFile(`${safeBase}_summary.srt`, editableTitlesToSrt(editableTitles), "application/x-subrip");
  downloadTextFile(`${safeBase}_premiere_README.txt`, PREMIERE_README);
}
