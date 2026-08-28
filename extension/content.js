/**
 * Bridge between the Recall website and this extension.
 *
 * Without it, connecting Slate meant the student copying a pairing code from
 * one window into another — friction for something both halves already know.
 * A web page cannot message an extension without knowing its ID (which changes
 * for unpacked installs), and it certainly cannot open extension settings. But
 * a content script runs *inside* the page, so it can simply announce itself and
 * relay what the page hands over.
 *
 * This script only runs on Recall's own origins, declared in the manifest.
 */

const TAG = "recall-extension";

/** Page → extension. Only same-window, same-origin messages are honoured. */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const msg = event.data;
  if (!msg || msg.target !== TAG) return;

  switch (msg.type) {
    case "PING":
      announce();
      break;

    case "SET_TOKEN":
      if (typeof msg.token === "string" && msg.token.length > 10) {
        chrome.runtime.sendMessage({ type: "SET_TOKEN", token: msg.token }, () => reply(msg.type));
      }
      break;

    case "SET_ICAL_URL":
      // The URL goes straight into extension storage. It is deliberately not
      // sent to Recall's server — only the calendar's contents ever are.
      if (typeof msg.url === "string" && msg.url.startsWith("https://")) {
        chrome.runtime.sendMessage({ type: "SET_ICAL_URL", url: msg.url }, (res) =>
          reply(msg.type, res),
        );
      }
      break;

    case "SYNC_NOW":
      chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (res) => reply(msg.type, res));
      break;

    // Fired when the student opens Recall. The background script decides
    // whether it is actually due, so refreshing the page costs Slate nothing.
    case "SYNC_IF_STALE":
      chrome.runtime.sendMessage({ type: "SYNC_IF_STALE" }, (res) => reply(msg.type, res));
      break;
  }
});

/** Extension → page. */
function reply(inResponseTo, payload) {
  window.postMessage(
    { source: TAG, type: "RESULT", inResponseTo, payload: payload ?? null },
    window.location.origin,
  );
}

function announce() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
    window.postMessage(
      {
        source: TAG,
        type: "READY",
        version: chrome.runtime.getManifest().version,
        state: state ?? null,
      },
      window.location.origin,
    );
  });
}

// The page may mount before or after this script runs, so announce on load and
// answer PINGs afterwards.
announce();
