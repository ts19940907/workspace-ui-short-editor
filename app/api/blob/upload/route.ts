import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { getOwnerUserId } from "@/lib/clip/owner";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";

export async function POST(request: Request): Promise<Response> {
  if (!isCloudEnabled() || !isBlobStorageEnabled()) {
    return new Response("Blob storage is not configured", { status: 503 });
  }

  const userId = getOwnerUserId();
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "video/x-matroska",
        ],
        maximumSizeInBytes: 1024 * 1024 * 1024,
        tokenPayload: JSON.stringify({ userId }),
      }),
      onUploadCompleted: async () => {
        // クライアント側で saveProjectAction により URL を永続化する
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }
}
