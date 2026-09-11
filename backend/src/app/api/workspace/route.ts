import { NextResponse } from "next/server";
import { seedWorkspace } from "@/lib/seed";
import { getWorkspace, putWorkspace, makeId } from "@/lib/workspace-store";

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
