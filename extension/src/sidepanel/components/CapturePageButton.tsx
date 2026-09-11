import { useState } from "react";
import { api } from "@/lib/api";

// New: this is the actual argument for "browser extension" over "web app"
// — the agent can be handed the real content of the tab the user is
// looking at, instead of relying only on Exa's index. Messages the
// background worker (which asks the active tab's content script for
// title/url/selection), then posts it to /api/research/add-source.
export default function CapturePageButton({ workspaceId, onCaptured }: { workspaceId: string; onCaptured: () => void }) {
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);

  const capture = () => {
    setBusy(true);
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page) => {
      if (!page || page.error) {
        alert(page?.error ?? "Could not read the current page.");
        setBusy(false);
        return;
      }
      try {
        await api.addCapturedSource(workspaceId, { title: page.title, url: page.url, text: page.bodyText }, provider || undefined);
        onCaptured();
      } catch {
        alert("Couldn't save this page — check the backend logs.");
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        placeholder="Which provider is this page about? (optional)"
        className="border rounded px-2 py-1 flex-1"
      />
      <button onClick={capture} disabled={busy} className="px-2 py-1 bg-zinc-800 text-white rounded disabled:opacity-50 whitespace-nowrap">
        {busy ? "Capturing…" : "Capture this page"}
      </button>
    </div>
  );
}
