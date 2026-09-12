// The research loop. This is the heart of the demo:
//   PLAN (what to search) -> SEARCH (Exa) -> EXTRACT (cited claims only)
//   -> FILL TABLE -> DETECT GAPS -> (human resolves) -> DRAFT REPORT
import { z } from "zod";
import { chat, structured } from "@/lib/llm";
import { quoteIsGrounded } from "@/lib/verify";
import { exaSearch } from "@/lib/exa";
import {
  getWorkspace, putWorkspace, logActivity, makeId,
} from "@/lib/workspace-store";
import { ResearchWorkspace, TableCell } from "@/lib/types";

const planSchema = z.object({
  providers: z.array(z.string()).min(1),
  queries: z.array(z.string()).min(1),
  // Used only when the caller supplied no columns. The side panel always
  // creates workspaces with columns: [] (the objectives checklist is the
  // primary artifact now and there is no column input in the UI), so without
  // this the run built queries like "Safaricom undefined" and then filled a
  // table that had no columns to fill — i.e. the whole "Run automatically"
  // mode silently produced an empty board.
  columns: z.array(z.string()).min(1).describe("3-5 comparison dimensions suited to the question, e.g. Pricing, Coverage, Settlement time"),
});

const claimsSchema = z.object({
  claims: z.array(
    z.object({
      column: z.string(),
      value: z.string(),
      quote: z.string(), // verbatim supporting excerpt — REQUIRED
    })
  ),
});

export async function runResearch(payload: {
  workspaceId: string;
  question: string;
  columns: string[];
}) {
  const ws = getWorkspace(payload.workspaceId);
  ws.question = payload.question;
  logActivity(ws, "spark", `Research started: ${payload.question}`);

  // 1. PLAN — decide which entities to research, what to search, and (when the
  // caller gave none) what the comparison columns should even be.
  const plan = await structured(
    planSchema,
    "You plan web research. Given a research question, list the 4-6 specific entities to research and 1-2 web search queries per entity. " +
      "Each query must name its entity explicitly so it can be matched back. If comparison columns are supplied, reuse them verbatim in `columns`; " +
      "if none are supplied, propose 3-5 columns that suit the question.",
    `Question: ${payload.question}
Columns: ${payload.columns.length ? payload.columns.join(", ") : "(none supplied — propose them)"}`
  );

  // Caller's columns win when supplied; otherwise take the planned ones.
  const columns = payload.columns.length ? payload.columns : plan.columns;
  ws.table = { columns, rows: [] };
  logActivity(ws, "plan", `Planned ${plan.providers.length} targets, ${plan.queries.length} searches across: ${columns.join(", ")}.`);

  // 2+3. SEARCH & EXTRACT — one cited pass per provider
  for (const provider of plan.providers) {
    const needle = provider.toLowerCase();
    const query =
      plan.queries.find((q) => q.toLowerCase().includes(needle)) ??
      plan.queries.find((q) => q.toLowerCase().includes(needle.slice(0, 8))) ??
      `${provider} ${columns[0]}`;
    logActivity(ws, "search", `Searching: ${query}`);
    const results = await exaSearch(query, 2);

    const source = results[0];
    if (!source) {
      logActivity(ws, "warn", `No results for ${provider}.`);
      continue;
    }
    ws.sources.push({
      id: makeId("src"),
      title: source.title,
      url: source.url,
      excerpt: source.text.slice(0, 400),
      fetchedAt: new Date().toISOString(),
      claims: [],
    });

    // The exact text the model sees — quote verification below checks against
    // this, not `source.text`, so a quote from past the cut-off can't pass.
    const sourceText = source.text.slice(0, 4000);
    const sourceId = ws.sources[ws.sources.length - 1].id;

    let extracted;
    try {
      extracted = await structured(
        claimsSchema,
        "Extract factual claims from the source text for the given table columns. Rules: every claim MUST have a verbatim supporting quote copied character-for-character from the text (a paraphrase will be rejected); never invent values; skip columns with no evidence.",
        `Provider: ${provider}
Columns: ${columns.join(", ")}

Source text:
${sourceText}`
      );
    } catch (err) {
      // One provider failing to parse shouldn't abort the whole run — log it,
      // leave the row's cells as gaps, and keep going.
      logActivity(ws, "warn", `Extraction failed for ${provider}: ${err instanceof Error ? err.message : String(err)}`);
      extracted = { claims: [] };
    }

    const cells: Record<string, TableCell> = {};
    for (const col of columns) {
      const claim = extracted.claims.find((c) => c.column.toLowerCase() === col.toLowerCase());
      // A claim whose quote isn't actually in the source is treated exactly
      // like no claim at all: the cell stays a gap and goes to a human.
      if (claim && !quoteIsGrounded(sourceText, claim.quote)) {
        logActivity(ws, "warn", `Discarded an unsupported claim for ${provider} / ${col} — the quote isn't in the source.`);
        cells[col] = { value: "", citations: [], status: "gap" };
        continue;
      }
      cells[col] = claim
        ? { value: claim.value, citations: [{ sourceId, quote: claim.quote }], status: "verified" }
        : { value: "", citations: [], status: "gap" };
    }
    ws.table.rows.push({ provider, cells });
    logActivity(ws, "table", `Filled row: ${provider} (${Object.values(cells).filter((c) => c.status === "verified").length}/${columns.length} verified)`);
  }

  // 4. GAP DETECTION — anything still empty after searching is flagged for a human
  for (const row of ws.table.rows) {
    for (const col of columns) {
      if (row.cells[col]?.status === "gap") {
        ws.gaps.push({
          id: makeId("gap"),
          provider: row.provider,
          column: col,
          reason: `Couldn't verify ${col} for ${row.provider} from primary sources.`,
          status: "open",
        });
      }
    }
  }
  if (ws.gaps.length) {
    logActivity(ws, "warn", `${ws.gaps.length} gaps flagged — need human decision.`);
  }

  // 5. DRAFT REPORT from the verified table only
  await draftReport(ws.id);

  putWorkspace(ws);
  return { providers: plan.providers.length, sources: ws.sources.length, gaps: ws.gaps.length };
}

