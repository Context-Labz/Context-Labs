import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

// FIX (was gap #3 in the review): the old version only merged the returned
// `gaps` array back into state, so the resolved cell's new value never
// reached the UI — the banner disappeared but the table looked untouched.
// resolve-gap now returns the full workspace, and this passes it straight
// up to replace state wholesale.
//
// Visually this shares the conflict treatment with contradictions, because
// it's the same kind of moment: the agent has stopped and needs a person to
// decide. Those are the only warm blocks in the panel.
export default function GapBanner({
  ws,
  onResolved,
}: {
  ws: ResearchWorkspace;
  onResolved: (ws: ResearchWorkspace) => void;
}) {
  const open = ws.gaps.filter((g) => g.status === "open");
  if (!open.length) return null;

  const decide = (gapId: string, decision: "leave_blank" | "secondary_source") => {
    api
      .resolveGap(ws.id, gapId, decision)
      .then(onResolved)
      .catch((err) =>
        alert(`Couldn't resolve that gap — ${err instanceof Error ? err.message : String(err)}`)
      );
  };

  return (
    <div className="rule-top px-4 py-3 space-y-2">
      <p className="t-section" style={{ color: "var(--conflict)" }}>
        Waiting on you
      </p>
      {open.map((g) => (
        <div key={g.id} className="conflict-block p-2.5">
          <p className="t-label">
            {g.provider} · {g.column}
          </p>
          <p className="t-summary mt-0.5">{g.reason}</p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <button onClick={() => decide(g.id, "leave_blank")} className="btn btn-quiet">
              Leave it blank
            </button>
            <button onClick={() => decide(g.id, "secondary_source")} className="btn btn-conflict">
              Use a weaker source
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
