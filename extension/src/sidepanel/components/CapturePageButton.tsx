import { useState } from "react";
import { api } from "@/lib/api";

// The argument for a browser extension over a web app, in one control: the
// agent gets the page you are actually looking at, not what a search index
// returns. It sits directly under the objectives board because capturing is
// the primary action, not a utility tucked in a toolbar.
export default function CapturePageButton({
  workspaceId,
  onCaptured,
}: {
  workspaceId: string;
  onCaptured: () => void;
}) {
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProvider, setShowProvider] = useState(false);

  const capture = () => {
    setBusy(true);
    chrome.runtime.sendMessage({ type: "CAPTURE_PAGE" }, async (page) => {
      if (!page || page.error) {
        alert(page?.error ?? "Couldn't read the current page.");
        setBusy(false);
        return;
      }
      try {
        await api.addCapturedSource(
          workspaceId,
          { title: page.title, url: page.url, text: page.bodyText },
          provider || undefined
        );
        onCaptured();
      } catch (err) {
        // Was "check the backend logs" for every failure, including the blank
        // 500 the schema bug produced. The backend now returns the real cause.
        alert(`Couldn't save this page — ${err instanceof Error ? err.message : String(err)}`);
        onCaptured(); // the source itself is still recorded; pull the updated activity log
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="rule-top px-4 py-3">
      <button onClick={capture} disabled={busy} className="btn btn-primary w-full">
        {busy ? "Reading this page" : "Save this page as evidence"}
      </button>

      {showProvider ? (
        <input
          autoFocus
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="Company this page is about"
          className="field mt-2"
        />
      ) : (
        <button onClick={() => setShowProvider(true)} className="btn btn-quiet mt-2 w-full">
          Name a company first
        </button>
      )}
    </div>
  );
}
