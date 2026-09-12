# Testing

## Playground

```bash
cd backend && npm install && npm run dev
```

Open http://127.0.0.1:43123.

- Search is pre-filled. Click a result (link click).
- Select a sentence (highlight), click **Save highlight**.
- Switch the simulated tabs.
- Confirm the plan picks up Market Size / Pricing / Team.
- Open Coastal Brands then Soko Swim — a pricing contradiction should appear.
- **End research** — the summary lists plan, highlights, sources, trail.

## Extension

```bash
cd extension && npm install && npm run build
```

Load `extension/dist`. Backend must be running on 43123.

- Open Google, search anything — the panel notices the query.
- Highlight text on an article — “Save highlight” chip.
- Right-click selection → Save highlight to Context Labs.
- Click a link, switch tabs — trail updates.
- End research → summary.
