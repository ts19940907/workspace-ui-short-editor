import type {
  ClipProject,
  EditableTitleSegment,
  TimelineSelection,
  TimelineTrackKind,
} from "@/lib/clip-schema";

export type SelectedSegmentInfo = {
  track: TimelineTrackKind;
  text: string;
  editable: boolean;
  label: string;
};

export function getSelectedSegmentInfo(
  project: ClipProject,
  selection: TimelineSelection | null,
): SelectedSegmentInfo | null {
  if (!selection) return null;

  if (selection.track === "transcript") {
    const seg = project.segments.find((s) => s.id === selection.id);
    if (!seg) return null;
    return { track: "transcript", text: seg.text, editable: true, label: "文字起こし" };
  }
  if (selection.track === "editableTitle") {
    const seg = project.editableTitles.find((s) => s.id === selection.id);
    if (!seg) return null;
    return {
      track: "editableTitle",
      text: seg.text,
      editable: true,
      label: `編集可能なタイトル（${seg.topicLabel}）`,
    };
  }
  const seg = project.readOnlyTitles.find((s) => s.id === selection.id);
  if (!seg) return null;
  return {
    track: "readOnlyTitle",
    text: seg.text,
    editable: false,
    label: "編集不可タイトル",
  };
}

export function updateSelectedSegmentText(
  project: ClipProject,
  selection: TimelineSelection,
  text: string,
): ClipProject {
  if (selection.track === "transcript") {
    return {
      ...project,
      segments: project.segments.map((s) =>
        s.id === selection.id ? { ...s, text } : s,
      ),
    };
  }
  if (selection.track === "editableTitle") {
    return {
      ...project,
      editableTitles: project.editableTitles.map((s) =>
        s.id === selection.id ? { ...s, text } : s,
      ),
    };
  }
  return project;
}

export function createEmptyProject(index: number): ClipProject {
  return {
    id: `proj-${crypto.randomUUID().slice(0, 8)}`,
    title: `新規プロジェクト ${index}`,
    playheadMs: 0,
    durationMs: 0,
    segments: [],
    editableTitles: [],
    readOnlyTitles: [],
    isSaved: false,
  };
}

/** DB 互換: 旧 summaryTelops フィールドをマージ */
export function normalizeClipProject(
  raw: ClipProject & { summaryTelops?: EditableTitleSegment[] },
): ClipProject {
  return {
    ...raw,
    editableTitles: raw.editableTitles ?? raw.summaryTelops ?? [],
    readOnlyTitles: raw.readOnlyTitles ?? [],
    isSaved: raw.isSaved ?? true,
  };
}
