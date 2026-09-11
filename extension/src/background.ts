// Opens the side panel when the toolbar icon is clicked, and relays
// "capture this page" requests from the side panel to the active tab's
// content script (service workers have no DOM access of their own).
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
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
