# Testing locally, and deploying the extension

## Part 1 — local testing checklist

Run these in order; each one builds on the last. Budget ~30–40 min the
first time through.

### Backend

- [ ] `cd backend && npm install`
- [ ] `cp .env.example .env.local` — fill in `OPENAI_API_KEY`, `EXA_API_KEY`,
      `LLM_MODEL` (e.g. `gpt-4o-mini` — no provider prefix here, that's only
      for the CopilotKit agent's model string, see the comment in `llm.ts`)
- [ ] `npx tsc --noEmit -p tsconfig.json` — should be clean
- [ ] `npm run build` — should succeed with **zero keys set too** (confirms
      the lazy-init fix holds); if this fails, something regressed
- [ ] `npm run dev`
- [ ] Smoke test workspace creation (no API keys needed for this one):
      ```bash
      curl -s -X POST localhost:3000/api/workspace -H "Content-Type: application/json" \
        -d '{"question":"test"}' | python3 -m json.tool
      ```
      Confirm the response has 6 `objectives` (Market Size, Competition,
      Customer Demand, Pricing, Team & Execution, Regulatory & Distribution
      Risk), all at `"confidence": "none"`.
- [ ] Copy the returned `id`, confirm cross-route sharing still works:
      ```bash
      curl -s "localhost:3000/api/workspace?id=<id>" | python3 -m json.tool
      ```
- [ ] With real keys set, test the objective-matching path:
      ```bash
      curl -s -X POST localhost:3000/api/research/add-source -H "Content-Type: application/json" \
        -d '{"workspaceId":"<id>","title":"test","url":"http://example.com","text":"The Kenyan swimwear market is valued at roughly KES 500 million, growing 8% annually driven by coastal tourism."}' \
        | python3 -m json.tool
      ```
      Confirm at least one objective's `confidence` moved off `"none"` and
      has a `summary` + `evidence` entry with a real quote.
- [ ] Capture a second, deliberately conflicting page for the same
      objective (different number, same topic) — confirm a `contradictions`
      entry appears on that objective with `status: "open"`.
- [ ] Resolve it:
      ```bash
      curl -s -X POST localhost:3000/api/research/resolve-contradiction -H "Content-Type: application/json" \
        -d '{"workspaceId":"<id>","objectiveId":"<objective id>","contradictionId":"<contradiction id>","decision":"keep_a"}'
      ```
      Confirm `status` flips to `"resolved"` and the objective's `summary`
      updates.

### Extension

- [ ] `cd extension && npm install`
- [ ] `cp .env.example .env` — set `VITE_BACKEND_URL=http://localhost:3000`
- [ ] `npx tsc --noEmit -p tsconfig.json` — should be clean
- [ ] `npm run build` — confirm `dist/manifest.json` exists and
      `host_permissions` includes your backend URL
- [ ] Load unpacked: `chrome://extensions` → enable **Developer mode** →
      **Load unpacked** → select `extension/dist`
- [ ] Click the toolbar icon → side panel opens (this is the first thing
      that's never actually been confirmed in a real browser — if it
      doesn't open, check the extension's service worker console via
      "Inspect views: service worker" on the `chrome://extensions` card)
- [ ] Confirm the 6 objectives render with "no evidence" badges
- [ ] Open any real webpage, click **Capture this page** in the side panel
      — confirm an objective updates with a real citation
- [ ] Open a second, contradicting page, capture it — confirm the amber
      contradiction banner appears under the right objective, with **Keep
      A / Keep B / Needs more research** buttons
- [ ] Click one of those buttons — confirm the banner clears and the
      objective's summary updates
- [ ] Open the chat sidebar, ask it to research one specific objective —
      confirm the activity feed shows a real Exa search (not instant —
      real network calls take a second or two) followed by evidence
      landing on the right objective
- [ ] Known gap, worth confirming it's still true: there's currently no UI
      field to set the research **question** directly — it stays
      "Untitled research" unless you use the secondary comparison-mode
      flow. Decide tonight/tomorrow whether that's worth a quick fix.
- [ ] Test the secondary comparison mode: expand "Optional: compare named
      competitors," type a question, click **Run automatically** — confirm
      the table fills with cited cells
- [ ] Click **↻ Refresh** after a chat action if the panel doesn't visibly
      update — confirm it pulls the latest state

## Part 2 — extension deployment considerations

**For tomorrow's demo, "deploying" means load-unpacked, not the Chrome Web
Store.** Store review takes days and isn't a live option. Two real
sub-decisions to make:

- **If judges only watch your video**: load-unpacked on your own machine is
  all you need — nothing else to prepare.
- **If judges might load and run it themselves** (check the submission
  rules for this): commit the **built** `extension/dist` folder to the
  repo, not just the source. Otherwise every judge needs Node installed and
  has to run `npm install && npm run build` themselves before they can even
  load it — real friction, and a real way for a reviewer to bail before
  seeing the demo. Committing `dist/` trades a bit of repo cleanliness for
  removing that entire failure mode.

**Things that would block a real Chrome Web Store submission later** (not
needed for tomorrow, but worth knowing so nobody's surprised):
- **No icons exist yet.** `manifest.config.ts` has no `icons` field and
  there are no `.png` files in the project at all. Chrome shows a generic
  puzzle-piece icon without one — fine for a demo, not acceptable for store
  submission (16/48/128px icons are required).
- **`host_permissions: ["<all_urls>"]` will get flagged in review.** It's
  fine for a hackathon (the content script needs to read whatever page
  you're on), but a real submission needs this scoped down or justified
  explicitly in the developer dashboard.
- **A privacy policy URL becomes required** once you're requesting
  broad host permissions + `storage` for a public listing.

**Backend deploy (Cloud Run) — two things to remember, both already fixed
in the code but worth re-confirming on the actual deploy**:
- Env vars set via `gcloud run deploy --set-env-vars` are runtime-only, not
  build-time — this was the whole point of the lazy-init fix in `llm.ts`;
  confirm the Cloud Run build step doesn't need any secret to succeed
  (it shouldn't, per the Part 1 test above).
- `EXTENSION_ORIGIN` — leave it at the default `*` for tomorrow. An
  unpacked extension's `chrome-extension://<id>` origin can change if it
  gets reloaded from a different path, so locking CORS down to one origin
  tonight is more likely to cause a confusing demo-day break than to add
  real security value for a hackathon backend with no auth/cookies anyway.
