import { useEffect, useState } from "react";
import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

// The research question is now settable from the primary objectives flow.
// It used to be read-only here, with the only input buried in the secondary
// comparison-mode <details> — which routes through /api/research/start and
// resets the table. So a normal capture-driven session could never name its
// own question and the header read "Untitled research" throughout.
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

  return (
    <header className="border-b pb-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Research Room</p>
      {editing ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setEditing(false); setDraft(ws.question); }
            }}
            placeholder="e.g. Is there a market for premium swimwear in Kenya?"
            className="border rounded px-2 py-1 flex-1 text-sm"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-2 py-1 bg-emerald-700 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click to set the research question"
          className="text-left w-full group"
        >
          <h1 className={`text-xl font-semibold ${ws.question ? "" : "text-zinc-400"}`}>
            {ws.question || "Set a research question…"}
          </h1>
          <span className="text-[11px] text-zinc-400 group-hover:text-zinc-600">click to edit</span>
        </button>
      )}
    </header>
  );
}
