import { NextResponse } from "next/server";
import { getWorkspace, putWorkspace, logActivity } from "@/lib/workspace-store";

// Human-in-the-loop for the "sources disagree" case — same pattern as
// resolve-gap, applied to objective contradictions instead of empty cells.
// The human picks which value stands, or asks the agent to keep digging;
// resolving never silently discards the losing evidence, it stays in
// obj.evidence for the record.
export async function POST(req: Request) {
  const { workspaceId, objectiveId, contradictionId, decision } = await req.json();
  // decision: "keep_a" | "keep_b" | "needs_more_research"
  let ws;
  try {
    ws = getWorkspace(workspaceId);
  } catch {
    return NextResponse.json({ error: `workspace not found: ${workspaceId}` }, { status: 404 });
  }

  const obj = ws.objectives.find((o) => o.id === objectiveId);
  if (!obj) return NextResponse.json({ error: `objective not found: ${objectiveId}` }, { status: 404 });
  const contradiction = obj.contradictions.find((c) => c.id === contradictionId);
  if (!contradiction) return NextResponse.json({ error: `contradiction not found: ${contradictionId}` }, { status: 404 });

  if (decision === "keep_a" || decision === "keep_b") {
    const winner = decision === "keep_a" ? contradiction.evidenceA : contradiction.evidenceB;
    obj.summary = winner.value;
    obj.confidence = "medium"; // downgraded from whatever it was — a resolved disagreement is not "high" confidence
    contradiction.status = "resolved";
    logActivity(ws, "human", `${obj.label}: kept "${winner.value}" over the conflicting value.`);
  } else {
    contradiction.status = "resolved";
    obj.confidence = "low";
    logActivity(ws, "human", `${obj.label}: marked as needing more research — both conflicting values kept on record.`);
  }

  putWorkspace(ws);
  return NextResponse.json(ws);
}
