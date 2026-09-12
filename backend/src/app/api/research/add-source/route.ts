import { NextResponse } from "next/server";
import { getOrCreateWorkspace, putWorkspace, logActivity, makeId } from "@/lib/workspace-store";
import { applyPageToObjectives } from "@/lib/agent/extract";
import { refreshSuggestions } from "@/lib/agent/suggest";
import { structured, llmConfigured } from "@/lib/llm";
import { quoteInText } from "@/lib/keywords";
import { TableCell } from "@/lib/types";
import { z } from "zod";

const claimsSchema = z.object({
  claims: z.array(z.object({ column: z.string(), value: z.string(), quote: z.string() })),
});

export async function POST(req: Request) {
  const { workspaceId, title, url, text, provider } = await req.json();
  const ws = getOrCreateWorkspace(workspaceId);

  const source = {
    id: makeId("src"),
    title: title || url,
    url,
    excerpt: String(text || "").slice(0, 400),
    fetchedAt: new Date().toISOString(),
    claims: [] as string[],
  };
  ws.sources.push(source);
  ws.events.push({
    id: makeId("evt"),
    type: "capture",
    title: source.title,
    url,
    text: source.excerpt,
    ts: source.fetchedAt,
  });
  logActivity(ws, "search", `Captured from browser: ${source.title}`);

  try {
    if (ws.objectives.length && text) {
      await applyPageToObjectives(ws, source, String(text));
    }

    if (provider && ws.table.columns.length && text) {
      let extracted = { claims: [] as { column: string; value: string; quote: string }[] };
      if (llmConfigured()) {
        extracted = await structured(
          claimsSchema,
          "Extract factual claims from the page text for the given table columns. Every claim MUST include a verbatim supporting quote. Skip columns with no evidence. Never invent a value. Return JSON.",
          `Provider: ${provider}\nColumns: ${ws.table.columns.join(", ")}\n\nPage text:\n${String(text).slice(0, 4000)}`,
        );
      }
      let row = ws.table.rows.find((r) => r.provider === provider);
      if (!row) {
        row = { provider, cells: {} };
        ws.table.rows.push(row);
      }
      for (const claim of extracted.claims) {
        if (!quoteInText(String(text), claim.quote)) continue;
        const cell: TableCell = {
          value: claim.value,
          citations: [{ sourceId: source.id, quote: claim.quote }],
          status: "verified",
        };
        row.cells[claim.column] = cell;
      }
      logActivity(ws, "table", `Filled ${extracted.claims.length} cell(s) for ${provider} from captured page.`);
    }

    await refreshSuggestions(ws);
    putWorkspace(ws);
    return NextResponse.json(ws);
  } catch (err: any) {
    console.error("add-source failed:", err);
    putWorkspace(ws);
    return NextResponse.json(ws);
  }
}
