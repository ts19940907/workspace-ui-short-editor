import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 単一オーナー用（OAuth なし） */
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

// ----- 切り抜き: プロジェクト -----

export const clipProjects = pgTable("clip_project", {
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
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow(),
});

// ----- 切り抜き: タイトル -----

export const titleSegments = pgTable("title_segment", {
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
  sourceSegmentIds: jsonb("source_segment_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});

// ----- 切り抜き: 文字起こし -----

export const transcriptSegments = pgTable("transcript_segment", {
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
