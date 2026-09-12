# Context Labs — backend

API, agent runtime, and the playground UI. The Chrome extension in `../extension` talks to these routes.

```bash
cp .env.example .env.local
npm install
npm run dev          # http://127.0.0.1:43123
```

Keys are optional. Empty `OPENROUTER_API_KEY` / `EXA_API_KEY` uses a bundled corpus and keyword extraction so you can demo without credentials.

The playground at `/` is a split view: a fake browser (search, articles, highlights, tab switches) and the same agent panel the extension uses.

See the root `README.md` for the API table and the product loop.
