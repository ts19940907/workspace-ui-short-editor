import {
  mockProofread,
  proofreadRequestSchema,
  proofreadResponseSchema,
} from "@/lib/clip/proofread";

const SYSTEM_PROMPT = `あなたは日本語の校正者です。ユーザーから渡されたテキストについて、誤字脱字・文法・表記ゆれ・読みやすさの観点で修正提案を行ってください。

出力形式:
- 問題がない場合は「問題は見つかりませんでした」と簡潔に述べる
- 問題がある場合は番号付きリストで、各項目に「該当箇所」「問題点」「修正案」を含める
- 敬体（です・ます）で回答する`;

async function runOpenAiProofread(text: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return mockProofread(text);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `以下のテキストを校正してください:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "OpenAI API request failed");
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI API returned empty content");
  }
  return content;
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

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

  try {
    const result = hasApiKey
      ? await runOpenAiProofread(parsed.data.text)
      : mockProofread(parsed.data.text);

    const payload = proofreadResponseSchema.parse({
      result,
      mode: hasApiKey ? "ai" : "mock",
    });
    return Response.json(payload);
  } catch (error) {
    return new Response((error as Error).message, { status: 502 });
  }
}
