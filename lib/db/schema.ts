import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 単一オーナー用（OAuth なし） */
export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
});

// ----- 切り抜き: プロジェクト -----

export const clipProjects = sqliteTable("clip_project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** プロジェクト名 */
  title: text("title").notNull(),
  /** ライブ配信リンク */
  sourceUrl: text("source_url"),
  /** 動画の総尺（ミリ秒） */
  durationMs: integer("duration_ms").notNull().default(0),
  videoFileName: text("video_file_name"),
  videoBlobUrl: text("video_blob_url"),
  playheadMs: integer("playhead_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ----- 切り抜き: タイトル -----

export const titleSegments = sqliteTable("title_segment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => clipProjects.id, { onDelete: "cascade" }),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  readOnlyText: text("read_only_text"),
  editableText: text("editable_text"),
  topicLabel: text("topic_label"),
  sourceSegmentIds: text("source_segment_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
});

// ----- 切り抜き: 文字起こし -----

export const transcriptSegments = sqliteTable("transcript_segment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => clipProjects.id, { onDelete: "cascade" }),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  text: text("text").notNull(),
});
