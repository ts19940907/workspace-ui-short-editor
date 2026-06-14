"use client";

import { useState } from "react";
import { FileDown, Save, Sparkles, SpellCheck, Trash2 } from "lucide-react";

import {
  transcriptToProofreadText,
  type ClipOutputResponse,
} from "@/lib/clip/output";
import { downloadPremiereExportWithSource } from "@/lib/clip/export-srt";
import { countSrtCues } from "@/lib/clip/srt";
import { describeSourceUrlSupport, isValidHttpUrl } from "@/lib/clip/source-url";
import type { ClipProject, TranscriptSegment } from "@/lib/clip-schema";
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
  hasVideoSource?: boolean;
  cloudEnabled?: boolean;
  blobUploadEnabled?: boolean;
  isOutputRunning: boolean;
  outputError?: string | null;
  lastOutputMode?: ClipOutputResponse["mode"] | null;
  isSaving: boolean;
  isDeleting?: boolean;
  onTogglePane: () => void;
  onSourceUrlChange: (url: string) => void;
  onRunOutput: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onApplyTranscript?: (segments: TranscriptSegment[]) => void;
};

export function ClipOutputPane({
  project,
  paneOpen,
  hasVideoSource = false,
  cloudEnabled = false,
  blobUploadEnabled = false,
  isOutputRunning,
  outputError = null,
  lastOutputMode = null,
  isSaving,
  isDeleting = false,
  onTogglePane,
  onSourceUrlChange,
  onRunOutput,
  onSave,
  onDelete,
  onApplyTranscript,
}: ClipOutputPaneProps) {
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [isExportRunning, setIsExportRunning] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const canExport = project.editableTitles.length > 0;
  const transcriptCueCount = countSrtCues(project.segments);
  const isSaved = project.isSaved ?? false;
  const hasTranscript = project.segments.length > 0;
  const sourceUrl = project.sourceUrl?.trim() ?? "";
  const hasSourceUrl = isValidHttpUrl(sourceUrl);
  const canRunOutput =
    hasSourceUrl || (hasVideoSource && project.durationMs > 0);
  const proofreadInitialText = hasTranscript
    ? transcriptToProofreadText(project.segments)
    : "";

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
              disabled={isOutputRunning || !canRunOutput}
              onClick={onRunOutput}
            >
              <Sparkles data-icon="inline-start" />
              {isOutputRunning ? "AI 処理中…" : "出力（文字起こし・要約）"}
            </Button>
            <p className="text-xs text-muted-foreground">
              ライブ配信リンク（YouTube 等）から文字起こし・要約・タイトル案を生成します。YouTube
              は字幕取得＋テキスト要約のため高速です（字幕が無い動画はエラーになります）。
            </p>
            {hasSourceUrl ? (
              <p className="text-xs text-muted-foreground">
                {describeSourceUrlSupport(sourceUrl)}
                長尺配信は 10 分ごとに分割要約します。混雑時は自動リトライします。
              </p>
            ) : null}
            {!canRunOutput ? (
              <p className="text-xs text-destructive">
                ライブ配信リンクを入力するか、左ペインから動画ファイルを添付してください。
              </p>
            ) : null}
            {lastOutputMode === "ai" ? (
              <p className="text-xs text-muted-foreground">
                直近の出力: Gemini API による AI 生成
              </p>
            ) : lastOutputMode === "mock" ? (
              <p className="text-xs text-muted-foreground">
                直近の出力: モック（`GEMINI_API_KEY` 未設定）
              </p>
            ) : null}
            {outputError ? (
              <p className="text-xs text-destructive">{outputError}</p>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <Button
              type="button"
              size="sm"
              disabled={isSaving || isDeleting}
              onClick={onSave}
            >
              <Save data-icon="inline-start" />
              {isSaving ? "保存中…" : isSaved ? "更新" : "保存"}
            </Button>
            {isSaved && onDelete ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving || isDeleting}
                onClick={onDelete}
              >
                <Trash2 data-icon="inline-start" />
                {isDeleting ? "削除中…" : "削除"}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {cloudEnabled
                ? isSaved
                  ? "「更新」で Neon の clip_project / title_segment / transcript_segment に上書き保存されます。"
                  : "「保存」で Neon に書き込まれ、左の一覧に表示されます。"
                : "DATABASE_URL 未設定のため、この端末のメモリ上のみに保存されます（.env.local に DATABASE_URL を設定してください）。"}
            </p>
            {blobUploadEnabled ? (
              <p className="text-xs text-muted-foreground">
                動画ファイルは Vercel Blob（Private）に保存し、URL を
                clip_project.video_blob_url に記録します。再生はアプリ経由で行います。
              </p>
            ) : cloudEnabled ? (
              <p className="text-xs text-muted-foreground">
                BLOB_READ_WRITE_TOKEN / BLOB_WEBHOOK_PUBLIC_KEY 未設定のため、動画はこのブラウザ内のみ再生されます。リロード後も再生するには
                .env.local に両方を設定し（`vercel env pull --environment=preview`）、動画を再選択してください。
              </p>
            ) : null}
          </Card>

          <Separator />

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <h3 className="text-sm font-semibold">Premiere Pro 出力</h3>
            <p className="text-xs text-muted-foreground">
              文字起こし {transcriptCueCount} 件・要約 {project.editableTitles.length}{" "}
              件を別ファイルで書き出します。YouTube リンクがある場合、文字起こしは字幕の全行を使います（タイムライン表示より細かい件数になります）。
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!canExport || isExportRunning}
              onClick={() => {
                setIsExportRunning(true);
                setExportMessage(null);
                void downloadPremiereExportWithSource({
                  projectTitle: project.title,
                  sourceUrl: project.sourceUrl,
                  segments: project.segments,
                  editableTitles: project.editableTitles,
                  readOnlyTitles: project.readOnlyTitles,
                })
                  .then(({ transcriptCueCount: exportedTranscript, summaryCueCount }) => {
                    setExportMessage(
                      `書き出し完了: 文字起こし ${exportedTranscript} キュー / 要約 ${summaryCueCount} キュー`,
                    );
                  })
                  .catch((error) => {
                    setExportMessage((error as Error).message);
                  })
                  .finally(() => {
                    setIsExportRunning(false);
                  });
              }}
            >
              <FileDown data-icon="inline-start" />
              {isExportRunning ? "SRT 生成中…" : "SRT を書き出し"}
            </Button>
            {exportMessage ? (
              <p className="text-xs text-muted-foreground">{exportMessage}</p>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-3 rounded-lg border-border bg-card p-3">
            <h3 className="text-sm font-semibold">誤字脱字チェック</h3>
            <p className="text-xs text-muted-foreground">
              テキストファイル、またはプロジェクトの文字起こしを AI
              で校正できます。`GEMINI_API_KEY` 設定時は Gemini
              による提案、未設定時は簡易チェックです。
            </p>
            {hasTranscript ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProofreadOpen(true)}
              >
                <SpellCheck data-icon="inline-start" />
                文字起こしをチェック
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={hasTranscript ? "outline" : "default"}
              onClick={() => setProofreadOpen(true)}
            >
              <SpellCheck data-icon="inline-start" />
              {hasTranscript ? "ファイルからチェック" : "誤字脱字チェック"}
            </Button>
          </Card>
        </div>
      </ScrollArea>
      <ProofreadDialog
        open={proofreadOpen}
        onOpenChange={setProofreadOpen}
        initialText={proofreadInitialText}
        initialLabel={
          hasTranscript ? "プロジェクトの文字起こし" : undefined
        }
        transcriptSegments={hasTranscript ? project.segments : undefined}
        onApplyTranscript={onApplyTranscript}
      />
    </aside>
  );
}
