import { NextResponse } from "next/server";
import { seedWorkspace } from "@/lib/seed";
import { getWorkspace, putWorkspace, makeId, logActivity } from "@/lib/workspace-store";
import { refreshSuggestions } from "@/lib/agent/suggest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { question, columns, useVcTemplate } = await req.json();
  const id = makeId("ws");
  const ws = seedWorkspace(id, question ?? "", columns ?? [], useVcTemplate ?? true);
  if (ws.question) {
    try {
      await refreshSuggestions(ws);
    } catch (err) {
      console.error(err);
    }
  }
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

export async function PATCH(req: Request) {
  const { id, question, columns } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let ws;
  try {
    ws = getWorkspace(id);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${id}` }, { status: 404 });
  }
  if (typeof question === "string" && question !== ws.question) {
    ws.question = question;
    ws.status = "active";
    ws.summary = "";
    logActivity(ws, "plan", `Topic set: ${question}`);
    try {
      await refreshSuggestions(ws);
    } catch (err) {
      console.error(err);
    }
  }
  if (Array.isArray(columns)) {
    ws.table.columns = columns;
  }
  putWorkspace(ws);
  return NextResponse.json(ws);
}
