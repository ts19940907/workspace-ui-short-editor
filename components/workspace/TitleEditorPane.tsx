"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

import {
  DEFAULT_FRAME_STEP_MS,
  formatTimelineLabel,
} from "@/lib/clip/time";
import type { TimelineSelection } from "@/lib/clip-schema";
import type { SelectedSegmentInfo } from "@/lib/clip/selection";
import { InlineTextField, InlineTextareaField } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type TitleEditorPaneProps = {
  projectTitle: string;
  videoUrl?: string;
  playheadMs: number;
  durationMs: number;
  isPlaying: boolean;
  selection: TimelineSelection | null;
  selectionInfo: SelectedSegmentInfo | null;
  onTitleSave: (title: string) => void;
  onPlayheadChange: (ms: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onDurationChange: (ms: number) => void;
  onSelectionTextSave: (text: string) => void;
};

export function TitleEditorPane({
  projectTitle,
  videoUrl,
  playheadMs,
  durationMs,
  isPlaying,
  selection,
  selectionInfo,
  onTitleSave,
  onPlayheadChange,
  onPlayingChange,
  onDurationChange,
  onSelectionTextSave,
}: TitleEditorPaneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    const targetSec = playheadMs / 1000;
    if (Math.abs(video.currentTime - targetSec) > 0.05) {
      seekingRef.current = true;
      video.currentTime = targetSec;
    }
  }, [playheadMs, videoUrl]);

  const clampPlayhead = useCallback(
    (ms: number) => {
      const max = durationMs > 0 ? durationMs : ms;
      return Math.max(0, Math.min(ms, max));
    },
    [durationMs],
  );

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || seekingRef.current) return;
    onPlayheadChange(Math.round(video.currentTime * 1000));
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      onPlayingChange(true);
    } else {
      video.pause();
      onPlayingChange(false);
    }
  };

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (video) video.pause();
    onPlayingChange(false);
    onPlayheadChange(clampPlayhead(playheadMs + direction * DEFAULT_FRAME_STEP_MS));
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border-border bg-card p-3">
      <InlineTextField
        key={projectTitle}
        value={projectTitle}
        ariaLabel="プロジェクトタイトル"
        placeholder="タイトルを入力"
        onSave={onTitleSave}
      />

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">タイトル編集</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {formatTimelineLabel(playheadMs)}
          {durationMs > 0 ? ` / ${formatTimelineLabel(durationMs)}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
        <Label className="text-xs text-muted-foreground">
          {selectionInfo
            ? selectionInfo.label
            : "タイムラインのブロックをクリックすると、ここに表示されます"}
        </Label>
        {selectionInfo ? (
          selectionInfo.editable ? (
            <InlineTextareaField
              key={
                selection
                  ? `${selection.track}-${selection.id}`
                  : "no-selection"
              }
              value={selectionInfo.text}
              ariaLabel={selectionInfo.label}
              onSave={onSelectionTextSave}
            />
          ) : (
            <p className="text-sm text-foreground">{selectionInfo.text}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">未選択</p>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-h-full max-w-full"
            onLoadedMetadata={(e) => {
              const dur = Math.round(e.currentTarget.duration * 1000);
              if (Number.isFinite(dur)) onDurationChange(dur);
            }}
            onTimeUpdate={handleTimeUpdate}
            onSeeked={() => {
              seekingRef.current = false;
            }}
            onEnded={() => onPlayingChange(false)}
            onPlay={() => onPlayingChange(true)}
            onPause={() => onPlayingChange(false)}
          />
        ) : (
          <p className="px-4 text-center text-sm text-muted-foreground">
            左ペインでプロジェクトを作成し、ローカル動画を選択してください
          </p>
        )}
      </div>

      <div className="flex justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => stepFrame(-1)}
          disabled={!videoUrl}
          aria-label="1フレーム戻る"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          onClick={() => void togglePlay()}
          disabled={!videoUrl}
          aria-label={isPlaying ? "一時停止" : "再生"}
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => stepFrame(1)}
          disabled={!videoUrl}
          aria-label="1フレーム進む"
        >
          <ChevronRight />
        </Button>
      </div>
    </Card>
  );
}
