# Changelog — v1 (single Next.js app) → v2 (extension + backend)

Context: v1 was evaluated before this rewrite. Three critical, demo-blocking
bugs were found; this version fixes all three and restructures the UI into a
browser-extension side panel per the team's direction. Kept for the record
so judges — and 3am-you — can see what changed and why.

## Critical fixes

1. **Chat path and Exa path were disconnected.** v1's chat tools
   (`useFrontendTool`) only mutated local browser state and had no way to
   actually search the web; the real Exa-powered loop (`run-research.ts`)
   was never called from the UI. **Fix:** `/api/copilotkit`'s actions now
   operate on the same `workspace-store.ts` the Exa loop uses — `search_web`
   is a real backend action, and `add_source`/`update_table_cell` require
   values traceable to a real search result. One store, one set of real
   tools, reachable from both the chat and the deterministic "Run
   automatically" path.

2. **The server-side workspace was never created.** v1's `getWorkspace()`
   threw immediately because nothing ever called `putWorkspace()` for a
   given id before reading it — the documented smoke-test curl would have
   404'd. **Fix:** `POST /api/workspace` is the one explicit creation point;
   the extension's side panel calls it on open (or reattaches to a saved id)
   before anything else runs. `/api/research/start` also defensively
   creates-if-missing so a skipped step doesn't hard-crash the demo.

3. **Resolving a gap didn't update the table.** v1's gap-resolution endpoint
   returned only `{ gaps }`, so a resolved cell's new value never reached
   the client — the banner disappeared but the table looked untouched.
   **Fix:** `/api/research/resolve-gap` now returns the full workspace; the
   caller (`GapBanner`) replaces state wholesale.

## Restructure

- Split into `backend/` (Next.js, API + agent runtime only) and
  `extension/` (Chrome/Edge MV3 side panel, the entire UI) per the team's
  decision to make the browser extension the primary environment.
- Added `POST /api/research/add-source` + `CapturePageButton` — lets the
  agent work from the real content of the tab the user has open, which is
  the actual argument for "browser extension" over "web app" against the
  Innovation & Theme Alignment rubric.
- Added CORS middleware (`backend/src/middleware.ts`) since requests now
  come from a `chrome-extension://` origin.

## Round 2 — actually verified against the real packages (network access
## turned out to be available for the npm registry, so this stopped being
## guesswork)

Everything below was found by really running `npm install`, `tsc`, `next
build`, `vite build`, and a live `next dev` + `curl` session — not by
reading docs or guessing. Each one would have been a real, confusing
failure tonight if left as originally written.

1. **CopilotKit's real v2 API shape differs from the first draft.** Tools
   register as `tools: [defineTool({...})]` — an array — not
   `actions: {...}` as a keyed object; the executor field is `execute`, not
   `handler`. Model strings need a provider prefix (`"openai/gpt-4o-mini"`,
   not `"gpt-4o-mini"`). `maxSteps` defaults to **1**, which silently caps
   the agent to one tool call per turn — too low to chain search → cite →
   fill; set to 8. `useCopilotReadable` doesn't exist in v2 at all — it's
   `useAgentContext`, same `{description, value}` shape, just renamed. The
   `instructions` prop on `CopilotSidebar` doesn't exist either — the system
   prompt now lives on the backend agent's `prompt` field. The chat
   `labels` prop's real keys are `modalHeaderTitle` / `welcomeMessageText`,
   not `{title, initial}`. All of this was confirmed by installing
   `@copilotkit/runtime@1.71.0` / `@copilotkit/react-core@1.71.0` (what the
   `^1.8.0` pin actually resolves to) and reading the real `.d.ts` files,
   then confirming with a clean `tsc` pass.

2. **The in-memory workspace store wasn't actually shared across API
   routes.** This is the big one. A plain `const store = new Map()` at
   module scope in `workspace-store.ts` is NOT a reliable singleton across
   different Next.js route files in dev mode — confirmed by creating a
   workspace via `POST /api/workspace`, then reading it from
   `/api/research/add-source`, and getting `Workspace not found` even
   though it had just been created. Each route got its own copy of the
   module. This would have silently defeated the whole "one store, one set
   of real tools" fix from round 1 the moment two different route files
   needed the same workspace — which is most of them. **Fix:** the same
   `globalThis` singleton pattern used for Prisma client singletons in
   Next.js — stash the Map on `globalThis` instead of a bare module
   variable, since that object genuinely is one thing for the whole
   process. Re-tested after the fix: create via one route, read from two
   different other routes, works.

