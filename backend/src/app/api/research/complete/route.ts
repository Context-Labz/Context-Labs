import { NextResponse } from "next/server";
import { getWorkspace, putWorkspace } from "@/lib/workspace-store";
import { completeResearch } from "@/lib/agent/summarize";

export async function POST(req: Request) {
  const { workspaceId } = await req.json();
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }
  await completeResearch(ws);
  putWorkspace(ws);
  return NextResponse.json(ws);
}
