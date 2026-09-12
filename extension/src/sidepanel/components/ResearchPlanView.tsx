import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

const confidenceStyle: Record<string, string> = {
  none: "bg-zinc-100 text-zinc-500",
  low: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-emerald-100 text-emerald-700",
};

// The research-plan layer: a fixed objective checklist that evidence maps
// into as the user browses, instead of one open-ended synthesized answer.
// This is the component that carries the "what does the extension know
// because we're browsing that ChatGPT doesn't" argument — see CHANGELOG.md.
export default function ResearchPlanView({ ws, onResolved }: { ws: ResearchWorkspace; onResolved: (ws: ResearchWorkspace) => void }) {
  if (!ws.objectives.length) return null;

  const resolve = (objectiveId: string, contradictionId: string, decision: "keep_a" | "keep_b" | "needs_more_research") => {
    api.resolveContradiction(ws.id, objectiveId, contradictionId, decision)
      .then(onResolved)
      .catch((err) => alert(`Couldn't resolve that contradiction — ${err instanceof Error ? err.message : String(err)}`));
  };

  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="font-medium mb-3">Research plan</h2>
      <ul className="space-y-3">
        {ws.objectives.map((obj) => {
          const openContradictions = obj.contradictions.filter((c) => c.status === "open");
          return (
            <li key={obj.id} className="border-l-2 border-zinc-200 pl-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{obj.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide ${confidenceStyle[obj.confidence]}`}>
                  {obj.confidence === "none" ? "no evidence" : `${obj.confidence} confidence`}
                </span>
              </div>
              {obj.summary && <p className="text-sm text-zinc-700 mt-0.5">{obj.summary}</p>}
              <p className="text-[11px] text-zinc-400 mt-0.5">{obj.evidence.length} source{obj.evidence.length === 1 ? "" : "s"}</p>

              {openContradictions.map((c) => (
                <div key={c.id} className="mt-2 bg-amber-50 border border-amber-300 rounded p-2 text-xs space-y-1">
                  <p>⚠️ Sources disagree: {c.note}</p>
                  <p className="text-zinc-600">A: "{c.evidenceA.value}" — B: "{c.evidenceB.value}"</p>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => resolve(obj.id, c.id, "keep_a")} className="px-2 py-0.5 border rounded hover:bg-white">Keep A</button>
                    <button onClick={() => resolve(obj.id, c.id, "keep_b")} className="px-2 py-0.5 border rounded hover:bg-white">Keep B</button>
                    <button onClick={() => resolve(obj.id, c.id, "needs_more_research")} className="px-2 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-700">Needs more research</button>
                  </div>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
