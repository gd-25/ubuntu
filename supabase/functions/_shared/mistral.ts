// Client minimal de l'API Mistral : chat (avec tools et streaming SSE),
// embeddings (mistral-embed, 1024 dims) et transcription Voxtral.
// La clé vient du secret d'Edge Function MISTRAL_API_KEY.

const BASE = "https://api.mistral.ai/v1";

export const CHAT_MODEL = Deno.env.get("MISTRAL_CHAT_MODEL") ?? "mistral-large-latest";
export const SMALL_MODEL = Deno.env.get("MISTRAL_SMALL_MODEL") ?? "mistral-small-latest";
export const EMBED_MODEL = "mistral-embed";
export const TRANSCRIBE_MODEL = Deno.env.get("MISTRAL_TRANSCRIBE_MODEL") ?? "voxtral-mini-latest";

function apiKey(): string {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("Secret MISTRAL_API_KEY manquant");
  return key;
}

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export async function chat(body: Record<string, unknown>): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mistral chat ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Réponse brute streaming (SSE) de /chat/completions, à parser avec sseChunks(). */
export async function chatStream(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) throw new Error(`Mistral chat ${res.status}: ${await res.text()}`);
  return res;
}

/** Itère les objets JSON du flux SSE de Mistral (s'arrête sur [DONE]). */
export async function* sseChunks(res: Response): AsyncGenerator<Record<string, any>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        // fragment incomplet malgré le découpage par lignes : ignoré
      }
    }
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts.map((t) => t.slice(0, 8000)) }),
  });
  if (!res.ok) throw new Error(`Mistral embeddings ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function transcribe(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", file, filename);
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Mistral transcription ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.text ?? "").trim();
}
