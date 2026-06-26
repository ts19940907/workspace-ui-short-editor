import type { EditableTitleSegment, TranscriptSegment } from "@/lib/clip-schema";
import {
  downloadPremiereExport,
  downloadTextFile,
  type PremiereExportFiles,
} from "@/lib/clip/srt";

export async function requestPremiereExportFiles(options: {
  sourceUrl?: string;
  segments: TranscriptSegment[];
  editableTitles: EditableTitleSegment[];
}): Promise<PremiereExportFiles> {
  const response = await fetch("/api/clip/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "SRT の生成に失敗しました");
  }

  return response.json() as Promise<PremiereExportFiles>;
}

export async function downloadPremiereExportWithSource(options: {
  projectTitle: string;
  sourceUrl?: string;
  segments: TranscriptSegment[];
  editableTitles: EditableTitleSegment[];
}): Promise<{ transcriptCueCount: number; editableTitlesCueCount: number }> {
  const trimmedSource = options.sourceUrl?.trim();
  const hasYoutubeSource = Boolean(trimmedSource);

  if (hasYoutubeSource) {
    const files = await requestPremiereExportFiles({
      sourceUrl: trimmedSource,
      segments: options.segments,
      editableTitles: options.editableTitles,
    });

    const safeBase =
      options.projectTitle.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/gu, "_") ||
      "project";

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

  return downloadPremiereExport(
    options.projectTitle,
    options.segments,
    options.editableTitles,
  );
}
