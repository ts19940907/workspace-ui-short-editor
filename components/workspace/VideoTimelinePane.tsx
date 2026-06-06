"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatTimelineLabel } from "@/lib/clip/time";
import type {
  EditableTitleSegment,
  ReadOnlyTitleSegment,
  TimelineSelection,
  TranscriptSegment,
} from "@/lib/clip-schema";
import { Card } from "@/components/ui/card";

type VideoTimelinePaneProps = {
  durationMs: number;
  playheadMs: number;
  segments: TranscriptSegment[];
  editableTitles: EditableTitleSegment[];
  readOnlyTitles: ReadOnlyTitleSegment[];
  selection: TimelineSelection | null;
  onPlayheadChange: (ms: number) => void;
  onSelect: (selection: TimelineSelection) => void;
};

function msToPercent(ms: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, (ms / durationMs) * 100));
}

type TrackProps = {
  durationMs: number;
  playheadMs: number;
  onPlayheadChange: (ms: number) => void;
  label: string;
  laneClassName: string;
  children: ReactNode;
};

function TimelineTrack({
  durationMs,
  playheadMs,
  onPlayheadChange,
  label,
  laneClassName,
  children,
}: TrackProps) {
  const laneRef = useRef<HTMLDivElement>(null);

  const seekFromPointer = (clientX: number) => {
    const lane = laneRef.current;
    if (!lane || durationMs <= 0) return;
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onPlayheadChange(Math.round(ratio * durationMs));
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div
        ref={laneRef}
        role="slider"
        aria-label={`${label}タイムライン`}
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={playheadMs}
        tabIndex={0}
        className={cn(
          "relative h-9 cursor-pointer overflow-hidden rounded-md border border-border",
          laneClassName,
        )}
        onClick={(e) => seekFromPointer(e.clientX)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 5000 : 1000;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            onPlayheadChange(Math.min(durationMs, playheadMs + step));
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onPlayheadChange(Math.max(0, playheadMs - step));
          }
        }}
      >
        {children}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-primary"
          style={{ left: `${msToPercent(playheadMs, durationMs)}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

type BlockProps = {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  title: string;
  label: string;
  className: string;
  selected: boolean;
  onSelect: () => void;
  onSeek: () => void;
  children?: ReactNode;
};

function TimelineBlock({
  startMs,
  endMs,
  durationMs,
  title,
  label,
  className,
  selected,
  onSelect,
  onSeek,
  children,
}: BlockProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "absolute top-1 bottom-1 rounded-sm px-1 text-left text-[10px] leading-tight",
        className,
        selected && "ring-2 ring-ring ring-offset-1",
      )}
      style={{
        left: `${msToPercent(startMs, durationMs)}%`,
        width: `${Math.max(
          2,
          msToPercent(endMs, durationMs) - msToPercent(startMs, durationMs),
        )}%`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
        onSeek();
      }}
    >
      {children}
    </button>
  );
}

export function VideoTimelinePane({
  durationMs,
  playheadMs,
  segments,
  editableTitles,
  readOnlyTitles,
  selection,
  onPlayheadChange,
  onSelect,
}: VideoTimelinePaneProps) {
  const effectiveDuration = durationMs > 0 ? durationMs : 1;

  const isSelected = (track: TimelineSelection["track"], id: string) =>
    selection?.track === track && selection.id === id;

  return (
    <Card className="flex h-60 shrink-0 flex-col gap-3 rounded-xl border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">タイムライン</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {formatTimelineLabel(playheadMs)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <TimelineTrack
          durationMs={effectiveDuration}
          playheadMs={playheadMs}
          onPlayheadChange={onPlayheadChange}
          label="編集不可タイトル"
          laneClassName="bg-muted"
        >
          {readOnlyTitles.map((item) => (
            <TimelineBlock
              key={item.id}
              id={item.id}
              startMs={item.startMs}
              endMs={item.endMs}
              durationMs={effectiveDuration}
              title={item.text}
              label={`編集不可: ${item.text}`}
              className="bg-muted-foreground/40 text-background hover:bg-muted-foreground/55"
              selected={isSelected("readOnlyTitle", item.id)}
              onSelect={() =>
                onSelect({ track: "readOnlyTitle", id: item.id })
              }
              onSeek={() => onPlayheadChange(item.startMs)}
            >
              <span className="line-clamp-2 font-medium">{item.text}</span>
            </TimelineBlock>
          ))}
        </TimelineTrack>

        <TimelineTrack
          durationMs={effectiveDuration}
          playheadMs={playheadMs}
          onPlayheadChange={onPlayheadChange}
          label="編集可能なタイトル"
          laneClassName="bg-secondary/50"
        >
          {editableTitles.map((item) => (
            <TimelineBlock
              key={item.id}
              id={item.id}
              startMs={item.startMs}
              endMs={item.endMs}
              durationMs={effectiveDuration}
              title={`${item.topicLabel}: ${item.text}`}
              label={`編集可能: ${item.text}`}
              className="bg-primary/80 text-primary-foreground hover:bg-primary"
              selected={isSelected("editableTitle", item.id)}
              onSelect={() =>
                onSelect({ track: "editableTitle", id: item.id })
              }
              onSeek={() => onPlayheadChange(item.startMs)}
            >
              <span className="line-clamp-2">{item.text}</span>
            </TimelineBlock>
          ))}
        </TimelineTrack>

        <TimelineTrack
          durationMs={effectiveDuration}
          playheadMs={playheadMs}
          onPlayheadChange={onPlayheadChange}
          label="文字起こし"
          laneClassName="bg-accent/30"
        >
          {segments.map((seg) => (
            <TimelineBlock
              key={seg.id}
              id={seg.id}
              startMs={seg.startMs}
              endMs={seg.endMs}
              durationMs={effectiveDuration}
              title={seg.text}
              label={`文字起こし: ${seg.text}`}
              className="bg-accent hover:bg-accent/80"
              selected={isSelected("transcript", seg.id)}
              onSelect={() => onSelect({ track: "transcript", id: seg.id })}
              onSeek={() => onPlayheadChange(seg.startMs)}
            />
          ))}
        </TimelineTrack>
      </div>
    </Card>
  );
}
