import { NextResponse } from "next/server";
import { getWorkspace, putWorkspace } from "@/lib/workspace-store";
import { refreshSuggestions } from "@/lib/agent/suggest";

export async function POST(req: Request) {
  const { workspaceId } = await req.json();
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }
  await refreshSuggestions(ws);
  putWorkspace(ws);
  return NextResponse.json(ws);
}
