import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace-store";
import { fillObjective } from "@/lib/agent/run-research";

export async function POST(req: Request) {
  const { workspaceId, objectiveId } = await req.json();
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }
  try {
    ws = await fillObjective(ws, objectiveId);
    return NextResponse.json(ws);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "fill failed" }, { status: 400 });
  }
}
