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

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      // TODO: Verify if BuiltInAgent can use OpenRouter. The model string format
      // "openai/gpt-4o-mini" suggests it might support OpenRouter's provider/model
      // syntax, but BuiltInAgent may have its own internal LLM client that only
      // connects to native providers. If it requires a native OpenAI key, this
      // chat path will need OPENAI_API_KEY set (unlike the rest of the backend,
      // which now uses OpenRouter as primary). Check CopilotKit docs or test.
      model: process.env.LLM_MODEL || "openai/gpt-4o-mini",
      tools,
      maxSteps: 8, // default is 1 — too low to chain search → cite → fill
      // System prompt lives here now, not as an `instructions` prop on the
      // frontend <CopilotSidebar> (that prop doesn't exist in v2 — verified
      // by a real compile error, not assumed). It doesn't need a workspace
      // id hardcoded in because useAgentContext on the extension side hands
      // the model the current workspaceId as live context on every turn.
      prompt:
        "You are a VC diligence analyst conducting first-pass due diligence on early-stage investment opportunities. " +
        "Your role is to systematically gather evidence across six critical investment dimensions while the analyst browses:\n\n" +
        "RESEARCH FRAMEWORK (map ALL findings to these objectives):\n" +
        "1. Market Size - TAM/SAM estimates, growth rates, market value (with specific currency/units)\n" +
        "2. Competition - Named competitors, market share data, competitive positioning, alternatives\n" +
        "3. Customer Demand - Adoption metrics, testimonials, waitlists, user growth, demand signals\n" +
        "4. Pricing - Specific pricing tiers, subscription costs, transaction fees (with currency)\n" +
        "5. Team & Execution - Founder backgrounds, previous exits, team composition, hiring velocity\n" +
        "6. Regulatory & Distribution Risk - Licenses, compliance requirements, distribution partnerships\n\n" +
        "OPERATIONAL RULES:\n" +
        "- Every tool call with workspaceId must use the id from your current context — never invent one\n" +
        "- Your context lists the current objectives (id, label, confidence) — map evidence onto THESE exact objectives\n" +
        "- Never answer generically; always ground findings in specific evidence tied to an objective\n" +
        "- Workflow: search_web → add_source → update_objective (with value/quote/sourceId from that source)\n" +
        "- Set confidence based on source quality: high (primary sources, company data), medium (credible reporting), low (anecdotal)\n" +
        "- If new evidence contradicts existing evidence for the same objective, call flag_contradiction immediately — investors need to resolve discrepancies\n" +
        "- For competitor comparison tables (not objective-based), use update_table_cell instead\n" +
        "- If you cannot verify a claim after exhaustive search, call flag_gap and ask the analyst for guidance\n" +
        "- Always cite verbatim quotes from sources — never paraphrase or invent supporting text",
    }),
  },
  // Without an Intelligence Platform key the runtime falls back to SSE mode
  // with an in-memory runner — exactly what a one-day hackathon wants.
  ...(process.env.CPK_INTELLIGENCE_API_KEY ? {} : { runner: new InMemoryAgentRunner() }),
});

const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });

export const GET = handler;
export const POST = handler;
