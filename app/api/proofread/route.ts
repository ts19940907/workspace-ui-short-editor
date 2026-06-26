import {
  mockProofread,
  proofreadRequestSchema,
  proofreadResponseSchema,
} from "@/lib/clip/proofread";
import { geminiGenerateContent, formatGeminiError, hasGeminiKey } from "@/lib/clip/gemini";

const SYSTEM_PROMPT = `あなたは日本語の校正者です。ユーザーから渡されたテキストについて、日本語として成立していないような内容はもちろん、誤字脱字がないかチェックしてください。

出力形式:
- 問題がない場合は「問題は見つかりませんでした」と簡潔に述べる
- 問題がある場合は番号付きリストで、各項目に「該当箇所」「問題点」「修正案」を含める
- 敬体（です・ます）で回答する`;

async function runGeminiProofread(text: string): Promise<string> {
  return geminiGenerateContent({
    system: SYSTEM_PROMPT,
    user: `以下のテキストを校正してください:\n\n${text}`,
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = proofreadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  const hasApiKey = hasGeminiKey();

  try {
    const result = hasApiKey
      ? await runGeminiProofread(parsed.data.text)
      : mockProofread(parsed.data.text);

    const payload = proofreadResponseSchema.parse({
      result,
      mode: hasApiKey ? "ai" : "mock",
    });
    return Response.json(payload);
  } catch (error) {
    return new Response(formatGeminiError((error as Error).message), {
      status: 502,
    });
  }
}
