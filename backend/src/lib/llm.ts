import OpenAI from "openai";
import { z } from "zod";
import { createRetryingFetch } from "./http";

const DEFAULT_MODEL = process.env.LLM_MODEL || "openai/gpt-4o-mini";
const resilientFetch = createRetryingFetch();

function looksLikePlaceholder(key?: string): boolean {
  if (!key) return true;
  const k = key.trim();
  if (k.length < 20) return true;
  if (/^(your-|changeme|xxx|placeholder|test)/i.test(k)) return true;
  return false;
}

export function llmConfigured(): boolean {
  return !looksLikePlaceholder(process.env.OPENROUTER_API_KEY) || !looksLikePlaceholder(process.env.OPENAI_API_KEY);
}

let _primary: OpenAI | null = null;
function primary(): OpenAI {
  if (!_primary) {
    _primary = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      fetch: resilientFetch,
      maxRetries: 0,
    });
  }
  return _primary;
}

let _fallback: OpenAI | null | undefined;
function fallback(): OpenAI | null {
  if (_fallback === undefined) {
    _fallback = looksLikePlaceholder(process.env.OPENAI_API_KEY)
      ? null
      : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _fallback;
}

async function withFallback<T>(fn: (client: OpenAI) => Promise<T>): Promise<T> {
  if (looksLikePlaceholder(process.env.OPENROUTER_API_KEY) && !fallback()) {
    throw new Error("No LLM key configured");
  }
  try {
    return await fn(primary());
  } catch (err: any) {
    console.error("LLM call failed:", {
      status: err?.status,
      message: err?.message,
      error: err?.error,
      type: err?.type,
      code: err?.code,
    });
    const rateLimited =
      err?.status === 429 ||
      err?.code === "rate_limit_exceeded" ||
      err?.message?.includes("429");
    const fb = fallback();
    if (rateLimited && fb) return fn(fb);
    throw err;
  }
}

export async function chat(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) {
  return withFallback((client) => client.chat.completions.create(params));
}

export async function structured<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
): Promise<T> {
  const systemWithJson = system.toLowerCase().includes("json")
    ? system
    : `${system}\n\nReturn your response as valid JSON.`;

  const res = await chat({
    model: DEFAULT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemWithJson },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    const retry = await chat({
      model: DEFAULT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemWithJson + "\nReturn ONLY valid JSON matching the schema." },
        { role: "user", content: raw + "\n\nThat output failed validation. Fix it." },
      ],
    });
    return schema.parse(JSON.parse(retry.choices[0]?.message?.content ?? "{}"));
  }
}
