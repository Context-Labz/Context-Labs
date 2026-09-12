import { useEffect, useState } from "react";
import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";

// The research question is now settable from the primary objectives flow.
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

  // Keep the draft in step when the workspace is replaced
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
    <header>
      <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Research Room</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setEditing(false); setDraft(ws.question); }
            }}
            placeholder="e.g. Is there a market for premium swimwear in Kenya?"
            className="border border-zinc-300 rounded px-2 py-1.5 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded-md text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
