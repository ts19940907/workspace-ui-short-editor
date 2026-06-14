import { formatTimelineLabel } from "@/lib/clip/time";
import { extractYoutubeVideoId } from "@/lib/clip/source-url";
import { groupTimedLinesBySentence } from "@/lib/clip/transcript-display";

const YOUTUBE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type YoutubeCaptionLine = {
  startMs: number;
  endMs: number;
  text: string;
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ")
    .trim();
}

export function mergeCaptionLines(
  lines: YoutubeCaptionLine[],
  targetWindowMs = 20_000,
): YoutubeCaptionLine[] {
  if (lines.length === 0) return [];

  const merged: YoutubeCaptionLine[] = [];
  let current: YoutubeCaptionLine | null = null;

  for (const line of lines) {
    if (!current) {
      current = { ...line };
      continue;
    }

    const spansSameWindow =
      line.startMs - current.startMs < targetWindowMs &&
      line.endMs - current.startMs < targetWindowMs;

    if (spansSameWindow) {
      current.endMs = Math.max(current.endMs, line.endMs);
      current.text = `${current.text} ${line.text}`.trim();
    } else {
      merged.push(current);
      current = { ...line };
    }
  }

  if (current) merged.push(current);
  return merged;
}

export function formatCaptionLinesForSummary(lines: YoutubeCaptionLine[]): string {
  return lines
    .map(
      (line) =>
        `[${formatTimelineLabel(line.startMs)}-${formatTimelineLabel(line.endMs)}] ${line.text}`,
    )
    .join("\n");
}

/** Gemini 入力用に字幕を圧縮（長尺配信向け） */
export function prepareCaptionSummaryInput(
  lines: YoutubeCaptionLine[],
): { text: string; durationMs: number } {
  const durationMs = lines.reduce((max, line) => Math.max(max, line.endMs), 0);
  let windowMs = 20_000;
  let merged = mergeCaptionLines(lines, windowMs);

  while (merged.length > 600 && windowMs < 120_000) {
    windowMs *= 2;
    merged = mergeCaptionLines(lines, windowMs);
  }

  return {
    durationMs,
    text: formatCaptionLinesForSummary(merged),
  };
}

/** 字幕行を画面表示用セグメントに変換（ケバ除去 + 「。」区切り） */
export function captionsToTranscriptSegments(
  lines: YoutubeCaptionLine[],
): Array<{ startMs: number; endMs: number; text: string }> {
  return groupTimedLinesBySentence(lines);
}

/** 長尺字幕を時間区切りで分割（要約 API を小分けにする） */
export function splitCaptionsByDuration(
  lines: YoutubeCaptionLine[],
  chunkMs = 600_000,
): YoutubeCaptionLine[][] {
  if (lines.length === 0) return [];

  const chunks: YoutubeCaptionLine[][] = [];
  let current: YoutubeCaptionLine[] = [];
  let chunkStartMs = lines[0]?.startMs ?? 0;

  for (const line of lines) {
    if (
      current.length > 0 &&
      line.startMs - chunkStartMs >= chunkMs
    ) {
      chunks.push(current);
      current = [];
      chunkStartMs = line.startMs;
    }
    current.push(line);
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function parseYoutubeCaptionXml(xml: string): YoutubeCaptionLine[] {
  if (xml.includes('<timedtext format="3"') || xml.includes("<p t=")) {
    return parseYoutubeTimedTextFormat3(xml);
  }

  const lines: YoutubeCaptionLine[] = [];
  const pattern =
    /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;

  for (const match of xml.matchAll(pattern)) {
    const startSec = Number(match[1]);
    const durSec = Number(match[2]);
    const text = decodeHtmlEntities(match[3] ?? "");
    if (!text) continue;

    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round((startSec + durSec) * 1000);
    lines.push({ startMs, endMs, text });
  }

  return lines;
}

/** YouTube timedtext format 3（Innertube API 経由で返る XML） */
export function parseYoutubeTimedTextFormat3(xml: string): YoutubeCaptionLine[] {
  const lines: YoutubeCaptionLine[] = [];
  const pattern = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

  for (const match of xml.matchAll(pattern)) {
    const startMs = Number(match[1]);
    const durMs = Number(match[2]);
    const inner = match[3] ?? "";
    const text = decodeHtmlEntities(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!text) continue;

    lines.push({
      startMs,
      endMs: startMs + durMs,
      text,
    });
  }

  return lines;
}

export function parseYoutubeCaptionJson3(raw: string): YoutubeCaptionLine[] {
  const parsed = JSON.parse(raw) as {
    events?: Array<{
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    }>;
  };

  const lines: YoutubeCaptionLine[] = [];
  for (const event of parsed.events ?? []) {
    const text = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text || text === "\n") continue;

    const startMs = event.tStartMs ?? 0;
    const endMs = startMs + (event.dDurationMs ?? 0);
    lines.push({
      startMs,
      endMs: endMs > startMs ? endMs : startMs + 1000,
      text: decodeHtmlEntities(text),
    });
  }

  return lines.filter((line) => line.text.length > 0);
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const prefer = (predicate: (track: CaptionTrack) => boolean) =>
    tracks.find(predicate);

  return (
    prefer((track) => track.languageCode === "ja" && track.kind !== "asr") ??
    prefer(
      (track) =>
        track.languageCode?.startsWith("ja") && track.kind === "asr",
    ) ??
    prefer((track) => track.languageCode?.startsWith("ja")) ??
    tracks[0]
  );
}

async function fetchInnertubePlayer(videoId: string): Promise<{
  tracks: CaptionTrack[];
  durationMs: number;
}> {
  const response = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": YOUTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "ja",
            gl: "JP",
          },
        },
        videoId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("YouTube 動画情報の取得に失敗しました");
  }

  const json = (await response.json()) as {
    playabilityStatus?: { status?: string; reason?: string };
    videoDetails?: { lengthSeconds?: string | number };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: CaptionTrack[];
      };
    };
  };

  const status = json.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(
      json.playabilityStatus?.reason ??
        "YouTube 動画を再生できません（非公開・地域制限の可能性があります）",
    );
  }

  const tracks =
    json.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    throw new Error(
      "YouTube 字幕が見つかりませんでした。自動生成字幕が無い動画の可能性があります",
    );
  }

  const lengthSeconds = Number(json.videoDetails?.lengthSeconds ?? 0);
  const durationMs =
    Number.isFinite(lengthSeconds) && lengthSeconds > 0
      ? Math.round(lengthSeconds * 1000)
      : 0;

  return { tracks, durationMs };
}

