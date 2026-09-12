# Start here

Context Labs — an in-browser research agent.

**Try it without installing anything**

```bash
cd backend
cp .env.example .env.local
npm install
npm run dev
```

Open http://127.0.0.1:43123 — simulated browser on the left, agent on the right.

**Then load the Chrome extension**

```bash
cd extension
cp .env.example .env
npm install
npm run build
```

`chrome://extensions` → Developer mode → Load unpacked → `extension/dist`.

The loop: set a topic → highlight / click / switch tabs → suggested reads + comparison table → **End research** for a summary of everything the panel showed.
