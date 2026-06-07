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
