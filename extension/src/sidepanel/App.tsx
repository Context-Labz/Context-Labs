import { useEffect, useState } from "react";
import { CopilotKit } from "@copilotkit/react-core/v2";
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

// Keyword vocabularies for objective matching (plain string matching, no AI)
const OBJECTIVE_KEYWORDS: Record<string, string[]> = {
  "Market Size": ["market size", "market value", "tam", "billion", "valued at"],
  "Competition": ["competitor", "vs", "alternative", "rival", "market share"],
  "Customer Demand": ["demand", "customers want", "adoption", "growth rate"],
  "Pricing": ["price", "pricing", "per month", "fee", "subscription", "$", "kes"],
  "Team & Execution": ["founder", "ceo", "co-founder", "team", "leadership"],
  "Regulatory & Distribution Risk": ["regulation", "license", "compliance", "law", "distribution"],
};

export default function App() {
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [detectedQuery, setDetectedQuery] = useState<string | null>(null);
  const [relevantObjective, setRelevantObjective] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedUrls, setCapturedUrls] = useState<Set<string>>(new Set());
  const [highlightedText, setHighlightedText] = useState<{ text: string; url: string; title: string } | null>(null);

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

  // Listen for search query detection and highlight detection from content script
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg?.type === "SEARCH_DETECTED" && msg?.query) {
        setDetectedQuery(msg.query);
      }
      if (msg?.type === "HIGHLIGHT_DETECTED" && msg?.text) {
        setHighlightedText({ text: msg.text, url: msg.url, title: msg.title });
      }
      if (msg?.type === "LINK_CLICKED" && msg?.url && ws) {
        // Log link click to activity feed
        api.logLinkClick(ws.id, msg.url, msg.text, msg.pageUrl).catch(() => {
          // Silent fail - link tracking is best-effort
        });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [ws]);

  // Check current page for objective relevance
  useEffect(() => {
    const checkPageRelevance = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        // Skip search result pages (Task A handles those)
        const url = tab.url || "";
        if (url.includes("google.") && url.includes("q=")) return;
        if (url.includes("bing.") && url.includes("q=")) return;

        chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TEXT" }, (response: any) => {
          if (chrome.runtime.lastError || !response?.text) {
            setRelevantObjective(null);
            return;
          }

          const text = response.text.toLowerCase();

          // Check each objective's keywords
          for (const [objective, keywords] of Object.entries(OBJECTIVE_KEYWORDS)) {
            if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
              setRelevantObjective(objective);
              return;
            }
          }

          setRelevantObjective(null);
        });
      } catch {
        setRelevantObjective(null);
      }
    };

    // Check on mount and when tab changes
    checkPageRelevance();
    chrome.tabs.onUpdated.addListener(checkPageRelevance);
    chrome.tabs.onActivated.addListener(checkPageRelevance);

    return () => {
      chrome.tabs.onUpdated.removeListener(checkPageRelevance);
      chrome.tabs.onActivated.removeListener(checkPageRelevance);
    };
  }, []);

  // Auto-capture on tab navigation (ambient research mode)
  useEffect(() => {
    if (!ws || capturing) return;

    const handleTabUpdate = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Only capture when page finishes loading
      if (changeInfo.status !== "complete") return;
      if (!tab.url || !tab.title) return;

      // Skip special pages
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url === "about:blank" ||
        tab.url.startsWith("edge://")
      ) return;

      // Skip if already captured this URL
      if (capturedUrls.has(tab.url)) return;

      // Skip search results pages (user can manually capture those)
      if (tab.url.includes("google.") && tab.url.includes("q=")) return;
      if (tab.url.includes("bing.") && tab.url.includes("q=")) return;

      // Auto-capture silently
      captureCurrentPage(true);
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    return () => chrome.tabs.onUpdated.removeListener(handleTabUpdate);
  }, [ws, capturing, capturedUrls]);

  const refresh = async () => {
    if (ws) setWs(await api.getWorkspace(ws.id));
  };

  // Unified capture function - captures current page and populates objectives
  const captureCurrentPage = (silent = false) => {
    if (!ws) return;
    setCapturing(true);
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page: any) => {
      if (!page || page.error) {
        if (!silent) alert(page?.error ?? "Could not read the current page.");
        setCapturing(false);
        return;
      }
      try {
        // Add 20s timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Capture timeout")), 20000)
        );
        await Promise.race([
          api.addCapturedSource(ws.id, { title: page.title, url: page.url, text: page.bodyText }, undefined),
          timeoutPromise,
        ]);
        // Track captured URL to prevent duplicates
        setCapturedUrls((prev) => new Set(prev).add(page.url));
        // Clear banners after successful capture
        setDetectedQuery(null);
        setRelevantObjective(null);
        refresh();
      } catch (err: any) {
        if (!silent) {
          alert(err?.message === "Capture timeout"
            ? "Page capture timed out — try again or skip this page."
            : "Couldn't save this page — check the backend logs.");
        }
      } finally {
        setCapturing(false);
      }
    });
  };

  // Capture highlighted text as evidence
  const captureHighlight = async () => {
    if (!ws || !highlightedText) return;
    setCapturing(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Capture timeout")), 20000)
      );
      await Promise.race([
        api.addCapturedSource(
          ws.id,
          { title: highlightedText.title, url: highlightedText.url, text: highlightedText.text },
          undefined
        ),
        timeoutPromise,
      ]);
      setHighlightedText(null);
      refresh();
    } catch (err: any) {
      alert(err?.message === "Capture timeout"
        ? "Highlight capture timed out — try again."
        : "Couldn't save highlight — check the backend logs.");
    } finally {
      setCapturing(false);
    }
  };

  // Run automated research using Exa
  const runAutomatically = async () => {
    if (!ws || !ws.question.trim()) return;
    setRunning(true);
    try {
      setWs(await api.startResearch(ws.id, ws.question, ws.table.columns));
    } catch (err) {
      alert(`Auto-run failed — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  if (loading || !ws) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center space-y-2">
          <div className="text-sm font-medium text-zinc-700">Loading workspace…</div>
          <div className="text-xs text-zinc-500">Connecting to Research Room</div>
        </div>
      </div>
    );
  }

  return (
    <CopilotKit runtimeUrl={`${api.backendUrl}/api/copilotkit`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-zinc-200">
          <ResearchHeader ws={ws} onQuestionSaved={setWs} />
        </div>

      {/* Smart banners - ambient research signals */}
      <div className="flex-shrink-0 p-4 space-y-2">
        {detectedQuery && (
          <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
            <span className="text-sm">
              🔍 You searched: "<strong>{detectedQuery}</strong>"
            </span>
            <button
              onClick={() => captureCurrentPage(false)}
              disabled={capturing}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              {capturing ? "Capturing…" : "Capture"}
            </button>
          </div>
        )}

        {relevantObjective && (
          <div className="flex items-center justify-between gap-2 p-3 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <span className="text-sm">
              📄 This page looks relevant to <strong>{relevantObjective}</strong>
            </span>
            <button
              onClick={() => captureCurrentPage(false)}
              disabled={capturing}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              {capturing ? "Capturing…" : "Capture"}
            </button>
          </div>
        )}

        {highlightedText && (
          <div className="flex items-center justify-between gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm">
            <span className="text-sm">
              ✏️ Highlighted: "{highlightedText.text.slice(0, 60)}..."
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => captureHighlight()}
                disabled={capturing}
                className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
              >
                {capturing ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setHighlightedText(null)}
                className="px-3 py-1.5 text-xs font-medium bg-gray-400 text-white rounded-md hover:bg-gray-500 whitespace-nowrap transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main content - scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Explanatory text */}
        <p className="text-xs text-zinc-500">
          Objectives below are the default startup/market diligence checklist. Browse and use
          "Capture" buttons to map evidence onto them — or chat with the agent directly.
        </p>

        {/* Primary research plan */}
        <div className="space-y-3">
          <ResearchPlanView ws={ws} onResolved={setWs} />
          <CapturePageButton workspaceId={ws.id} onCaptured={refresh} />
          <GapBanner ws={ws} onResolved={setWs} />
        </div>

        {/* Optional competitor comparison */}
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">
            Optional: compare named competitors on specific columns
          </summary>
          <div className="flex items-center gap-2 mt-3 p-3 bg-zinc-50 rounded-lg">
            <p className="flex-1 text-xs text-zinc-500">
              {ws.question
                ? <>Runs live Exa research for <span className="text-zinc-700 font-medium">"{ws.question}"</span> and fills a cited comparison table. Columns are proposed automatically.</>
                : "Set a research question in the header first."}
            </p>
            <button
              onClick={runAutomatically}
              disabled={running || !ws.question.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              {running ? "Running…" : "Run automatically"}
            </button>
          </div>
        </details>

        {/* Supporting views */}
        <div className="space-y-4 pt-4 border-t border-zinc-200">
          <ComparisonTableView ws={ws} />
          <ReportView ws={ws} />
          <SourcesPanel ws={ws} />
          <ActivityFeed ws={ws} />
        </div>
      </div>
    </div>
    </CopilotKit>
  );
}
