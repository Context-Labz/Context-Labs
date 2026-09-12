# Start here

Team Tuhame — Research Room, for AI Tinkerers Nairobi (12 Sept 2026).

**If you're catching up on this project, read these three, in order:**

1. `docs/AGENT_VISION.md` — what we're building and WHY (the ambient
   VC-diligence agent, not a chatbox). Read this first.
2. `backend/docs/DEMO_SCRIPT.md` — the 2-minute video we're building toward.
   Read this to understand the target.
3. `docs/TESTING_AND_DEPLOYMENT.md` — how to run it locally, step by step.

Then, for reference as you build:

- `backend/docs/DAY_PLAN.md` — hour-by-hour, team split, cut ladder.
- `backend/docs/ARCHITECTURE.md` — how backend + extension fit together.
- `CHANGELOG.md` — what changed and why, across the prep sessions. Read the
  "Round 2/3" sections to understand what's already been verified vs. what
  hasn't.

## What this repo is

A **prepared scaffold**, built before the event. It typechecks and builds
clean, but **has never run against real API keys or in a real browser** —
making it actually work is tomorrow's first job, and it counts as building.

Prepared before the event: scaffolding, API routes, UI shell, the
objectives/confidence/contradiction data model, docs.
To be built DURING the event: first working run + bug fixes, the ambient
browser-native features (search recognition, page badges, highlight-to-note
— see AGENT_VISION.md build order), demo, submission.

## Two packages

- `backend/` — Next.js API + agent runtime. Deploys to Cloud Run.
- `extension/` — Chrome/Edge MV3 side panel. The UI.

cd extension && npm run build — this produces the extension/dist/ folder. Confirm that folder exists and has a manifest.json inside it.
Open chrome://extensions (or edge://extensions).
Turn on Developer mode — toggle, top-right. Nothing loads without this.
Click Load unpacked (top-left) and select the extension/dist folder — not the extension/ root, the dist subfolder specifically. This is the most common mistake.
Now it appears in the list, as "Research Room." Pin it (the puzzle-piece icon in the toolbar → pin) so the icon is visible.
Click the icon → the side panel should open.
