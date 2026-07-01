"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Loader2, SpellCheck, Upload } from "lucide-react";

import { applyProofreadToTranscript } from "@/lib/clip/output";
import { requestProofread } from "@/lib/clip/proofread";
import type { TranscriptSegment } from "@/lib/clip-schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ProofreadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  initialLabel?: string;
  transcriptSegments?: TranscriptSegment[];
  onApplyTranscript?: (segments: TranscriptSegment[]) => void;
};

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".srt") ||
    name.endsWith(".md")
  );
}

export function ProofreadDialog({
  open,
  onOpenChange,
  initialText = "",
  initialLabel,
  transcriptSegments,
  onApplyTranscript,
}: ProofreadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [mode, setMode] = useState<"ai" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const resetState = useCallback(() => {
    setFileName(null);
    setText("");
    setResult("");
    setMode(null);
    setError(null);
    setIsDragging(false);
    setIsRunning(false);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (!isTextFile(file)) {
      setError("テキストファイル（.txt / .srt / .md 等）を選択してください。");
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    setResult("");
    setMode(null);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const handleProofread = useCallback(async () => {
    if (!text.trim()) return;
    setIsRunning(true);
    setError(null);
    try {
      const response = await requestProofread(text);
      setResult(response.result);
      setMode(response.mode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRunning(false);
    }
  }, [text]);

  const correctedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const canApplyToTranscript =
    Boolean(transcriptSegments?.length) &&
    Boolean(onApplyTranscript) &&
    correctedLines.length === transcriptSegments?.length;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setText(initialText);
        setFileName(initialText.trim() ? (initialLabel ?? null) : null);
        setResult("");
        setMode(null);
        setError(null);
        setIsDragging(false);
        setIsRunning(false);
      } else {
        resetState();
      }
      onOpenChange(next);
    },
    [initialLabel, initialText, onOpenChange, resetState],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>誤字脱字チェック</DialogTitle>
          <DialogDescription>
            テキストファイルを選択するか、ドラッグ&ドロップして AI
            による校正提案を受け取ります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>テキストファイル</Label>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 transition-colors",
                isDragging && "border-primary bg-primary/5",
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-foreground">
                クリックしてファイルを選択、またはここにドロップ
              </p>
              <p className="text-xs text-muted-foreground">
                .txt / .srt / .md など
              </p>
              {fileName ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="size-3.5" />
                  {fileName}
                </p>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.srt,.md,text/plain"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-2">
              <Label>
                校正結果
                {mode === "ai"
                  ? "（Gemini）"
                  : mode === "mock"
                    ? "（モック）"
                    : ""}
              </Label>
              <ScrollArea className="max-h-64 rounded-lg border border-border bg-card p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {result}
                </p>
              </ScrollArea>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
          {canApplyToTranscript && transcriptSegments ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = applyProofreadToTranscript(
                  transcriptSegments,
                  text,
                );
                if (next) {
                  onApplyTranscript?.(next);
                  handleOpenChange(false);
                }
              }}
            >
              修正テキストを文字起こしに反映
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!text.trim() || isRunning}
            onClick={() => void handleProofread()}
          >
            {isRunning ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <SpellCheck data-icon="inline-start" />
            )}
            {isRunning ? "チェック中…" : "誤字脱字チェック"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
