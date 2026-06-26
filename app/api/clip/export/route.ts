import { normalizeTranscriptSegments } from "@/lib/clip/ai-output";
import { buildPremiereExportFiles } from "@/lib/clip/srt";
import { isValidHttpUrl, isYoutubeUrl } from "@/lib/clip/source-url";
import { fetchYoutubeCaptions } from "@/lib/clip/youtube-captions";
import type { EditableTitleSegment, TranscriptSegment } from "@/lib/clip-schema";
import { z } from "zod";

export const runtime = "nodejs";

const exportRequestSchema = z.object({
  sourceUrl: z.string().optional(),
  segments: z.array(
    z.object({
      id: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
    }),
  ),
  editableTitles: z.array(
    z.object({
      id: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
      topicLabel: z.string(),
      sourceSegmentIds: z.array(z.string()),
    }),
  ),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  let segments: TranscriptSegment[] = parsed.data.segments;
  const sourceUrl = parsed.data.sourceUrl?.trim();

  if (sourceUrl && isValidHttpUrl(sourceUrl) && isYoutubeUrl(sourceUrl)) {
    const { lines } = await fetchYoutubeCaptions(sourceUrl);
    segments = normalizeTranscriptSegments(
      lines.map((line) => ({
        startMs: line.startMs,
        endMs: line.endMs,
        text: line.text,
      })),
    );
  }

  const files = buildPremiereExportFiles(
    segments,
    parsed.data.editableTitles as EditableTitleSegment[],
  );

  return Response.json(files);
}
