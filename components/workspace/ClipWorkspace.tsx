"use client";

import { useCallback, useMemo, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";

import { type ClipProject, type TimelineSelection } from "@/lib/clip-schema";
import {
  createProjectAction,
  deleteProjectAction,
  saveProjectAction,
} from "@/lib/clip/actions";
import { requestClipOutput } from "@/lib/clip/output";
import {
  createEmptyProject,
  getSelectedSegmentInfo,
  normalizeClipProject,
  updateSelectedSegmentText,
} from "@/lib/clip/selection";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  ClipGlobalHeader,
  type SaveStatus,
} from "@/components/workspace/ClipGlobalHeader";
import { ProjectLibraryPane } from "@/components/workspace/ProjectLibraryPane";
import { TitleEditorPane } from "@/components/workspace/TitleEditorPane";
import { VideoTimelinePane } from "@/components/workspace/VideoTimelinePane";
import { ClipOutputPane } from "@/components/workspace/ClipOutputPane";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";
import { toVideoPlaybackUrl } from "@/lib/cloud/blob-video";

type ClipWorkspaceProps = {
  workspaceName: string;
  initialSavedProjects: ClipProject[];
  cloudEnabled?: boolean;
  blobUploadEnabled?: boolean;
};

/** Neon に保存できる HTTPS の Blob URL を解決する（blob: はセッション限定のため除外）。 */
function resolvePersistableVideoUrl(
  project: ClipProject,
  sessionUrlByProjectId: Record<string, string>,
): string | undefined {
  if (project.videoBlobUrl) return project.videoBlobUrl;
  const sessionUrl = sessionUrlByProjectId[project.id];
  if (sessionUrl && !sessionUrl.startsWith("blob:")) return sessionUrl;
  return undefined;
}

function migrateVideoBlobUrlKey(
  urls: Record<string, string>,
  fromId: string,
  toId: string,
): Record<string, string> {
  if (fromId === toId) return urls;
  const url = urls[fromId];
  if (!url) return urls;
  const next = { ...urls };
  delete next[fromId];
  next[toId] = url;
  return next;
}

function initialVideoBlobUrls(projects: ClipProject[]): Record<string, string> {
  const seeded: Record<string, string> = {};
  for (const project of projects) {
    if (project.videoBlobUrl) seeded[project.id] = project.videoBlobUrl;
  }
  return seeded;
}

