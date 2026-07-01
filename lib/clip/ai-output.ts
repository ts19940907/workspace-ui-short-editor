import { get } from "@vercel/blob";
import { z } from "zod";

import type {
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TranscriptSegment,
} from "@/lib/clip-schema";
import {
  isPrivateVercelBlobUrl,
  isVercelBlobUrl,
} from "@/lib/cloud/blob-video";
import { mockRunAiOutput } from "@/lib/clip/mock-pipeline";
import {
  geminiGenerateContent,
  geminiGenerateContentWithMedia,
  geminiGenerateContentWithRemoteUrl,
  getGeminiModel,
  guessVideoMimeType,
  hasGeminiKey,
  parseGeminiJsonText,
} from "@/lib/clip/gemini";
import { isValidHttpUrl, isYoutubeUrl, normalizeSourceUrl } from "@/lib/clip/source-url";
import { removeTranscriptFillers } from "@/lib/clip/transcript-display";
import {
  captionsToTranscriptSegments,
  fetchYoutubeCaptions,
  prepareCaptionSummaryInput,
  splitCaptionsByDuration,
  type YoutubeCaptionLine,
} from "@/lib/clip/youtube-captions";

const geminiTranscriptSegmentSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});

const geminiTranscriptResponseSchema = z.object({
  segments: z.array(geminiTranscriptSegmentSchema),
});

const aiTopicSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  topicLabel: z.string().min(1),
  summaryText: z.string().min(1),
  sourceSegmentIds: z.array(z.string()),
});

const aiTopicsResponseSchema = z.object({
  topics: z.array(aiTopicSchema),
});

const liveStreamAnalysisSchema = z.object({
  durationMs: z.number().int().nonnegative().optional(),
  segments: z.array(geminiTranscriptSegmentSchema),
  topics: z.array(aiTopicSchema),
});

const liveStreamSummarySchema = z.object({
  durationMs: z.number().int().nonnegative().optional(),
  topics: z.array(aiTopicSchema),
});

export type ClipOutputMode = "full" | "summaryOnly";

/** 画面のライブ配信リンク欄の値をプロンプトに埋め込む */
export function buildSummaryRequestPrompt(sourceUrl?: string): string {
  const trimmed = sourceUrl?.trim();
  const link = trimmed
    ? isValidHttpUrl(trimmed)
      ? normalizeSourceUrl(trimmed)
      : trimmed
    : "（ライブ配信リンク未入力）";
  return `${link} 記載しているURLの配信のトピックが変わるたびにHH:mm:ss形式のタイムテーブルと話している内容を記載してください。`;
}

function buildLiveStreamSummarySystemPrompt(sourceUrl: string): string {
  return `${buildSummaryRequestPrompt(sourceUrl)}

JSON 形式で出力:
{
  "durationMs": number,
  "topics": [
    {
      "startMs": number,
      "endMs": number,
      "topicLabel": string,
      "summaryText": string,
      "sourceSegmentIds": string[]
    }
  ]
}

ルール:
- 日本語で出力
- topics の startMs/endMs は HH:mm:ss に対応するミリ秒整数（タイムテーブルの各区間）
- topicLabel は短い見出し（編集不可タイトル層用）
- summaryText はその区間で話している内容（編集可能タイトル層用）
- durationMs は動画全体の長さ（ミリ秒）
- sourceSegmentIds は空配列 [] でよい（文字起こしなし）`;
}

function buildCaptionSummarySystemPrompt(sourceUrl: string): string {
  return `${buildSummaryRequestPrompt(sourceUrl)}

YouTube 字幕テキスト（タイムスタンプ付き）を読み、上記タイムテーブルに沿って topics を JSON で出力してください。

JSON 形式で出力:
{
  "durationMs": number,
  "topics": [
    {
      "startMs": number,
      "endMs": number,
      "topicLabel": string,
      "summaryText": string,
      "sourceSegmentIds": string[]
    }
  ]
}

ルール:
- 日本語で出力
- 入力の [M:SS-M:SS] タイムスタンプを参照し、topics の startMs/endMs をミリ秒整数で正確に設定する
- 各区間は重ならない。1 チャンクあたり最大 3 セクション
- topicLabel は短い見出し、summaryText はその区間で話している内容
- durationMs は最後の topic の endMs または入力末尾の時刻から推定
- sourceSegmentIds は空配列 [] でよい`;
}

