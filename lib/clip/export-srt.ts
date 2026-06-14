import type {
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TranscriptSegment,
} from "@/lib/clip-schema";
import {
  downloadPremiereExport,
  downloadTextFile,
  type PremiereExportFiles,
} from "@/lib/clip/srt";

export async function requestPremiereExportFiles(options: {
  sourceUrl?: string;
  segments: TranscriptSegment[];
  editableTitles: EditableTitleSegment[];
  readOnlyTitles: ReadOnlyTitleSegment[];
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
  readOnlyTitles: ReadOnlyTitleSegment[];
}): Promise<{ transcriptCueCount: number; summaryCueCount: number }> {
  const trimmedSource = options.sourceUrl?.trim();
  const hasYoutubeSource = Boolean(trimmedSource);

  if (hasYoutubeSource) {
    const files = await requestPremiereExportFiles({
      sourceUrl: trimmedSource,
      segments: options.segments,
      editableTitles: options.editableTitles,
      readOnlyTitles: options.readOnlyTitles,
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
    downloadTextFile(
      `${safeBase}_premiere_README.txt`,
      `Premiere Pro への読み込み手順
========================

1. YouTube からダウンロードした「同じ動画」を V1 の 00:00:00:00 から配置
2. ${safeBase}_transcript_${files.transcriptCueCount}cue.srt … 文字起こし（${files.transcriptCueCount} キュー）
3. ${safeBase}_summary_${files.summaryCueCount}cue.srt … 要約タイトル（${files.summaryCueCount} キュー）

※ 文字起こしは字幕1行ごと、要約は話題ごとです。件数が違うのが正常です。
`,
    );

    return {
      transcriptCueCount: files.transcriptCueCount,
      summaryCueCount: files.summaryCueCount,
    };
  }

  return downloadPremiereExport(
    options.projectTitle,
    options.segments,
    options.editableTitles,
    options.readOnlyTitles,
  );
}
