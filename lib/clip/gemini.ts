const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const INLINE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { file_data: { file_uri: string; mime_type?: string } };

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

type GeminiFileResource = {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: string;
  error?: { message?: string };
};

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export function hasGeminiKey(): boolean {
  return Boolean(getGeminiApiKey());
}

export function formatGeminiError(message: string): string {
  if (
    message.includes("no longer available") ||
    message.includes("is not found")
  ) {
    return [
      "指定した Gemini モデルは利用できません。",
      "`.env.local` に `GEMINI_MODEL=gemini-2.5-flash` を設定し、dev サーバーを再起動してください。",
    ].join(" ");
  }
  if (
    message.includes("high demand") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("overloaded")
  ) {
    return [
      "Gemini モデルが混雑しています（Google 側の一時的な高負荷）。",
      "自動リトライと代替モデルでも失敗しました。数分待ってから再度お試しください。",
      "`.env.local` に `GEMINI_MODEL=gemini-2.5-flash-lite` を設定すると安定する場合があります。",
    ].join(" ");
  }
  if (message.includes("quota") || message.includes("Quota exceeded")) {
    return [
      "Gemini API の利用上限に達しています。",
      "Google AI Studio（https://aistudio.google.com/）で API キー・Prepay 残高・利用上限を確認してください。",
    ].join(" ");
  }
  if (
    message.includes("prepayment credits are depleted") ||
    message.includes("Prepay")
  ) {
    return [
      "Gemini API の Prepay 残高が不足しています。",
      "AI Studio（https://ai.studio/projects）でクレジットを追加してください（最低 $10 程度）。",
    ].join(" ");
  }
  if (message.includes("fetch failed") || message.includes("ECONNRESET")) {
    return [
      "Gemini API への通信が途中で切れました（タイムアウトまたはネットワーク障害）。",
      "YouTube 解析は数分かかることがあります。短い動画で再試行するか、数分待ってからもう一度実行してください。",
    ].join(" ");
  }
  return message;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
] as const;

export function getGeminiModelCandidates(): string[] {
  const primary = getGeminiModel();
  const fallbacks = GEMINI_FALLBACK_MODELS.filter((model) => model !== primary);
  return [primary, ...fallbacks];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableGeminiError(
  message: string,
  status?: number,
): boolean {
  if (status === 429 || status === 503 || status === 500) return true;
  return (
    message.includes("high demand") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("overloaded") ||
    message.includes("UNAVAILABLE") ||
    message.includes("fetch failed") ||
    message.includes("ECONNRESET")
  );
}

function requireGeminiApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return apiKey;
}

function geminiUrl(path: string): string {
  const apiKey = requireGeminiApiKey();
  return `${GEMINI_API_BASE}${path}?key=${encodeURIComponent(apiKey)}`;
}

export function guessVideoMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    default:
      return "video/mp4";
  }
}

export function parseGeminiJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(jsonText);
}

function extractGeminiText(response: GeminiGenerateResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error(
      response.error?.message ?? "Gemini API returned empty content",
    );
  }
  return text;
}

async function callGeminiGenerateContent(options: {
  model: string;
  system?: string;
  parts: GeminiContentPart[];
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: options.parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.jsonObject ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const response = await fetch(
    geminiUrl(`/models/${options.model}:generateContent`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const json = (await response.json()) as GeminiGenerateResponse;
  if (!response.ok) {
    const message =
      json.error?.message ??
      ((await response.text()) || "Gemini API request failed");
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return extractGeminiText(json);
}

async function callGeminiWithRetry(options: {
  system?: string;
  parts: GeminiContentPart[];
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  const models = getGeminiModelCandidates();
  let lastError: (Error & { status?: number }) | null = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await callGeminiGenerateContent({ ...options, model });
      } catch (error) {
        lastError = error as Error & { status?: number };
        const message = lastError.message;
        const retryable = isRetryableGeminiError(message, lastError.status);
        if (!retryable || attempt === 2) break;
        await sleep(1500 * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error("Gemini API request failed");
}

export async function geminiGenerateContent(options: {
  system?: string;
  user: string;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  return callGeminiWithRetry({
    system: options.system,
    parts: [{ text: options.user }],
    temperature: options.temperature,
    jsonObject: options.jsonObject,
  });
}

async function waitForGeminiFileReady(
  fileName: string,
  timeoutMs = 120_000,
): Promise<GeminiFileResource> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(geminiUrl(`/${fileName}`));
    const json = (await response.json()) as GeminiFileResource;
    if (!response.ok) {
      throw new Error(json.error?.message ?? "Failed to read uploaded file status");
    }
    if (json.state === "ACTIVE") return json;
    if (json.state === "FAILED") {
      throw new Error(json.error?.message ?? "Gemini file processing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Gemini file processing timed out");
}

async function uploadGeminiFile(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<{ fileUri: string; mimeType: string }> {
  const apiKey = requireGeminiApiKey();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const uploadResponse = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Header-Content-Length": String(buffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: buffer,
    },
  );

  const uploaded = (await uploadResponse.json()) as { file?: GeminiFileResource };
  if (!uploadResponse.ok || !uploaded.file?.name || !uploaded.file.uri) {
    throw new Error(
      uploaded.file?.error?.message ??
        ((await uploadResponse.text()) || "Gemini file upload failed"),
    );
  }

  const ready = await waitForGeminiFileReady(uploaded.file.name);
  return {
    fileUri: ready.uri ?? uploaded.file.uri,
    mimeType: ready.mimeType ?? mimeType,
  };
}

function buildMediaPart(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<GeminiContentPart> {
  if (blob.size <= INLINE_UPLOAD_MAX_BYTES) {
    return blob.arrayBuffer().then((buffer) => ({
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(buffer).toString("base64"),
      },
    }));
  }
  return uploadGeminiFile(blob, fileName, mimeType).then((file) => ({
    file_data: {
      mime_type: file.mimeType,
      file_uri: file.fileUri,
    },
  }));
}

export async function geminiGenerateContentWithMedia(options: {
  system?: string;
  user: string;
  mediaBlob: Blob;
  mediaFileName: string;
  mimeType?: string;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  const mimeType = options.mimeType ?? guessVideoMimeType(options.mediaFileName);
  const mediaPart = await buildMediaPart(
    options.mediaBlob,
    options.mediaFileName,
    mimeType,
  );

  return geminiGenerateContentWithParts({
    system: options.system,
    parts: [mediaPart, { text: options.user }],
    temperature: options.temperature,
    jsonObject: options.jsonObject,
  });
}

async function geminiGenerateContentWithParts(options: {
  system?: string;
  parts: GeminiContentPart[];
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  return callGeminiWithRetry(options);
}

/** YouTube 等の公開 URL を Gemini に渡して解析する */
export async function geminiGenerateContentWithRemoteUrl(options: {
  system?: string;
  user: string;
  sourceUrl: string;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  const normalizedUrl = options.sourceUrl.trim();
  const parts: GeminiContentPart[] = [{ text: options.user }];

  parts.push({
    file_data: {
      file_uri: normalizedUrl,
    },
  });

  return geminiGenerateContentWithParts({
    system: options.system,
    parts,
    temperature: options.temperature,
    jsonObject: options.jsonObject,
  });
}
