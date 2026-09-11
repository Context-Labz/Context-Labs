# Build-day plan — 12 Sept 2026 (v2: extension + backend)

## Team split

| Person | Owns | Why |
|---|---|---|
| **Faith** | Backend agent core: `backend/src/lib/agent/*`, `lib/llm.ts`, `lib/exa.ts`, `/api/copilotkit`, `/api/research/*` | Deepest TS + systems experience |
| **Omollo** | Extension UI: `extension/src/sidepanel/*`, manifest/vite config | Full-stack, UI-heavy |
| **Victor M.** | `background.ts`/`content-script.ts` capture flow, Trigger.dev wiring, Cloud Run deploy for the backend, demo video + submission assets | Glue + demo polish |

Two packages now build and run somewhat independently (`backend/` is a
normal Next.js dev server; `extension/` is `vite dev` + load-unpacked) — so
Faith and Omollo can work in parallel from hour 0 once the API contract in
`extension/src/lib/api.ts` is agreed, instead of Omollo waiting on backend
routes to exist first.

## Hour-by-hour

| Hours | Milestone (definition of done) |
|---|---|
| 0–0.5 | `npm install` in BOTH packages; confirm CopilotKit `/v2` imports resolve in each — do this before anything else, it gates the whole day |
| 0.5–1.5 | Backend: `POST /api/workspace` creates, `/api/copilotkit` actions answer a chat message and can call `search_web`. Extension: side panel loads, creates a workspace on open, renders seeded/empty state |
| 1.5–3 | **Core loop works**: chat message → search_web → add_source → update_table_cell visibly fills a row; "Run automatically" also fills the table via `/api/research/start` |
| 3–4.5 | Gap detection + resolve-gap; GapBanner shows the fix from earlier (full workspace returned, cell actually updates); report drafting |
| 4.5–5.5 | `CapturePageButton` end-to-end: capture a real tab → source appears → (optional) cell fills from page text |
| 5.5–6.5 | Trigger.dev task wraps `runResearch`; deploy backend to Cloud Run; point `extension/.env` at the live URL; set `EXTENSION_ORIGIN` if locking down CORS |
| 6.5–8 | Demo hardening: pre-seeded fallback path, rehearse 2-min script 3× — with the extension loaded via "load unpacked", not `vite dev` |
| 8–10 | Record video, write description, push repo, social post |

## Cut ladder (in order — never cut Beat 3)

1. ~~Auth0~~ — never planned, never missed.
2. **Firefox support** — ship Chrome/Edge only via `side_panel`; a Firefox
   `sidebar_action` variant is a nice-to-have, not core, given the hours left.
3. Trigger.dev **demo path** — run research inline; keep the task in the repo for judges to read.
4. Live Exa on EVERY provider — fall back to seeded sources for 2 of 5 rows.
5. Postgres/Prisma — in-memory store stays.
6. Push-update from chat to side panel — the manual "↻ Refresh" button is fine for a narrated demo.
7. **NEVER cut:** the gap banner + human decision, and the chat tools actually calling real Exa search. Those are the 4–5 on Innovation & Usefulness — and the reason last night's review flagged them as broken, not just rough.

## If everything is on fire at hour 6

Strip to: seeded table (2 rows) + ONE live gap interaction + report, running
inside the side panel next to a real webpage. That's still a complete,
honest demo — and the side panel next to a live tab is a stronger visual
than a bare web app tab was. Ship that.
