"use client";

import { ResearchWorkspace, Objective, SuggestedLink, BrowserEvent, ResearchNote } from "@/lib/types";

function confidenceClass(c: string) {
  if (c === "high") return "text-[#8fbf9f] bg-[#8fbf9f]/10";
  if (c === "medium") return "text-[#e0b44a] bg-[#e0b44a]/10";
  if (c === "low") return "text-[#d4886a] bg-[#d4886a]/10";
  return "text-[#6b665c] bg-white/5";
}

function eventLabel(type: string) {
  switch (type) {
    case "highlight":
      return "Highlight";
    case "tab_switch":
      return "Tab";
    case "link_click":
      return "Link";
    case "search":
      return "Search";
    case "capture":
      return "Capture";
    default:
      return "Page";
  }
}

export default function ResearchPanel({
  ws,
  currentTitle,
  currentUrl,
  selectedText,
  busy,
  capturing,
  onSetQuestion,
  onCapture,
  onSaveHighlight,
  onOpenLink,
  onFillObjective,
  onResolveContradiction,
  onCompare,
  onComplete,
  onNewTopic,
}: {
  ws: ResearchWorkspace;
  currentTitle?: string;
  currentUrl?: string;
  selectedText?: string;
  busy?: string | null;
  capturing?: boolean;
  onSetQuestion: (q: string) => void;
  onCapture: () => void;
  onSaveHighlight: () => void;
  onOpenLink: (url: string) => void;
  onFillObjective: (id: string) => void;
  onResolveContradiction: (objectiveId: string, contradictionId: string, decision: "keep_a" | "keep_b" | "needs_more_research") => void;
  onCompare: () => void;
  onComplete: () => void;
  onNewTopic: () => void;
}) {
  if (ws.status === "completed") {
    return (
      <div className="flex h-full flex-col">
        <Header live={false} />
        <div className="flex-1 overflow-y-auto panel-scroll px-4 py-4 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#d4a574]">Session summary</p>
          <h2 className="font-serif text-2xl leading-tight">{ws.question || "Untitled research"}</h2>
          <article className="prose-summary text-[13.5px] leading-relaxed text-[#d8d2c6] whitespace-pre-wrap">
            {ws.summary || ws.report}
          </article>
        </div>
        <div className="border-t border-[#2c2924] p-3">
          <button
            onClick={onNewTopic}
            className="w-full rounded-md bg-[#d4a574] px-3 py-2 text-sm font-medium text-[#1a1612] hover:bg-[#e0b88a]"
          >
            Start a new topic
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header live />
      <div className="flex-1 overflow-y-auto panel-scroll px-4 py-3 space-y-5">
        <TopicBar question={ws.question} onSetQuestion={onSetQuestion} busy={busy === "topic"} />

        <NowCard
          title={currentTitle}
          url={currentUrl}
          selectedText={selectedText}
          capturing={capturing}
          onCapture={onCapture}
          onSaveHighlight={onSaveHighlight}
        />

        <Suggestions links={ws.suggestions} onOpen={onOpenLink} />

        <Plan
          ws={ws}
          onFill={onFillObjective}
          onResolve={onResolveContradiction}
          filling={busy === "fill"}
        />

        <Comparison ws={ws} onCompare={onCompare} comparing={busy === "compare"} />

        <Trail events={ws.events} notes={ws.notes} />

        <Sources ws={ws} onOpen={onOpenLink} />
      </div>
      <div className="border-t border-[#2c2924] p-3">
        <button
          onClick={onComplete}
          disabled={busy === "complete"}
          className="w-full rounded-md border border-[#d4a574]/40 bg-transparent px-3 py-2 text-sm text-[#d4a574] hover:bg-[#d4a574]/10 disabled:opacity-50"
        >
          {busy === "complete" ? "Summarizing…" : "End research — summarize this session"}
        </button>
      </div>
    </div>
  );
}

function Header({ live }: { live: boolean }) {
  return (
    <header className="flex items-center justify-between border-b border-[#2c2924] px-4 py-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[#d4a574]">Context Labs</p>
        <p className="text-xs text-[#9a9488]">In-browser research agent</p>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-[#9a9488]">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-[#8fbf9f]" : "bg-[#6b665c]"}`} />
        {live ? "Listening" : "Closed"}
      </span>
    </header>
  );
}

function TopicBar({
  question,
  onSetQuestion,
  busy,
}: {
  question: string;
  onSetQuestion: (q: string) => void;
  busy?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const q = String(data.get("q") || "").trim();
        if (q) onSetQuestion(q);
      }}
      className="space-y-1.5"
    >
      <label className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Topic</label>
      <div className="flex gap-2">
        <input
          name="q"
          defaultValue={question}
          key={question}
          placeholder="What are you researching?"
          className="flex-1 rounded-md border border-[#2c2924] bg-[#10100e] px-2.5 py-1.5 text-sm text-[#f3efe7] placeholder:text-[#6b665c] outline-none focus:border-[#d4a574]/50"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#d4a574] px-2.5 py-1.5 text-xs font-medium text-[#1a1612] disabled:opacity-50"
        >
          {busy ? "…" : "Set"}
        </button>
      </div>
    </form>
  );
}

