import type {
  ClipProject,
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TranscriptSegment,
} from "@/lib/clip-schema";

const MOCK_EDITABLE_BY_DURATION: EditableTitleSegment[] = [
  {
    id: "edit-1",
    startMs: 0,
    endMs: 95_000,
    topicLabel: "オープニング・本日のテーマ",
    text: "配信開始と本日の概要",
    sourceSegmentIds: ["seg-1", "seg-2"],
  },
  {
    id: "edit-2",
    startMs: 95_000,
    endMs: 248_000,
    topicLabel: "製品デモ",
    text: "新機能3点のデモと操作説明",
    sourceSegmentIds: ["seg-3", "seg-4", "seg-5"],
  },
  {
    id: "edit-3",
    startMs: 248_000,
    endMs: 420_000,
    topicLabel: "価格・提供時期",
    text: "料金プランとロードマップ",
    sourceSegmentIds: ["seg-6", "seg-7"],
  },
];

const MOCK_READONLY_BY_DURATION: ReadOnlyTitleSegment[] = [
  {
    id: "ro-1",
    startMs: 0,
    endMs: 95_000,
    text: "オープニング・本日のテーマ",
  },
  {
    id: "ro-2",
    startMs: 95_000,
    endMs: 248_000,
    text: "製品デモ",
  },
  {
    id: "ro-3",
    startMs: 248_000,
    endMs: 420_000,
    text: "価格・提供時期",
  },
];

function scaleTranscript(
  segments: TranscriptSegment[],
  sourceDurationMs: number,
  targetDurationMs: number,
): TranscriptSegment[] {
  if (targetDurationMs <= 0 || sourceDurationMs <= 0) return segments;
  const ratio = targetDurationMs / sourceDurationMs;
  return segments.map((seg) => ({
    ...seg,
    startMs: Math.round(seg.startMs * ratio),
    endMs: Math.round(seg.endMs * ratio),
  }));
}

function scaleEditable(
  items: EditableTitleSegment[],
  sourceDurationMs: number,
  targetDurationMs: number,
): EditableTitleSegment[] {
  if (targetDurationMs <= 0 || sourceDurationMs <= 0) return items;
  const ratio = targetDurationMs / sourceDurationMs;
  return items.map((item) => ({
    ...item,
    startMs: Math.round(item.startMs * ratio),
    endMs: Math.round(item.endMs * ratio),
  }));
}

function scaleReadOnly(
  items: ReadOnlyTitleSegment[],
  sourceDurationMs: number,
  targetDurationMs: number,
): ReadOnlyTitleSegment[] {
  if (targetDurationMs <= 0 || sourceDurationMs <= 0) return items;
  const ratio = targetDurationMs / sourceDurationMs;
  return items.map((item) => ({
    ...item,
    startMs: Math.round(item.startMs * ratio),
    endMs: Math.round(item.endMs * ratio),
  }));
}

const MOCK_TRANSCRIPT_BASE: TranscriptSegment[] = [
  {
    id: "seg-1",
    startMs: 0,
    endMs: 42_000,
    text: "みなさんこんにちは、今日のライブ配信へようこそ。",
  },
  {
    id: "seg-2",
    startMs: 42_000,
    endMs: 95_000,
    text: "本日は新機能の発表と、その後 Q&A を予定しています。",
  },
  {
    id: "seg-3",
    startMs: 95_000,
    endMs: 148_000,
    text: "まずダッシュボードの刷新から見ていきましょう。",
  },
  {
    id: "seg-4",
    startMs: 148_000,
    endMs: 198_000,
    text: "タイムライン上でプレビューと文字起こしを同期できます。",
  },
  {
    id: "seg-5",
    startMs: 198_000,
    endMs: 248_000,
    text: "タイムライン上でプレビューと文字起こしを同期できます。",
  },
  {
    id: "seg-6",
    startMs: 248_000,
    endMs: 332_000,
    text: "料金はスタンダードとプロの2プランを用意しています。",
  },
  {
    id: "seg-7",
    startMs: 332_000,
    endMs: 420_000,
    text: "正式リリースは来月を予定しています。",
  },
];

const MOCK_SOURCE_DURATION_MS = 420_000;

export function mockTranscribe(durationMs: number): TranscriptSegment[] {
  return scaleTranscript(
    MOCK_TRANSCRIPT_BASE,
    MOCK_SOURCE_DURATION_MS,
    durationMs,
  );
}

export function mockGenerateReadOnlyTitles(
  durationMs: number,
): ReadOnlyTitleSegment[] {
  return scaleReadOnly(
    MOCK_READONLY_BY_DURATION,
    MOCK_SOURCE_DURATION_MS,
    durationMs,
  );
}

export function mockGenerateEditableTitles(
  segments: TranscriptSegment[],
  durationMs: number,
): EditableTitleSegment[] {
  const scaled = scaleEditable(
    MOCK_EDITABLE_BY_DURATION,
    MOCK_SOURCE_DURATION_MS,
    durationMs,
  );
  return scaled.map((item, index) => ({
    ...item,
    id: `edit-${index + 1}`,
    sourceSegmentIds: segments
      .filter(
        (seg) => seg.startMs >= item.startMs && seg.endMs <= item.endMs,
      )
      .map((seg) => seg.id),
  }));
}

/** 出力ボタン用: 文字起こし + 3 層タイムラインを一括生成（モック） */
export function mockRunAiOutput(durationMs: number): Pick<
  ClipProject,
  "segments" | "readOnlyTitles" | "editableTitles"
> {
  const segments = mockTranscribe(durationMs);
  const readOnlyTitles = mockGenerateReadOnlyTitles(durationMs);
  const editableTitles = mockGenerateEditableTitles(segments, durationMs);
  return { segments, readOnlyTitles, editableTitles };
}
