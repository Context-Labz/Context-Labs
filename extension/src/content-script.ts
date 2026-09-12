// Reports the current page's title, url, and any selected text back to the
// side panel on request. This is the actual point of the extension: the
// agent can work from what the user is already looking at, not just from
// a generic web search.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_PAGE_CONTEXT") {
    const selection = window.getSelection()?.toString() ?? "";
    sendResponse({
      title: document.title,
      url: window.location.href,
      selectedText: selection,
      bodyText: selection || document.body.innerText.slice(0, 8000),
    });
  }
});

// Search recognition: detect Google/Bing search queries and notify the panel
(function detectSearchQuery() {
  const hostname = window.location.hostname.toLowerCase();
  const isSearchPage = hostname.includes("google.") || hostname.includes("bing.");

  if (isSearchPage) {
    const url = new URL(window.location.href);
    const query = url.searchParams.get("q");

    if (query) {
      chrome.runtime.sendMessage({ type: "SEARCH_DETECTED", query });
    }
  }
})();

// ─────────────────────────────────────────────────────────────────────────
// TOMORROW (build during event) — ambient recognition. See AGENT_VISION.md
// "The agent we're actually building". These are the browser-native, NO-AI
// features that make this more than a docked chatbox. Intentionally left as
// stubs so the scaffold builds clean and these are net-new commits tomorrow.
//
// #1 SEARCH RECOGNITION: on a Google/Bing results page, read the query from
//    the URL (?q=) and message the panel to map it to an objective. No AI.
//      e.g. const q = new URL(location.href).searchParams.get("q");
//
// #2 PAGE KEYWORD BADGE: on page load, plain keyword-match document.body
//    text against a small per-objective vocabulary (fetch the current
//    objectives from the panel/backend), and if it hits, message the panel
//    to show a "looks like evidence for <objective> — save?" badge. Only
//    AFTER the user confirms does the panel call /api/research/add-source.
//    No AI in THIS file — the LLM extraction stays server-side, gated on
//    confirmation.
//
// Guardrail (product + Usefulness rubric): only run the above while the
// side panel is open ("research mode"), and never auto-send page text —
// propose, let the analyst confirm. VC deal flow is confidential.
// ─────────────────────────────────────────────────────────────────────────
