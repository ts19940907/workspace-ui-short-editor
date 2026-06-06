/** ミリ秒を SRT タイムコード `HH:MM:SS,mmm` に変換する。 */
export function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

/** ミリ秒をタイムライン表示用 `M:SS` に変換する。 */
export function formatTimelineLabel(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const DEFAULT_FRAME_STEP_MS = Math.round(1000 / 30);
