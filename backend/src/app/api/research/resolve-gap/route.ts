import { NextResponse } from "next/server";
import { resolveGap } from "@/lib/agent/run-research";

// Human-in-the-loop endpoint: owner decides how to handle a flagged gap
// ("leave_blank" | "secondary_source").
//
// FIX (was gap #3 in the review): this used to return only { gaps }, so the
// resolved table cell's new value never reached the client — the banner
// disappeared but the table looked untouched. Now returns the full
// workspace; the caller should replace its state with the response wholesale.
export async function POST(req: Request) {
  const { workspaceId, gapId, decision } = await req.json();
  try {
    const ws = await resolveGap(workspaceId, gapId, decision);
    return NextResponse.json(ws);
  } catch (err) {
    // resolveGap throws plain Errors ("Gap not found", "Cell not found") and
    // the secondary-source branch hits Exa, which can fail on a bad key or a
    // rate limit. Unhandled, any of those became an empty 500 and the side
    // panel just said "resolve failed" with nothing to go on.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
