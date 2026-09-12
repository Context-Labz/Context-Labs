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

export default function App() {
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

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

  const refresh = async () => {
    if (ws) setWs(await api.getWorkspace(ws.id));
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
    return <div className="p-4 text-sm text-zinc-500">Loading workspace…</div>;
  }

  // workspaceId travels as an explicit parameter on every backend tool call
  // (see backend/src/app/api/copilotkit/route.ts) rather than a header —
  // this was verified against the real CopilotKit v2 API (see CHANGELOG.md).
  return (
    <CopilotKit runtimeUrl={`${api.backendUrl}/api/copilotkit`}>
      <div className="p-4 space-y-4">
        <ResearchHeader ws={ws} onQuestionSaved={setWs} />

        <p className="text-xs text-zinc-500">
          Objectives below are the default startup/market diligence checklist. Browse and use
          "Capture this page" to map evidence onto them — or chat with the agent directly.
        </p>

        <ResearchPlanView ws={ws} onResolved={setWs} />
        <CapturePageButton workspaceId={ws.id} onCaptured={refresh} />
        <GapBanner ws={ws} onResolved={setWs} />

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">Optional: compare named competitors on specific columns</summary>
          {/* The question now lives in one place — the header — instead of
              being typed again here. Two inputs for the same field meant the
              header could say one thing and the auto-run research another. */}
          <div className="flex items-center gap-2 mt-2">
            <p className="flex-1 text-xs text-zinc-500">
              {ws.question
                ? <>Runs live Exa research for <span className="text-zinc-700">“{ws.question}”</span> and fills a cited comparison table. Columns are proposed automatically.</>
                : "Set a research question in the header first."}
            </p>
            <button
              onClick={runAutomatically}
              disabled={running || !ws.question.trim()}
              className="px-2 py-1 bg-emerald-700 text-white rounded disabled:opacity-50 whitespace-nowrap"
            >
              {running ? "Running…" : "Run automatically"}
            </button>
          </div>
        </details>
        {/* "Run automatically" is the deterministic Exa-only fallback path for
            the comparison-table mode — useful if the chat tool-calling loop is
            unreliable mid-demo. The objectives checklist above is now primary. */}
        <ComparisonTableView ws={ws} />
        <ReportView ws={ws} />
        <SourcesPanel ws={ws} />
        <ActivityFeed ws={ws} />
      </div>
      <CopilotChat ws={ws} onWorkspaceChange={refresh} />
    </CopilotKit>
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
        className="fixed bottom-4 left-4 text-xs px-2 py-1 bg-zinc-200 rounded"
        title="Re-fetch the workspace if the table doesn't update after a chat action"
      >
        ↻ Refresh
      </button>
    </>
  );
}
