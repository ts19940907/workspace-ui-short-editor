"use client";

import { useCallback, useMemo, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";

import { type ClipProject, type TimelineSelection } from "@/lib/clip-schema";
import {
  createProjectAction,
  deleteProjectAction,
  saveProjectAction,
} from "@/lib/clip/actions";
import { mockRunAiOutput } from "@/lib/clip/mock-pipeline";
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

type ClipWorkspaceProps = {
  workspaceName: string;
  initialSavedProjects: ClipProject[];
  cloudEnabled?: boolean;
  blobUploadEnabled?: boolean;
};

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
  const [videoBlobUrls, setVideoBlobUrls] = useState<Record<string, string>>({});
  const [timelineSelection, setTimelineSelection] =
    useState<TimelineSelection | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pane4Open, setPane4Open] = useState(true);
  const [isOutputRunning, setIsOutputRunning] = useState(false);
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

  const persistProjectToCloud = useCallback(
    async (project: ClipProject): Promise<ClipProject | null> => {
      if (!cloudEnabled) return project;
      try {
        if (isProjectSavedInCloud(project.id)) {
          return await saveProjectAction(project);
        }
        return null;
      } catch {
        setSaveStatus("error");
        return null;
      }
    },
    [cloudEnabled, isProjectSavedInCloud],
  );

  const videoUrl = activeProject
    ? (videoBlobUrls[activeProject.id] ?? activeProject.videoBlobUrl)
    : undefined;

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
          access: "public",
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

        const persisted = await persistProjectToCloud(updatedProject);
        if (persisted) {
          replaceActiveProject(persisted);
        }

        setUploadStatus("idle");
      } catch {
        setUploadStatus("error");
      }
    },
    [
      blobUploadEnabled,
      cloudEnabled,
      draftProject,
      persistProjectToCloud,
      replaceActiveProject,
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

    let toSave: ClipProject = {
      ...activeProject,
      title,
      isSaved: true,
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
  }, [activeProject, cloudEnabled, draftProject, savedProjects]);

  const handleRunOutput = useCallback(() => {
    if (!activeProject || activeProject.durationMs <= 0) return;
    setIsOutputRunning(true);
    window.setTimeout(() => {
      const ai = mockRunAiOutput(activeProject.durationMs);
      replaceActiveProject({
        ...activeProject,
        ...ai,
      });
      setIsOutputRunning(false);
    }, 900);
  }, [activeProject, replaceActiveProject]);

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
            cloudEnabled={cloudEnabled}
            blobUploadEnabled={blobUploadEnabled}
            isOutputRunning={isOutputRunning}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onTogglePane={() => setPane4Open((v) => !v)}
            onSourceUrlChange={(url) => patchActiveProject({ sourceUrl: url })}
            onRunOutput={handleRunOutput}
            onSave={() => void handleSave()}
            onDelete={() => handleRequestDelete(activeProject)}
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
