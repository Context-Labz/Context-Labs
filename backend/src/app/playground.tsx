"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ResearchWorkspace } from "@/lib/types";
import { DEMO_PAGES, DemoPage, pageByUrl } from "@/lib/demo-pages";
import ResearchPanel from "./research-panel";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export default function Playground() {
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageId, setPageId] = useState("search");
  const [openTabs, setOpenTabs] = useState<string[]>(["search"]);
  const [selectedText, setSelectedText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [mobileTab, setMobileTab] = useState<"browser" | "agent">("browser");

  const page = useMemo(() => DEMO_PAGES.find((p) => p.id === pageId) ?? DEMO_PAGES[0], [pageId]);

  useEffect(() => {
    (async () => {
      try {
        const created = await json<ResearchWorkspace>(
          await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: "Kenya swimwear market — first-pass diligence",
              columns: [],
            }),
          }),
        );
        setWs(created);
      } catch (err: any) {
        setError(err?.message || "Could not create a workspace.");
      }
    })();
  }, []);

  const postEvent = useCallback(
    async (type: string, current: DemoPage, extra?: { text?: string; pageText?: string }) => {
      if (!ws) return;
      const next = await json<ResearchWorkspace>(
        await fetch("/api/research/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: ws.id,
            type,
            title: current.title,
            url: current.url,
            text: extra?.text,
            pageText: extra?.pageText,
          }),
        }),
      );
      setWs(next);
    },
    [ws],
  );

  const goTo = useCallback(
    async (id: string, via: "tab_switch" | "link_click" = "tab_switch") => {
      const nextPage = DEMO_PAGES.find((p) => p.id === id);
      if (!nextPage || !ws) return;
      setPageId(id);
      setSelectedText("");
      setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]));
      await postEvent(via, nextPage, { text: via === "link_click" ? nextPage.title : undefined });
    },
    [postEvent, ws],
  );

  const capture = async () => {
    if (!ws) return;
    setCapturing(true);
    try {
      const next = await json<ResearchWorkspace>(
        await fetch("/api/research/add-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: ws.id,
            title: page.title,
            url: page.url,
            text: page.body,
          }),
        }),
      );
      setWs(next);
    } catch (err: any) {
      setError(err?.message || "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  const saveHighlight = async () => {
    if (!ws || !selectedText) return;
    await postEvent("highlight", page, { text: selectedText, pageText: page.body });
    setSelectedText("");
  };

  const setQuestion = async (question: string) => {
    if (!ws) return;
    setBusy("topic");
    try {
      const next = await json<ResearchWorkspace>(
        await fetch("/api/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ws.id, question }),
        }),
      );
      setWs(next);
    } finally {
      setBusy(null);
    }
  };

  const fillObjective = async (objectiveId: string) => {
    if (!ws) return;
    setBusy("fill");
    try {
      const next = await json<ResearchWorkspace>(
        await fetch("/api/research/fill-objective", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: ws.id, objectiveId }),
        }),
      );
      setWs(next);
    } finally {
      setBusy(null);
    }
  };

  const resolveContradiction = async (
    objectiveId: string,
    contradictionId: string,
    decision: "keep_a" | "keep_b" | "needs_more_research",
  ) => {
    if (!ws) return;
    const next = await json<ResearchWorkspace>(
      await fetch("/api/research/resolve-contradiction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id, objectiveId, contradictionId, decision }),
      }),
    );
    setWs(next);
  };

  const compare = async () => {
    if (!ws) return;
    setBusy("compare");
    try {
      const next = await json<ResearchWorkspace>(
        await fetch("/api/research/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: ws.id,
            question: ws.question,
            columns: ["Overview", "Pricing", "Strengths", "Risks"],
          }),
        }),
      );
      setWs(next);
    } finally {
      setBusy(null);
    }
  };

  const complete = async () => {
    if (!ws) return;
    setBusy("complete");
    try {
      const next = await json<ResearchWorkspace>(
        await fetch("/api/research/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: ws.id }),
        }),
      );
      setWs(next);
    } finally {
      setBusy(null);
    }
  };

  const newTopic = async () => {
    setBusy("topic");
    try {
      const created = await json<ResearchWorkspace>(
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "", columns: [] }),
        }),
      );
      setWs(created);
      setPageId("search");
      setOpenTabs(["search"]);
      setSelectedText("");
    } finally {
      setBusy(null);
    }
  };

  const openLink = async (url: string) => {
    const local = pageByUrl(url);
    if (local) {
      await goTo(local.id, "link_click");
      setMobileTab("browser");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (page.kind === "search" && ws && !ws.events.some((e) => e.type === "search")) {
      postEvent("search", page, { text: "Kenya swimwear market size" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  if (error && !ws) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-sm text-[#d4886a]">
        {error}
      </main>
    );
  }

  if (!ws) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-sm text-[#9a9488]">
        Opening research room…
      </main>
    );
  }

  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="border-b border-[#2c2924] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#d4a574]">Context Labs</p>
            <h1 className="font-serif text-2xl tracking-tight">Research that follows your browser</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#9a9488]">
              Highlight a line, follow a link, switch tabs. The agent files it against a standing plan, suggests the next
              reads, and — when you stop — summarizes everything that was on the panel. No chat dump.
            </p>
          </div>
          <div className="flex gap-2 lg:hidden">
            <button
              onClick={() => setMobileTab("browser")}
              className={`rounded-md px-3 py-1.5 text-xs ${mobileTab === "browser" ? "bg-[#d4a574] text-[#1a1612]" : "bg-white/10"}`}
            >
              Browser
            </button>
            <button
              onClick={() => setMobileTab("agent")}
              className={`rounded-md px-3 py-1.5 text-xs ${mobileTab === "agent" ? "bg-[#d4a574] text-[#1a1612]" : "bg-white/10"}`}
            >
              Agent
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] lg:h-[calc(100vh-92px)]">
        <section className={`${mobileTab === "browser" ? "block" : "hidden"} lg:block min-h-0 border-r border-[#2c2924]`}>
          <BrowserSim
            page={page}
            openTabs={openTabs}
            selectedText={selectedText}
            onSelectTab={(id) => goTo(id, "tab_switch")}
            onFollowLink={(id) => goTo(id, "link_click")}
            onSelection={setSelectedText}
            onSearch={async (q) => {
              await setQuestion(q);
              await postEvent("search", page, { text: q });
            }}
          />
        </section>
        <aside className={`${mobileTab === "agent" ? "block" : "hidden"} lg:block min-h-[70vh] lg:min-h-0 bg-[#171613]`}>
          <ResearchPanel
            ws={ws}
            currentTitle={page.title}
            currentUrl={page.url}
            selectedText={selectedText}
            busy={busy}
            capturing={capturing}
            onSetQuestion={setQuestion}
            onCapture={capture}
            onSaveHighlight={saveHighlight}
            onOpenLink={openLink}
            onFillObjective={fillObjective}
            onResolveContradiction={resolveContradiction}
            onCompare={compare}
            onComplete={complete}
            onNewTopic={newTopic}
          />
        </aside>
      </div>
    </main>
  );
}