function extractCaptionTracksFromWatchPage(html: string): CaptionTrack[] {
  const marker = '"captions":';
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error("YouTube 字幕が見つかりませんでした（字幕が無効な動画の可能性があります）");
  }

  const afterMarker = html.slice(start + marker.length);
  const endMarker = ',"videoDetails"';
  const end = afterMarker.indexOf(endMarker);
  if (end === -1) {
    throw new Error("YouTube 字幕情報の解析に失敗しました");
  }

  const captionsJson = JSON.parse(afterMarker.slice(0, end)) as {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };

  const tracks =
    captionsJson.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    throw new Error(
      "YouTube 字幕が見つかりませんでした。自動生成字幕が無い、または非公開の動画の可能性があります",
    );
  }

  return tracks;
}

async function fetchCaptionTrackLines(track: CaptionTrack): Promise<YoutubeCaptionLine[]> {
  const baseUrl = track.baseUrl;
  if (!baseUrl) {
    throw new Error("YouTube 字幕 URL の取得に失敗しました");
  }

  const response = await fetch(baseUrl, {
    headers: { "User-Agent": YOUTUBE_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error("YouTube 字幕のダウンロードに失敗しました");
  }

  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error("YouTube 字幕の内容が空でした");
  }

  try {
    const jsonLines = parseYoutubeCaptionJson3(raw);
    if (jsonLines.length > 0) return jsonLines;
  } catch {
    // fall through to XML
  }

  const xmlLines = parseYoutubeCaptionXml(raw);
  if (xmlLines.length === 0) {
    throw new Error("YouTube 字幕の内容が空でした");
  }
  return xmlLines;
}

export type YoutubeCaptionFetchResult = {
  lines: YoutubeCaptionLine[];
  durationMs: number;
};

export async function fetchYoutubeCaptions(
  sourceUrl: string,
): Promise<YoutubeCaptionFetchResult> {
  const videoId = extractYoutubeVideoId(sourceUrl);
  if (!videoId) {
    throw new Error("YouTube URL から動画 ID を取得できませんでした");
  }

  let tracks: CaptionTrack[];
  let durationMs = 0;
  try {
    const player = await fetchInnertubePlayer(videoId);
    tracks = player.tracks;
    durationMs = player.durationMs;
  } catch (innertubeError) {
    const pageResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": YOUTUBE_USER_AGENT,
          "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
        },
      },
    );

    if (!pageResponse.ok) {
      throw innertubeError;
    }

    const html = await pageResponse.text();
    if (html.includes('class="g-recaptcha"')) {
      throw new Error(
        "YouTube から一時的にブロックされました。しばらく待って再試行してください",
      );
    }

    tracks = extractCaptionTracksFromWatchPage(html);
  }

  const track = pickCaptionTrack(tracks);
  if (!track) {
    throw new Error("利用可能な YouTube 字幕トラックがありません");
  }

  const lines = await fetchCaptionTrackLines(track);
  const captionEndMs = lines.reduce((max, line) => Math.max(max, line.endMs), 0);

  return {
    lines,
    durationMs: durationMs || captionEndMs,
  };
}

export { extractYoutubeVideoId };
