# Pre-night checklist (do this TONIGHT — now two packages, budget ~2.5 hours)

> **Already verified for you** (real `npm install` + `tsc` + `next build` +
> `vite build` + a live `next dev` session, not guesswork — see root
> `CHANGELOG.md` "Round 2" section for the full list): CopilotKit's real v2
> API shape, the workspace store's cross-route sharing bug (now fixed via
> `globalThis`), the Tailwind/PostCSS build failure (fixed), the
> build-time OpenAI-client crash (fixed), and two pre-existing syntax/type
> bugs in `run-research.ts`/`llm.ts`. Both packages currently typecheck and
> build clean with zero API keys set. What's LEFT to verify tonight is
> below — mainly: does it actually work with real keys, in a real browser.

## Accounts & keys (30 min)
- [ ] OpenAI API key with billing enabled (test 1 call)
- [ ] OpenRouter key as fallback (test 1 call)
- [ ] Exa API key (test 1 search with the curl in their docs)
- [ ] Trigger.dev account + project ref → `TRIGGER_PROJECT` (optional but do it)
- [ ] Google Cloud project + `gcloud` CLI logged in (`gcloud auth login`)
- [ ] GitHub repo created, public, named something good (e.g. `research-room`) — this time with `backend/` and `extension/` as top-level folders

## Verify the BACKEND runs (30 min)
- [ ] `cd backend && npm install` — if CopilotKit versions resolve badly, run
      `npm install @copilotkit/react-core@latest @copilotkit/runtime@latest`
      and fix any renamed imports against https://docs.copilotkit.ai/quickstart.
      **Do this first — it gates the extension's chat too.**
- [ ] `cp .env.example .env.local` + fill keys, including a real `LLM_MODEL`
      (the code default is an unverified placeholder — check your OpenAI
      account for a model name that actually exists)
- [ ] `npm run dev`
- [ ] `curl -X POST localhost:3000/api/workspace -d '{"question":"test","columns":["Pricing"]}' -H 'Content-Type: application/json'`
      → should return a workspace with an `id` (this used to be missing — if
      it 404s or errors, nothing downstream will work)
- [ ] `curl -X POST localhost:3000/api/research/start -d '{"workspaceId":"<id from above>","question":"Compare X","columns":["Pricing"]}' -H 'Content-Type: application/json'`
      → table should have rows with citations
- [ ] `npm run typecheck` clean

## Verify the EXTENSION runs (45 min)
- [ ] `cd extension && npm install` — confirm `@crxjs/vite-plugin` resolves;
      this is a less battle-tested combo than the CopilotKit risk above, budget
      real time here
- [ ] `cp .env.example .env` and set `VITE_BACKEND_URL=http://localhost:3000`
- [ ] `npm run build` (crxjs needs a build, not just `vite dev`, to produce a
      loadable `dist/` for most MV3 workflows — confirm which your plugin version wants)
- [ ] Load unpacked: `chrome://extensions` → enable Developer mode → "Load
      unpacked" → select `extension/dist`
- [ ] Click the toolbar icon → side panel opens → workspace loads (check the
      Network tab: `POST /api/workspace` should fire once)
- [ ] Open the chat sidebar, send a message → confirm it can call `search_web`
      (check the backend terminal for the Exa fetch, not just a chat reply)
- [ ] On a real webpage, click "Capture this page" → a new source appears in
      the side panel
- [ ] `npm run typecheck` clean

## Deploy rehearsal — BACKEND only (30 min)
- [ ] `docker build -t research-room-backend backend/` succeeds (or deploy
      straight: `cd backend && gcloud run deploy --source .`)
- [ ] Confirm the live URL serves `/` (health check page) and `/api/workspace` (POST)
- [ ] Point `extension/.env`'s `VITE_BACKEND_URL` at the live Cloud Run URL,
      rebuild the extension, reload unpacked, re-run the smoke test above
      against the deployed backend (not localhost) — this is the version you demo with
- [ ] If locking CORS down: set `EXTENSION_ORIGIN` on the backend to your
      loaded extension's `chrome-extension://<id>` origin (visible on
      `chrome://extensions`); otherwise leave it at the `*` default
- [ ] Optional: `npm run trigger:dev` in `backend/` → task registers in the Trigger.dev dashboard

## Housekeeping (15 min)
- [ ] GitHub issues created from docs/DAY_PLAN.md milestones
- [ ] Demo script read aloud once as a team, **using the loaded extension**, not `vite dev`
- [ ] Chargers, hotspots, and a backup screen-recording plan confirmed
- [ ] Decide now, not at hour 8: is Firefox support in scope? (see ARCHITECTURE.md limitations) — default answer is no
