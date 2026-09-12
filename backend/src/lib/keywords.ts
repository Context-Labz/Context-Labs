import { quoteIsGrounded } from "./verify";

export const OBJECTIVE_KEYWORDS: Record<string, string[]> = {
  "Market Size": ["market size", "market value", "tam", "sam", "billion", "million", "valued at", "cagr", "growth rate"],
  Competition: ["competitor", "vs", "versus", "alternative", "rival", "market share", "incumbent", "landscape"],
  "Customer Demand": ["demand", "customers want", "adoption", "users", "buyers", "willingness to pay", "pain point"],
  Pricing: ["price", "pricing", "per month", "fee", "subscription", "kes", "usd", "ticket", "asp", "cost"],
  "Team & Execution": ["founder", "ceo", "co-founder", "team", "leadership", "hired", "background"],
  "Regulatory & Distribution Risk": ["regulation", "license", "compliance", "law", "cbk", "distribution", "import duty"],
  Overview: ["overview", "introduction", "what is", "background"],
  "Key Players": ["player", "competitor", "company", "brand", "startup"],
  Evidence: ["according to", "reported", "study", "data"],
  Risks: ["risk", "challenge", "constraint", "bottleneck"],
  "Open Questions": ["unknown", "unclear", "further research"],
};

export function sentenceContaining(text: string, needle: string): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  const hit = parts.find((s) => s.toLowerCase().includes(needle.toLowerCase()));
  return (hit || text).replace(/\s+/g, " ").trim().slice(0, 280);
}

export function quoteInText(text: string, quote: string): boolean {
  if (!quote?.trim()) return false;
  if (quoteIsGrounded(text, quote)) return true;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const q = norm(quote);
  const t = norm(text);
  const short = q.slice(0, Math.min(80, q.length));
  return short.length >= 12 && t.includes(short);
}
