# Context Labs — Chrome extension

Manifest V3 side panel. This is the real product UI; the backend playground is the same loop in a regular tab.

```bash
cp .env.example .env    # VITE_BACKEND_URL=http://localhost:43123
npm install
npm run build
```

Load `dist/` as an unpacked extension. Click the toolbar icon to open the panel.

While the panel is open the content script:

- shows **Save highlight** on selected text (also a right-click menu)
- records **link clicks**
- reads Google/Bing/DuckDuckGo search queries
- the service worker records **tab switches**

None of that auto-posts page body text. Capture and highlight are explicit.
