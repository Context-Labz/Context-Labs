// One chat abstraction, two providers. OpenRouter primary, OpenAI optional fallback.
// OpenRouter is the main client because we have working OpenRouter credits, not
// standard OpenAI API access (only Codex, which doesn't work for chat completions).
// The optional OpenAI fallback is kept in case OPENAI_API_KEY is set, but it's
// not required and won't break anything if missing.
import OpenAI from "openai";
import { z } from "zod";

// OpenRouter model string format: "provider/model" (e.g., "openai/gpt-4o-mini").
// This is different from bare OpenAI model names.
const DEFAULT_MODEL = process.env.LLM_MODEL || "openai/gpt-4o-mini";

// FIX (found by actually running `next build`, not just `tsc`): constructing
// the OpenAI client at module load time throws "OPENROUTER_API_KEY is missing"
// during Next's build-time page-data collection if the key isn't present as
// a BUILD-time env var — which it often isn't for Cloud Run (env vars set
// via `gcloud run deploy --set-env-vars` are RUNTIME-only). That broke
// `next build` entirely, which would have broken the Cloud Run deploy step
// on demo night with a confusing error. Lazy-init + memoize instead, so the
// client is only constructed the first time a request actually needs it.
let _primary: OpenAI | null = null;
function primary(): OpenAI {
  if (!_primary) {
    _primary = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _primary;
}

let _fallback: OpenAI | null | undefined;
function fallback(): OpenAI | null {
  if (_fallback === undefined) {
    _fallback = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }
  return _fallback;
}

async function withFallback<T>(fn: (client: OpenAI) => Promise<T>): Promise<T> {
  try {
    return await fn(primary());
  } catch (err: any) {
    // Log full error details for debugging
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

// FIX (found by actually running tsc against the real openai package):
// OpenAI.Chat.ChatCompletionCreateParams is a union that covers the
// streaming case too, so `.create(params)` returns a Stream<...> | ChatCompletion
// union and `res.choices` doesn't typecheck. Pinning the param type to the
// NonStreaming variant (we never pass `stream: true` anywhere in this file)
// narrows the return type to plain ChatCompletion, which does have `.choices`.
export async function chat(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) {
  return withFallback((client) => client.chat.completions.create(params));
}

// Structured output: ask for JSON, parse with Zod, retry once on parse failure.
export async function structured<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
): Promise<T> {
  // OpenAI requires the word "json" in the prompt when using json_object mode
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
