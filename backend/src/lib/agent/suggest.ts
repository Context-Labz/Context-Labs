import { exaSearch } from "@/lib/exa";
import { makeId } from "@/lib/workspace-store";
import { ResearchWorkspace, SuggestedLink } from "@/lib/types";

function reasonFor(query: string, title: string): string {
  const q = query.trim() || "your topic";
  if (/price|pricing|fee|kes/i.test(title) || /price|pricing/i.test(q)) return "Pricing evidence";
  if (/founder|ceo|team/i.test(title)) return "Team / people";
  if (/market|tam|million|size/i.test(title)) return "Market size";
  if (/compet|vs|alternative|compare/i.test(title)) return "Comparison";
  return `Related to “${q.slice(0, 48)}”`;
}

export async function refreshSuggestions(ws: ResearchWorkspace): Promise<SuggestedLink[]> {
  const latestSearch = [...ws.events].reverse().find((e) => e.type === "search" && e.text);
  const latestHighlight = [...ws.events].reverse().find((e) => e.type === "highlight" && e.text);
  const query =
    ws.question ||
    latestSearch?.text ||
    latestHighlight?.text ||
    ws.notes[0]?.text ||
    "";
  if (!query.trim()) {
    ws.suggestions = [];
    return [];
  }

  const results = await exaSearch(query, 4);
  const existing = new Set(ws.sources.map((s) => s.url));
  ws.suggestions = results
    .filter((r) => !existing.has(r.url))
    .slice(0, 4)
    .map((r) => ({
      id: makeId("sug"),
      title: r.title,
      url: r.url,
      reason: reasonFor(query, r.title),
      snippet: r.text.slice(0, 180),
    }));
  return ws.suggestions;
}
