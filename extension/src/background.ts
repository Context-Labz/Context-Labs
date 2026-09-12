chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const panelPorts = new Set<chrome.runtime.Port>();

function broadcast(msg: unknown) {
  for (const port of panelPorts) {
    try {
      port.postMessage(msg);
    } catch {
      panelPorts.delete(port);
    }
  }
}

function isTrackable(url?: string) {
  if (!url) return false;
  return /^https?:/i.test(url);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "context-labs-save-highlight",
      title: "Save highlight to Context Labs",
      contexts: ["selection"],
    });
  });
});

chrome.action.onClicked.addListener(async () => {
  const window = await chrome.windows.getCurrent();
  if (window.id !== undefined) {
    chrome.sidePanel.open({ windowId: window.id }).catch(console.error);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "context-panel") return;
  panelPorts.add(port);
  port.onDisconnect.addListener(() => panelPorts.delete(port));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "context-labs-save-highlight") return;
  const text = info.selectionText?.trim();
  if (!text || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }, (page) => {
    if (chrome.runtime.lastError || !page) return;
    broadcast({
      type: "BROWSER_EVENT",
      event: {
        type: "highlight",
        title: page.title,
        url: page.url,
        text,
        pageText: page.bodyText,
      },
    });
  });
});

chrome.tabs.onActivated.addListener(async (info) => {
  if (!panelPorts.size) return;
  try {
    const tab = await chrome.tabs.get(info.tabId);
    if (!isTrackable(tab.url)) return;
    broadcast({
      type: "BROWSER_EVENT",
      event: {
        type: "tab_switch",
        title: tab.title || tab.url,
        url: tab.url,
      },
    });
  } catch {
    // ignore
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!panelPorts.size) return;
  if (changeInfo.status !== "complete" || !tab.active) return;
  if (!isTrackable(tab.url)) return;
  broadcast({
    type: "TAB_READY",
    tabId,
    title: tab.title,
    url: tab.url,
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CAPTURE_PAGE") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        sendResponse({ error: "No active tab found." });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }, (res) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: "Couldn't read this page (try reloading the tab)." });
          return;
        }
        sendResponse(res);
      });
    });
    return true;
  }

  if (msg?.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ title: tab?.title, url: tab?.url, id: tab?.id });
    });
    return true;
  }

  if (msg?.type === "OPEN_URL" && typeof msg.url === "string") {
    chrome.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "CONTENT_EVENT") {
    broadcast({ type: "BROWSER_EVENT", event: msg.event, tabId: sender.tab?.id });
    sendResponse({ ok: true });
  }
});
