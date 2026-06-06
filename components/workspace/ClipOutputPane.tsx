"use client";

import { useState } from "react";
import { FileDown, Save, Sparkles, SpellCheck } from "lucide-react";

import { downloadPremiereExport } from "@/lib/clip/srt";
import type { ClipProject } from "@/lib/clip-schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Pane4Toggle } from "@/components/workspace/Pane4Toggle";
import { ProofreadDialog } from "@/components/workspace/ProofreadDialog";

type ClipOutputPaneProps = {
  project: ClipProject;
  paneOpen: boolean;
  cloudEnabled?: boolean;
  isOutputRunning: boolean;
  isSaving: boolean;
  onTogglePane: () => void;
  onSourceUrlChange: (url: string) => void;
  onRunOutput: () => void;
  onSave: () => void;
};

export function ClipOutputPane({
  project,
  paneOpen,
  cloudEnabled = false,
  isOutputRunning,
  isSaving,
  onTogglePane,
  onSourceUrlChange,
  onRunOutput,
  onSave,
}: ClipOutputPaneProps) {
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const canExport =
    project.segments.length > 0 && project.editableTitles.length > 0;

  if (!paneOpen) {
    return (
      <aside className="flex w-12 shrink-0 flex-col border-l border-border bg-canvas">
        <div className="flex h-12 items-center justify-center border-b border-border">
          <Pane4Toggle open={paneOpen} onToggle={onTogglePane} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-canvas">
      <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-sm font-semibold text-foreground">切り抜き</h2>
        <Pane4Toggle open={paneOpen} onToggle={onTogglePane} />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-url">ライブ配信リンク</Label>
              <Input
                id="source-url"
                value={project.sourceUrl ?? ""}
                placeholder="https://..."
                onChange={(e) => onSourceUrlChange(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isOutputRunning || project.durationMs <= 0}
              onClick={onRunOutput}
            >
              <Sparkles data-icon="inline-start" />
              {isOutputRunning
                ? "AI 処理中…"
                : "出力（文字起こし・タイトル）"}
            </Button>
            <p className="text-xs text-muted-foreground">
              タイムラインの 3 層（文字起こし・編集可能タイトル・編集不可タイトル）を AI
              が生成します（現在はモック）。
            </p>
          </Card>

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={onSave}
            >
              <Save data-icon="inline-start" />
              {isSaving ? "保存中…" : "保存"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {cloudEnabled
                ? "保存すると Neon に書き込まれ、左の一覧に表示されます。"
                : "DATABASE_URL 未設定のため、この端末のメモリ上のみに保存されます（.env.local に DATABASE_URL を設定してください）。"}
            </p>
          </Card>

          <Separator />

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <h3 className="text-sm font-semibold">Premiere Pro 出力</h3>
            <p className="text-xs text-muted-foreground">
              transcript.srt（文字起こし）と summary.srt（編集可能タイトル）をダウンロードします。
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!canExport}
              onClick={() =>
                downloadPremiereExport(
                  project.title,
                  project.segments,
                  project.editableTitles,
                )
              }
            >
              <FileDown data-icon="inline-start" />
              SRT を書き出し
            </Button>
          </Card>

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <h3 className="text-sm font-semibold">誤字脱字チェック</h3>
            <p className="text-xs text-muted-foreground">
              テキストファイルを読み込み、AI
              による誤字脱字・文法の修正提案を確認できます。
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setProofreadOpen(true)}
            >
              <SpellCheck data-icon="inline-start" />
              誤字脱字チェック
            </Button>
          </Card>
        </div>
      </ScrollArea>
      <ProofreadDialog open={proofreadOpen} onOpenChange={setProofreadOpen} />
    </aside>
  );
}
