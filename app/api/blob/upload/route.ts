import { issueSignedToken } from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";

import { getOwnerUserId } from "@/lib/clip/owner";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";

const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
] as const;

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isCloudEnabled() || !isBlobStorageEnabled()) {
    return new Response("Blob storage is not configured", { status: 503 });
  }

  const userId = getOwnerUserId();
  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: [...VIDEO_CONTENT_TYPES],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: [...VIDEO_CONTENT_TYPES],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            tokenPayload: JSON.stringify({ userId }),
          },
        };
      },
      onUploadCompleted: async () => {
        // クライアント側で saveProjectAction により URL を永続化する
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }
}
