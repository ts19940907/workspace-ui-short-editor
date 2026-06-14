import { describe, expect, it } from "vitest";

import {
  resolveBlobVideoResponseStatus,
  sanitizeBlobUploadFileName,
  toVideoPlaybackUrl,
} from "@/lib/cloud/blob-video";

describe("sanitizeBlobUploadFileName", () => {
  it("keeps ascii file names", () => {
    expect(sanitizeBlobUploadFileName("my-video.mp4")).toBe("my-video.mp4");
  });

  it("transliterates japanese names to ascii", () => {
    expect(sanitizeBlobUploadFileName("ライブ配信.mp4")).toBe("video.mp4");
    expect(sanitizeBlobUploadFileName("テスト動画.mov")).toMatch(/\.mov$/);
  });
});

describe("resolveBlobVideoResponseStatus", () => {
  it("returns 206 for range responses that upstream marks as 200", () => {
    expect(
      resolveBlobVideoResponseStatus(
        "bytes=0-1023",
        "bytes 0-1023/114390538",
        200,
      ),
    ).toBe(206);
  });

  it("keeps 200 for full responses without range", () => {
    expect(resolveBlobVideoResponseStatus(null, null, 200)).toBe(200);
  });
});

describe("toVideoPlaybackUrl", () => {
  it("proxies private blob urls", () => {
    const stored =
      "https://example.private.blob.vercel-storage.com/videos/a.mp4";
    expect(toVideoPlaybackUrl(stored)).toBe(
      `/api/blob/video?url=${encodeURIComponent(stored)}`,
    );
  });
});
