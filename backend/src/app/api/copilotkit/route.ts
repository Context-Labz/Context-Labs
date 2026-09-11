// CopilotKit v2 runtime endpoint. Docs: https://docs.copilotkit.ai/quickstart
//
// FIX (was gap #1 in the review, the big one): the old scaffold had two
// disconnected "agents" — a chat path whose frontend tools only mutated
// local UI state with no way to search the web, and a separate Exa-powered
// run-research.ts loop nothing in the UI ever called. This file merges them:
// the chat agent's tools are now backend tools that call the *same*
// getWorkspace/putWorkspace store run-research.ts uses, and search_web calls
// the real Exa client. One store, one set of real tools, both paths use it.
//
// VERIFIED against @copilotkit/runtime@1.71.0 (the version `^1.8.0` in
// package.json actually resolves to as of Sept 2026 — checked via a real
// `npm install`, not assumed). Three real corrections vs. the original
// scaffold's draft, worth knowing WHY:
//   1. Tools are registered as `tools: [defineTool({...})]`, an ARRAY —
//      not an `actions: {...}` keyed object like the first draft had.
//      Each tool's executor is `execute`, not `handler`.
//   2. Model strings need a provider prefix: "openai/gpt-4o-mini", not
//      "gpt-4o-mini" or "gpt-5.4-mini" (both of which were unverified
//      placeholders in earlier versions of this file).
//   3. `maxSteps` defaults to 1 tool call per turn. Left at the default,
//      the agent could call search_web OR add_source in a turn but not
//      chain them — it needs several steps to search, cite a source, then
//      fill a cell, so this is set explicitly below.
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
  BuiltInAgent,
  defineTool,
} from "@copilotkit/runtime/v2";
import { z } from "zod";
import { exaSearch } from "@/lib/exa";
import { getWorkspace, putWorkspace, logActivity, makeId } from "@/lib/workspace-store";
import { TableCell } from "@/lib/types";
// workspaceId is an explicit parameter on every tool (not read from a
// header) so this stays a plain module-level runtime. The extension's
// CopilotSidebar instructions tell the model to pass the current workspace
// id on every call, and useAgentContext exposes it as context so the model
// doesn't have to guess it.
const tools = [
  defineTool({
    name: "search_web",
    description: "Search the live web for a query. Returns up to 3 results with title, url, and a text excerpt. Call this before add_source — never invent a url.",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => exaSearch(query, 3),
  }),

  defineTool({
    name: "add_source",
    description: "Add a source to the research board. title/url/excerpt must come from a search_web result you just received.",
    parameters: z.object({
      workspaceId: z.string(),
      title: z.string(),
      url: z.string(),
      excerpt: z.string(),
    }),
    execute: async ({ workspaceId, title, url, excerpt }) => {
      const ws = getWorkspace(workspaceId);
      const source = { id: makeId("src"), title, url, excerpt, fetchedAt: new Date().toISOString(), claims: [] as string[] };
      ws.sources.push(source);
      logActivity(ws, "search", `Source added: ${title}`);
      putWorkspace(ws);
      return source;
    },
  }),

  defineTool({
    name: "update_table_cell",
    description: "Set a comparison-table cell. value and quote must be grounded in a source you already added with add_source — sourceId is that source's id.",
    parameters: z.object({
      workspaceId: z.string(),
      provider: z.string(),
      column: z.string(),
      value: z.string(),
      sourceId: z.string(),
      quote: z.string().describe("Verbatim excerpt from the source that supports this value"),
    }),
    execute: async ({ workspaceId, provider, column, value, sourceId, quote }) => {
      const ws = getWorkspace(workspaceId);
      let row = ws.table.rows.find((r) => r.provider === provider);
      if (!row) { row = { provider, cells: {} }; ws.table.rows.push(row); }
      const cell: TableCell = { value, citations: [{ sourceId, quote }], status: "verified" };
      row.cells[column] = cell;
      logActivity(ws, "table", `${provider} / ${column} updated (chat)`);
      putWorkspace(ws);
      return cell;
    },
  }),

  defineTool({
    name: "flag_gap",
    description: "Flag a table cell you could not verify from any source. Always tell the human you've flagged it and ask how to proceed.",
    parameters: z.object({ workspaceId: z.string(), provider: z.string(), column: z.string(), reason: z.string() }),
    execute: async ({ workspaceId, provider, column, reason }) => {
      const ws = getWorkspace(workspaceId);
      ws.gaps.push({ id: makeId("gap"), provider, column, reason, status: "open" });
      logActivity(ws, "warn", `Gap flagged: ${provider} / ${column}`);
      putWorkspace(ws);
      return { ok: true };
    },
  }),

  // Research-plan layer (VC-diligence framing) — see CHANGELOG.md. Every
  // workspace is seeded with a fixed objective checklist (Market Size,
  // Competition, Pricing, ...); these two tools are how evidence gets
  // mapped into it instead of just producing one synthesized answer.
  defineTool({
    name: "update_objective",
    description: "Record evidence against a research objective (use the objective ids from your context — never invent one). value/quote/sourceId must come from a source you already added with add_source. confidence is your own judgment of how well this evidence answers the objective.",
    parameters: z.object({
      workspaceId: z.string(),
      objectiveId: z.string(),
      value: z.string().describe("The specific claim this evidence supports, e.g. \"KES 3,500–6,500\""),
      sourceId: z.string(),
      quote: z.string().describe("Verbatim excerpt from the source"),
      confidence: z.enum(["low", "medium", "high"]),
      summary: z.string().describe("One-sentence updated synthesis for this objective given all evidence so far"),
    }),
    execute: async ({ workspaceId, objectiveId, value, sourceId, quote, confidence, summary }) => {
      const ws = getWorkspace(workspaceId);
      const obj = ws.objectives.find((o) => o.id === objectiveId);
      if (!obj) throw new Error(`Unknown objective id: ${objectiveId}. Use an id from your context, don't invent one.`);
      obj.evidence.push({ sourceId, quote, value });
      obj.confidence = confidence;
      obj.summary = summary;
      logActivity(ws, "table", `${obj.label}: ${confidence} confidence (${obj.evidence.length} source${obj.evidence.length === 1 ? "" : "s"})`);
      putWorkspace(ws);
      return obj;
    },
  }),

  defineTool({
    name: "flag_contradiction",
    description: "Flag that two pieces of evidence for the same objective disagree. Both must be real evidence you've already added via update_objective — never invent either side.",
    parameters: z.object({
      workspaceId: z.string(),
      objectiveId: z.string(),
      note: z.string().describe("Plain-language description of what conflicts"),
      sourceIdA: z.string(), quoteA: z.string(), valueA: z.string(),
      sourceIdB: z.string(), quoteB: z.string(), valueB: z.string(),
    }),
    execute: async ({ workspaceId, objectiveId, note, sourceIdA, quoteA, valueA, sourceIdB, quoteB, valueB }) => {
      const ws = getWorkspace(workspaceId);
      const obj = ws.objectives.find((o) => o.id === objectiveId);
      if (!obj) throw new Error(`Unknown objective id: ${objectiveId}`);
      obj.contradictions.push({
        id: makeId("contra"),
        note,
        evidenceA: { sourceId: sourceIdA, quote: quoteA, value: valueA },
        evidenceB: { sourceId: sourceIdB, quote: quoteB, value: valueB },
        status: "open",
      });
      logActivity(ws, "warn", `Contradiction flagged on ${obj.label}: ${note}`);
      putWorkspace(ws);
      return { ok: true };
    },
  }),

  defineTool({
    name: "set_report",
    description: "Write or update the final research brief in markdown.",
    parameters: z.object({ workspaceId: z.string(), markdown: z.string() }),
    execute: async ({ workspaceId, markdown }) => {
      const ws = getWorkspace(workspaceId);
      ws.report = markdown;
      logActivity(ws, "report", "Draft report generated.");
      putWorkspace(ws);
      return { ok: true };
    },
  }),
];

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      // Verified enum value on @copilotkit/runtime@1.71.0's BuiltInAgentModel
      // type — override with LLM_MODEL if you want a different one from that
      // same list (e.g. "openai/gpt-5-mini").
      model: process.env.LLM_MODEL || "openai/gpt-4o-mini",
      tools,
      maxSteps: 8, // default is 1 — too low to chain search → cite → fill
      // System prompt lives here now, not as an `instructions` prop on the
      // frontend <CopilotSidebar> (that prop doesn't exist in v2 — verified
      // by a real compile error, not assumed). It doesn't need a workspace
      // id hardcoded in because useAgentContext on the extension side hands
      // the model the current workspaceId as live context on every turn.
      prompt:
        "You are the Research Room agent, doing first-pass diligence on a startup/market idea while the user browses. " +
        "Every tool call that takes a workspaceId must use the one given to you in the current context — never invent one. " +
        "Your context also lists the current research objectives (id, label, confidence) — map evidence onto THESE, don't " +
        "just answer the question generically. Use search_web to find real results, add_source to record one, then " +
        "update_objective using a value/quote/sourceId taken from a source you added, plus your own confidence judgment " +
        "(low/medium/high) and an updated one-sentence summary for that objective. If new evidence disagrees with evidence " +
        "already recorded for the same objective, call flag_contradiction instead of silently overwriting it. For anything " +
        "not covered by the objective checklist (e.g. comparing named competitors on specific columns), use " +
        "update_table_cell instead. If you can't verify something at all, call flag_gap and tell the human you need a decision.",
    }),
  },
  // Without an Intelligence Platform key the runtime falls back to SSE mode
  // with an in-memory runner — exactly what a one-day hackathon wants.
  ...(process.env.CPK_INTELLIGENCE_API_KEY ? {} : { runner: new InMemoryAgentRunner() }),
});

const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });

export const GET = handler;
export const POST = handler;
