// The research loop. This is the heart of the demo:
//   PLAN (what to search) -> SEARCH (Exa) -> EXTRACT (cited claims only)
//   -> FILL TABLE -> DETECT GAPS -> (human resolves) -> DRAFT REPORT
import { z } from "zod";
import { chat, structured } from "@/lib/llm";
import { exaSearch } from "@/lib/exa";
import {
  getWorkspace, putWorkspace, logActivity, makeId,
} from "@/lib/workspace-store";
import { ResearchWorkspace, TableCell } from "@/lib/types";

const planSchema = z.object({
  providers: z.array(z.string()).min(1),
  queries: z.array(z.string()).min(1),
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
  ws.table = { columns: payload.columns, rows: [] };
  logActivity(ws, "spark", `Research started: ${payload.question}`);

  // 1. PLAN — decide which providers/entities to research and what to search
  const plan = await structured(
    planSchema,
    "You plan web research. Given a research question and table columns, list the 4-6 specific entities to research and 1-2 web search queries per entity.",
    `Question: ${payload.question}
Columns: ${payload.columns.join(", ")}`
  );
  logActivity(ws, "plan", `Planned ${plan.providers.length} targets, ${plan.queries.length} searches.`);

  // 2+3. SEARCH & EXTRACT — one cited pass per provider
  for (const provider of plan.providers) {
    const query = plan.queries.find((q) => q.toLowerCase().includes(provider.toLowerCase().slice(0, 8)))
      ?? `${provider} ${payload.columns[0]}`;
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

    const extracted = await structured(
      claimsSchema,
      "Extract factual claims from the source text for the given table columns. Rules: every claim MUST have a verbatim supporting quote from the text; never invent values; skip columns with no evidence.",
      `Provider: ${provider}
Columns: ${payload.columns.join(", ")}

Source text:
${source.text.slice(0, 4000)}`
    );

    const cells: Record<string, TableCell> = {};
    for (const col of payload.columns) {
      const claim = extracted.claims.find((c) => c.column.toLowerCase() === col.toLowerCase());
      cells[col] = claim
        ? { value: claim.value, citations: [{ sourceId: ws.sources[ws.sources.length - 1].id, quote: claim.quote }], status: "verified" }
        : { value: "", citations: [], status: "gap" };
    }
    ws.table.rows.push({ provider, cells });
    logActivity(ws, "table", `Filled row: ${provider} (${Object.values(cells).filter((c) => c.status === "verified").length}/${payload.columns.length} verified)`);
  }

  // 4. GAP DETECTION — anything still empty after searching is flagged for a human
  for (const row of ws.table.rows) {
    for (const col of payload.columns) {
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
