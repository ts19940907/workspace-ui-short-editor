import { z } from "zod";

export const proofreadRequestSchema = z.object({
  text: z.string().min(1).max(100_000),
});

export const proofreadResponseSchema = z.object({
  result: z.string(),
  mode: z.enum(["ai", "mock"]),
});

export type ProofreadResponse = z.infer<typeof proofreadResponseSchema>;

/** API キー未設定時の簡易ヒューリスティック */
export function mockProofread(text: string): string {
  const issues: string[] = [];

  if (/[\u3000]/.test(text)) {
    issues.push(
      "・全角スペース（　）が含まれています。半角スペースまたは改行に置き換えを検討してください。",
    );
  }
  if (/\s{2,}/.test(text)) {
    issues.push("・連続する空白が見つかりました。1 つに統一してください。");
  }
  if (/[a-zA-Z][。、]|[。、][a-zA-Z]/.test(text)) {
    issues.push(
      "・英字と句読点の間にスペースがない箇所があります（例: word。next → word. next）。",
    );
  }
  if (/[ァ-ン]{5,}/.test(text)) {
    issues.push(
      "・長いカタカナ語列があります。外来語表記の統一（長音の有無など）を確認してください。",
    );
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trimEnd();
    if (trimmed.length > 0 && /[^。！？!?]$/.test(trimmed)) {
      issues.push(
        `・${index + 1} 行目: 文末に句点がなく、文が途切れている可能性があります。`,
      );
    }
  });

  if (issues.length === 0) {
    return [
      "【モックモード】明らかな形式上の問題は検出されませんでした。",
      "",
      "より精度の高い誤字脱字・文法チェックには `.env.local` に `GEMINI_API_KEY` を設定してください。",
    ].join("\n");
  }

  return [
    "【モックモード】以下の点を確認してください。",
    "",
    ...issues,
    "",
    "より精度の高いチェックには `.env.local` に `GEMINI_API_KEY` を設定してください。",
  ].join("\n");
}

export async function requestProofread(text: string): Promise<ProofreadResponse> {
  const res = await fetch("/api/proofread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "誤字脱字チェックに失敗しました");
  }

  return proofreadResponseSchema.parse(await res.json());
}
