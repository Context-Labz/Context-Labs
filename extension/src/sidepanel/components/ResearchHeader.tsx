import { useEffect, useState } from "react";
import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

// The question is the hero of the panel: this whole tool exists to answer one
// thing, and every other element on screen is evidence for or against it. It's
// set in the reading face at the top of the page rather than treated as a
// window title, and it stays editable in place — clicking the question is how
// you start, so it shouldn't hide behind a settings affordance.
export default function ResearchHeader({
  ws,
  onQuestionSaved,
}: {
  ws: ResearchWorkspace;
  onQuestionSaved: (ws: ResearchWorkspace) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ws.question);
  const [saving, setSaving] = useState(false);

  // Keep the draft in step when the workspace is replaced wholesale (refresh,
  // capture, gap resolution) — but not while the field is being edited, which
  // would yank text out from under whoever is typing.
  useEffect(() => {
    if (!editing) setDraft(ws.question);
  }, [ws.question, editing]);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === ws.question) {
      setEditing(false);
      setDraft(ws.question);
      return;
    }
    setSaving(true);
    try {
      onQuestionSaved(await api.setQuestion(ws.id, next));
      setEditing(false);
    } catch (err) {
      alert(`Couldn't save the question — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const withEvidence = ws.objectives.filter((o) => o.evidence.length > 0).length;
  const openConflicts = ws.objectives.reduce(
    (n, o) => n + o.contradictions.filter((c) => c.status === "open").length,
    0
  );

  return (
    <header className="px-4 pt-4 pb-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(ws.question);
              }
            }}
            placeholder="What are you trying to find out?"
            className="field resize-none"
            style={{ fontFamily: "var(--font-read)", fontSize: "17px", lineHeight: 1.35 }}
          />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? "Saving" : "Save question"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(ws.question);
              }}
              className="btn btn-quiet"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Edit the research question"
          className="text-left w-full block"
        >
          {ws.question ? (
            <h1 className="t-question">{ws.question}</h1>
          ) : (
            <p className="t-question-empty">What are you trying to find out?</p>
          )}
        </button>
      )}

      {/* One quiet line of real status. Not a stat tile — a sentence, because
          that's how an analyst would say it. */}
      {!editing && (
        <p className="t-meta mt-2">
          {withEvidence === 0
            ? `${ws.objectives.length} objectives, none with evidence yet`
            : `${withEvidence} of ${ws.objectives.length} objectives have evidence`}
          {openConflicts > 0 && (
            <span style={{ color: "var(--conflict)", fontWeight: 600 }}>
              {" · "}
              {openConflicts} unresolved {openConflicts === 1 ? "conflict" : "conflicts"}
            </span>
          )}
        </p>
      )}
    </header>
  );
}
