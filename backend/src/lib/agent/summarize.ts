import { chat, llmConfigured } from "@/lib/llm";
import { logActivity } from "@/lib/workspace-store";
import { ResearchWorkspace } from "@/lib/types";

function faithfulSummary(ws: ResearchWorkspace): string {
  const lines: string[] = [];
  lines.push(`# ${ws.question || "Untitled research"}`);
  lines.push("");
  lines.push(
    `You captured **${ws.sources.length}** source${ws.sources.length === 1 ? "" : "s"}, saved **${ws.notes.length}** highlight${ws.notes.length === 1 ? "" : "s"}, and moved through **${ws.events.length}** browser action${ws.events.length === 1 ? "" : "s"}.`,
  );
  lines.push("");

  const open = ws.objectives.filter((o) => o.contradictions.some((c) => c.status === "open"));
  if (open.length) {
    lines.push(`Open disagreements: ${open.map((o) => o.label).join(", ")}.`);
    lines.push("");
  }

  lines.push("## Research plan");
  for (const obj of ws.objectives) {
    const conf = obj.confidence === "none" ? "no evidence" : `${obj.confidence} confidence`;
    lines.push(`- **${obj.label}** — ${conf}${obj.summary ? `. ${obj.summary}` : ""}`);
    for (const ev of obj.evidence.slice(0, 3)) {
      lines.push(`  - “${ev.value}”`);
    }
  }
  lines.push("");

  if (ws.table.rows.length) {
    lines.push("## Comparison");
    lines.push(`Columns: ${ws.table.columns.join(", ") || "—"}`);
    for (const row of ws.table.rows) {
      const cells = ws.table.columns.map((c) => `${c}: ${row.cells[c]?.value || "—"}`).join("; ");
      lines.push(`- **${row.provider}** — ${cells}`);
    }
    lines.push("");
  }

  if (ws.notes.length) {
    lines.push("## Highlights");
    for (const n of ws.notes) {
      lines.push(`- “${n.text}” — ${n.title} (${n.url})`);
    }
    lines.push("");
  }

  if (ws.sources.length) {
    lines.push("## Sources");
    for (const s of ws.sources) {
      lines.push(`- [${s.title}](${s.url}) — ${s.excerpt.slice(0, 140)}`);
    }
    lines.push("");
  }

  if (ws.suggestions.length) {
    lines.push("## Suggested next reads (from this session)");
    for (const s of ws.suggestions) {
      lines.push(`- [${s.title}](${s.url}) — ${s.reason}`);
    }
    lines.push("");
  }

  if (ws.events.length) {
    lines.push("## Browser trail");
    for (const e of ws.events.slice(-20)) {
      const bit = e.text ? ` — ${e.text.slice(0, 80)}` : "";
      lines.push(`- ${e.type.replace("_", " ")} · ${e.title}${bit}`);
    }
    lines.push("");
  }

  const empty = ws.objectives.filter((o) => o.confidence === "none").map((o) => o.label);
  if (empty.length) {
    lines.push("## Still open");
    lines.push(`No evidence yet for: ${empty.join(", ")}.`);
  }

  return lines.join("\n");
}

export async function completeResearch(ws: ResearchWorkspace): Promise<ResearchWorkspace> {
  const base = faithfulSummary(ws);
  let brief = "";
  if (llmConfigured() && (ws.question || ws.sources.length || ws.notes.length)) {
    try {
      const res = await chat({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Write a tight 2–3 paragraph research brief from the notes below. Do not invent facts. Mention disagreements and gaps. No fluff, no greeting.",
          },
          { role: "user", content: base },
        ],
      });
      brief = res.choices[0]?.message?.content?.trim() || "";
    } catch (err) {
      console.error("summary LLM failed", err);
    }
  }

  ws.summary = brief ? `${brief}\n\n---\n\n${base}` : base;
  ws.report = ws.summary;
  ws.status = "completed";
  logActivity(ws, "report", "Session summary compiled from everything shown in the panel.");
  return ws;
}
