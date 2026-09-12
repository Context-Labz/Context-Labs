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
import { quoteIsGrounded } from "@/lib/verify";
import { ResearchWorkspace, TableCell } from "@/lib/types";

// Full text of every result the agent has actually been shown this session,
// keyed by url. search_web fills it; the citing tools check quotes against it.
// Same globalThis pattern as workspace-store, and for the same reason: Next
// compiles routes into separate bundles and a plain module-scope Map is not
// reliably one instance per process.
const gText = globalThis as unknown as { __researchRoomSeenText?: Map<string, string> };
const seenText = gText.__researchRoomSeenText ?? (gText.__researchRoomSeenText = new Map<string, string>());

// Enforcement for the chat path, mirroring the capture path's guard in
// /api/research/add-source. Returns an error message for the model, or null
// when the citation checks out.
//
// Deliberately permissive in one direction: if we have no recorded text for
// the source (it came from somewhere other than search_web), the quote is
// ACCEPTED rather than rejected. Rejecting on missing context would send the
// agent into a retry loop it cannot win, which is worse mid-demo than an
// unverified citation — and the capture path, where page text is always
// present, enforces unconditionally.
function citationProblem(ws: ResearchWorkspace, sourceId: string, quote: string): string | null {
  const src = ws.sources.find((s) => s.id === sourceId);
  if (!src) return `Unknown sourceId "${sourceId}". Call add_source with a search_web result first, then cite the id it returns.`;
  const body = seenText.get(src.url);
  if (!body) return null;
  if (!quoteIsGrounded(body, quote)) {
    return `That quote does not appear in ${src.url}. Copy an exact sentence from the source text you received — do not paraphrase. If the source doesn't actually support this, call flag_gap instead.`;
  }
  return null;
}
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
    execute: async ({ query }) => {
      const results = await exaSearch(query, 3);
      // Remember what the agent was actually shown, so a later citation can be
      // checked against it rather than taken on trust.
      for (const r of results) seenText.set(r.url, r.text);
      return results;
    },
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
      const problem = citationProblem(ws, sourceId, quote);
      if (problem) throw new Error(problem); // surfaced to the model so it can correct itself
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
      const problem = citationProblem(ws, sourceId, quote);
      if (problem) throw new Error(problem); // surfaced to the model so it can correct itself
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
      const problemA = citationProblem(ws, sourceIdA, quoteA);
      if (problemA) throw new Error(`Side A: ${problemA}`);
      const problemB = citationProblem(ws, sourceIdB, quoteB);
      if (problemB) throw new Error(`Side B: ${problemB}`);
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

// ─────────────────────────────────────────────────────────────────────────
// TOMORROW (build during event) — see AGENT_VISION.md build order.
// These slot in as additional defineTool(...) entries in the `tools` array
// above; left as notes so the scaffold builds clean and they're net-new
// commits tomorrow:
//
//   research_objective(workspaceId, objectiveId): scoped Exa auto-research
//     for ONE objective — reuse the search+extract logic already in
//     lib/agent/run-research.ts, targeted at a single objective instead of
//     the whole table. Backs the "no evidence for Team yet — search?" nudge.
//
// Also tomorrow, in lib/agent/run-research.ts / add-source: add the
// `text.includes(quote)` guard before accepting any evidence, so
// "no claim without a source" is ENFORCED, not just prompted. (Judge note.)
// ─────────────────────────────────────────────────────────────────────────

// Guard against the exact footgun above: a bare model name here is fatal at
// RUN time (the sidebar just shows an error after you hit send), not at boot,
// so catch it at boot instead and fall back to a valid default.
function agentModel(): string {
  const configured = process.env.COPILOT_AGENT_MODEL?.trim();
  if (!configured) return "openai/gpt-4o-mini";
  if (!configured.includes("/")) {
    console.warn(
      `[research-room] COPILOT_AGENT_MODEL="${configured}" has no provider prefix; ` +
        `the CopilotKit agent requires one (e.g. "openai/${configured}"). Falling back to openai/gpt-4o-mini.`
    );
    return "openai/gpt-4o-mini";
  }
  return configured;
}

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      // TODO (from the OpenRouter switch): verify BuiltInAgent can reach
      // OpenRouter at all. The rest of the backend now uses OpenRouter as
      // primary, but BuiltInAgent may use its own internal client that only
      // talks to native providers — in which case this chat path still needs
      // OPENAI_API_KEY set, and COPILOT_AGENT_MODEL must stay inside the
      // enum below rather than being any OpenRouter model string.
      // NOTE the separate env var. Both this agent and lib/llm.ts now want a
      // provider-prefixed string, but they validate against DIFFERENT lists:
      // llm.ts accepts anything in OpenRouter's catalogue, while this agent
      // accepts only the BuiltInAgentModel union below. Sharing one var means
      // any OpenRouter-only model set for llm.ts kills every chat run with
      // RUN_ERROR: Invalid model string. Keep them separate.
      // Valid values are the BuiltInAgentModel union in
      // @copilotkit/runtime@1.71.0: openai/gpt-5, openai/gpt-5-mini,
      // openai/gpt-4.1{,-mini,-nano}, openai/gpt-4o{,-mini}, openai/o3{,-mini},
      // openai/o4-mini, anthropic/claude-sonnet-4-{5,6},
      // anthropic/claude-opus-4-8, anthropic/claude-haiku-4-5,
      // google/gemini-2.5-{pro,flash,flash-lite}.
      model: agentModel(),
      tools,
      // Default is 1 — far too low to chain search → cite → fill. One
      // objective costs three calls (search_web → add_source →
      // update_objective), so the old value of 8 capped a turn at two
      // objectives and the agent stopped mid-checklist with no explanation.
      // 20 covers six objectives plus retries and a closing summary.
      maxSteps: 20,
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

// This file MUST live at api/copilotkit/[[...path]]/route.ts, not
// api/copilotkit/route.ts.
//
// createCopilotRuntimeHandler defaults to mode "multi-route": it routes on the
// URL path, and the client appends sub-paths to runtimeUrl — /info,
// /agent/<id>/run, /agent/<id>/connect, /threads/..., /annotate. A plain
// route.ts matches ONLY the exact /api/copilotkit, so every one of those calls
// hit Next's own 404 and this handler never ran at all. Symptom: the chat
// sidebar renders fine and the send button does nothing, because the POST that
// would start a run 404s before reaching CopilotKit.
//
// The optional catch-all [[...path]] matches the base path AND everything
// under it; basePath below tells the handler what prefix to strip.
const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });

export const GET = handler;
export const POST = handler;
// The client also issues DELETE (thread deletion, memory removal) and PUT/PATCH
// on some routes. Export them so they reach the handler rather than 405ing at
// the Next layer.
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