function BrowserSim({
  page,
  openTabs,
  selectedText,
  onSelectTab,
  onFollowLink,
  onSelection,
  onSearch,
}: {
  page: DemoPage;
  openTabs: string[];
  selectedText: string;
  onSelectTab: (id: string) => void;
  onFollowLink: (id: string) => void;
  onSelection: (text: string) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="flex h-full min-h-[560px] flex-col bg-[#10100e]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#2c2924] bg-[#171613] px-2 pt-2">
        {openTabs.map((id) => {
          const tab = DEMO_PAGES.find((p) => p.id === id);
          if (!tab) return null;
          const active = tab.id === page.id;
          return (
            <button
              key={id}
              onClick={() => onSelectTab(id)}
              className={`max-w-[160px] truncate rounded-t-md px-3 py-1.5 text-xs ${
                active ? "bg-[#10100e] text-[#f3efe7]" : "text-[#9a9488] hover:text-[#f3efe7]"
              }`}
            >
              {tab.tab}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-b border-[#2c2924] px-3 py-2">
        <span className="text-[11px] text-[#6b665c]">● ● ●</span>
        <div className="flex-1 truncate rounded-full bg-[#1e1c18] px-3 py-1 text-xs text-[#9a9488]">{page.url}</div>
      </div>
      <div className="flex-1 overflow-y-auto panel-scroll px-6 py-8 lg:px-12">
        {page.kind === "search" ? (
          <SearchView page={page} onFollowLink={onFollowLink} onSearch={onSearch} />
        ) : (
          <ArticleView page={page} onFollowLink={onFollowLink} onSelection={onSelection} selectedText={selectedText} />
        )}
      </div>
    </div>
  );
}

function SearchView({
  page,
  onFollowLink,
  onSearch,
}: {
  page: DemoPage;
  onFollowLink: (id: string) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") || "").trim();
          if (q) onSearch(q);
        }}
        className="flex gap-2"
      >
        <input
          name="q"
          defaultValue="Kenya swimwear market size"
          className="flex-1 rounded-full border border-[#2c2924] bg-[#1e1c18] px-4 py-2 text-sm outline-none focus:border-[#d4a574]/50"
        />
        <button className="rounded-full bg-[#d4a574] px-4 py-2 text-sm font-medium text-[#1a1612]">Search</button>
      </form>
      <p className="text-xs text-[#6b665c]">{page.body}</p>
      <ul className="space-y-4">
        {page.links?.map((l) => (
          <li key={l.href}>
            <button onClick={() => l.pageId && onFollowLink(l.pageId)} className="text-left">
              <span className="block text-[11px] text-[#6b665c]">{l.href}</span>
              <span className="block text-lg text-[#8ab4f8] hover:underline">{l.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleView({
  page,
  onFollowLink,
  onSelection,
  selectedText,
}: {
  page: DemoPage;
  onFollowLink: (id: string) => void;
  onSelection: (text: string) => void;
  selectedText: string;
}) {
  return (
    <article className="mx-auto max-w-2xl">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#d4a574]">{page.tab}</p>
      <h2 className="font-serif mt-2 text-3xl leading-tight">{page.title}</h2>
      <p className="mt-2 text-xs text-[#6b665c]">Select any sentence — it becomes evidence in the agent.</p>
      <div
        className="mt-6 space-y-4 text-[16px] leading-7 text-[#e7e1d6]"
        onMouseUp={() => {
          const t = window.getSelection()?.toString().trim() || "";
          onSelection(t);
        }}
      >
        {page.body.split("\n\n").map((para) => (
          <p key={para.slice(0, 24)}>{para}</p>
        ))}
      </div>
      {selectedText ? (
        <p className="mt-4 border-l-2 border-[#d4a574] pl-3 text-sm italic text-[#d4a574]">Selected: “{selectedText}”</p>
      ) : null}
      {page.links?.length ? (
        <div className="mt-8 border-t border-[#2c2924] pt-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">On this page</p>
          <ul className="mt-2 space-y-1">
            {page.links.map((l) => (
              <li key={l.href}>
                <button
                  onClick={() => l.pageId && onFollowLink(l.pageId)}
                  className="text-sm text-[#8ab4f8] hover:underline"
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
