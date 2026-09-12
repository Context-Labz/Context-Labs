# Context Labs

A research agent that lives in the browser, not a chat tab.

Type a topic, then work as you already do: search, click links, switch tabs, highlight a sentence. The agent files that context against a standing research plan, suggests the next few reads, fills a comparison table when you ask, and — when you end the session — summarizes everything that was on the panel. No chat sidebar. No dump of tokens.

The Chrome side panel is the product. This repo also ships a **browser playground** so you can try the same loop without loading an unpacked extension.

## What’s in the repo

- `backend/` — Next.js API + agent runtime + playground UI (`npm run dev` on port **43123**)
- `extension/` — Chrome/Edge Manifest V3 side panel

The agent watches four browser signals:

| Signal | What it does |
|---|---|
| **Search** | Reads `?q=` on Google/Bing/DuckDuckGo and maps it to the topic |
| **Highlight** | Floating “Save highlight” chip + right-click “Save highlight to Context Labs” |
| **Link click** | Records the URL and label in the trail |
| **Tab switch** | Notes that you moved, and offers “Save page” if it looks like evidence |

It answers with, and only with:

- a short list of **suggested reads**
- a **research plan** (confidence per objective, contradictions called out)
- an optional **comparison table**
- a **session summary** of everything the panel actually showed

## Run the playground

```bash
cd backend
cp .env.example .env.local   # keys optional — works without them
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Without `OPENROUTER_API_KEY` / `EXA_API_KEY` the agent uses a bundled research corpus and a keyword extractor. With keys it uses OpenRouter + Exa for live extraction and search.

## Load the extension

```bash
cd extension
cp .env.example .env         # VITE_BACKEND_URL=http://localhost:43123
npm install
npm run build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.

Pin the icon, open a tab, click it. The side panel is the whole UI.

## Typical loop

1. Set a topic (or just search Google — the query is noticed).
2. Open a result. Highlight a number, save it. Or **Save page**.
3. Follow a link; switch to another tab. The trail updates.
4. Suggested reads appear. Click one.
5. If two sources disagree, pick Keep A / Keep B / Need more.
6. **Build table** when you want a side-by-side.
7. **End research** — you get a summary of the plan, table, highlights, sources, and trail.

## API

| Route | Purpose |
|---|---|
| `POST /api/workspace` | Create a workspace |
| `GET /api/workspace?id=` | Read one |
| `PATCH /api/workspace` | Set the topic (refreshes suggestions) |
| `POST /api/research/event` | Ingest highlight / tab / click / search |
| `POST /api/research/add-source` | Capture the current page |
| `POST /api/research/suggest` | Refresh suggested reads |
| `POST /api/research/fill-objective` | Search the web for one empty plan item |
| `POST /api/research/start` | Build the comparison table |
| `POST /api/research/complete` | Session summary of everything on the panel |
| `POST /api/research/resolve-contradiction` | Keep A / Keep B / need more |
| `POST /api/research/resolve-gap` | Leave blank or use a secondary source |

## Privacy

Page text is sent to the backend only after you confirm (Save page / Save highlight). Tab switches and link clicks send title + URL only. Recognition runs while the panel is open.
