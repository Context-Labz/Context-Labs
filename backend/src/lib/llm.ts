// One chat abstraction, two providers. OpenRouter primary, OpenAI optional fallback.
// OpenRouter is the main client because we have working OpenRouter credits, not
// standard OpenAI API access (only Codex, which doesn't work for chat completions).
// The optional OpenAI fallback is kept in case OPENAI_API_KEY is set, but it's
// not required and won't break anything if missing.
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

// Some models wrap JSON in a markdown fence despite response_format. Strip it
// rather than letting JSON.parse throw on the backticks.
function parseJsonLoose(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined; // let the Zod layer report it as a validation failure
  }
}

// FIX (the big one): `schema` used to be applied ONLY at the end, in
// schema.parse(). It never reached the model — so every .describe() in the
// calling routes (add-source's objectiveMatchSchema especially) was dead
// code, and the model had to guess field names like `objectiveId` and
// `contradictsExisting` from prose that never named them. It guessed
// differently, Zod threw, and the retry re-asked WITHOUT the schema too, so
// the retry had no more information than the first attempt. Net effect: the
// capture path — the primary demo path — failed with an unhandled throw.
//
// Serialise the schema into the system prompt. Prompt injection rather than
// OpenAI's native `json_schema` strict mode because this exact call path also
// runs against the OpenRouter fallback, where strict structured output isn't
// universally supported — and a fallback that can't parse is not a fallback.
// $refStrategy "none" inlines repeated sub-schemas: models handle a flat
// schema far more reliably than one full of internal $ref pointers.
function schemaPrompt(system: string, schema: z.ZodType<unknown>): string {
  const json = JSON.stringify(zodToJsonSchema(schema, { $refStrategy: "none" }), null, 2);
  return `${system}

Return ONE JSON object matching this JSON Schema exactly. Use these exact field
names, include every property listed in "required", add no properties that
aren't in the schema, and emit raw JSON with no markdown fences.

JSON Schema:
${json}`;
}

// Structured output: ask for JSON, parse with Zod, retry once with the
// validation error fed back in.
export async function structured<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
): Promise<T> {
  const instructions = schemaPrompt(system, schema);

  const res = await chat({
    model: DEFAULT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  const first = schema.safeParse(parseJsonLoose(raw));
  if (first.success) return first.data;

  // Retry as a real conversation turn — the model sees its own bad output and
  // the specific validation errors, not just "fix it".
  const retry = await chat({
    model: DEFAULT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: user },
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That response failed schema validation:

${first.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}

Return corrected JSON matching the schema above. Raw JSON only.`,
      },
    ],
  });
  const second = schema.safeParse(parseJsonLoose(retry.choices[0]?.message?.content ?? ""));
  if (second.success) return second.data;

  throw new Error(
    `Model output failed schema validation twice: ${second.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")}`
  );
}
