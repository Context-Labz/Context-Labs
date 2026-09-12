import { useCallback, useEffect, useState } from "react";
import { PageContext, ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";
import ResearchPanel from "./Panel";

const STORAGE_KEY = "context-labs:workspace-id";

export default function App() {
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ title?: string; url?: string }>({});
  const [selectedText, setSelectedText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await chrome.storage.local.get(STORAGE_KEY);
      const savedId = saved[STORAGE_KEY] as string | undefined;
      try {
        if (savedId) {
          setWs(await api.getWorkspace(savedId));
          return;
        }
      } catch {
        // stale id
      }
      try {
        const created = await api.createWorkspace("", []);
        await chrome.storage.local.set({ [STORAGE_KEY]: created.id });
        setWs(created);
      } catch (err: any) {
        setError(err?.message || "Backend is not reachable. Start it with npm run dev in /backend.");
      } finally {
        setLoading(false);
      }
    })().finally(() => setLoading(false));
  }, []);

  const refreshTab = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" }, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      setCurrent({ title: tab.title, url: tab.url });
    });
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, (page: PageContext & { error?: string }) => {
      if (!page || page.error) return;
      setCurrent({ title: page.title, url: page.url });
      setSelectedText(page.selectedText || "");
    });
  }, []);

  useEffect(() => {
    refreshTab();
    const port = chrome.runtime.connect({ name: "context-panel" });
    port.onMessage.addListener(async (msg) => {
      if (msg?.type === "TAB_READY") {
        setCurrent({ title: msg.title, url: msg.url });
        setSelectedText("");
      }
      if (msg?.type === "BROWSER_EVENT" && msg.event && ws) {
        try {
          const next = await api.ingestEvent(ws.id, msg.event);
          setWs(next);
          if (msg.event.type === "highlight") setSelectedText("");
          if (msg.event.title) setCurrent({ title: msg.event.title, url: msg.event.url });
        } catch (err) {
          console.error(err);
        }
      }
    });
    return () => port.disconnect();
  }, [ws?.id, refreshTab]);

  const capture = async () => {
    if (!ws) return;
    setCapturing(true);
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page: PageContext & { error?: string }) => {
      if (!page || page.error) {
        setError(page?.error ?? "Could not read this page. Reload the tab.");
        setCapturing(false);
        return;
      }
      try {
        const next = await api.addCapturedSource(ws.id, {
          title: page.title,
          url: page.url,
          text: page.bodyText,
        });
        setWs(next);
        setCurrent({ title: page.title, url: page.url });
      } catch (err: any) {
        setError(err?.message || "Capture failed.");
      } finally {
        setCapturing(false);
      }
    });
  };

  const saveHighlight = async () => {
    if (!ws || !selectedText) return;
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page: PageContext & { error?: string }) => {
      if (!page || page.error) return;
      const next = await api.ingestEvent(ws.id, {
        type: "highlight",
        title: page.title,
        url: page.url,
        text: selectedText,
        pageText: page.bodyText,
      });
      setWs(next);
      setSelectedText("");
    });
  };

  if (loading) {
    return <div className="p-4 text-sm text-[#9a9488]">Opening research room…</div>;
  }
  if (error && !ws) {
    return <div className="p-4 text-sm text-[#d4886a]">{error}</div>;
  }
  if (!ws) return null;

  return (
    <div className="h-screen bg-[#171613]">
      {error ? (
        <div className="border-b border-[#2c2924] bg-[#d4886a]/10 px-3 py-2 text-[12px] text-[#d4886a]">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      ) : null}
      <ResearchPanel
        ws={ws}
        currentTitle={current.title}
        currentUrl={current.url}
        selectedText={selectedText}
        busy={busy}
        capturing={capturing}
        onSetQuestion={async (q) => {
          setBusy("topic");
          try {
            setWs(await api.setQuestion(ws.id, q));
          } finally {
            setBusy(null);
          }
        }}
        onCapture={capture}
        onSaveHighlight={saveHighlight}
        onOpenLink={(url) => chrome.runtime.sendMessage({ type: "OPEN_URL", url })}
        onFillObjective={async (id) => {
          setBusy("fill");
          try {
            setWs(await api.fillObjective(ws.id, id));
          } finally {
            setBusy(null);
          }
        }}
        onResolveContradiction={async (objectiveId, contradictionId, decision) => {
          setWs(await api.resolveContradiction(ws.id, objectiveId, contradictionId, decision));
        }}
        onCompare={async () => {
          setBusy("compare");
          try {
            setWs(
              await api.startResearch(ws.id, ws.question, ["Overview", "Pricing", "Strengths", "Risks"]),
            );
          } finally {
            setBusy(null);
          }
        }}
        onComplete={async () => {
          setBusy("complete");
          try {
            setWs(await api.complete(ws.id));
          } finally {
            setBusy(null);
          }
        }}
        onNewTopic={async () => {
          const created = await api.createWorkspace("", []);
          await chrome.storage.local.set({ [STORAGE_KEY]: created.id });
          setWs(created);
        }}
      />
    </div>
  );
}
