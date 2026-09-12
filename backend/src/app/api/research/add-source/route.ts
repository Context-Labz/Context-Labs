import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspace, putWorkspace, logActivity, makeId } from "@/lib/workspace-store";
import { structured } from "@/lib/llm";
import { quoteIsGrounded } from "@/lib/verify";
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
      // .nullish() not .optional(): models routinely emit an explicit null for
      // a field they have nothing to say about, and plain .optional() rejects
      // null — which would fail the whole parse over a non-problem.
      contradictionNote: z.string().nullish().describe("Required if contradictsExisting is true: what conflicts, in plain language"),
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

  // The exact string the model is shown. Quote verification below must check
  // against THIS, not the full page text — a quote from beyond the cut-off is
  // one the model could not have read.
  const pageText = String(text || "").slice(0, 4000);

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

      let result;
      try {
        result = await structured(
          objectiveMatchSchema,
          "You check a captured web page against a list of research objectives. For each objective this page provides real " +
            "evidence for, return a match with a verbatim quote — never invent a value or quote. The quote must be copied " +
            "character-for-character from the page text; a paraphrase will be rejected and the evidence discarded. Skip " +
            "objectives the page says nothing about. If the page's value conflicts with an objective's existing evidence, set " +
            "contradictsExisting=true and explain the conflict in contradictionNote — do NOT silently treat it as agreement.",
          `Objectives:\n${objectivesContext}\n\nPage text:\n${pageText}`
        );
      } catch (err) {
        // Previously an unhandled throw here produced an empty 500 and the
        // side panel showed "Couldn't save this page" with nothing to debug.
        // The source is already recorded, so keep it and report the real cause.
        const message = err instanceof Error ? err.message : String(err);
        logActivity(ws, "warn", `Objective matching failed: ${message}`);
        putWorkspace(ws);
        return NextResponse.json({ error: `objective matching failed: ${message}`, workspace: ws }, { status: 502 });
      }

      let contradictionCount = 0;
      let rejectedCount = 0;
      for (const match of result.matches) {
        const obj = ws.objectives.find((o) => o.id === match.objectiveId);
        if (!obj) continue; // model referenced an id we didn't offer — ignore rather than crash

        // ENFORCEMENT: the quote has to actually be on the page. Rejections are
        // logged to the activity feed rather than dropped silently — an agent
        // visibly refusing a claim it can't ground is the rule working, and
        // it's more convincing than a board that only ever fills up.
        if (!quoteIsGrounded(pageText, match.quote)) {
          rejectedCount++;
          logActivity(ws, "warn", `Discarded an unsupported claim for ${obj.label} — the quote isn't on the page.`);
          continue;
        }

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
          // Record the conflicting evidence too. It is real, cited evidence —
          // withholding it left the objective's source count frozen during the
          // one beat the demo pauses on. Summary/confidence deliberately do NOT
          // move: that's the human's call in resolve-contradiction.
          obj.evidence.push(evidence);
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
      } else if (rejectedCount && rejectedCount === result.matches.length) {
        logActivity(ws, "warn", "Every claim from this page failed quote verification — nothing recorded.");
      }
      if (contradictionCount) {
        logActivity(ws, "warn", `${contradictionCount} contradiction(s) need a decision — see the research plan.`);
      }
    }
  }

  // Path 2: general comparison mode (the original flow) — only runs if the
  // caller explicitly named a provider AND the workspace has table columns,
  // so it never conflicts with path 1 above.
  if (provider && ws.table.columns.length && text) {
    let extracted;
    try {
      extracted = await structured(
        claimsSchema,
        "Extract factual claims from the page text for the given table columns. Every claim MUST include a verbatim supporting quote, copied character-for-character from the page text — a paraphrase will be rejected. Skip columns with no evidence. Never invent a value.",
        `Provider: ${provider}
Columns: ${ws.table.columns.join(", ")}

Page text:
${pageText}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity(ws, "warn", `Column extraction failed: ${message}`);
      putWorkspace(ws);
      return NextResponse.json({ error: `column extraction failed: ${message}`, workspace: ws }, { status: 502 });
    }

    let row = ws.table.rows.find((r) => r.provider === provider);
    if (!row) { row = { provider, cells: {} }; ws.table.rows.push(row); }
    let filled = 0;
    for (const claim of extracted.claims) {
      if (!quoteIsGrounded(pageText, claim.quote)) {
        logActivity(ws, "warn", `Discarded an unsupported claim for ${provider} / ${claim.column} — the quote isn't on the page.`);
        continue;
      }
      const cell: TableCell = { value: claim.value, citations: [{ sourceId: source.id, quote: claim.quote }], status: "verified" };
      row.cells[claim.column] = cell;
      filled++;
    }
    logActivity(ws, "table", `Filled ${filled} cell(s) for ${provider} from captured page.`);
  }

  putWorkspace(ws);
  return NextResponse.json(ws);
}
