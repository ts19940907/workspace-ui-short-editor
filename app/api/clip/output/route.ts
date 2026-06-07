import { runAiClipOutput } from "@/lib/clip/ai-output";
import { formatGeminiError } from "@/lib/clip/gemini";
import {
  clipOutputJsonRequestSchema,
  clipOutputModeSchema,
  clipOutputResponseSchema,
} from "@/lib/clip/output";
import { isValidHttpUrl } from "@/lib/clip/source-url";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const durationRaw = form.get("durationMs");
      const sourceUrlRaw = form.get("sourceUrl");
      const outputModeRaw = form.get("outputMode");
      const video = form.get("video");

      const durationMs = Number(durationRaw);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        return new Response("Invalid durationMs", { status: 400 });
      }

      const outputModeParsed = clipOutputModeSchema.safeParse(outputModeRaw);
      const outputMode = outputModeParsed.success
        ? outputModeParsed.data
        : "summaryOnly";

      const sourceUrl =
        typeof sourceUrlRaw === "string" && isValidHttpUrl(sourceUrlRaw)
          ? sourceUrlRaw.trim()
          : undefined;

      if (sourceUrl) {
        const result = await runAiClipOutput({
          durationMs,
          sourceUrl,
          outputMode,
        });
        return Response.json(clipOutputResponseSchema.parse(result));
      }

      if (!(video instanceof File)) {
        return new Response("Video file or sourceUrl is required", {
          status: 400,
        });
      }

      const result = await runAiClipOutput({
        durationMs: durationMs > 0 ? durationMs : 420_000,
        videoBlob: video,
        videoFileName: video.name,
        outputMode,
      });

      return Response.json(clipOutputResponseSchema.parse(result));
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const parsed = clipOutputJsonRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(parsed.error.message, { status: 400 });
    }

    const result = await runAiClipOutput({
      durationMs: parsed.data.durationMs,
      sourceUrl: parsed.data.sourceUrl,
      videoUrl: parsed.data.videoUrl,
      videoFileName: parsed.data.videoFileName,
      outputMode: parsed.data.outputMode,
    });

    return Response.json(clipOutputResponseSchema.parse(result));
  } catch (error) {
    const message = (error as Error).message;
    const status =
      message.includes("リンク") ||
      message.includes("動画") ||
      message.includes("添付")
        ? 400
        : 502;
    return new Response(formatGeminiError(message), { status });
  }
}