function NowCard({
  title,
  url,
  selectedText,
  capturing,
  onCapture,
  onSaveHighlight,
}: {
  title?: string;
  url?: string;
  selectedText?: string;
  capturing?: boolean;
  onCapture: () => void;
  onSaveHighlight: () => void;
}) {
  if (!title && !url) return null;
  return (
    <section className="rounded-lg border border-[#2c2924] bg-[#1e1c18] p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">This page</p>
      <p className="text-sm font-medium leading-snug">{title}</p>
      <p className="truncate text-[11px] text-[#6b665c]">{url}</p>
      {selectedText ? (
        <p className="border-l-2 border-[#d4a574] pl-2 text-[12px] italic text-[#d8d2c6]">“{selectedText}”</p>
      ) : (
        <p className="text-[11px] text-[#6b665c]">Highlight a passage on the page to pin it.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCapture}
          disabled={capturing}
          className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-50"
        >
          {capturing ? "Saving…" : "Save page"}
        </button>
        <button
          onClick={onSaveHighlight}
          disabled={!selectedText}
          className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-40"
        >
          Save highlight
        </button>
      </div>
    </section>
  );
}

function Suggestions({ links, onOpen }: { links: SuggestedLink[]; onOpen: (url: string) => void }) {
  if (!links.length) return null;
  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Suggested reads</p>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => onOpen(l.url)}
              className="w-full rounded-md border border-[#2c2924] px-3 py-2 text-left hover:border-[#d4a574]/40"
            >
              <span className="block text-[11px] text-[#d4a574]">{l.reason}</span>
              <span className="block text-sm leading-snug">{l.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Plan({
  ws,
  onFill,
  onResolve,
  filling,
}: {
  ws: ResearchWorkspace;
  onFill: (id: string) => void;
  onResolve: (objectiveId: string, contradictionId: string, decision: "keep_a" | "keep_b" | "needs_more_research") => void;
  filling?: boolean;
}) {
  if (!ws.objectives.length) return null;
  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Plan</p>
      <ul className="space-y-2">
        {ws.objectives.map((obj) => (
          <ObjectiveRow key={obj.id} obj={obj} onFill={onFill} onResolve={onResolve} filling={filling} />
        ))}
      </ul>
    </section>
  );
}

function ObjectiveRow({
  obj,
  onFill,
  onResolve,
  filling,
}: {
  obj: Objective;
  onFill: (id: string) => void;
  onResolve: (objectiveId: string, contradictionId: string, decision: "keep_a" | "keep_b" | "needs_more_research") => void;
  filling?: boolean;
}) {
  const open = obj.contradictions.filter((c) => c.status === "open");
  return (
    <li className="rounded-md border border-[#2c2924] px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{obj.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${confidenceClass(obj.confidence)}`}>
              {obj.confidence === "none" ? "empty" : obj.confidence}
            </span>
          </div>
          {obj.summary ? <p className="mt-1 text-[12px] leading-snug text-[#c6c0b4]">{obj.summary}</p> : null}
        </div>
        {obj.confidence === "none" ? (
          <button
            onClick={() => onFill(obj.id)}
            disabled={filling}
            className="shrink-0 text-[11px] text-[#d4a574] hover:underline disabled:opacity-50"
          >
            Find sources
          </button>
        ) : null}
      </div>
      {open.map((c) => (
        <div key={c.id} className="mt-2 rounded border border-[#e0b44a]/30 bg-[#e0b44a]/10 p-2 text-[12px] space-y-1">
          <p>Sources disagree: {c.note}</p>
          <p className="text-[#9a9488]">A: “{c.evidenceA.value}” · B: “{c.evidenceB.value}”</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button onClick={() => onResolve(obj.id, c.id, "keep_a")} className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/10">
              Keep A
            </button>
            <button onClick={() => onResolve(obj.id, c.id, "keep_b")} className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/10">
              Keep B
            </button>
            <button onClick={() => onResolve(obj.id, c.id, "needs_more_research")} className="rounded bg-[#e0b44a] px-2 py-0.5 text-[#1a1612]">
              Need more
            </button>
          </div>
        </div>
      ))}
    </li>
  );
}

function Comparison({
  ws,
  onCompare,
  comparing,
}: {
  ws: ResearchWorkspace;
  onCompare: () => void;
  comparing?: boolean;
}) {
  const has = ws.table.rows.length > 0;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Comparison</p>
        <button
          onClick={onCompare}
          disabled={comparing || !ws.question}
          className="text-[11px] text-[#d4a574] hover:underline disabled:opacity-40"
        >
          {comparing ? "Building…" : has ? "Refresh table" : "Build table"}
        </button>
      </div>
      {!has ? (
        <p className="text-[12px] text-[#6b665c]">No table yet. Set a topic, then build a comparison from the web.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#2c2924]">
          <table className="w-full min-w-[320px] text-left text-[12px]">
            <thead className="bg-[#1e1c18] text-[#9a9488]">
              <tr>
                <th className="p-2 font-medium">Entity</th>
                {ws.table.columns.map((c) => (
                  <th key={c} className="p-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ws.table.rows.map((row) => (
                <tr key={row.provider} className="border-t border-[#2c2924]">
                  <td className="p-2 font-medium">{row.provider}</td>
                  {ws.table.columns.map((col) => (
                    <td key={col} className="p-2 text-[#c6c0b4]">
                      {row.cells[col]?.value || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Trail({ events, notes }: { events: BrowserEvent[]; notes: ResearchNote[] }) {
  if (!events.length && !notes.length) return null;
  const recent = [...events].reverse().slice(0, 12);
  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Trail</p>
      <ul className="space-y-1">
        {recent.map((e) => (
          <li key={e.id} className="flex gap-2 text-[12px] text-[#c6c0b4]">
            <span className="w-16 shrink-0 text-[#6b665c]">{eventLabel(e.type)}</span>
            <span className="min-w-0 truncate">
              {e.title}
              {e.text ? ` — “${e.text.slice(0, 60)}”` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sources({ ws, onOpen }: { ws: ResearchWorkspace; onOpen: (url: string) => void }) {
  if (!ws.sources.length) return null;
  return (
    <section className="space-y-2 pb-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#6b665c]">Sources ({ws.sources.length})</p>
      <ul className="space-y-1.5">
        {ws.sources.map((s) => (
          <li key={s.id}>
            <button onClick={() => onOpen(s.url)} className="text-left text-[13px] text-[#d4a574] hover:underline">
              {s.title}
            </button>
            <p className="line-clamp-2 text-[12px] text-[#9a9488]">{s.excerpt}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
