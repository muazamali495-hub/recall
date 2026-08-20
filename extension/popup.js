import { RECALL_ORIGIN } from "./config.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");

function show(text, ok = true) {
  msg.textContent = text;
  msg.className = `msg ${ok ? "ok" : "bad"}`;
}

function hideMsg() {
  msg.className = "msg hidden";
}

async function render() {
  const { deviceToken, icalUrl, status } = await chrome.storage.local.get([
    "deviceToken",
    "icalUrl",
    "status",
  ]);

  $("pairView").classList.toggle("hidden", Boolean(deviceToken));
  $("mainView").classList.toggle("hidden", !deviceToken);

  if (icalUrl) $("url").value = icalUrl;
  if (status?.message) show(status.message, status.ok);
  else hideMsg();
}

$("pairBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (!code) return show("Enter the code from Recall.", false);

  $("pairBtn").disabled = true;
  show("Linking…");

  try {
    const res = await fetch(`${RECALL_ORIGIN}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, label: "Chrome extension" }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error ?? "Could not link.");

    await chrome.storage.local.set({ deviceToken: data.token, status: null });
    show("Linked. Now add your Slate calendar link.");
    await render();
  } catch (err) {
    show(err.message, false);
  } finally {
    $("pairBtn").disabled = false;
  }
});

$("url").addEventListener("change", async () => {
  const value = $("url").value.trim();
  if (!value) return;

  if (!value.startsWith("https://")) return show("The link must start with https://", false);

  await chrome.storage.local.set({ icalUrl: value });
  show("Saved. Hit “Sync now” to try it.");
});

$("syncBtn").addEventListener("click", async () => {
  $("syncBtn").disabled = true;
  show("Checking Slate…");

  const reply = await chrome.runtime.sendMessage({ type: "SYNC_NOW" });

  if (reply?.ok) show(`Synced ${reply.parsed ?? 0} events to Recall.`);
  else show(reply?.error ?? "Sync failed.", false);

  $("syncBtn").disabled = false;
});

$("unpairBtn").addEventListener("click", async () => {
  await chrome.storage.local.clear();
  hideMsg();
  await render();
});

render();
