# Architecture (v2 — browser extension side panel)

```
┌────────────────────────────┐         ┌──────────────────────────────────┐
│  Browser extension (MV3)    │         │  Next.js 15 — backend only        │
│  chrome-extension://...     │         │  (no UI; API + agent runtime)     │
│                              │         │                                    │
│  side panel (React)         │ fetch   │  POST /api/workspace               │
│   header · table · sources  │────────►│  GET  /api/workspace?id=           │
│   gaps · activity · report  │         │  POST /api/research/start          │
│   "Capture this page" btn   │         │  POST /api/research/resolve-gap    │
│                              │         │  POST /api/research/add-source     │
│  CopilotSidebar (chat) ─────┼────────►│  POST /api/copilotkit              │
│  useCopilotReadable(ws)     │         │   └─ CopilotRuntime + BuiltInAgent  │
│                              │         │       actions: search_web,          │
│  background.ts (service     │         │       add_source, update_table_cell,│
│   worker) + content-script  │         │       flag_gap, set_report          │
│   → reads the active tab's  │         │                                    │
│   title/url/selection       │         │  lib/agent/run-research.ts          │
└──────────────────────────────┘         │   (same loop, now called by BOTH   │
                                          │    the chat actions above AND      │
                                          │    the deterministic /start route) │
                                          └───────────┬────────────────────────┘
                                                       │
                                            ┌──────────┼──────────┐
                                            ▼          ▼          ▼
                                         OpenAI      Exa      Trigger.dev
                                       (+OpenRouter (web      (deep-research
                                        fallback)   search)   background job)
```

## What changed from v1 (and why)

The original single Next.js app had two agent paths that never connected:
a chat UI whose tools only mutated local browser state (no way to actually
search the web), and a separate Exa-powered research loop nothing in the UI
ever called. Splitting into extension (UI) + backend (agent runtime) forced
fixing that properly rather than papering over it:

- **One store, one set of real tools.** `/api/copilotkit`'s actions
  (`search_web`, `add_source`, `update_table_cell`, `flag_gap`, `set_report`)
  now operate on the exact same `workspace-store.ts` that
  `lib/agent/run-research.ts` writes to. The chat path and the deterministic
  "Run automatically" path are two ways into the same state, not two
  disconnected demos.
- **Workspace creation is explicit.** `POST /api/workspace` is the one place
  a workspace gets created — the side panel calls it on open (or reattaches
  to a saved id via `chrome.storage`) before anything else touches the store.
- **Gap resolution returns full state.** `/api/research/resolve-gap` returns
  the whole workspace now, not just the gaps array, so a resolved cell's new
  value actually reaches the table.

## The agent loop (src/lib/agent/run-research.ts) — unchanged

PLAN (LLM: which providers + what queries)
  → SEARCH (Exa, live web)
  → EXTRACT (LLM structured output — every claim needs a verbatim quote)
  → FILL TABLE (cell = value + citations + status)
  → DETECT GAPS (empty cells after searching)
  → HUMAN DECISION (leave blank vs. secondary source)   ← rubric moment
  → DRAFT REPORT (from verified cells only)

## What the extension adds that a web app couldn't

`CapturePageButton` sends the active tab's title/url/selected text to
`/api/research/add-source`, which runs the same cited-extraction step against
real page content the user is already looking at — not just Exa's index.
This is the actual "environment is essential" argument for Innovation &
Theme Alignment: the browser, specifically, is what lets the agent see what
the user sees.

## Known limitations, stated plainly

- **Chrome/Edge only as written.** `side_panel` is a Chromium API
  (Chrome 114+, Edge). Firefox uses a different `sidebar_action` manifest
  key and doesn't support `chrome.sidePanel` — if the Mozilla sponsor tie-in
  matters for judging, that's a second manifest variant, not a settings
  toggle. Decide tonight whether that's in scope.
- **CopilotKit v1/v2 API shape is unverified from this environment** (no
  network access to check the real package against `npm install`). This was
  flagged in the original scaffold too — it's still the first thing to
  confirm, now in two places (`extension/src/sidepanel/App.tsx` and
  `backend/src/app/api/copilotkit/route.ts`).
- **No live push from chat → side panel.** A tool call landing via chat
  updates the backend store, but the side panel only re-reads it on the
  explicit "↻ Refresh" button, the capture flow, or "Run automatically" —
  there's no websocket/poll loop. Fine for a narrated demo where you click
  refresh on cue; worth knowing if you plan an unnarrated recording.