3. **Tailwind broke the extension's production build entirely.**
   `vite build` failed outright: Tailwind's PostCSS plugin errored on
   `@copilotkit/react-core/v2/index.css` (their bundled CSS uses `@layer
   base` for its own purposes, without a `@tailwind base` in that same
   file, which Tailwind's plugin doesn't like when it processes every CSS
   file that passes through Vite — including ones from node_modules).
   **Fix:** `postcss.config.js` is now a function that only applies
   Tailwind to files under `/src/`; everything else gets autoprefixer only.

4. **`next build` failed with zero API keys set.** The OpenAI client was
   constructed at module load time in `llm.ts`; Next's build-time page-data
   collection step imports every route, which imports `llm.ts`, which threw
   `OPENAI_API_KEY is missing` — breaking the build even before any request
   was ever made. This matters specifically for Cloud Run: env vars set via
   `gcloud run deploy --set-env-vars` are runtime-only, so a build-time
   crash here would have broken the deploy step, not just local dev.
   **Fix:** lazy-init and memoize the OpenAI clients on first actual use
   instead of at module scope.

5. **Two smaller, pre-existing bugs in the original scaffold**, unrelated
   to anything about the extension pivot, caught by actually compiling the
   file instead of reading it: a literal newline character had broken out
   of a double-quoted string in `run-research.ts`'s `.join("\n")` (syntax
   error); and `lib/llm.ts`'s `chat()` function was typed to accept the
   OpenAI SDK's general (streaming-inclusive) params type, so `res.choices`
   didn't typecheck — pinned to `ChatCompletionCreateParamsNonStreaming`
   instead.

6. **The extension's production bundle is large: ~18MB unpacked, ~17MB of
   JS**, confirmed by actually running `npm run build`. This comes from
   CopilotKit v2's chat UI pulling in Mermaid diagram rendering and a large
   syntax-highlighter language pack for code blocks in chat — none of which
   this project uses. Not fixed (would need code-splitting or a lighter
   chat UI, real work for real time), but worth testing actual side-panel
   open latency tonight before assuming it's fine for a live demo.

## Still genuinely unverified (couldn't check even with registry access)

- `side_panel` opening and rendering correctly in an actual Chrome window —
  everything here was verified by build/typecheck/curl, not by loading the
  unpacked extension in a real browser (no display in this environment).
  Do this first thing tonight.
- Whether the chat UI's tool-calling loop actually drives `search_web` →
  `add_source` → `update_table_cell` correctly end-to-end against a real
  OpenAI key and a real Exa key — the wiring and types are now verified
  correct, but no real LLM call was made against real keys.
- No live push from a chat-driven table update to the side panel — there's
  a manual "↻ Refresh" button as the stopgap. Fine for a narrated demo,
  worth knowing before an unnarrated recording.

## Round 3 — research-plan layer (objectives, confidence, contradictions)

Added on top of the verified v2 architecture, per the competitive-landscape
review: "collect pages + cite a summary" is now a crowded pattern (TabMate,
Weft, FolioLM, and others all do it), so the differentiator moved from
answering one question to maintaining a standing research plan the browser
feeds evidence into.

- **`Objective`** (new type): a fixed checklist item — label, confidence
  (none/low/medium/high), running summary, evidence list, contradictions.
  Every workspace is seeded with a 6-item VC-diligence template (Market
  Size, Competition, Customer Demand, Pricing, Team & Execution,
  Regulatory & Distribution Risk) by default — `useVcTemplate: false` on
  `POST /api/workspace` opts back into the original open-ended mode.
- **`update_objective` / `flag_contradiction`** (new CopilotKit backend
  tools): the chat agent maps evidence onto objective ids from its context
  instead of just answering generically, and explicitly flags disagreement
  instead of silently overwriting a prior value.
- **`/api/research/add-source` now checks captured pages against every
  open objective in one LLM call**, not just a single named provider/column
  — this is the "one-click check against my research plan" version of the
  passive-detection idea from the competitive review, without the
  reliability risk of a continuously-running background watcher.
- **`/api/research/resolve-contradiction`** (new route) + `ResearchPlanView`
  (new component): the human-in-the-loop pattern from gap resolution,
  applied to "sources disagree" — pick which value stands, or mark it as
  needing more research. Losing evidence stays on record, never discarded.
- The comparison table (provider × column) is kept, unchanged, as an
  explicitly optional secondary mode — collapsed behind a `<details>` in
  the side panel — for when a straight side-by-side comparison is what's
  actually needed.
- Verified: both packages typecheck and build clean with the new code;
  workspace creation seeds the 6 objectives correctly (checked via curl);
  `add-source`'s objective-matching path reaches the real LLM call and
  fails exactly where expected (missing API key) rather than crashing on
  anything upstream of that — confirmed by reading the actual stack trace,
  not assumed.
