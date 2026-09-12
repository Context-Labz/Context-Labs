const CHIP_ID = "__context_labs_chip";

function pagePayload() {
  const selection = window.getSelection()?.toString() ?? "";
  return {
    title: document.title,
    url: window.location.href,
    selectedText: selection,
    bodyText: selection || document.body.innerText.slice(0, 8000),
  };
}

function sendEvent(event: { type: string; title?: string; url?: string; text?: string; pageText?: string }) {
  chrome.runtime.sendMessage({
    type: "CONTENT_EVENT",
    event: {
      title: document.title,
      url: window.location.href,
      ...event,
    },
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_PAGE_CONTEXT") {
    sendResponse(pagePayload());
  }
  if (msg?.type === "GET_PAGE_TEXT") {
    sendResponse({
      title: document.title,
      url: window.location.href,
      text: document.body?.innerText?.slice(0, 4000) ?? "",
    });
  }
});

(function detectSearchQuery() {
  const hostname = window.location.hostname.toLowerCase();
  const isSearchPage = hostname.includes("google.") || hostname.includes("bing.") || hostname.includes("duckduckgo.");
  if (!isSearchPage) return;
  const url = new URL(window.location.href);
  const query = url.searchParams.get("q");
  if (query) {
    sendEvent({ type: "search", text: query, title: document.title, url: window.location.href });
  }
})();

document.addEventListener(
  "click",
  (e) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.href;
    if (!/^https?:/i.test(href)) return;
    sendEvent({
      type: "link_click",
      title: (a.innerText || a.getAttribute("aria-label") || href).trim().slice(0, 120),
      url: href,
      text: a.innerText.trim().slice(0, 160),
    });
  },
  true,
);

function removeChip() {
  document.getElementById(CHIP_ID)?.remove();
}

function showChip(x: number, y: number, text: string) {
  removeChip();
  const host = document.createElement("div");
  host.id = CHIP_ID;
  host.style.cssText = `position:fixed;left:${Math.min(x, window.innerWidth - 160)}px;top:${Math.max(8, y)}px;z-index:2147483647;`;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      button {
        font: 12px/1.2 ui-sans-serif, system-ui, sans-serif;
        background: #1a1612;
        color: #f3efe7;
        border: 1px solid #d4a574;
        border-radius: 999px;
        padding: 6px 10px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      button:hover { background: #2a241c; }
    </style>
    <button type="button">Save highlight</button>
  `;
  shadow.querySelector("button")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    sendEvent({
      type: "highlight",
      text,
      pageText: document.body.innerText.slice(0, 8000),
    });
    removeChip();
    window.getSelection()?.removeAllRanges();
  });
  document.documentElement.appendChild(host);
}

document.addEventListener("mouseup", () => {
  const text = window.getSelection()?.toString().trim() ?? "";
  if (text.length < 8) {
    removeChip();
    return;
  }
  const range = window.getSelection()?.getRangeAt(0);
  const rect = range?.getBoundingClientRect();
  if (!rect) return;
  showChip(rect.left, rect.bottom + 8, text);
});

document.addEventListener("mousedown", (e) => {
  const host = document.getElementById(CHIP_ID);
  if (host && e.composedPath().includes(host)) return;
  if (!(e.target as HTMLElement)?.closest?.(`#${CHIP_ID}`)) {
    // keep chip if clicking it (shadow path handled above)
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") removeChip();
});
