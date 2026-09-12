import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

// FIX (was gap #3 in the review): the old version only merged the returned
// `gaps` array back into state, so the resolved cell's new value never
// reached the UI — the banner disappeared but the table looked untouched.
// resolve-gap now returns the full workspace, and this passes it straight
// up to replace state wholesale.
export default function GapBanner({ ws, onResolved }: { ws: ResearchWorkspace; onResolved: (ws: ResearchWorkspace) => void }) {
  const open = ws.gaps.filter((g) => g.status === "open");
  if (!open.length) return null;

  const decide = (gapId: string, decision: "leave_blank" | "secondary_source") => {
    api.resolveGap(ws.id, gapId, decision)
      .then(onResolved)
      .catch((err) => alert(`Couldn't resolve that gap — ${err instanceof Error ? err.message : String(err)}`));
  };

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
      {open.map((g) => (
        <div key={g.id} className="flex items-center gap-3 text-sm">
          <span>⚠️ <strong>{g.provider} / {g.column}:</strong> {g.reason}</span>
          <button onClick={() => decide(g.id, "leave_blank")} className="px-2 py-1 border rounded hover:bg-white">Leave blank</button>
          <button onClick={() => decide(g.id, "secondary_source")} className="px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700">Use secondary source</button>
        </div>
      ))}
    </div>
  );
}