// Human-in-the-loop: the demo's rubric moment. Owner picks how to handle a gap.
export async function resolveGap(workspaceId: string, gapId: string, decision: "leave_blank" | "secondary_source") {
  const ws = getWorkspace(workspaceId);
  const gap = ws.gaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("Gap not found");
  const row = ws.table.rows.find((r) => r.provider === gap.provider);
  const cell = row?.cells[gap.column];
  if (!cell) throw new Error("Cell not found");

  if (decision === "leave_blank") {
    cell.value = "—";
    cell.status = "verified"; // verified-as-unknown: the board never lies
    gap.status = "resolved_blank";
    logActivity(ws, "human", `${gap.provider} / ${gap.column}: left blank by human decision.`);
  } else {
    // Secondary source: find a weaker source and mark the cell unverified
    const results = await exaSearch(`${gap.provider} ${gap.column} fees pricing`, 1);
    const src = results[0];
    if (src) {
      ws.sources.push({ id: makeId("src"), title: `[secondary] ${src.title}`, url: src.url, excerpt: src.text.slice(0, 300), fetchedAt: new Date().toISOString(), claims: [] });
      cell.value = "see source (unverified)";
      cell.citations = [{ sourceId: ws.sources[ws.sources.length - 1].id, quote: src.text.slice(0, 160) }];
      cell.status = "unverified";
    } else {
      cell.value = "—";
      cell.status = "verified";
    }
    gap.status = "resolved_secondary";
    logActivity(ws, "human", `${gap.provider} / ${gap.column}: filled from secondary source (marked unverified).`);
  }
  putWorkspace(ws);
  return ws;
}

export async function draftReport(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  const tableSummary = ws.table.rows
    .map((r) => `${r.provider}: ${ws.table.columns.map((c) => `${c}=${r.cells[c]?.value || "?"}`).join(", ")}`)
    .join("\n");
  const res = await chat({
    model: process.env.LLM_MODEL || "gpt-4o-mini", // OpenAI SDK call — no provider prefix here, unlike the CopilotKit BuiltInAgent model string
    messages: [
      { role: "system", content: "Write a concise research brief from the verified table. Explicitly mention gaps and unverified cells. No unsourced claims." },
      { role: "user", content: `Question: ${ws.question}

Table:
${tableSummary}` },
    ],
  });
  ws.report = res.choices[0]?.message?.content ?? "";
  logActivity(ws, "report", "Draft report generated.");
  putWorkspace(ws);
}
