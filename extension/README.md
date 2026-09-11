# Research Room — browser extension (side panel)

Chrome/Edge Manifest V3 extension. The side panel is the entire workspace UI
(table, sources, gaps, report, chat) — the `backend/` package next to this
one is API + agent runtime only, no UI of its own.

## Run it

```bash
npm install
cp .env.example .env   # set VITE_BACKEND_URL (localhost:3000 while developing)
npm run build           # crxjs needs a build to produce a loadable dist/
```

Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked**
→ select this folder's `dist/`.

Click the toolbar icon to open the side panel. It creates a workspace on the
backend automatically on first open (see `src/sidepanel/App.tsx`) and
remembers it in `chrome.storage.local` for next time.

## Files that matter

- `manifest.config.ts` — MV3 manifest as TS (via `@crxjs/vite-plugin`), so
  `VITE_BACKEND_URL` can be baked into `host_permissions` at build time.
- `src/background.ts` — service worker; opens the panel, relays page-capture
  requests to the active tab (service workers can't touch the DOM directly).
- `src/content-script.ts` — reads the active tab's title/url/selected text
  on request.
- `src/sidepanel/App.tsx` — the whole UI. Creates/reattaches the workspace,
  hosts the CopilotKit chat, wires the "Run automatically" deterministic
  fallback and the "Capture this page" button.
- `src/lib/api.ts` — the only place that talks to the backend; every call
  returns the full workspace so the UI never needs to hand-merge partial
  updates (this was a real bug in the original single-app scaffold — see
  the root `CHANGELOG.md`).

## Known limitations

- **Chrome/Edge only.** `side_panel` doesn't exist in Firefox — that would
  need a separate `sidebar_action` manifest and its own testing pass.
- **No live push from chat to the panel.** A tool call updates the backend;
  the panel re-reads it on the "↻ Refresh" button, on capture, or on "Run
  automatically" — not automatically mid-chat. Click refresh during a demo
  if a chat-driven table update doesn't appear.
- **`@crxjs/vite-plugin` version is unverified against this exact React 19 /
  Vite 5 combo** — budget real time for `npm install`/`npm run build` to
  possibly need a version bump tonight.