export function ClipWorkspace({
  workspaceName,
  initialSavedProjects,
  cloudEnabled = false,
  blobUploadEnabled = false,
}: ClipWorkspaceProps) {
  const [savedProjects, setSavedProjects] = useState<ClipProject[]>(
    initialSavedProjects.map((p) => normalizeClipProject(p)),
  );
  const [draftProject, setDraftProject] = useState<ClipProject | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [videoBlobUrls, setVideoBlobUrls] = useState<Record<string, string>>(
    () => initialVideoBlobUrls(initialSavedProjects),
  );
  const [timelineSelection, setTimelineSelection] =
    useState<TimelineSelection | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pane4Open, setPane4Open] = useState(true);
  const [isOutputRunning, setIsOutputRunning] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [lastOutputMode, setLastOutputMode] = useState<"ai" | "mock" | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [deleteTarget, setDeleteTarget] = useState<ClipProject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeProject = useMemo(() => {
    if (draftProject?.id === selectedProjectId) return draftProject;
    return savedProjects.find((p) => p.id === selectedProjectId) ?? null;
  }, [draftProject, savedProjects, selectedProjectId]);

  const isProjectSavedInCloud = useCallback(
    (projectId: string) =>
      savedProjects.some((p) => p.id === projectId && p.isSaved),
    [savedProjects],
  );

  const rawVideoUrl = activeProject
    ? (videoBlobUrls[activeProject.id] ?? activeProject.videoBlobUrl)
    : undefined;
  const videoUrl = toVideoPlaybackUrl(rawVideoUrl);

  const selectionInfo = useMemo(
    () =>
      activeProject
        ? getSelectedSegmentInfo(activeProject, timelineSelection)
        : null,
    [activeProject, timelineSelection],
  );

  const patchActiveProject = useCallback(
    (patch: Partial<ClipProject>) => {
      if (!activeProject) return;
      const next = { ...activeProject, ...patch };
      if (draftProject?.id === activeProject.id) {
        setDraftProject(next);
      } else {
        setSavedProjects((prev) =>
          prev.map((p) => (p.id === activeProject.id ? next : p)),
        );
      }
    },
    [activeProject, draftProject],
  );

  const replaceActiveProject = useCallback(
    (next: ClipProject) => {
      if (draftProject?.id === next.id) {
        setDraftProject(next);
      } else {
        setSavedProjects((prev) =>
          prev.map((p) => (p.id === next.id ? next : p)),
        );
      }
    },
    [draftProject],
  );

  const persistProjectAfterVideoUpload = useCallback(
    async (
      project: ClipProject,
      previousProjectId: string,
    ): Promise<ClipProject | null> => {
      if (!cloudEnabled) return project;
      try {
        let toPersist: ClipProject = {
          ...project,
          isSaved: true,
          videoBlobUrl: resolvePersistableVideoUrl(project, videoBlobUrls),
        };

        if (!isProjectSavedInCloud(toPersist.id)) {
          const created = await createProjectAction(
            toPersist.title || "新規プロジェクト",
          );
          setVideoBlobUrls((prev) =>
            migrateVideoBlobUrlKey(prev, previousProjectId, created.id),
          );
          toPersist = { ...toPersist, id: created.id };

          const wasDraft = draftProject?.id === previousProjectId;
          if (wasDraft) {
            setSelectedProjectId(created.id);
            setDraftProject(null);
          }
          setSavedProjects((prev) => {
            const without = prev.filter(
              (p) => p.id !== previousProjectId && p.id !== created.id,
            );
            return [toPersist, ...without];
          });
        }

        const persisted = await saveProjectAction(toPersist);
        replaceActiveProject(persisted);
        setSaveStatus("saved");
        return persisted;
      } catch {
        setSaveStatus("error");
        return null;
      }
    },
    [
      cloudEnabled,
      draftProject,
      isProjectSavedInCloud,
      replaceActiveProject,
      videoBlobUrls,
    ],
  );

  const handleCreateProject = useCallback(() => {
    const next = createEmptyProject(savedProjects.length + 1);
    setDraftProject(next);
    setSelectedProjectId(next.id);
    setTimelineSelection(null);
    setIsPlaying(false);
  }, [savedProjects.length]);

  const handleSelectSavedProject = useCallback((id: string) => {
    setDraftProject(null);
    setSelectedProjectId(id);
    setTimelineSelection(null);
    setIsPlaying(false);
  }, []);

  const attachVideo = useCallback(
    async (projectId: string, file: File) => {
      const previous =
        draftProject?.id === projectId
          ? draftProject
          : savedProjects.find((p) => p.id === projectId);
      if (!previous) return;

      const blobUrl = URL.createObjectURL(file);
      setVideoBlobUrls((prev) => {
        const old = prev[projectId];
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return { ...prev, [projectId]: blobUrl };
      });
      setIsPlaying(false);
      setTimelineSelection(null);

      const resetProject: ClipProject = {
        ...previous,
        videoFileName: file.name,
        playheadMs: 0,
        segments: [],
        editableTitles: [],
        readOnlyTitles: [],
        durationMs: 0,
        videoBlobUrl: undefined,
      };

      if (draftProject?.id === projectId) {
        setDraftProject(resetProject);
      } else {
        setSavedProjects((prev) =>
          prev.map((p) => (p.id === projectId ? resetProject : p)),
        );
      }

      if (!cloudEnabled || !blobUploadEnabled) return;

      setUploadStatus("uploading");
      try {
        const pathname = `videos/${projectId}/${Date.now()}-${file.name}`;
        const result = await uploadPresigned(pathname, file, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
        });
        setVideoBlobUrls((prev) => ({ ...prev, [projectId]: result.url }));

        const updatedProject: ClipProject = {
          ...resetProject,
          videoBlobUrl: result.url,
          videoFileName: file.name,
        };

        if (draftProject?.id === projectId) {
          setDraftProject(updatedProject);
        } else {
          setSavedProjects((prev) =>
            prev.map((p) => (p.id === projectId ? updatedProject : p)),
          );
        }

        await persistProjectAfterVideoUpload(updatedProject, projectId);

        setUploadStatus("idle");
      } catch {
        setUploadStatus("error");
      }
    },
    [
      blobUploadEnabled,
      cloudEnabled,
      draftProject,
      persistProjectAfterVideoUpload,
      savedProjects,
    ],
  );

  const handleSave = useCallback(async () => {
    if (!activeProject) return;
    setIsSaving(true);
    setSaveStatus("saving");

    const title =
      activeProject.title ||
      activeProject.sourceUrl?.replace(/^https?:\/\//, "").slice(0, 40) ||
      `プロジェクト ${savedProjects.length + 1}`;

    const previousProjectId = activeProject.id;
    const persistableVideoUrl = resolvePersistableVideoUrl(
      activeProject,
      videoBlobUrls,
    );
    // Blob 有効時は URL が取れない動画メタデータを DB に書かない（ファイル名だけ残る事故を防ぐ）
    const shouldPersistVideoMeta =
      Boolean(persistableVideoUrl) || !blobUploadEnabled;
    let toSave: ClipProject = {
      ...activeProject,
      title,
      isSaved: true,
      videoBlobUrl: persistableVideoUrl,
      videoFileName: shouldPersistVideoMeta
        ? activeProject.videoFileName
        : undefined,
    };

    try {
      if (cloudEnabled) {
        const existsInCloud = savedProjects.some(
          (p) => p.id === toSave.id && p.isSaved,
        );
        if (existsInCloud) {
          toSave = await saveProjectAction(toSave);
        } else {
          const created = await createProjectAction(toSave.title);
          setVideoBlobUrls((prev) =>
            migrateVideoBlobUrlKey(prev, previousProjectId, created.id),
          );
          toSave = {
            ...toSave,
            id: created.id,
          };
          toSave = await saveProjectAction(toSave);
          if (draftProject?.id === activeProject.id) {
            setSelectedProjectId(created.id);
          }
        }
      }

      setSavedProjects((prev) => {
        const without = prev.filter((p) => p.id !== toSave.id);
        const existing = prev.find((p) => p.id === toSave.id);
        if (existing) {
          return prev.map((p) => (p.id === toSave.id ? toSave : p));
        }
        return [toSave, ...without.filter((p) => p.id !== activeProject.id)];
      });

      if (draftProject?.id === activeProject.id) {
        setDraftProject(null);
      }

      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }, [
    activeProject,
    blobUploadEnabled,
    cloudEnabled,
    draftProject,
    savedProjects,
    videoBlobUrls,
  ]);

  const handleRunOutput = useCallback(async () => {
    if (!activeProject) return;

    const sourceUrl = activeProject.sourceUrl?.trim();
    const rawVideoUrl =
      videoBlobUrls[activeProject.id] ?? activeProject.videoBlobUrl;
    const hasSourceUrl = Boolean(sourceUrl);
    const hasLocalVideo = Boolean(rawVideoUrl);

    if (!hasSourceUrl && !hasLocalVideo) return;
    if (!hasSourceUrl && activeProject.durationMs <= 0) return;

    setIsOutputRunning(true);
    setOutputError(null);

    try {
      const result = await requestClipOutput({
        sourceUrl: sourceUrl || undefined,
        durationMs: activeProject.durationMs,
        videoUrl:
          !hasSourceUrl &&
          rawVideoUrl &&
          !rawVideoUrl.startsWith("blob:")
            ? rawVideoUrl
            : undefined,
        videoFileName: activeProject.videoFileName,
        localVideoUrl:
          !hasSourceUrl && rawVideoUrl?.startsWith("blob:")
            ? rawVideoUrl
            : undefined,
      });

      setLastOutputMode(result.mode);
      replaceActiveProject({
        ...activeProject,
        durationMs: result.durationMs ?? activeProject.durationMs,
        segments: result.segments,
        readOnlyTitles: result.readOnlyTitles,
        editableTitles: result.editableTitles,
      });
    } catch (error) {
      setOutputError((error as Error).message);
    } finally {
      setIsOutputRunning(false);
    }
  }, [activeProject, replaceActiveProject, videoBlobUrls]);

  const handleSelectionTextSave = useCallback(
    (text: string) => {
      if (!activeProject || !timelineSelection) return;
      replaceActiveProject(
        updateSelectedSegmentText(activeProject, timelineSelection, text),
      );
    },
    [activeProject, replaceActiveProject, timelineSelection],
  );

  const handleTitleSave = useCallback(
    (title: string) => {
      patchActiveProject({ title });
    },
    [patchActiveProject],
  );

  const handleRequestDelete = useCallback((project: ClipProject) => {
    setDeleteTarget(project);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (cloudEnabled && deleteTarget.isSaved) {
        await deleteProjectAction(deleteTarget.id);
      }
      setSavedProjects((prev) =>
        prev.filter((p) => p.id !== deleteTarget.id),
      );
      setVideoBlobUrls((prev) => {
        const next = { ...prev };
        const localUrl = next[deleteTarget.id];
        if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
        delete next[deleteTarget.id];
        return next;
      });
      if (selectedProjectId === deleteTarget.id) {
        setSelectedProjectId("");
        setDraftProject(null);
        setTimelineSelection(null);
        setIsPlaying(false);
      }
      setDeleteTarget(null);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
    } finally {
      setIsDeleting(false);
    }
  }, [cloudEnabled, deleteTarget, selectedProjectId]);

  if (!activeProject) {
    return (
      <SidebarProvider
        defaultOpen
        className="h-screen w-full overflow-hidden bg-background text-foreground"
      >
        <ProjectLibraryPane
          workspaceName={workspaceName}
          savedProjects={savedProjects}
          selectedProjectId=""
          hasActiveDraft={false}
          onCreateProject={handleCreateProject}
          onSelectProject={handleSelectSavedProject}
          onAttachVideo={() => {}}
          onDeleteProject={handleRequestDelete}
        />
        <SidebarInset className="flex min-w-0 flex-col items-center justify-center bg-background p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground">
            左上の「新規作成」からプロジェクトを作成してください。保存したプロジェクトは左の一覧に表示されます。
          </p>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen w-full overflow-hidden bg-background text-foreground"
    >
      <ProjectLibraryPane
        workspaceName={workspaceName}
        savedProjects={savedProjects}
        selectedProjectId={selectedProjectId}
        hasActiveDraft={draftProject !== null}
        onCreateProject={handleCreateProject}
        onSelectProject={handleSelectSavedProject}
        onAttachVideo={(id, file) => void attachVideo(id, file)}
        onDeleteProject={handleRequestDelete}
      />
      <SidebarInset className="flex min-w-0 flex-col bg-background">
        <ClipGlobalHeader
          projectTitle={activeProject.title}
          videoFileName={activeProject.videoFileName}
          cloudEnabled={cloudEnabled}
          saveStatus={saveStatus}
          uploadStatus={uploadStatus}
        />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
            <TitleEditorPane
              projectTitle={activeProject.title}
              videoUrl={videoUrl}
              playheadMs={activeProject.playheadMs}
              durationMs={activeProject.durationMs}
              isPlaying={isPlaying}
              selection={timelineSelection}
              selectionInfo={selectionInfo}
              onTitleSave={handleTitleSave}
              onPlayheadChange={(ms) => patchActiveProject({ playheadMs: ms })}
              onPlayingChange={setIsPlaying}
              onDurationChange={(durationMs) =>
                patchActiveProject({ durationMs })
              }
              onSelectionTextSave={handleSelectionTextSave}
            />
            <VideoTimelinePane
              durationMs={activeProject.durationMs}
              playheadMs={activeProject.playheadMs}
              segments={activeProject.segments}
              editableTitles={activeProject.editableTitles}
              readOnlyTitles={activeProject.readOnlyTitles}
              selection={timelineSelection}
              onPlayheadChange={(ms) => patchActiveProject({ playheadMs: ms })}
              onSelect={setTimelineSelection}
            />
          </div>
          <ClipOutputPane
            project={activeProject}
            paneOpen={pane4Open}
            hasVideoSource={Boolean(rawVideoUrl)}
            cloudEnabled={cloudEnabled}
            blobUploadEnabled={blobUploadEnabled}
            isOutputRunning={isOutputRunning}
            outputError={outputError}
            lastOutputMode={lastOutputMode}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onTogglePane={() => setPane4Open((v) => !v)}
            onSourceUrlChange={(url) => patchActiveProject({ sourceUrl: url })}
            onRunOutput={() => void handleRunOutput()}
            onSave={() => void handleSave()}
            onDelete={() => handleRequestDelete(activeProject)}
            onApplyTranscript={(segments) =>
              patchActiveProject({ segments })
            }
          />
        </div>
      </SidebarInset>
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="プロジェクトを削除しますか？"
        itemName={deleteTarget?.title ?? ""}
        onConfirm={() => void handleConfirmDelete()}
      />
    </SidebarProvider>
  );
}
