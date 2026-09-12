import { ResearchWorkspace } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Backend error routes now return { error, workspace? } as JSON rather than an
// empty 500, so surface that message instead of a bare status code — the whole
// point of the change is that a failure mid-demo is debuggable from the panel.
async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail ? `${res.status}: ${detail}` : `${res.status}: request failed`);
  }
  return res.json();
}

// Thin fetch wrapper — the side panel never keeps its own copy of workspace
// state beyond what's in flight; every call here returns the full
// ResearchWorkspace and the caller replaces its state with it wholesale.
export const api = {
  backendUrl: BACKEND_URL,

  createWorkspace: (question: string, columns: string[]) =>
    fetch(`${BACKEND_URL}/api/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, columns }),
    }).then((r) => asJson<ResearchWorkspace>(r)),

  getWorkspace: (id: string) =>
    fetch(`${BACKEND_URL}/api/workspace?id=${encodeURIComponent(id)}`).then((r) => asJson<ResearchWorkspace>(r)),

  // Sets the research question without touching anything else in the
  // workspace (unlike startResearch, which resets the comparison table).
  setQuestion: (workspaceId: string, question: string) =>
    fetch(`${BACKEND_URL}/api/workspace`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, question }),
    }).then((r) => asJson<ResearchWorkspace>(r)),

  startResearch: (workspaceId: string, question: string, columns: string[]) =>
    fetch(`${BACKEND_URL}/api/research/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, question, columns }),
    }).then((r) => asJson<ResearchWorkspace>(r)),

  resolveGap: (workspaceId: string, gapId: string, decision: "leave_blank" | "secondary_source") =>
    fetch(`${BACKEND_URL}/api/research/resolve-gap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, gapId, decision }),
    }).then((r) => asJson<ResearchWorkspace>(r)),

  resolveContradiction: (workspaceId: string, objectiveId: string, contradictionId: string, decision: "keep_a" | "keep_b" | "needs_more_research") =>
    fetch(`${BACKEND_URL}/api/research/resolve-contradiction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, objectiveId, contradictionId, decision }),
    }).then((r) => asJson<ResearchWorkspace>(r)),

  addCapturedSource: (workspaceId: string, page: { title: string; url: string; text: string }, provider?: string) =>
    fetch(`${BACKEND_URL}/api/research/add-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, title: page.title, url: page.url, text: page.text, provider }),
    }).then((r) => asJson<ResearchWorkspace>(r)),
};
