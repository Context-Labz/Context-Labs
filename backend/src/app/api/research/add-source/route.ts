import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspace, putWorkspace, logActivity, makeId } from "@/lib/workspace-store";
import { structured } from "@/lib/llm";
import { TableCell } from "@/lib/types";

const claimsSchema = z.object({
  claims: z.array(z.object({ column: z.string(), value: z.string(), quote: z.string() })),
});

// The one-click "check this page against my research plan" extraction —
// this is the actual differentiator from a plain summarize-this-page
// extension (see CHANGELOG.md): it maps evidence onto the SAME objective
// checklist the chat agent works from, not a fresh answer each time, and it
// flags when new evidence disagrees with what's already recorded instead
// of silently overwriting it.
const objectiveMatchSchema = z.object({
  matches: z.array(
    z.object({
      objectiveId: z.string().default(""),
      value: z.string().default(""),
      quote: z.string().default(""),
      confidence: z.enum(["low", "medium", "high"]).default("low"),
      summary: z.string().default(""),
      contradictsExisting: z.boolean().default(false),
      contradictionNote: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  const { workspaceId, title, url, text, provider } = await req.json();
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }

  const source = {
    id: makeId("src"),
    title: title || url,
    url,
    excerpt: String(text || "").slice(0, 400),
    fetchedAt: new Date().toISOString(),
    claims: [] as string[],
  };
  ws.sources.push(source);
  logActivity(ws, "search", `Captured from browser: ${source.title}`);

  try {
    // Path 1: research-plan mode (default). Check this page against every
    // objective that isn't already at high confidence, in one LLM call.
    if (ws.objectives.length && text) {
    const openObjectives = ws.objectives.filter((o) => o.confidence !== "high");
    if (openObjectives.length) {
      const objectivesContext = openObjectives
        .map((o) => {
          const existing = o.evidence.length
            ? ` Existing evidence: ${o.evidence.map((e) => `"${e.value}"`).join("; ")}.`
            : " No evidence yet.";
          return `- id="${o.id}" label="${o.label}" current confidence=${o.confidence} summary="${o.summary}".${existing}`;
        })
        .join("\n");

      const availableIds = openObjectives.map((o) => o.id).join(", ");

      const result = await structured(
        objectiveMatchSchema,
        "You are a VC diligence analyst extracting evidence from captured web pages for investment evaluation.\n\n" +
          "Your task: analyze the page text against each research objective and return findings in EXACT JSON format.\n\n" +
          "VC DILIGENCE STANDARDS:\n" +
          "- Market Size: look for TAM/SAM numbers, growth rates, market value estimates (in specific currency)\n" +
          "- Competition: identify named competitors, market share data, competitive positioning\n" +
          "- Customer Demand: find adoption metrics, customer testimonials, waitlists, growth indicators\n" +
          "- Pricing: extract specific pricing tiers, subscription costs, transaction fees (with currency)\n" +
          "- Team & Execution: capture founder backgrounds, previous exits, team size, hiring velocity\n" +
          "- Regulatory & Distribution Risk: note licenses, compliance mentions, distribution partnerships\n\n" +
          "Only extract claims you can quote VERBATIM from the page. Set confidence based on:\n" +
          "- high: primary source data, company announcements, verified metrics\n" +
          "- medium: credible third-party reporting, analyst estimates\n" +
          "- low: anecdotal evidence, unverified claims, indirect signals\n\n" +
          "CRITICAL: Use these EXACT key names (case-sensitive):\n" +
          "{\n" +
          '  "matches": [\n' +
          "    {\n" +
          '      "objectiveId": "<MUST be exactly one of the provided ids>",\n' +
          '      "value": "<specific claim from page, e.g. \'KES 500M market\'>",\n' +
          '      "quote": "<verbatim text excerpt from page>",\n' +
          '      "confidence": "low" | "medium" | "high",\n' +
          '      "summary": "<one-sentence synthesis from VC lens>",\n' +
          '      "contradictsExisting": true | false,\n' +
          '      "contradictionNote": "<required if contradictsExisting is true>"\n' +
          "    }\n" +
          "  ]\n" +
          "}\n\n" +
          `Available objective IDs (use EXACTLY one of these): ${availableIds}\n\n` +
          "Rules:\n" +
          "- Return {\"matches\": []} if nothing matches\n" +
          "- Every field is REQUIRED except contradictionNote (optional unless contradictsExisting=true)\n" +
          "- Never invent quotes or values — only use what's in the page text\n" +
          "- If page evidence conflicts with existing evidence, set contradictsExisting=true\n" +
          "- Flag contradictions immediately - investors need to resolve data discrepancies\n" +
          "- Do NOT add, rename, or omit any keys",
        `Research objectives for this deal:\n${objectivesContext}\n\nCaptured page text:\n${String(text).slice(0, 4000)}`
      );

      // Filter out matches with missing required fields and ensure type safety
      const validMatches = result.matches.filter(
        (m): m is typeof m & { objectiveId: string; value: string; quote: string; confidence: "low" | "medium" | "high"; summary: string } =>
          !!m.objectiveId && !!m.value && !!m.quote && !!m.summary && !!m.confidence
      );

      let contradictionCount = 0;
      for (const match of validMatches) {
        const obj = ws.objectives.find((o) => o.id === match.objectiveId);
        if (!obj) continue; // model referenced an id we didn't offer — ignore rather than crash
        const evidence = { sourceId: source.id, quote: match.quote, value: match.value };
        if (match.contradictsExisting && obj.evidence.length) {
          const priorEvidence = obj.evidence[obj.evidence.length - 1];
          obj.contradictions.push({
            id: makeId("contra"),
            note: match.contradictionNote || "New evidence conflicts with a prior source.",
            evidenceA: priorEvidence,
            evidenceB: evidence,
            status: "open",
          });
          contradictionCount++;
          logActivity(ws, "warn", `Contradiction on ${obj.label}: ${match.contradictionNote || "conflicting values"}`);
        } else {
          obj.evidence.push(evidence);
          obj.confidence = match.confidence;
          obj.summary = match.summary;
          logActivity(ws, "table", `${obj.label}: ${match.confidence} confidence from captured page`);
        }
      }
      if (!validMatches.length) {
        logActivity(ws, "search", "Captured page didn't match any open objective.");
      } else if (contradictionCount) {
        logActivity(ws, "warn", `${contradictionCount} contradiction(s) need a decision — see the research plan.`);
      }
    }
  }

  // Path 2: general comparison mode (the original flow) — only runs if the
  // caller explicitly named a provider AND the workspace has table columns,
  // so it never conflicts with path 1 above.
  if (provider && ws.table.columns.length && text) {
    const extracted = await structured(
      claimsSchema,
      "Extract factual claims from the page text for the given table columns. Every claim MUST include a verbatim supporting quote. Skip columns with no evidence. Never invent a value.",
      `Provider: ${provider}
Columns: ${ws.table.columns.join(", ")}

Page text:
${String(text).slice(0, 4000)}`
    );
    let row = ws.table.rows.find((r) => r.provider === provider);
    if (!row) { row = { provider, cells: {} }; ws.table.rows.push(row); }
    for (const claim of extracted.claims) {
      const cell: TableCell = { value: claim.value, citations: [{ sourceId: source.id, quote: claim.quote }], status: "verified" };
      row.cells[claim.column] = cell;
    }
    logActivity(ws, "table", `Filled ${extracted.claims.length} cell(s) for ${provider} from captured page.`);
  }

  putWorkspace(ws);
  return NextResponse.json(ws);
  } catch (err: any) {
    // Log the actual LLM/OpenRouter error for debugging
    console.error("add-source LLM call failed:", {
      status: err?.status,
      message: err?.message,
      error: err?.error,
      type: err?.type,
      code: err?.code,
    });

    // Return the real error to the extension so it's visible in the popup/network tab
    const errorMessage = err?.message || err?.error?.message || "LLM call failed";
    const errorDetails = err?.status ? ` (HTTP ${err.status})` : "";

    return NextResponse.json(
      {
        error: `${errorMessage}${errorDetails}`,
        details: err?.error || undefined,
      },
      { status: 500 }
    );
  }
}
