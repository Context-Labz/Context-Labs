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
    putWorkspace(seedWorkspace(workspaceId, question ?? "", columns ?? []));
  }

  try {
    await runResearch({ workspaceId, question, columns: columns ?? [] });
  } catch (err) {
    // A failure partway through still leaves useful state (sources found,
    // activity logged), so return the workspace alongside the real error
    // instead of an empty 500 the side panel can't explain.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, workspace: getWorkspace(workspaceId) }, { status: 502 });
  }
  return NextResponse.json(getWorkspace(workspaceId)); // full workspace, not just counts
}
