// One chat abstraction, two providers. OpenAI primary, OpenRouter fallback.
// The fallback exists so a live-demo rate limit is a 2-second hiccup, not a
// dead demo (note: it only triggers on 429s — a bad/unavailable model name
// on the primary client will NOT fall through to OpenRouter, it'll just
// error. Verify DEFAULT_MODEL against a real OpenAI model list tonight).
import OpenAI from "openai";
import { z } from "zod";

// UNVERIFIED placeholder — confirm this is a real, currently-available
// model string for your OpenAI key before relying on it as the default.
const DEFAULT_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

// FIX (found by actually running `next build`, not just `tsc`): constructing
// the OpenAI client at module load time throws "OPENAI_API_KEY is missing"
// during Next's build-time page-data collection if the key isn't present as
// a BUILD-time env var — which it often isn't for Cloud Run (env vars set
// via `gcloud run deploy --set-env-vars` are RUNTIME-only). That broke
// `next build` entirely, which would have broken the Cloud Run deploy step
// on demo night with a confusing error. Lazy-init + memoize instead, so the
// client is only constructed the first time a request actually needs it.
let _primary: OpenAI | null = null;
function primary(): OpenAI {
  if (!_primary) _primary = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _primary;
}

let _fallback: OpenAI | null | undefined;
function fallback(): OpenAI | null {
  if (_fallback === undefined) {
    _fallback = process.env.OPENROUTER_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" })
      : null;
  }
  return _fallback;
}

async function withFallback<T>(fn: (client: OpenAI) => Promise<T>): Promise<T> {
  try {
    return await fn(primary());
  } catch (err: any) {
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
  const res = await chat({
    model: DEFAULT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
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
        { role: "system", content: system + "\nReturn ONLY valid JSON matching the schema." },
        { role: "user", content: raw + "\n\nThat output failed validation. Fix it." },
      ],
    });
    return schema.parse(JSON.parse(retry.choices[0]?.message?.content ?? "{}"));
  }
}
