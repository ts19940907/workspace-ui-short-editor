/**
 * ライブ切り抜きツールの Zod スキーマと派生型。
 */

import { z } from "zod";

export const transcriptSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

/** 編集可能なタイトル（要約テロップ・Premiere キャプション 2 層用） */
export const editableTitleSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  topicLabel: z.string(),
  sourceSegmentIds: z.array(z.string()),
});
export type EditableTitleSegment = z.infer<typeof editableTitleSegmentSchema>;

/** @deprecated editableTitleSegmentSchema の別名 */
export const summaryTelopSegmentSchema = editableTitleSegmentSchema;
export type SummaryTelopSegment = EditableTitleSegment;

/** 編集不可タイトル（AI が付与した話題ラベル） */
export const readOnlyTitleSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});
export type ReadOnlyTitleSegment = z.infer<typeof readOnlyTitleSegmentSchema>;

export const timelineTrackKindSchema = z.enum([
  "transcript",
  "editableTitle",
  "readOnlyTitle",
]);
export type TimelineTrackKind = z.infer<typeof timelineTrackKindSchema>;

export const timelineSelectionSchema = z.object({
  track: timelineTrackKindSchema,
  id: z.string(),
});
export type TimelineSelection = z.infer<typeof timelineSelectionSchema>;

export const clipProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().optional(),
  playheadMs: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
  videoFileName: z.string().optional(),
  videoBlobUrl: z.string().optional(),
  segments: z.array(transcriptSegmentSchema).default([]),
  editableTitles: z.array(editableTitleSegmentSchema).default([]),
  readOnlyTitles: z.array(readOnlyTitleSegmentSchema).default([]),
  /** 左ペインに表示済み（明示的保存後） */
  isSaved: z.boolean().optional(),
});
export type ClipProject = z.infer<typeof clipProjectSchema>;

export const clipProjectsSchema = z.array(clipProjectSchema);
