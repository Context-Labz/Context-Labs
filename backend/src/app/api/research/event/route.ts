import { NextResponse } from "next/server";
import { getOrCreateWorkspace, putWorkspace } from "@/lib/workspace-store";
import { ingestEvent } from "@/lib/agent/ingest-event";

export async function POST(req: Request) {
  const body = await req.json();
  const { workspaceId, type, title, url, text, pageText } = body;
  if (!workspaceId || !type) {
    return NextResponse.json({ error: "workspaceId and type required" }, { status: 400 });
  }
  const ws = getOrCreateWorkspace(workspaceId);
  try {
    await ingestEvent(ws, { type, title: title || "", url: url || "", text, pageText });
    putWorkspace(ws);
    return NextResponse.json(ws);
  } catch (err: any) {
    console.error("ingest event failed", err);
    putWorkspace(ws);
    return NextResponse.json(ws);
  }
}
