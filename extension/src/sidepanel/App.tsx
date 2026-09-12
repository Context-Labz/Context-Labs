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
  const [detectedQuery, setDetectedQuery] = useState<string | null>(null);
  const [relevantObjective, setRelevantObjective] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedUrls, setCapturedUrls] = useState<Set<string>>(new Set());

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
            onClick={() => captureCurrentPage(false)}
            disabled={capturing}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {capturing ? "Capturing…" : "Capture"}
          </button>
        </div>
      )}

      {relevantObjective && (
        <div className="flex items-center justify-between gap-2 p-2 bg-green-50 border border-green-200 rounded">
          <span className="text-sm">
            📄 This page looks relevant to <strong>{relevantObjective}</strong>
          </span>
          <button
            onClick={() => captureCurrentPage(false)}
            disabled={capturing}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
          >
            {capturing ? "Capturing…" : "Capture"}
          </button>
        </div>
      )}

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
