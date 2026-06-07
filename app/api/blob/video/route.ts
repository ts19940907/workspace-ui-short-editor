import { get } from "@vercel/blob";

import { isVercelBlobUrl } from "@/lib/cloud/blob-video";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";

export async function GET(request: Request): Promise<Response> {
  if (!isCloudEnabled() || !isBlobStorageEnabled()) {
    return new Response("Blob storage is not configured", { status: 503 });
  }

  const blobUrl = new URL(request.url).searchParams.get("url");
  if (!blobUrl || !isVercelBlobUrl(blobUrl)) {
    return new Response("Invalid blob URL", { status: 400 });
  }

  const range = request.headers.get("range");
  const access = blobUrl.includes(".private.blob.vercel-storage.com")
    ? "private"
    : "public";
  const result = await get(blobUrl, {
    access,
    headers: range ? { Range: range } : undefined,
  });

  if (!result) {
    return new Response("Blob not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new Response(null, { status: 304, headers: result.headers });
  }

  const headers = new Headers(result.headers);
  if (!headers.has("Accept-Ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }

  return new Response(result.stream, {
    status: result.statusCode,
    headers,
  });
}
