// Opens the side panel when the toolbar icon is clicked, and relays
// "capture this page" requests from the side panel to the active tab's
// content script (service workers have no DOM access of their own).

// FIX: setPanelBehavior must run on every service worker startup, not just
// onInstalled — the service worker can restart without being reinstalled
// (e.g., after the browser restarts or the worker goes idle), and the
// behavior setting doesn't persist. Call it at the top level so it runs
// on every worker init.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
  // Initial setup can go here if needed in the future
  console.log("Research Room extension installed");
});

// Explicit click handler as a fallback: if setPanelBehavior somehow doesn't
// work, this ensures the icon click always opens the panel. chrome.sidePanel.open()
// requires a windowId, which we get from the current window.
chrome.action.onClicked.addListener(async () => {
  const window = await chrome.windows.getCurrent();
  if (window.id !== undefined) {
    chrome.sidePanel.open({ windowId: window.id }).catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CAPTURE_PAGE") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) { sendResponse({ error: "No active tab found." }); return; }
      chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }, (res) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: "Couldn't read this page (try reloading the tab)." });
          return;
        }
        sendResponse(res);
      });
    });
    return true; // keep the message channel open for the async sendResponse above
  }
});
