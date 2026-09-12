import { z } from "zod";
import { chat, structured } from "@/lib/llm";
import { exaSearch } from "@/lib/exa";
import { quoteInText } from "@/lib/keywords";
import { applyPageToObjectives } from "@/lib/agent/extract";
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
      quote: z.string(),
    }),
  ),
});

function fallbackPlan(question: string, columns: string[]) {
  const providers = question
    .split(/\b(?:vs|versus|compare|and)\b/i)
    .map((s) => s.replace(/[^a-zA-Z0-9 +&-]/g, " ").trim())
    .filter((s) => s.length > 1)
    .slice(0, 5);
  const names = providers.length ? providers : ["Primary", "Alternative"];
  return {
    providers: names,
    queries: names.map((p) => `${p} ${question} ${columns[0] || ""}`.trim()),
  };
}

export async function runResearch(payload: {
  workspaceId: string;
  question: string;
  columns: string[];
}) {
  const ws = getWorkspace(payload.workspaceId);
  ws.question = payload.question;
  ws.table = { columns: payload.columns, rows: [] };
  ws.status = "active";
  logActivity(ws, "spark", `Comparison run: ${payload.question}`);

  let plan: { providers: string[]; queries: string[] };
  try {
    plan = await structured(
      planSchema,
      "You plan web research. Given a research question and table columns, list the 4-6 specific entities to research and 1-2 web search queries per entity. Return JSON.",
      `Question: ${payload.question}\nColumns: ${payload.columns.join(", ")}`,
    );
  } catch {
    plan = fallbackPlan(payload.question, payload.columns);
  }
  logActivity(ws, "plan", `Planned ${plan.providers.length} targets, ${plan.queries.length} searches.`);

  for (const provider of plan.providers) {
    const query =
      plan.queries.find((q) => q.toLowerCase().includes(provider.toLowerCase().slice(0, 8))) ??
      `${provider} ${payload.columns[0] || payload.question}`;
    logActivity(ws, "search", `Searching: ${query}`);
    const results = await exaSearch(query, 2);
    const found = results[0];
    if (!found) {
      logActivity(ws, "warn", `No results for ${provider}.`);
      continue;
    }
    const source = {
      id: makeId("src"),
      title: found.title,
      url: found.url,
      excerpt: found.text.slice(0, 400),
      fetchedAt: new Date().toISOString(),
      claims: [] as string[],
    };
    ws.sources.push(source);

    let extracted: z.infer<typeof claimsSchema> = { claims: [] };
    try {
      extracted = await structured(
        claimsSchema,
        "Extract factual claims from the source text for the given table columns. Rules: every claim MUST have a verbatim supporting quote from the text; never invent values; skip columns with no evidence. Return JSON.",
        `Provider: ${provider}\nColumns: ${payload.columns.join(", ")}\n\nSource text:\n${found.text.slice(0, 4000)}`,
      );
    } catch {
      extracted = {
        claims: payload.columns
          .map((column) => {
            const quote = found.text.split(/(?<=[.!?])\s+/).find((s) => s.length > 40) || found.text.slice(0, 180);
            return { column, value: quote.slice(0, 80), quote };
          })
          .filter((c) => quoteInText(found.text, c.quote)),
      };
    }

    const cells: Record<string, TableCell> = {};
    for (const col of payload.columns) {
      const claim = extracted.claims.find((c) => c.column.toLowerCase() === col.toLowerCase());
      const ok = claim && quoteInText(found.text, claim.quote);
      cells[col] = ok
        ? { value: claim!.value, citations: [{ sourceId: source.id, quote: claim!.quote }], status: "verified" }
        : { value: "", citations: [], status: "gap" };
    }
    ws.table.rows.push({ provider, cells });
    await applyPageToObjectives(ws, source, found.text);
    logActivity(
      ws,
      "table",
      `Filled row: ${provider} (${Object.values(cells).filter((c) => c.status === "verified").length}/${payload.columns.length} verified)`,
    );
  }

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
    logActivity(ws, "warn", `${ws.gaps.length} gaps flagged — need a decision.`);
  }

  await draftReport(ws.id);
  putWorkspace(ws);
  return { providers: plan.providers.length, sources: ws.sources.length, gaps: ws.gaps.length };
}

export async function resolveGap(workspaceId: string, gapId: string, decision: "leave_blank" | "secondary_source") {
  const ws = getWorkspace(workspaceId);
  const gap = ws.gaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("Gap not found");
  const row = ws.table.rows.find((r) => r.provider === gap.provider);
  const cell = row?.cells[gap.column];
  if (!cell) throw new Error("Cell not found");

  if (decision === "leave_blank") {
    cell.value = "—";
    cell.status = "verified";
    gap.status = "resolved_blank";
    logActivity(ws, "human", `${gap.provider} / ${gap.column}: left blank.`);
  } else {
    const results = await exaSearch(`${gap.provider} ${gap.column}`, 1);
    const src = results[0];
    if (src) {
      ws.sources.push({
        id: makeId("src"),
        title: `[secondary] ${src.title}`,
        url: src.url,
        excerpt: src.text.slice(0, 300),
        fetchedAt: new Date().toISOString(),
        claims: [],
      });
      cell.value = "see source (unverified)";
      cell.citations = [{ sourceId: ws.sources[ws.sources.length - 1].id, quote: src.text.slice(0, 160) }];
      cell.status = "unverified";
    } else {
      cell.value = "—";
      cell.status = "verified";
    }
    gap.status = "resolved_secondary";
    logActivity(ws, "human", `${gap.provider} / ${gap.column}: filled from a secondary source.`);
  }
  putWorkspace(ws);
  return ws;
}

export async function draftReport(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  const tableSummary = ws.table.rows
    .map((r) => `${r.provider}: ${ws.table.columns.map((c) => `${c}=${r.cells[c]?.value || "?"}`).join(", ")}`)
    .join("\n");
  try {
    const res = await chat({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Write a concise research brief from the verified table. Mention gaps. No unsourced claims." },
        { role: "user", content: `Question: ${ws.question}\n\nTable:\n${tableSummary}` },
      ],
    });
    ws.report = res.choices[0]?.message?.content ?? tableSummary;
  } catch {
    ws.report = tableSummary || "Comparison table filled from available sources.";
  }
  logActivity(ws, "report", "Comparison brief drafted.");
  putWorkspace(ws);
}

export async function fillObjective(ws: ResearchWorkspace, objectiveId: string) {
  const obj = ws.objectives.find((o) => o.id === objectiveId);
  if (!obj) throw new Error("Objective not found");
  const query = `${ws.question || ""} ${obj.label}`.trim();
  logActivity(ws, "search", `Filling gap: ${obj.label} — ${query}`);
  const results = await exaSearch(query, 3);
  for (const found of results.slice(0, 2)) {
    const source = {
      id: makeId("src"),
      title: found.title,
      url: found.url,
      excerpt: found.text.slice(0, 400),
      fetchedAt: new Date().toISOString(),
      claims: [] as string[],
    };
    ws.sources.push(source);
    await applyPageToObjectives(ws, source, found.text);
  }
  putWorkspace(ws);
  return ws;
}
