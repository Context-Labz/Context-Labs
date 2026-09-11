import { defineManifest } from "@crxjs/vite-plugin";

// UNVERIFIED: @crxjs/vite-plugin is the common MV3+Vite+React combo, but I
// haven't compile-verified this against the beta version pinned in
// package.json — check its quickstart if `npm run dev` errors on this file.
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:3000";

export default defineManifest({
  manifest_version: 3,
  name: "Research Room",
  version: "0.1.0",
  description: "An agent that researches inside your browser workspace.",
  action: { default_title: "Open Research Room" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [
    { matches: ["<all_urls>"], js: ["src/content-script.ts"], run_at: "document_idle" },
  ],
  // <all_urls> is broad — fine for a hackathon demo, scope this down to
  // specific sites before any real submission/publish.
  permissions: ["sidePanel", "activeTab", "scripting", "storage"],
  host_permissions: ["<all_urls>", `${BACKEND_URL}/*`],
});
