import { asc, desc, eq, inArray } from "drizzle-orm";

import type {
  ClipProject,
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TranscriptSegment,
} from "@/lib/clip-schema";
import { normalizeClipProject } from "@/lib/clip/selection";
import {
  clipProjects,
  titleSegments,
  transcriptSegments,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";

type ClipProjectRow = typeof clipProjects.$inferSelect;
type TitleSegmentRow = typeof titleSegments.$inferSelect;
type TranscriptSegmentRow = typeof transcriptSegments.$inferSelect;

function timeRangeKey(startMs: number, endMs: number): string {
  return `${startMs}:${endMs}`;
}

function titleRowsToClipParts(rows: TitleSegmentRow[]): {
  readOnlyTitles: ReadOnlyTitleSegment[];
  editableTitles: EditableTitleSegment[];
} {
  const readOnlyTitles: ReadOnlyTitleSegment[] = [];
  const editableTitles: EditableTitleSegment[] = [];

  for (const row of rows) {
    if (row.readOnlyText) {
      readOnlyTitles.push({
        id: `${row.id}-ro`,
        startMs: row.startMs,
        endMs: row.endMs,
        text: row.readOnlyText,
      });
    }
    if (row.editableText) {
      editableTitles.push({
        id: `${row.id}-ed`,
        startMs: row.startMs,
        endMs: row.endMs,
        text: row.editableText,
        topicLabel: row.topicLabel ?? "",
        sourceSegmentIds: row.sourceSegmentIds ?? [],
      });
    }
  }

  return { readOnlyTitles, editableTitles };
}

function clipPartsToTitleRows(
  projectId: string,
  readOnlyTitles: ReadOnlyTitleSegment[],
  editableTitles: EditableTitleSegment[],
): (typeof titleSegments.$inferInsert)[] {
  const merged = new Map<
    string,
    {
      startMs: number;
      endMs: number;
      readOnlyText?: string;
      editableText?: string;
      topicLabel?: string;
      sourceSegmentIds?: string[];
    }
  >();

  for (const seg of readOnlyTitles) {
    const key = timeRangeKey(seg.startMs, seg.endMs);
    const existing = merged.get(key) ?? {
      startMs: seg.startMs,
      endMs: seg.endMs,
    };
    merged.set(key, {
      ...existing,
      readOnlyText: seg.text,
    });
  }

  for (const seg of editableTitles) {
    const key = timeRangeKey(seg.startMs, seg.endMs);
    const existing = merged.get(key) ?? {
      startMs: seg.startMs,
      endMs: seg.endMs,
    };
    merged.set(key, {
      ...existing,
      editableText: seg.text,
      topicLabel: seg.topicLabel,
      sourceSegmentIds: seg.sourceSegmentIds,
    });
  }

  return [...merged.values()].map((row) => ({
    projectId,
    startMs: row.startMs,
    endMs: row.endMs,
    readOnlyText: row.readOnlyText ?? null,
    editableText: row.editableText ?? null,
    topicLabel: row.topicLabel ?? null,
    sourceSegmentIds: row.sourceSegmentIds ?? [],
  }));
}

function transcriptRowsToSegments(
  rows: TranscriptSegmentRow[],
): TranscriptSegment[] {
  return rows.map((row) => ({
    id: row.id,
    startMs: row.startMs,
    endMs: row.endMs,
    text: row.text,
  }));
}

function segmentsToTranscriptRows(
  projectId: string,
  segments: TranscriptSegment[],
): (typeof transcriptSegments.$inferInsert)[] {
  return segments.map((seg) => ({
    projectId,
    startMs: seg.startMs,
    endMs: seg.endMs,
    text: seg.text,
  }));
}

function assembleClipProject(
  row: ClipProjectRow,
  titleRows: TitleSegmentRow[],
  transcriptRows: TranscriptSegmentRow[],
): ClipProject {
  const { readOnlyTitles, editableTitles } = titleRowsToClipParts(titleRows);
  return normalizeClipProject({
    id: row.id,
    title: row.title,
    sourceUrl: row.sourceUrl ?? undefined,
    playheadMs: row.playheadMs,
    durationMs: row.durationMs,
    videoFileName: row.videoFileName ?? undefined,
    videoBlobUrl: row.videoBlobUrl ?? undefined,
    segments: transcriptRowsToSegments(transcriptRows),
    editableTitles,
    readOnlyTitles,
    isSaved: true,
  });
}

async function loadChildSegments(projectIds: string[]) {
  if (projectIds.length === 0) {
    return { titleRows: [] as TitleSegmentRow[], transcriptRows: [] as TranscriptSegmentRow[] };
  }
  const db = getDb();
  const [titleRows, transcriptRows] = await Promise.all([
    db
      .select()
      .from(titleSegments)
      .where(inArray(titleSegments.projectId, projectIds))
      .orderBy(asc(titleSegments.startMs)),
    db
      .select()
      .from(transcriptSegments)
      .where(inArray(transcriptSegments.projectId, projectIds))
      .orderBy(asc(transcriptSegments.startMs)),
  ]);
  return { titleRows, transcriptRows };
}

export async function listProjectsByUserId(
  userId: string,
): Promise<ClipProject[]> {
  const db = getDb();
  const projectRows = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.userId, userId))
    .orderBy(desc(clipProjects.updatedAt));

  const projectIds = projectRows.map((p) => p.id);
  const { titleRows, transcriptRows } = await loadChildSegments(projectIds);

  return projectRows.map((row) =>
    assembleClipProject(
      row,
      titleRows.filter((t) => t.projectId === row.id),
      transcriptRows.filter((t) => t.projectId === row.id),
    ),
  );
}

export async function createProjectForUser(
  userId: string,
  title: string,
): Promise<ClipProject> {
  const db = getDb();
  const [row] = await db
    .insert(clipProjects)
    .values({
      userId,
      title,
    })
    .returning();
  return assembleClipProject(row, [], []);
}

export async function updateProjectForUser(
  userId: string,
  project: ClipProject,
): Promise<ClipProject | null> {
  const db = getDb();
  const titleRows = clipPartsToTitleRows(
    project.id,
    project.readOnlyTitles,
    project.editableTitles,
  );
  const transcriptRows = segmentsToTranscriptRows(project.id, project.segments);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(clipProjects)
      .set({
        title: project.title,
        sourceUrl: project.sourceUrl ?? null,
        playheadMs: project.playheadMs,
        durationMs: project.durationMs,
        videoFileName: project.videoFileName ?? null,
        videoBlobUrl: project.videoBlobUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(clipProjects.id, project.id))
      .returning();

    if (!row || row.userId !== userId) return null;

    await tx
      .delete(titleSegments)
      .where(eq(titleSegments.projectId, project.id));
    await tx
      .delete(transcriptSegments)
      .where(eq(transcriptSegments.projectId, project.id));

    if (titleRows.length > 0) {
      await tx.insert(titleSegments).values(titleRows);
    }
    if (transcriptRows.length > 0) {
      await tx.insert(transcriptSegments).values(transcriptRows);
    }

    const [savedTitles, savedTranscripts] = await Promise.all([
      tx
        .select()
        .from(titleSegments)
        .where(eq(titleSegments.projectId, project.id))
        .orderBy(asc(titleSegments.startMs)),
      tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.projectId, project.id))
        .orderBy(asc(transcriptSegments.startMs)),
    ]);

    return assembleClipProject(row, savedTitles, savedTranscripts);
  });
}
