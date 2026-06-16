import { get } from "@vercel/blob";

import { isVercelBlobUrl, resolveBlobVideoResponseStatus } from "@/lib/cloud/blob-video";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";

/** @vercel/blob の undici Headers を Web API Headers に変換 */
function toWebHeaders(source: { entries(): IterableIterator<[string, string]> }): Headers {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    headers.set(key, value);
  }
  return headers;
}

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

  const headers = toWebHeaders(result.headers);

  if (result.statusCode === 304) {
    return new Response(null, { status: 304, headers });
  }
  if (!headers.has("Accept-Ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }

  const status = resolveBlobVideoResponseStatus(
    range,
    headers.get("Content-Range"),
    result.statusCode,
  );

  return new Response(result.stream, {
    status,
    headers,
  });
}