function buildLocalVideoSummarySystemPrompt(sourceUrl?: string): string {
  return `${buildSummaryRequestPrompt(sourceUrl)}

動画の内容を視聴し、上記タイムテーブルに沿って topics を JSON で出力してください。

JSON 形式で出力:
{
  "durationMs": number,
  "topics": [
    {
      "startMs": number,
      "endMs": number,
      "topicLabel": string,
      "summaryText": string,
      "sourceSegmentIds": string[]
    }
  ]
}

ルール:
- 日本語で出力
- topics の startMs/endMs は HH:mm:ss に対応するミリ秒整数
- topicLabel は短い見出し、summaryText はその区間で話している内容
- sourceSegmentIds は空配列 [] でよい`;
}

function buildTitleSystemPrompt(sourceUrl?: string): string {
  return `${buildSummaryRequestPrompt(sourceUrl)}

文字起こしセグメントを読み、上記タイムテーブルに沿って topics を JSON で出力してください。

JSON 形式で出力:
{
  "topics": [
    {
      "startMs": number,
      "endMs": number,
      "topicLabel": string,
      "summaryText": string,
      "sourceSegmentIds": string[]
    }
  ]
}

ルール:
- topicLabel は短い見出し（編集不可タイトル層用）
- summaryText はその区間で話している内容（編集可能タイトル層用）
- startMs/endMs はセグメントの startMs/endMs から決める（HH:mm:ss に対応するミリ秒整数）
- sourceSegmentIds は該当する文字起こしセグメント id を列挙
- 日本語で出力`;
}

const LIVE_STREAM_SYSTEM_PROMPT = `あなたはライブ配信の切り抜き編集アシスタントです。指定された動画の内容を視聴し、タイムテーブル（話題区切り）ごとに文字起こしと要約を作成してください。

JSON 形式で出力:
{
  "durationMs": number,
  "segments": [
    { "startMs": number, "endMs": number, "text": string }
  ],
  "topics": [
    {
      "startMs": number,
      "endMs": number,
      "topicLabel": string,
      "summaryText": string,
      "sourceSegmentIds": string[]
    }
  ]
}

ルール:
- 日本語で出力
- segments は意味のまとまりごとの文字起こし（目安 5〜30 秒）。先頭から seg-1, seg-2... と番号付けし、topics の sourceSegmentIds で参照する
- topics はタイムテーブル（話題区切り）ごとの要約。3〜8 セクション程度
- topicLabel は短い見出し（編集不可タイトル層用）
- summaryText は 1 行の要約（編集可能タイトル層用）
- startMs/endMs はミリ秒整数
- durationMs は動画全体の長さ（ミリ秒）`;

const TRANSCRIPT_SYSTEM_PROMPT = `あなたは日本語の文字起こし担当です。動画の音声を聞き取り、タイムスタンプ付きの文字起こしを作成してください。

JSON 形式で出力:
{
  "segments": [
    {
      "startMs": number,
      "endMs": number,
      "text": string
    }
  ]
}

ルール:
- 日本語で文字起こしする
- 意味のまとまりごとにセグメントを分ける（目安: 5〜20 秒）
- startMs/endMs はミリ秒整数
- 最初のセグメントは startMs: 0 から始める
- フィラー（えー、あの、えっと等）は書かない
- 1 セグメント = 1 文（「。」で終わる単位）`;

export type AiClipOutput = Pick<
  import("@/lib/clip-schema").ClipProject,
  "segments" | "readOnlyTitles" | "editableTitles" | "durationMs"
> & { mode: "ai" | "mock"; mockReason?: "no_api_key" };

export function normalizeTranscriptSegments(
  segments: z.infer<typeof geminiTranscriptSegmentSchema>[],
): TranscriptSegment[] {
  return segments
    .map((seg, index) => {
      const startMs = Math.max(0, seg.startMs);
      let endMs = Math.max(0, seg.endMs);
      if (endMs <= startMs) {
        endMs = startMs + 1000;
      }
      return {
        id: `seg-${index + 1}`,
        startMs,
        endMs,
        text: removeTranscriptFillers(seg.text.trim()),
      };
    })
    .filter((seg) => seg.text.length > 0);
}

/** @deprecated normalizeTranscriptSegments の別名（テスト互換） */
export function whisperSegmentsToTranscript(
  segments: Array<{ start: number; end: number; text: string }>,
): TranscriptSegment[] {
  return normalizeTranscriptSegments(
    segments.map((seg) => ({
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(seg.end * 1000),
      text: seg.text,
    })),
  );
}

