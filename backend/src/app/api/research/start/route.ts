import { NextResponse } from "next/server";
import { runResearch } from "@/lib/agent/run-research";
import { getWorkspace, putWorkspace } from "@/lib/workspace-store";
import { seedWorkspace } from "@/lib/seed";

// Starts a full auto-run research pass for a workspace (the deterministic
// "no chat needed" fallback path — useful if the CopilotKit tool loop is
// flaky mid-demo). The Trigger.dev task (src/trigger/research.ts) wraps the
// same runResearch() function for the background-jobs story.
export async function POST(req: Request) {
  const { workspaceId, question, columns } = await req.json();

  // Defensive: the extension should always POST /api/workspace first, but
  // don't let a missed step hard-crash the demo (this was gap #2).
  try {
    getWorkspace(workspaceId);
  } catch {
    putWorkspace(seedWorkspace(workspaceId, question, columns));
  }

  await runResearch({ workspaceId, question, columns });
  return NextResponse.json(getWorkspace(workspaceId)); // full workspace, not just counts
}
