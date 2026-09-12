import { useEffect, useState } from "react";
import { ResearchWorkspace } from "@/lib/types";
import { api } from "@/lib/api";
import ResearchHeader from "./components/ResearchHeader";
import SourcesPanel from "./components/SourcesPanel";
import ComparisonTableView from "./components/ComparisonTableView";
import ActivityFeed from "./components/ActivityFeed";
import GapBanner from "./components/GapBanner";
import ResearchPlanView from "./components/ResearchPlanView";
import ReportView from "./components/ReportView";
import CapturePageButton from "./components/CapturePageButton";

// Table columns are now the OPTIONAL secondary "compare named
// competitors" mode — the primary artifact is the objectives checklist
// seeded server-side by default (useVcTemplate: true in createWorkspace).
const DEFAULT_COLUMNS: string[] = [];
const STORAGE_KEY = "research-room:workspace-id";

export default function App() {
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [detectedQuery, setDetectedQuery] = useState<string | null>(null);

  // FIX (was gap #2 in the review): a workspace must exist on the backend
  // before anything else touches it. This is the one explicit place that
  // happens — reattach to the last id this browser created (chrome.storage),
  // or create a fresh one. Nothing downstream guesses or auto-creates.
  useEffect(() => {
    (async () => {
      const saved = await chrome.storage.local.get(STORAGE_KEY);
      const savedId = saved[STORAGE_KEY] as string | undefined;
      try {
        if (savedId) {
          const existing = await api.getWorkspace(savedId);
          setWs(existing);
          setQuestion(existing.question);
          return;
        }
      } catch {
        // saved id is stale (e.g. backend restarted) — fall through and create fresh
      }
      const created = await api.createWorkspace("", DEFAULT_COLUMNS);
      await chrome.storage.local.set({ [STORAGE_KEY]: created.id });
      setWs(created);
    })().finally(() => setLoading(false));
  }, []);

  // Listen for search query detection from content script
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg?.type === "SEARCH_DETECTED" && msg?.query) {
        setDetectedQuery(msg.query);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const refresh = async () => {
    if (ws) setWs(await api.getWorkspace(ws.id));
  };

  const trackSearch = () => {
    if (detectedQuery) {
      setQuestion(detectedQuery);
      setDetectedQuery(null); // Clear the banner after tracking
    }
  };

  const runAutomatically = async () => {
    if (!ws || !question.trim()) return;
    setRunning(true);
    try {
      setWs(await api.startResearch(ws.id, question, ws.table.columns));
    } finally {
      setRunning(false);
    }
  };

  if (loading || !ws) {
    return <div className="p-4 text-sm text-zinc-500">Loading workspace…</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <ResearchHeader ws={ws} />

      {detectedQuery && (
        <div className="flex items-center justify-between gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
          <span className="text-sm">
            🔍 You searched: "<strong>{detectedQuery}</strong>"
          </span>
          <button
            onClick={trackSearch}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
          >
            Track this search
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What are you researching? (e.g. Is there a market for premium swimwear in Kenya?)"
          className="border rounded px-2 py-1 flex-1"
        />
        <button
          onClick={runAutomatically}
          disabled={running || !question.trim()}
          className="px-2 py-1 bg-emerald-700 text-white rounded disabled:opacity-50 whitespace-nowrap"
        >
          {running ? "Researching…" : "Research"}
        </button>
      </div>

      <ResearchPlanView ws={ws} onResolved={setWs} />
      <CapturePageButton workspaceId={ws.id} onCaptured={refresh} />
      <GapBanner ws={ws} onResolved={setWs} />

      <ComparisonTableView ws={ws} />
        <ReportView ws={ws} />
        <SourcesPanel ws={ws} />
        <ActivityFeed ws={ws} />
    </div>
  );
}
