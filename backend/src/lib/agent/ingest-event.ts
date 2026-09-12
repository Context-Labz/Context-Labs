import { applyPageToObjectives } from "@/lib/agent/extract";
import { refreshSuggestions } from "@/lib/agent/suggest";
import { logActivity, makeId } from "@/lib/workspace-store";
import { BrowserEventType, ResearchWorkspace } from "@/lib/types";

export async function ingestEvent(
  ws: ResearchWorkspace,
  payload: {
    type: BrowserEventType;
    title: string;
    url: string;
    text?: string;
    pageText?: string;
  },
): Promise<ResearchWorkspace> {
  const event = {
    id: makeId("evt"),
    type: payload.type,
    title: payload.title || payload.url,
    url: payload.url,
    text: payload.text,
    ts: new Date().toISOString(),
  };

  const last = ws.events[ws.events.length - 1];
  const duplicate =
    last &&
    last.type === event.type &&
    last.url === event.url &&
    (last.text || "") === (event.text || "") &&
    Date.now() - new Date(last.ts).getTime() < 4000;
  if (!duplicate) {
    ws.events.push(event);
    if (ws.events.length > 60) ws.events.splice(0, ws.events.length - 60);
  }

  if (payload.type === "highlight" && payload.text?.trim()) {
    const note = {
      id: makeId("note"),
      text: payload.text.trim(),
      url: payload.url,
      title: payload.title || payload.url,
      ts: event.ts,
    };
    ws.notes.push(note);
    logActivity(ws, "human", `Highlight saved: “${note.text.slice(0, 80)}”`);

    const source = {
      id: makeId("src"),
      title: `${payload.title} (highlight)`,
      url: payload.url,
      excerpt: payload.text.trim().slice(0, 400),
      fetchedAt: event.ts,
      claims: [payload.text.trim()],
    };
    ws.sources.push(source);
    await applyPageToObjectives(ws, source, payload.pageText || payload.text);
    await refreshSuggestions(ws);
  }

  if (payload.type === "search" && payload.text?.trim()) {
    if (!ws.question) ws.question = payload.text.trim();
    logActivity(ws, "search", `Search noticed: “${payload.text.trim()}”`);
    await refreshSuggestions(ws);
  }

  if (payload.type === "tab_switch") {
    logActivity(ws, "plan", `Moved to tab: ${payload.title || payload.url}`);
  }

  if (payload.type === "link_click") {
    logActivity(ws, "search", `Followed link: ${payload.title || payload.url}`);
  }

  if (payload.type === "page_view" && payload.pageText && payload.pageText.length > 200) {
    // Metadata-only by default. Extraction waits for capture/highlight.
  }

  return ws;
}
