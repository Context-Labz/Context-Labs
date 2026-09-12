import { NextResponse } from "next/server";
import { runResearch } from "@/lib/agent/run-research";
import { getWorkspace, putWorkspace } from "@/lib/workspace-store";
import { seedWorkspace } from "@/lib/seed";

export async function POST(req: Request) {
  const { workspaceId, question, columns } = await req.json();
  const cols =
    Array.isArray(columns) && columns.length
      ? columns
      : ["Overview", "Pricing", "Strengths", "Risks"];

  try {
    getWorkspace(workspaceId);
  } catch {
    putWorkspace(seedWorkspace(workspaceId, question, cols));
  }

  await runResearch({ workspaceId, question, columns: cols });
  return NextResponse.json(getWorkspace(workspaceId));
}
