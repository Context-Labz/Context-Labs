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
      objectiveId: z.string(),
      value: z.string().describe("The specific claim this page supports, e.g. \"KES 3,500–6,500\""),
      quote: z.string().describe("Verbatim excerpt from the page text"),
      confidence: z.enum(["low", "medium", "high"]),
      summary: z.string().describe("One-sentence updated synthesis for this objective given all evidence so far, including any prior evidence listed below"),
      contradictsExisting: z.boolean().describe("True if this value conflicts with the objective's existing evidence/summary below"),
      contradictionNote: z.string().optional().describe("Required if contradictsExisting is true: what conflicts, in plain language"),
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

      const result = await structured(
        objectiveMatchSchema,
        "You check a captured web page against a list of research objectives. For each objective this page provides real " +
          "evidence for, return a match with a verbatim quote — never invent a value or quote. Skip objectives the page " +
          "says nothing about. If the page's value conflicts with an objective's existing evidence, set " +
          "contradictsExisting=true and explain the conflict in contradictionNote — do NOT silently treat it as agreement.",
        `Objectives:\n${objectivesContext}\n\nPage text:\n${String(text).slice(0, 4000)}`
      );

      let contradictionCount = 0;
      for (const match of result.matches) {
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
      if (!result.matches.length) {
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
