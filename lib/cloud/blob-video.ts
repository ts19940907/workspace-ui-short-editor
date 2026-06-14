/** Vercel Blob の URL かどうか。 */
export function isVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Private Blob ストアの URL（認証付きプロキシが必要）。 */
export function isPrivateVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Vercel Blob の pathname 用にファイル名を ASCII 化する。
 * 日本語等の非 ASCII 名は presigned URL 発行時に 400 になるため。
 */
export function sanitizeBlobUploadFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : ".mp4";
  const rawBase = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const base =
    rawBase
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "video";
  return `${base}${ext}`;
}

/**
 * Range 付き GET で upstream が 200 + Content-Range を返す場合、
 * `<video>` 再生に必要な 206 に変換する。
 */
export function resolveBlobVideoResponseStatus(
  requestRange: string | null,
  contentRange: string | null,
  upstreamStatus: number,
): number {
  if (upstreamStatus === 304) return 304;
  if (requestRange && contentRange && upstreamStatus === 200) return 206;
  return upstreamStatus;
}

/**
 * `<video src>` 用 URL を返す。
 * Private Blob は `/api/blob/video` 経由、ローカル blob: はそのまま。
 */
export function toVideoPlaybackUrl(storedUrl?: string): string | undefined {
  if (!storedUrl) return undefined;
  if (storedUrl.startsWith("blob:")) return storedUrl;
  if (isPrivateVercelBlobUrl(storedUrl)) {
    return `/api/blob/video?url=${encodeURIComponent(storedUrl)}`;
  }
  return storedUrl;
}
