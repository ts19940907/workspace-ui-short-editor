"use client";

import { useCallback, useRef, useState } from "react";
import { Film, Plus } from "lucide-react";

import { type ClipProject } from "@/lib/clip-schema";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Pane1Toggle } from "@/components/workspace/Pane1Toggle";
import { cn } from "@/lib/utils";

type ProjectLibraryPaneProps = {
  workspaceName: string;
  savedProjects: ClipProject[];
  selectedProjectId: string;
  hasActiveDraft: boolean;
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onAttachVideo: (projectId: string, file: File) => void;
};

export function ProjectLibraryPane({
  workspaceName,
  savedProjects,
  selectedProjectId,
  hasActiveDraft,
  onCreateProject,
  onSelectProject,
  onAttachVideo,
}: ProjectLibraryPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachTargetIdRef = useRef<string | null>(null);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  const openFilePicker = (projectId: string) => {
    attachTargetIdRef.current = projectId;
    fileInputRef.current?.click();
  };

  const attachVideoFile = useCallback(
    (projectId: string, file: File) => {
      if (!file.type.startsWith("video/")) return;
      onAttachVideo(projectId, file);
    },
    [onAttachVideo],
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const projectId = attachTargetIdRef.current;
          if (file && projectId) onAttachVideo(projectId, file);
          e.target.value = "";
        }}
      />
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border [&_[data-slot=sidebar-container]]:bg-sidebar"
      >
        <SidebarHeader className="border-b border-sidebar-border p-0">
          <div className="flex h-12 items-center justify-between gap-2 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[state=expanded]:px-5">
            <h2 className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {workspaceName}
            </h2>
            <Pane1Toggle />
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-3 px-2 py-3 group-data-[collapsible=icon]:hidden">
          <div className="flex flex-col gap-2">
            <Button type="button" className="w-full" onClick={onCreateProject}>
              <Plus data-icon="inline-start" />
              新規作成
            </Button>
            {selectedProjectId ? (
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingVideo(false);
                  const file = e.dataTransfer.files[0];
                  if (file) attachVideoFile(selectedProjectId, file);
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full",
                    isDraggingVideo && "border-primary bg-primary/5",
                  )}
                  onClick={() => openFilePicker(selectedProjectId)}
                >
                  <Film data-icon="inline-start" />
                  {isDraggingVideo
                    ? "ここに動画をドロップ"
                    : "ローカル動画を選択"}
                </Button>
              </div>
            ) : null}
          </div>

          {hasActiveDraft && !savedProjects.some((p) => p.id === selectedProjectId) ? (
            <p className="px-1 text-xs text-muted-foreground">
              編集中の下書きがあります。右ペインの「保存」で一覧に追加されます。
            </p>
          ) : null}

          <SidebarGroup className="px-0">
            <SidebarGroupLabel className="px-2 text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">
              保存済みの動画
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {savedProjects.length === 0 ? (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  まだ保存されたプロジェクトはありません。上の「新規作成」から始めてください。
                </p>
              ) : (
                <SidebarMenu>
                  {savedProjects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        size="lg"
                        isActive={project.id === selectedProjectId}
                        onClick={() => onSelectProject(project.id)}
                        className="h-auto min-h-12 flex-col items-start gap-0.5 overflow-visible"
                      >
                        <span className="w-full truncate font-medium">
                          {project.title}
                        </span>
                        <span className="w-full truncate text-xs text-muted-foreground">
                          {project.videoFileName ?? "動画未設定"}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </>
  );
}
