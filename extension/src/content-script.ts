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
