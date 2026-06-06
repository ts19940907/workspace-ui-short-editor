"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type ClipGlobalHeaderProps = {
  projectTitle: string;
  videoFileName?: string;
  cloudEnabled?: boolean;
  saveStatus?: SaveStatus;
  uploadStatus?: "idle" | "uploading" | "error";
};

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "保存中…",
  saved: "保存済み",
  error: "保存失敗",
};

export function ClipGlobalHeader({
  projectTitle,
  videoFileName,
  cloudEnabled = false,
  saveStatus = "idle",
  uploadStatus = "idle",
}: ClipGlobalHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <Breadcrumb className="min-w-0 flex-1" aria-label="パンくず">
        <BreadcrumbList className="flex-nowrap text-[11px]">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">
              {projectTitle}
            </BreadcrumbPage>
          </BreadcrumbItem>
          {videoFileName ? (
            <BreadcrumbItem className="min-w-0 text-muted-foreground">
              <span className="truncate">{videoFileName}</span>
            </BreadcrumbItem>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex shrink-0 items-center gap-2">
        {uploadStatus === "uploading" ? (
          <Badge variant="secondary">動画アップロード中…</Badge>
        ) : null}
        {cloudEnabled && saveStatus !== "idle" ? (
          <Badge
            variant={saveStatus === "error" ? "destructive" : "secondary"}
          >
            {SAVE_LABEL[saveStatus]}
          </Badge>
        ) : null}
        {cloudEnabled ? (
          <Badge variant="outline">Turso 保存</Badge>
        ) : null}
      </div>
    </header>
  );
}
