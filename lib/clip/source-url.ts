/** ライブ配信・動画 URL の正規化と判定 */

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const normalized = normalizeSourceUrl(url);
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id && YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const id = parsed.searchParams.get("v");
      return id && YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.replace(/^www\./, "") === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (parsed.hostname.replace(/^www\./, "") === "youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isYoutubeUrl(url: string): boolean {
  try {
    const host = new URL(normalizeSourceUrl(url)).hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    );
  } catch {
    return false;
  }
}

export function describeSourceUrlSupport(url: string): string {
  if (isYoutubeUrl(url)) {
    return "YouTube は字幕を先に取得し、テキスト要約のみ Gemini に渡します（動画丸ごと解析より高速）。";
  }
  return "YouTube 以外の URL は Gemini 側で取得できない場合があります。うまくいかない場合は YouTube のアーカイブ URL を試してください。";
}
