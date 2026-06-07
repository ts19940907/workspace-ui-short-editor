import { z } from "zod";

import type {
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TranscriptSegment,
} from "@/lib/clip-schema";
import { isValidHttpUrl } from "@/lib/clip/source-url";

export const clipOutputModeSchema = z.enum(["full", "summaryOnly"]);

export const clipOutputJsonRequestSchema = z.object({
  durationMs: z.number().int().nonnegative().default(0),
  sourceUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  videoFileName: z.string().optional(),
  outputMode: clipOutputModeSchema.default("summaryOnly"),
});

export const clipOutputResponseSchema = z.object({
  segments: z.array(
    z.object({
      id: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
    }),
  ),
  readOnlyTitles: z.array(
    z.object({
      id: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
    }),
  ),
  editableTitles: z.array(
    z.object({
      id: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
      topicLabel: z.string(),
      sourceSegmentIds: z.array(z.string()),
    }),
  ),
  durationMs: z.number().int().nonnegative().optional(),
  mode: z.enum(["ai", "mock"]),
  mockReason: z.enum(["no_api_key"]).optional(),
});

export type ClipOutputResponse = z.infer<typeof clipOutputResponseSchema>;

export type ClipOutputMode = z.infer<typeof clipOutputModeSchema>;

export type RequestClipOutputOptions = {
  durationMs?: number;
  sourceUrl?: string;
  videoUrl?: string;
  videoFileName?: string;
  /** ブラウザ内 blob: URL（サーバーから取得できないためファイルとして送信） */
  localVideoUrl?: string;
  outputMode?: ClipOutputMode;
};

export type ClipOutputData = Pick<
  import("@/lib/clip-schema").ClipProject,
  "segments" | "readOnlyTitles" | "editableTitles" | "durationMs"
> & { mode: ClipOutputResponse["mode"] };

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || "AI 出力に失敗しました";
}

export async function requestClipOutput(
  options: RequestClipOutputOptions,
): Promise<ClipOutputData> {
  const {
    durationMs = 0,
    sourceUrl,
    videoUrl,
    videoFileName,
    localVideoUrl,
    outputMode = "summaryOnly",
  } = options;

  const trimmedSource = sourceUrl?.trim();
  const hasSourceUrl = Boolean(trimmedSource && isValidHttpUrl(trimmedSource));

  if (!hasSourceUrl && !localVideoUrl && !videoUrl) {
    throw new Error(
      "ライブ配信リンクを入力するか、左ペインから動画ファイルを添付してください。",
    );
  }

  if (localVideoUrl) {
    const blobResponse = await fetch(localVideoUrl);
    if (!blobResponse.ok) {
      throw new Error("ローカル動画の読み込みに失敗しました");
    }
    const videoBlob = await blobResponse.blob();
    const form = new FormData();
    form.append("durationMs", String(durationMs));
    form.append("outputMode", outputMode);
    if (trimmedSource) form.append("sourceUrl", trimmedSource);
    form.append("video", videoBlob, videoFileName ?? "video.mp4");

    const response = await fetch("/api/clip/output", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }
    return clipOutputResponseSchema.parse(await response.json());
  }

  const response = await fetch("/api/clip/output", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      durationMs,
      sourceUrl: trimmedSource,
      videoUrl,
      videoFileName,
      outputMode,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return clipOutputResponseSchema.parse(await response.json());
}

/** プロジェクトの文字起こし全文を校正用テキストに整形 */
export function transcriptToProofreadText(
  segments: TranscriptSegment[],
): string {
  return segments.map((seg) => seg.text).join("\n");
}

/** 校正結果を文字起こしセグメントに反映（行数が一致する場合のみ） */
export function applyProofreadToTranscript(
  segments: TranscriptSegment[],
  correctedText: string,
): TranscriptSegment[] | null {
  const lines = correctedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length !== segments.length) {
    return null;
  }

  return segments.map((seg, index) => ({
    ...seg,
    text: lines[index] ?? seg.text,
  }));
}

export type { TranscriptSegment, EditableTitleSegment, ReadOnlyTitleSegment };
