import { NextResponse } from "next/server";
import { seedWorkspace } from "@/lib/seed";
import { getWorkspace, putWorkspace, logActivity, makeId } from "@/lib/workspace-store";

// The extension calls this once when the side panel opens (or reattaches to
// a saved workspace id — see chrome.storage usage in App.tsx). This is the
// fix for gap #2: a workspace now always exists server-side before anything
// else — /api/research/start, /api/copilotkit tool calls, etc. — tries to
// read or write it.
export async function POST(req: Request) {
  const { question, columns, useVcTemplate } = await req.json();
  const id = makeId("ws");
  const ws = seedWorkspace(id, question ?? "", columns ?? [], useVcTemplate ?? true);
  putWorkspace(ws);
  return NextResponse.json(ws);
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });
  try {
    return NextResponse.json(getWorkspace(id));
  } catch {
    return NextResponse.json({ error: `workspace not found: ${id}` }, { status: 404 });
  }
}

// Set the research question on an existing workspace, without wiping state.
//
// There was previously NO way to do this: ResearchHeader renders
// `ws.question || "Untitled research"` read-only, and the only question input
// was the one inside the secondary comparison-mode <details> — which only
// takes effect via /api/research/start, and that resets ws.table. So the
// primary objectives flow, the one the demo actually follows, permanently read
// "Untitled research" in the header.
export async function PATCH(req: Request) {
  const { workspaceId, question } = await req.json();
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }
  if (typeof question !== "string") {
    return NextResponse.json({ error: "question must be a string" }, { status: 400 });
  }
  ws.question = question;
  logActivity(ws, "spark", `Research question set: ${question}`);
  putWorkspace(ws);
  return NextResponse.json(ws);
}
