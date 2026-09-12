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

  if (msg?.type === "GET_PAGE_TEXT") {
    const text = document.body?.innerText?.slice(0, 4000) ?? "";
    sendResponse({
      title: document.title,
      url: window.location.href,
      text,
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

// Text selection capture: when user highlights text, offer to save as evidence
document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";

  // Only notify if there's actual text selected (at least 10 chars)
  if (selectedText.length >= 10) {
    chrome.runtime.sendMessage({
      type: "HIGHLIGHT_DETECTED",
      text: selectedText,
      url: window.location.href,
      title: document.title,
    });
  }
});

// Link click tracking: log clicked links to activity feed
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const link = target.closest("a");

  if (link?.href) {
    // Skip internal anchors and javascript: links
    if (link.href.startsWith("#") || link.href.startsWith("javascript:")) return;

    chrome.runtime.sendMessage({
      type: "LINK_CLICKED",
      url: link.href,
      text: link.textContent?.trim() || link.href,
      pageUrl: window.location.href,
    });
  }
});
