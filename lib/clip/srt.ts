import { formatSrtTime } from "@/lib/clip/time";
import type { EditableTitleSegment, TranscriptSegment } from "@/lib/clip-schema";

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

export type PremiereExportFiles = {
  transcriptSrt: string;
  transcriptCueCount: number;
  editableTitlesSrt: string;
  editableTitlesCueCount: number;
};

export function buildPremiereExportFiles(
  segments: TranscriptSegment[],
  editableTitles: EditableTitleSegment[],
): PremiereExportFiles {
  const transcriptSrt = transcriptToSrt(segments);
  const editableTitlesSrt = editableTitlesToSrt(editableTitles);

  return {
    transcriptSrt,
    transcriptCueCount: countSrtCues(segments),
    editableTitlesSrt,
    editableTitlesCueCount: countSrtCues(editableTitles),
  };
}

export function downloadPremiereExport(
  projectTitle: string,
  segments: TranscriptSegment[],
  editableTitles: EditableTitleSegment[],
): { transcriptCueCount: number; editableTitlesCueCount: number } {
  const files = buildPremiereExportFiles(segments, editableTitles);
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
    `${safeBase}_editable_titles_${files.editableTitlesCueCount}cue.srt`,
    files.editableTitlesSrt,
    "application/x-subrip",
  );

  return {
    transcriptCueCount: files.transcriptCueCount,
    editableTitlesCueCount: files.editableTitlesCueCount,
  };
}
