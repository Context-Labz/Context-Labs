import { NextResponse } from "next/server";
import { getWorkspace, putWorkspace, logActivity } from "@/lib/workspace-store";

// Best-effort link tracking - log clicked links to activity feed as research trail
export async function POST(req: Request) {
  const { workspaceId, url, text, pageUrl } = await req.json();

  try {
    const ws = getWorkspace(workspaceId);
    logActivity(ws, "search", `Clicked: ${text} → ${url} (from ${pageUrl})`);
    putWorkspace(ws);
    return NextResponse.json({ ok: true });
  } catch {
    // Silent fail - link tracking is best-effort
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
