# Research Room 🕵🏾‍♀️ — backend

API + agent runtime for Research Room. No UI here anymore — the workspace
lives in the browser extension in `../extension` (a Chrome/Edge side panel).
This package exposes the workspace store, the CopilotKit tool loop, and the
Exa-powered research pass over HTTP.

Built for AI Tinkerers Nairobi, 12 Sept 2026. Team Tuhame.

## Quick start

1. `npm install`
2. `cp .env.example .env.local` and fill in: `OPENAI_API_KEY`, `EXA_API_KEY`,
   `LLM_MODEL` (required — the in-code default is an unverified placeholder),
   `OPENROUTER_API_KEY` (fallback insurance), `TRIGGER_*` (optional stretch).
3. `npm run dev`
4. Smoke test without the extension at all:
   ```bash
   curl -X POST localhost:3000/api/workspace \
     -H "Content-Type: application/json" \
     -d '{"question":"Compare the top 5 Kenyan payment gateways","columns":["Pricing","API","M-Pesa","Payouts"]}'
   # copy the returned "id", then:
   curl -X POST localhost:3000/api/research/start \
     -H "Content-Type: application/json" \
     -d '{"workspaceId":"<id>","question":"Compare the top 5 Kenyan payment gateways","columns":["Pricing","API","M-Pesa","Payouts"]}'
   ```
   The second call should return a workspace with populated `table.rows` and
   real citations.
5. Point `../extension/.env`'s `VITE_BACKEND_URL` at this server (or the
   deployed Cloud Run URL) to drive it from the actual UI.

> ⚠️ **API drift warning:** CopilotKit's API moves fast, and this scaffold's
> `/v2` imports (`@copilotkit/runtime/v2`, `createCopilotRuntimeHandler`,
> `BuiltInAgent`) haven't been compile-verified against the pinned `^1.8.0`
> in `package.json` — check that first tonight, before anything else. If it
> breaks: the five action handlers in `src/app/api/copilotkit/route.ts` are
> plain functions against `workspace-store.ts`, so re-registering them
> against whatever the real API expects is a local fix, not a rewrite.

## Stack

Next.js 15 (App Router, TypeScript, API routes only) · CopilotKit (agent
tool loop) · OpenAI (+ OpenRouter fallback) · Exa (web research) ·
Trigger.dev (background research jobs) · Google Cloud Run (deploy)

## API surface

| Route | Purpose |
|---|---|
| `POST /api/workspace` | Create a workspace — the extension calls this once per side-panel open |
| `GET /api/workspace?id=` | Fetch current workspace state |
| `POST /api/copilotkit` | CopilotKit chat runtime — tools call real Exa + mutate the real store |
| `POST /api/research/start` | Deterministic auto-run (no chat) — same loop as the chat tools use |
| `POST /api/research/resolve-gap` | Human-in-the-loop gap resolution — returns full workspace |
| `POST /api/research/add-source` | Extension's "capture this page" — adds + optionally extracts from real page text |

## Docs in this repo

- `docs/ARCHITECTURE.md` — how backend + extension fit together, and what changed from v1
- `docs/DEMO_SCRIPT.md` — the 2-minute demo, beat by beat
- `docs/DAY_PLAN.md` — hour-by-hour plan, team split, cut ladder
- `docs/PRE_DAY_CHECKLIST.md` — everything to verify BEFORE build day, for both packages
- `docs/SUBMISSION.md` — what the judges need from us
