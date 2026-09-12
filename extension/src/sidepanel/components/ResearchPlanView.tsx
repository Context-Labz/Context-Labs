import { ResearchWorkspace, Objective, ObjectiveConfidence } from "@/lib/types";
import { api } from "@/lib/api";

// How many of the three meter segments are lit at each level.
const FILLED: Record<ObjectiveConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 };

const LEVEL_WORD: Record<ObjectiveConfidence, string> = {
  none: "no evidence",
  low: "low",
  medium: "medium",
  high: "high",
};

// Three stacked segments, filled bottom-up by confidence. This is the panel's
// one bold element and it earns the space: run your eye down the left edge and
// you read where the investigation is solid and where it's empty — the
// "strong on demand, nothing on team" read that a standing research plan gives
// you and a one-shot answer can't.
function Meter({ level, conflicted }: { level: ObjectiveConfidence; conflicted: boolean }) {
  const filled = FILLED[level];
  return (
    <div className="meter" data-level={level} data-conflict={conflicted} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="meter-seg" data-on={i < filled} />
      ))}
    </div>
  );
}

export default function ResearchPlanView({
  ws,
  onResolved,
}: {
  ws: ResearchWorkspace;
  onResolved: (ws: ResearchWorkspace) => void;
}) {
  if (!ws.objectives.length) return null;

  const resolve = (
    objectiveId: string,
    contradictionId: string,
    decision: "keep_a" | "keep_b" | "needs_more_research"
  ) => {
    api
      .resolveContradiction(ws.id, objectiveId, contradictionId, decision)
      .then(onResolved)
      .catch((err) =>
        alert(`Couldn't resolve that contradiction — ${err instanceof Error ? err.message : String(err)}`)
      );
  };

  return (
    <section>
      {ws.objectives.map((obj) => (
        <ObjectiveRow key={obj.id} obj={obj} onResolve={resolve} />
      ))}
    </section>
  );
}

function ObjectiveRow({
  obj,
  onResolve,
}: {
  obj: Objective;
  onResolve: (o: string, c: string, d: "keep_a" | "keep_b" | "needs_more_research") => void;
}) {
  const open = obj.contradictions.filter((c) => c.status === "open");
  const sourceCount = obj.evidence.length;

  return (
    <article className="rule-top px-4 py-3">
      {/* The meter sits alongside the label and summary only. When it also
          wrapped the contradiction block it stretched to three times the height
          of a normal row, which broke the scan-down-the-column reading the
          meter exists for. */}
      <div className="flex gap-3">
        <Meter level={obj.confidence} conflicted={open.length > 0} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="t-label truncate">{obj.label}</h2>
            <span className="level" data-level={obj.confidence}>
              {open.length > 0 ? (
                <span style={{ color: "var(--conflict)" }}>sources disagree</span>
              ) : (
                LEVEL_WORD[obj.confidence]
              )}
            </span>
          </div>

          {obj.summary ? (
            <p className="t-summary mt-1">{obj.summary}</p>
          ) : (
            <p className="t-meta mt-1">Capture a page or ask the agent to look into this.</p>
          )}

          {sourceCount > 0 && (
            <p className="t-meta mt-1.5">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </p>
          )}

        </div>
      </div>

      {open.map((c) => (
            <div key={c.id} className="conflict-block mt-2.5 p-2.5">
              <p className="t-summary" style={{ color: "var(--conflict)" }}>
                {c.note}
              </p>

              <div className="mt-2 space-y-1.5">
                <p className="t-quote">{c.evidenceA.value}</p>
                <p className="t-quote">{c.evidenceB.value}</p>
              </div>

              {/* Buttons name the outcome, not the mechanism. */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <button onClick={() => onResolve(obj.id, c.id, "keep_a")} className="btn btn-quiet">
                  Keep the first
                </button>
                <button onClick={() => onResolve(obj.id, c.id, "keep_b")} className="btn btn-quiet">
                  Keep the second
                </button>
                <button
                  onClick={() => onResolve(obj.id, c.id, "needs_more_research")}
                  className="btn btn-conflict"
                >
                  Dig further
                </button>
              </div>
            </div>
          ))}
    </article>
  );
}
