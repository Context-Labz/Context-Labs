import { defineManifest } from "@crxjs/vite-plugin";

// UNVERIFIED: @crxjs/vite-plugin is the common MV3+Vite+React combo, but I
// haven't compile-verified this against the beta version pinned in
// package.json — check its quickstart if `npm run dev` errors on this file.
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:3000";

export default defineManifest({
  manifest_version: 3,
  name: "Context Labs",
  version: "0.2.0",
  description: "A quiet research agent that reads highlights, tabs, and link clicks in your browser.",
  action: { default_title: "Open Context Labs" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [
    { matches: ["<all_urls>"], js: ["src/content-script.ts"], run_at: "document_idle" },
  ],
  permissions: ["sidePanel", "activeTab", "scripting", "storage", "tabs", "contextMenus"],
  host_permissions: ["<all_urls>", `${BACKEND_URL}/*`],
});
