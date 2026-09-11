# Research Room 🕵🏾‍♀️

An agent that lives inside your browser, not a separate app tab. Ask it to
research something — it searches the web (Exa), fills a comparison table
with **cited** evidence, flags what it can't verify, and drafts a report.
It can also read the page you're already looking at. No claim without a
source.

Built for AI Tinkerers Nairobi, 12 Sept 2026. Team Tuhame.

## Two packages

- **`backend/`** — Next.js API + agent runtime. No UI. Deploys to Google Cloud Run.
- **`extension/`** — Chrome/Edge Manifest V3 side-panel extension. This is the entire UI.

Start with `backend/README.md`, then `extension/README.md`. `docs/` inside
`backend/` covers architecture, the demo script, the build-day plan, and the
pre-night checklist for BOTH packages.

## Why a browser extension

A standalone chatbox can search the web. It can't see the tab you already
have open. The side panel can — `CapturePageButton` hands the agent the
actual page content you're looking at, not just what Exa's index returns for
a query. That's the argument for the environment being load-bearing, not
decorative.

## Status / honesty notes

This is a corrected v2 of an earlier single-app scaffold that had two
disconnected agent loops (see `backend/docs/ARCHITECTURE.md` → "What changed
from v1"). The fixes are real but several pieces are still unverified
against actual `npm install` output, since this was written without network
access to the real package registries:

- CopilotKit's `/v2` import paths and action-registration shape (both packages)
- `@crxjs/vite-plugin` against this exact React 19 / Vite 5 combo (extension)
- The default LLM model string (backend) — set `LLM_MODEL` explicitly

Do these checks first tonight. See `backend/docs/PRE_DAY_CHECKLIST.md`.
