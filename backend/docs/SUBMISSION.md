# Submission checklist (due end of day)

- [ ] **Title:** Research Room — an agent that researches inside your workspace
- [ ] **Description:** lead with the two rubric hooks — (1) environment is
      load-bearing (the browser IS the agent's context — it can read the
      page you're already on, not just search the web), (2) no claim without
      a source + human-in-the-loop gap resolution.
      Name-check sponsors ACTUALLY used: CopilotKit, OpenAI, OpenRouter,
      Exa, Trigger.dev, Google Cloud Run. Don't claim Mozilla — as built this
      is a Chrome/Edge `side_panel` extension, not a Firefox one; only
      mention Mozilla if a Firefox variant actually ships.
- [ ] **Public GitHub repo:** two top-level folders, `backend/` and
      `extension/`, each with its own README; root README links both plus
      the architecture diagram, demo GIF, and an honest "what we'd build
      next" section (Auth0 workspaces, Postgres, realtime chat→panel sync,
      Firefox support).
- [ ] **2-minute video:** follow docs/DEMO_SCRIPT.md beats exactly.
- [ ] **Social post:** tag event partners + sponsors, 30–60s vertical cut of Beat 3.
- [ ] **Repo hygiene:** `.env.local` never committed; `typecheck` clean;
      no `console.log` spam.
