import { z } from "zod";
import { structured, llmConfigured } from "@/lib/llm";
import { OBJECTIVE_KEYWORDS, quoteInText, sentenceContaining } from "@/lib/keywords";
import { logActivity, makeId } from "@/lib/workspace-store";
import { Objective, ObjectiveEvidence, ResearchWorkspace, Source } from "@/lib/types";

export const objectiveMatchSchema = z.object({
  matches: z.array(
    z.object({
      objectiveId: z.string().default(""),
      value: z.string().default(""),
      quote: z.string().default(""),
      confidence: z.enum(["low", "medium", "high"]).default("low"),
      summary: z.string().default(""),
      contradictsExisting: z.boolean().default(false),
      contradictionNote: z.string().optional(),
    }),
  ),
});

function heuristicMatches(objectives: Objective[], text: string) {
  const matches = [];
  for (const obj of objectives) {
    const keywords = OBJECTIVE_KEYWORDS[obj.label] ?? [obj.label.toLowerCase()];
    const hit = keywords.find((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    if (!hit) continue;
    const quote = sentenceContaining(text, hit);
    const existing = obj.evidence[obj.evidence.length - 1];
    const number = (s: string) => s.match(/[\d,.]+/g)?.join(" ");
    const contradicts =
      !!existing && !!number(existing.value) && !!number(quote) && number(existing.value) !== number(quote);
    matches.push({
      objectiveId: obj.id,
      value: quote.slice(0, 140),
      quote,
      confidence: "low" as const,
      summary: quote.slice(0, 180),
      contradictsExisting: contradicts,
      contradictionNote: contradicts
        ? `“${existing!.value}” vs “${quote.slice(0, 80)}”`
        : undefined,
    });
  }
  return { matches };
}

export async function applyPageToObjectives(
  ws: ResearchWorkspace,
  source: Source,
  text: string,
): Promise<void> {
  const openObjectives = ws.objectives.filter((o) => o.confidence !== "high");
  if (!openObjectives.length || !text) return;

  let result: { matches: Array<{
    objectiveId?: string;
    value?: string;
    quote?: string;
    confidence?: "low" | "medium" | "high";
    summary?: string;
    contradictsExisting?: boolean;
    contradictionNote?: string;
  }> };
  try {
    if (llmConfigured()) {
      const objectivesContext = openObjectives
        .map((o) => {
          const existing = o.evidence.length
            ? ` Existing evidence: ${o.evidence.map((e) => `"${e.value}"`).join("; ")}.`
            : " No evidence yet.";
          return `- id="${o.id}" label="${o.label}" current confidence=${o.confidence} summary="${o.summary}".${existing}`;
        })
        .join("\n");
      const availableIds = openObjectives.map((o) => o.id).join(", ");
      result = await structured(
        objectiveMatchSchema,
        "You check a captured web page against research objectives and return matches in EXACT JSON format.\n\n" +
          "CRITICAL: Use these EXACT key names (case-sensitive):\n" +
          `{ "matches": [ { "objectiveId": "<one of the provided ids>", "value": "<claim>", "quote": "<verbatim excerpt>", "confidence": "low"|"medium"|"high", "summary": "<one sentence>", "contradictsExisting": false, "contradictionNote": "<optional>" } ] }\n\n` +
          `Available objective IDs: ${availableIds}\n` +
          "Rules: return {\"matches\": []} if nothing matches; never invent quotes; if new evidence conflicts, set contradictsExisting=true.",
        `Objectives:\n${objectivesContext}\n\nPage text:\n${text.slice(0, 4000)}`,
      );
    } else {
      result = heuristicMatches(openObjectives, text);
    }
  } catch (err) {
    console.error("objective match LLM failed, using heuristics", err);
    result = heuristicMatches(openObjectives, text);
  }

  const validMatches = result.matches.filter(
    (m): m is typeof m & { objectiveId: string; value: string; quote: string; confidence: "low" | "medium" | "high"; summary: string } =>
      !!m.objectiveId && !!m.value && !!m.quote && !!m.summary && !!m.confidence,
  );

  let contradictionCount = 0;
  for (const match of validMatches) {
    const obj = ws.objectives.find((o) => o.id === match.objectiveId);
    if (!obj) continue;
    if (!quoteInText(text, match.quote)) continue;
    const evidence: ObjectiveEvidence = { sourceId: source.id, quote: match.quote, value: match.value };
    if (match.contradictsExisting && obj.evidence.length) {
      obj.contradictions.push({
        id: makeId("contra"),
        note: match.contradictionNote || "New evidence conflicts with a prior source.",
        evidenceA: obj.evidence[obj.evidence.length - 1],
        evidenceB: evidence,
        status: "open",
      });
      obj.evidence.push(evidence);
      contradictionCount++;
      logActivity(ws, "warn", `Contradiction on ${obj.label}: ${match.contradictionNote || "conflicting values"}`);
    } else {
      obj.evidence.push(evidence);
      obj.confidence = match.confidence;
      obj.summary = match.summary;
      logActivity(ws, "table", `${obj.label}: ${match.confidence} confidence from captured context`);
    }
  }

  if (!validMatches.length) {
    logActivity(ws, "search", "Page context didn't match an open objective.");
  } else if (contradictionCount) {
    logActivity(ws, "warn", `${contradictionCount} contradiction(s) need a decision.`);
  }
}
