import { useEffect, useState } from "react";
import { CopilotKit, useAgentContext, CopilotSidebar } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
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

// Plain string matching against a per-objective vocabulary — deliberately NO
// AI in the panel. Keys must match the objective labels the backend seeds.
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
          setWs(await api.getWorkspace(savedId));
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

  // The content script posts the query whenever the user runs a search on a
  // recognised engine, so the panel can offer to adopt it as the question.
  useEffect(() => {
    const handleMessage = (msg: { type?: string; query?: string }) => {
      if (msg?.type === "SEARCH_DETECTED" && msg.query) setDetectedQuery(msg.query);
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Persist through the same api.setQuestion path the header uses. Upstream
  // wrote this into a local `question` input, but that second input was removed
  // precisely so the header stays the single source of truth for the question.
  // Keyword badge: ask the active tab for its text and see whether it hits any
  // objective vocabulary. Search result pages are skipped — the query banner
  // already covers those, and a SERP is not evidence.
  useEffect(() => {
    const checkPageRelevance = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        const url = tab.url || "";
        if (/[?&]q=/.test(url) && /google\.|bing\./.test(url)) return;

        chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TEXT" }, (response) => {
          // lastError fires on pages the content script can't run in
          // (chrome://, the web store). Read it so it isn't logged as unchecked.
          if (chrome.runtime.lastError || !response?.text) {
            setRelevantObjective(null);
            return;
          }
          const text = String(response.text).toLowerCase();
          const hit = Object.entries(OBJECTIVE_KEYWORDS).find(([, keywords]) =>
            keywords.some((kw) => text.includes(kw.toLowerCase()))
          );
          setRelevantObjective(hit ? hit[0] : null);
        });
      } catch {
        setRelevantObjective(null);
      }
    };

    checkPageRelevance();
    chrome.tabs.onUpdated.addListener(checkPageRelevance);
    chrome.tabs.onActivated.addListener(checkPageRelevance);
    return () => {
      chrome.tabs.onUpdated.removeListener(checkPageRelevance);
      chrome.tabs.onActivated.removeListener(checkPageRelevance);
    };
  }, []);

  // One capture path for both banners.
  const captureCurrentPage = () => {
    if (!ws) return;
    setCapturing(true);
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page) => {
      if (!page || page.error) {
        alert(page?.error ?? "Could not read the current page.");
        setCapturing(false);
        return;
      }
      try {
        await api.addCapturedSource(ws.id, { title: page.title, url: page.url, text: page.bodyText }, undefined);
        setDetectedQuery(null);
        setRelevantObjective(null);
        refresh();
      } catch {
        alert("Couldn't save this page — check the backend logs.");
      } finally {
        setCapturing(false);
      }
    });
  };

  const refresh = async () => {
    if (!ws) return;
    try {
      setWs(await api.getWorkspace(ws.id));
    } catch (err) {
      if (!String(err).includes("404")) throw err;
      const created = await api.createWorkspace("", DEFAULT_COLUMNS);
      await chrome.storage.local.set({ [STORAGE_KEY]: created.id });
      setWs(created);
    }
  };

  const runAutomatically = async () => {
    if (!ws || !ws.question.trim()) return;
    setRunning(true);
    try {
      setWs(await api.startResearch(ws.id, ws.question, ws.table.columns));
    } catch (err) {
      // The route returns the real cause now (bad key, Exa failure, schema
      // validation) instead of an empty 500 — show it rather than swallowing it.
      alert(`Auto-run failed — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  if (loading || !ws) {
    return <p className="t-meta p-4">Opening your research room…</p>;
  }

  // workspaceId travels as an explicit parameter on every backend tool call
  // (see backend/src/app/api/copilotkit/route.ts) rather than a header —
  // this was verified against the real CopilotKit v2 API (see CHANGELOG.md).
  return (
    <CopilotKit runtimeUrl={`${api.backendUrl}/api/copilotkit`}>
      <div className="pb-24">
        <ResearchHeader ws={ws} onQuestionSaved={setWs} />

        {/* The agent proposes, the analyst confirms — page text only leaves the
            browser after one of these is accepted. Both are cool-toned: they're
            offers, not problems, and warm is reserved for things that are. */}
        {detectedQuery && (
          <Proposal
            lead="You searched"
            subject={detectedQuery}
            action={capturing ? "Saving" : "Save this page"}
            onAct={captureCurrentPage}
            busy={capturing}
            onDismiss={() => setDetectedQuery(null)}
          />
        )}

        {relevantObjective && (
          <Proposal
            lead="This page looks like evidence for"
            subject={relevantObjective}
            action={capturing ? "Saving" : "Save this page"}
            onAct={captureCurrentPage}
            busy={capturing}
            onDismiss={() => setRelevantObjective(null)}
          />
        )}

        <ResearchPlanView ws={ws} onResolved={setWs} />
        <CapturePageButton workspaceId={ws.id} onCaptured={refresh} />
        <GapBanner ws={ws} onResolved={setWs} />

        {/* Everything below is reference material. It's collapsed by default so
            the objectives board owns the panel — these used to be eight
            equal-weight cards competing with the thing that matters. */}
        <Section title="Sources" count={ws.sources.length}>
          <SourcesPanel ws={ws} />
        </Section>

        <Section title="Memo">
          <ReportView ws={ws} />
        </Section>

        <Section title="Comparison table" count={ws.table.rows.length || undefined}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="t-meta flex-1">
                {ws.question
                  ? "Researches named companies against this question and fills a cited table."
                  : "Set a question above first."}
              </p>
              <button
                onClick={runAutomatically}
                disabled={running || !ws.question.trim()}
                className="btn btn-quiet"
              >
                {running ? "Researching" : "Run research"}
              </button>
            </div>
            <ComparisonTableView ws={ws} />
          </div>
        </Section>

        <Section title="What the agent did" count={ws.activity.length}>
          <ActivityFeed ws={ws} />
        </Section>
      </div>
      <CopilotChat ws={ws} onWorkspaceChange={refresh} />
    </CopilotKit>
  );
}

// A confirmable suggestion from the ambient recognisers. Its left edge carries
// the evidence hue so it reads as part of the same system as the meters.
function Proposal({
  lead,
  subject,
  action,
  onAct,
  busy,
  onDismiss,
}: {
  lead: string;
  subject: string;
  action: string;
  onAct: () => void;
  busy: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rule-top px-4 py-3"
      style={{ background: "var(--evidence-wash)", borderLeft: "3px solid var(--evidence)" }}
    >
      <p className="t-meta">{lead}</p>
      <p className="t-summary mt-0.5" style={{ color: "var(--ink)" }}>
        {subject}
      </p>
      <div className="flex gap-1.5 mt-2">
        <button onClick={onAct} disabled={busy} className="btn btn-primary">
          {action}
        </button>
        <button onClick={onDismiss} className="btn btn-quiet">
          Not this one
        </button>
      </div>
    </div>
  );
}

// Reference sections: quiet, collapsible, and counted so you can tell whether
// opening one is worth it without opening it.
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="rule-top group">
      <summary className="px-4 py-2.5 cursor-pointer flex items-center gap-2 list-none">
        <span
          className="t-meta transition-transform group-open:rotate-90"
          style={{ display: "inline-block", width: "8px" }}
        >
          ›
        </span>
        <span className="t-section flex-1">{title}</span>
        {count !== undefined && <span className="t-meta">{count}</span>}
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

// Small wrapper so useAgentContext/CopilotSidebar run inside the
// <CopilotKit> provider tree, with access to the current workspace.
function CopilotChat({ ws, onWorkspaceChange }: { ws: ResearchWorkspace; onWorkspaceChange: () => void }) {
  // Gives the agent "eyes": the workspace id and current table shape.
  // FIX (was gap #1 in the review): the model needs workspaceId to call any
  // backend tool (see src/app/api/copilotkit/route.ts on the backend) —
  // exposing it here plus repeating it in the sidebar instructions below
  // means the model doesn't have to guess or invent one.
  // NOTE: v1's useCopilotReadable doesn't exist in v2 — this is
  // useAgentContext, verified against the real installed package (same
  // {description, value} shape, just renamed).
  useAgentContext({
    description:
      "The current research workspace id, question, table columns, and research objectives (id/label/confidence). " +
      "Every tool call must include this workspaceId. Map evidence onto these objective ids with update_objective — " +
      "don't invent new ids.",
    value: {
      workspaceId: ws.id,
      question: ws.question,
      columns: ws.table.columns,
      objectives: ws.objectives.map((o) => ({ id: o.id, label: o.label, confidence: o.confidence })),
    },
  });

  // UNVERIFIED: whether CopilotKit v2's chat UI exposes a hook/callback for
  // "a tool call just finished, re-render" — check this against your
  // installed version. Until then, the visible workaround is the manual
  // "Refresh" button below (or re-open the side panel / click "Run
  // automatically" which does refresh state directly).
  return (
    <>
      {/* NOTE: v1's `instructions` prop doesn't exist on CopilotSidebar/
          CopilotChat in v2 (verified against the real package — it errors
          at compile time, not just at runtime). The system prompt now lives
          on the backend agent (`prompt` field of BuiltInAgent, see
          backend/src/app/api/copilotkit/route.ts) — it doesn't need ws.id
          interpolated into it because useAgentContext above already hands
          the model the current workspaceId as live context on every turn. */}
      <CopilotSidebar
        labels={{
          // Field names verified against CopilotChatDefaultLabels in the real
          // package — v1's { title, initial } shape doesn't exist in v2.
          modalHeaderTitle: "Research Agent",
          welcomeMessageText: "Tell me what you're researching — a startup idea, a market — and I'll work the objectives checklist as you browse. Try: is there a market for premium swimwear in Kenya?",
        }}
      />
      <button
        onClick={onWorkspaceChange}
        className="btn btn-quiet fixed bottom-4 left-4"
        style={{ background: "var(--surface)", boxShadow: "0 1px 3px rgb(20 32 43 / 0.12)" }}
        title="Chat actions update the board on the backend; this pulls the latest state"
      >
        Refresh board
      </button>
    </>
  );
}