export function topicsToTitleLayers(
  topics: z.infer<typeof aiTopicSchema>[],
): Pick<AiClipOutput, "readOnlyTitles" | "editableTitles"> {
  const readOnlyTitles: ReadOnlyTitleSegment[] = topics.map((topic, index) => ({
    id: `ro-${index + 1}`,
    startMs: topic.startMs,
    endMs: topic.endMs,
    text: topic.topicLabel,
  }));

  const editableTitles: EditableTitleSegment[] = topics.map((topic, index) => ({
    id: `edit-${index + 1}`,
    startMs: topic.startMs,
    endMs: topic.endMs,
    topicLabel: topic.topicLabel,
    text: topic.summaryText,
    sourceSegmentIds: topic.sourceSegmentIds,
  }));

  return { readOnlyTitles, editableTitles };
}

const MAX_SEGMENTS_FOR_TITLE_GENERATION = 120;
export function normalizeTopicTimeline(
  topics: z.infer<typeof aiTopicSchema>[],
  durationMs: number,
): z.infer<typeof aiTopicSchema>[] {
  const clamped = topics
    .map((topic) => {
      const startMs = Math.max(0, Math.min(topic.startMs, durationMs));
      const endMs = Math.max(
        startMs + 1000,
        Math.min(topic.endMs, durationMs),
      );
      return { ...topic, startMs, endMs };
    })
    .filter((topic) => topic.endMs > topic.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const aligned: z.infer<typeof aiTopicSchema>[] = [];
  for (const topic of clamped) {
    const prev = aligned[aligned.length - 1];
    const startMs = prev && topic.startMs < prev.endMs ? prev.endMs : topic.startMs;
    if (topic.endMs <= startMs) continue;
    aligned.push({ ...topic, startMs });
  }

  return aligned;
}

type TopicMeta = Pick<
  z.infer<typeof aiTopicSchema>,
  "topicLabel" | "summaryText"
> & {
  sourceSegmentIds?: string[];
  startMs?: number;
  endMs?: number;
};

/** 話題ラベルに、文字起こしセグメントの実タイムスタンプを割り当てる（Premiere/SRT 同期用） */
export function assignTopicTimeRangesFromSegments(
  topics: TopicMeta[],
  segments: TranscriptSegment[],
): z.infer<typeof aiTopicSchema>[] {
  if (topics.length === 0) return [];

  if (segments.length === 0) {
    return topics
      .map((topic) => ({
        topicLabel: topic.topicLabel,
        summaryText: topic.summaryText,
        sourceSegmentIds: topic.sourceSegmentIds ?? [],
        startMs: topic.startMs ?? 0,
        endMs: topic.endMs ?? 0,
      }))
      .filter((topic) => topic.endMs > topic.startMs);
  }

  return topics
    .map((topic, index) => {
      const startIndex = Math.floor((index * segments.length) / topics.length);
      const endIndex = Math.floor(((index + 1) * segments.length) / topics.length);
      const chunk = segments.slice(
        startIndex,
        Math.max(endIndex, startIndex + 1),
      );
      if (chunk.length === 0) return null;

      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      if (!first || !last) return null;

      return {
        topicLabel: topic.topicLabel,
        summaryText: topic.summaryText,
        sourceSegmentIds: chunk.map((seg) => seg.id),
        startMs: first.startMs,
        endMs: last.endMs,
      };
    })
    .filter((topic): topic is z.infer<typeof aiTopicSchema> => topic !== null);
}

/** 長尺文字起こしを要約 API 向けに間引く（タイムスタンプは保持） */
export function compressSegmentsForTitleGeneration(
  segments: TranscriptSegment[],
  maxCount = MAX_SEGMENTS_FOR_TITLE_GENERATION,
): TranscriptSegment[] {
  if (segments.length <= maxCount) return segments;

  const bucketSize = Math.ceil(segments.length / maxCount);
  const compressed: TranscriptSegment[] = [];

  for (let index = 0; index < segments.length; index += bucketSize) {
    const bucket = segments.slice(index, index + bucketSize);
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    if (!first || !last) continue;

    compressed.push({
      id: first.id,
      startMs: first.startMs,
      endMs: last.endMs,
      text: bucket.map((seg) => seg.text).join(" "),
    });
  }

  return compressed;
}

function inferDurationMs(
  segments: TranscriptSegment[],
  topics: z.infer<typeof aiTopicSchema>[],
  fallbackMs: number,
): number {
  const segmentMax = segments.reduce((max, seg) => Math.max(max, seg.endMs), 0);
  const topicMax = topics.reduce((max, topic) => Math.max(max, topic.endMs), 0);
  return Math.max(segmentMax, topicMax, fallbackMs);
}

async function fetchVideoBlob(
  videoUrl: string,
  fileName?: string,
): Promise<{ blob: Blob; fileName: string }> {
  if (isVercelBlobUrl(videoUrl)) {
    const access = isPrivateVercelBlobUrl(videoUrl) ? "private" : "public";
    const result = await get(videoUrl, { access });
    if (!result?.stream) {
      throw new Error("動画ファイルが見つかりませんでした");
    }
    const blob = await new Response(result.stream).blob();
    return { blob, fileName: fileName ?? "video.mp4" };
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error("動画ファイルの取得に失敗しました");
  }
  const blob = await response.blob();
  return { blob, fileName: fileName ?? "video.mp4" };
}

async function summarizeCaptionChunk(
  sourceUrl: string,
  chunkLines: YoutubeCaptionLine[],
  rangeLabel: string,
): Promise<z.infer<typeof aiTopicSchema>[]> {
  const { text } = prepareCaptionSummaryInput(chunkLines);
  const content = await geminiGenerateContent({
    system: buildCaptionSummarySystemPrompt(sourceUrl),
    user: [
      buildSummaryRequestPrompt(sourceUrl),
      "",
      "以下は YouTube 動画の字幕の一部です。",
      `対象区間: ${rangeLabel}`,
      "topics の startMs/endMs は動画全体の絶対時刻（ミリ秒）で返してください。",
      "",
      text,
    ].join("\n"),
    temperature: 0.2,
    jsonObject: true,
  });

  const parsed = liveStreamSummarySchema.parse(parseGeminiJsonText(content));
  if (parsed.topics.length === 0) {
    throw new Error("Gemini API の要約結果が空でした");
  }
  return parsed.topics;
}

async function processYoutubeFromCaptions(
  sourceUrl: string,
  fallbackDurationMs: number,
  outputMode: ClipOutputMode,
): Promise<AiClipOutput> {
  const { lines: captions, durationMs: youtubeDurationMs } =
    await fetchYoutubeCaptions(sourceUrl);
  const captionEndMs = captions.reduce(
    (max, line) => Math.max(max, line.endMs),
    0,
  );
  const durationMs = youtubeDurationMs || captionEndMs || fallbackDurationMs;
  const segments = normalizeTranscriptSegments(
    captionsToTranscriptSegments(captions),
  );

  if (outputMode === "summaryOnly") {
    const chunks = splitCaptionsByDuration(captions, 600_000);
    const topicMeta: TopicMeta[] = [];

    for (const chunk of chunks) {
      const chunkStart = chunk[0]?.startMs ?? 0;
      const chunkEnd = chunk.reduce((max, line) => Math.max(max, line.endMs), 0);
      const rangeLabel = `${Math.floor(chunkStart / 60_000)}:${String(Math.floor((chunkStart % 60_000) / 1000)).padStart(2, "0")} 〜 ${Math.floor(chunkEnd / 60_000)}:${String(Math.floor((chunkEnd % 60_000) / 1000)).padStart(2, "0")}`;
      const chunkTopics = await summarizeCaptionChunk(
        sourceUrl,
        chunk,
        rangeLabel,
      );
      topicMeta.push(
        ...chunkTopics.map((topic) => ({
          topicLabel: topic.topicLabel,
          summaryText: topic.summaryText,
        })),
      );
    }

    const chunkSegments = normalizeTranscriptSegments(
      captionsToTranscriptSegments(captions),
    );
    const topics = assignTopicTimeRangesFromSegments(topicMeta, chunkSegments);
    const titled = topicsToTitleLayers(topics);

    return {
      segments: [],
      ...titled,
      durationMs: inferDurationMs([], topics, durationMs),
      mode: "ai",
    };
  }

  const titled = await generateTitlesFromTranscript(
    compressSegmentsForTitleGeneration(segments),
    durationMs,
    sourceUrl,
  );
  const topics = assignTopicTimeRangesFromSegments(
    titled.editableTitles.map((item) => ({
      topicLabel: item.topicLabel,
      summaryText: item.text,
    })),
    segments,
  );
  const layers = topicsToTitleLayers(topics);

  return {
    segments,
    ...layers,
    durationMs: inferDurationMs(segments, topics, durationMs),
    mode: "ai",
  };
}

async function analyzeLiveStreamUrl(
  sourceUrl: string,
  fallbackDurationMs: number,
  outputMode: ClipOutputMode,
): Promise<AiClipOutput> {
  const normalizedUrl = normalizeSourceUrl(sourceUrl);

  if (isYoutubeUrl(normalizedUrl)) {
    return processYoutubeFromCaptions(
      normalizedUrl,
      fallbackDurationMs,
      outputMode,
    );
  }

  if (outputMode === "summaryOnly") {
    const content = await geminiGenerateContentWithRemoteUrl({
      system: buildLiveStreamSummarySystemPrompt(normalizedUrl),
      user: buildSummaryRequestPrompt(normalizedUrl),
      sourceUrl: normalizedUrl,
      temperature: 0.2,
      jsonObject: true,
    });

    const parsed = liveStreamSummarySchema.parse(parseGeminiJsonText(content));
    if (parsed.topics.length === 0) {
      throw new Error("Gemini API の要約結果が空でした");
    }

    const titled = topicsToTitleLayers(parsed.topics);
    return {
      segments: [],
      ...titled,
      durationMs:
        parsed.durationMs ??
        inferDurationMs([], parsed.topics, fallbackDurationMs),
      mode: "ai",
    };
  }

  const content = await geminiGenerateContentWithRemoteUrl({
    system: LIVE_STREAM_SYSTEM_PROMPT,
    user: [
      "次のライブ配信（動画）URL を視聴してください。",
      "タイムテーブル（話題区切り）ごとに内容を要約し、文字起こし segments も含めて JSON で返してください。",
      "",
      `URL: ${normalizedUrl}`,
    ].join("\n"),
    sourceUrl: normalizedUrl,
    temperature: 0.2,
    jsonObject: true,
  });

  const parsed = liveStreamAnalysisSchema.parse(parseGeminiJsonText(content));
  if (parsed.segments.length === 0 || parsed.topics.length === 0) {
    throw new Error("Gemini API の解析結果が空でした");
  }

  const segments = normalizeTranscriptSegments(parsed.segments);
  const titled = topicsToTitleLayers(parsed.topics);

  return {
    segments,
    ...titled,
    durationMs:
      parsed.durationMs ??
      inferDurationMs(segments, parsed.topics, fallbackDurationMs),
    mode: "ai",
  };
}

async function transcribeLocalVideoWithGemini(
  videoBlob: Blob,
  fileName: string,
  durationMs: number,
): Promise<TranscriptSegment[]> {
  const content = await geminiGenerateContentWithMedia({
    system: TRANSCRIPT_SYSTEM_PROMPT,
    user: `この動画（約 ${Math.round(durationMs / 1000)} 秒）の音声を文字起こしし、segments を JSON で返してください。`,
    mediaBlob: videoBlob,
    mediaFileName: fileName,
    mimeType: guessVideoMimeType(fileName),
    temperature: 0.1,
    jsonObject: true,
  });

  const parsed = geminiTranscriptResponseSchema.parse(
    parseGeminiJsonText(content),
  );
  if (parsed.segments.length === 0) {
    throw new Error("Gemini API returned empty transcript");
  }

  return normalizeTranscriptSegments(parsed.segments);
}

async function generateTitlesFromTranscript(
  segments: TranscriptSegment[],
  durationMs: number,
  sourceUrl?: string,
): Promise<Pick<AiClipOutput, "readOnlyTitles" | "editableTitles">> {
  const payload = {
    durationMs,
    segments: segments.map((seg) => ({
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
    })),
  };

  const content = await geminiGenerateContent({
    system: buildTitleSystemPrompt(sourceUrl),
    user: `${buildSummaryRequestPrompt(sourceUrl)}\n\n以下の文字起こしをもとに topics を JSON で返してください:\n\n${JSON.stringify(payload, null, 2)}`,
    temperature: 0.3,
    jsonObject: true,
  });

  const parsed = aiTopicsResponseSchema.parse(parseGeminiJsonText(content));
  if (parsed.topics.length === 0) {
    throw new Error("要約タイトルの生成結果が空でした");
  }

  return topicsToTitleLayers(parsed.topics);
}

async function summarizeLocalVideoWithGemini(
  videoBlob: Blob,
  fileName: string,
  durationMs: number,
  sourceUrl?: string,
): Promise<Pick<AiClipOutput, "readOnlyTitles" | "editableTitles" | "durationMs">> {
  const content = await geminiGenerateContentWithMedia({
    system: buildLocalVideoSummarySystemPrompt(sourceUrl),
    user: `${buildSummaryRequestPrompt(sourceUrl)}\n\nこの動画（約 ${Math.round(durationMs / 1000)} 秒）を視聴し、topics を JSON で返してください。`,
    mediaBlob: videoBlob,
    mediaFileName: fileName,
    mimeType: guessVideoMimeType(fileName),
    temperature: 0.2,
    jsonObject: true,
  });

  const parsed = liveStreamSummarySchema.parse(parseGeminiJsonText(content));
  if (parsed.topics.length === 0) {
    throw new Error("Gemini API の要約結果が空でした");
  }

  const titled = topicsToTitleLayers(parsed.topics);
  return {
    ...titled,
    durationMs: parsed.durationMs ?? inferDurationMs([], parsed.topics, durationMs),
  };
}

async function analyzeLocalVideo(
  options: {
    durationMs: number;
    sourceUrl?: string;
    videoUrl?: string;
    videoFileName?: string;
    videoBlob?: Blob;
    outputMode: ClipOutputMode;
  },
): Promise<AiClipOutput> {
  const { durationMs, sourceUrl, videoUrl, videoFileName, videoBlob, outputMode } =
    options;

  let blob = videoBlob;
  let name = videoFileName ?? "video.mp4";

  if (!blob) {
    if (!videoUrl) {
      throw new Error(
        "ローカル動画の解析には動画ファイルが必要です。左ペインから動画を添付してください。",
      );
    }
    const fetched = await fetchVideoBlob(videoUrl, videoFileName);
    blob = fetched.blob;
    name = fetched.fileName;
  }

  if (outputMode === "summaryOnly") {
    const summarized = await summarizeLocalVideoWithGemini(
      blob,
      name,
      durationMs,
      sourceUrl,
    );
    return {
      segments: [],
      readOnlyTitles: summarized.readOnlyTitles,
      editableTitles: summarized.editableTitles,
      durationMs: summarized.durationMs ?? durationMs,
      mode: "ai",
    };
  }

  const segments = await transcribeLocalVideoWithGemini(blob, name, durationMs);
  const titled = await generateTitlesFromTranscript(segments, durationMs, sourceUrl);

  return {
    segments,
    ...titled,
    durationMs,
    mode: "ai",
  };
}

export async function runAiClipOutput(options: {
  durationMs: number;
  sourceUrl?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoBlob?: Blob;
  outputMode?: ClipOutputMode;
}): Promise<AiClipOutput> {
  const {
    durationMs,
    sourceUrl,
    videoUrl,
    videoFileName,
    videoBlob,
    outputMode = "full",
  } = options;
  const normalizedSource = sourceUrl?.trim();
  const hasSourceUrl = Boolean(normalizedSource && isValidHttpUrl(normalizedSource));
  const hasLocalVideo = Boolean(videoBlob || videoUrl);

  if (!hasSourceUrl && !hasLocalVideo) {
    throw new Error(
      "ライブ配信リンクを入力するか、左ペインから動画ファイルを添付してください。",
    );
  }

  if (!hasGeminiKey()) {
    const mockDuration = durationMs > 0 ? durationMs : 420_000;
    return {
      ...mockRunAiOutput(mockDuration, outputMode),
      durationMs: mockDuration,
      mode: "mock",
      mockReason: "no_api_key",
    };
  }

  if (hasSourceUrl && normalizedSource) {
    return analyzeLiveStreamUrl(normalizedSource, durationMs, outputMode);
  }

  return analyzeLocalVideo({
    durationMs: durationMs > 0 ? durationMs : 420_000,
    sourceUrl: sourceUrl?.trim() || undefined,
    videoUrl,
    videoFileName,
    videoBlob,
    outputMode,
  });
}

/** テスト・デバッグ用 */
export function getGeminiClipModel(): string {
  return getGeminiModel();
}
