import { RECALL_ORIGIN, SYNC_PERIOD_MINUTES, REMINDER_PERIOD_MINUTES } from "./config.js";

const ALARM = "recall-sync";
const REMINDER_ALARM = "recall-reminders";
const SLATE_ORIGIN = "https://slate.uol.edu.pk";

/**
 * Slate sits behind Cloudflare, which rejects anything that doesn't look
 * like the site's own traffic — servers AND extension-origin requests both
 * get a 403.
 *
 * So we don't fetch from here. We run the fetch *inside a Slate page*, where
 * it is a genuine same-origin request, indistinguishable from the calendar
 * UI asking for its own data.
 *
 * The calendar URL never leaves this machine. Recall receives only the
 * calendar contents.
 */

function scheduleSync() {
  chrome.alarms.create(ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES, delayInMinutes: 1 });
  chrome.alarms.create(REMINDER_ALARM, { periodInMinutes: REMINDER_PERIOD_MINUTES, delayInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(() => {
  scheduleSync();
  syncNow().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) syncNow().catch(() => {});
  if (alarm.name === REMINDER_ALARM) checkReminders().catch(() => {});
});

/**
 * Sync when the machine comes back to life.
 *
 * A six-hour alarm only fires while Chrome is actually running, and onStartup
 * only fires on a cold start — close the lid at night and reopen it in the
 * morning and neither happens, because Chrome never stopped. That is how a
 * "checks every six hours" sync ends up twenty hours stale.
 *
 * Returning to the keyboard is the moment a fresh answer starts mattering, so
 * that is when to look.
 */
chrome.idle.onStateChanged.addListener((state) => {
  if (state !== "active") return;
  syncIfStale().catch(() => {});
});

/**
 * Syncs only if the last successful one is old enough to be worth redoing.
 *
 * Without the floor this would fire every time the student walked back to
 * their laptop — Slate would see a burst of requests for no new information,
 * which is exactly the kind of traffic that gets an app blocked.
 */
async function syncIfStale(maxAgeMinutes = 60) {
  const { lastSyncAt } = await chrome.storage.local.get("lastSyncAt");
  if (lastSyncAt && Date.now() - lastSyncAt < maxAgeMinutes * 60_000) return null;

  return syncNow();
}

/**
 * Asks Recall whether anything is due. The server decides what to send and
 * records it, so running this often is harmless — a reminder already sent is
 * never sent twice.
 */
async function checkReminders() {
  const { deviceToken } = await chrome.storage.local.get("deviceToken");
  if (!deviceToken) return;

  await fetch(`${RECALL_ORIGIN}/api/reminders/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "SYNC_NOW":
      syncNow()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // keep the channel open for the async reply

    // Opening Recall is the moment the student wants current deadlines, and
    // it is a far better trigger than a timer that only ticks while Chrome
    // happens to be open. Rate-limited so a page refresh is not a Slate fetch.
    case "SYNC_IF_STALE":
      syncIfStale()
        .then((result) =>
          sendResponse(result ? { ok: true, synced: true, ...result } : { ok: true, synced: false }),
        )
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    // The website mints a device token once the student is signed in and
    // hands it over, so nobody has to copy a pairing code by hand.
    case "SET_TOKEN":
      chrome.storage.local.set({ deviceToken: message.token }).then(() =>
        sendResponse({ ok: true }),
      );
      return true;

    // Stored locally on purpose: Recall's server never receives this URL,
    // only the calendar contents it returns.
    case "SET_ICAL_URL":
      chrome.storage.local
        .set({ icalUrl: message.url })
        .then(() => syncNow())
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_STATE":
      chrome.storage.local.get(["deviceToken", "icalUrl", "status"]).then((s) =>
        sendResponse({
          paired: Boolean(s.deviceToken),
          hasCalendarUrl: Boolean(s.icalUrl),
          status: s.status ?? null,
        }),
      );
      return true;
  }
});

async function setStatus(patch) {
  const { status = {} } = await chrome.storage.local.get("status");
  await chrome.storage.local.set({ status: { ...status, ...patch, at: Date.now() } });
}

/** Runs inside the Slate page. Must be self-contained — it is serialised across. */
function fetchInPage(url) {
  return fetch(url, { credentials: "include", cache: "no-store" })
    .then(async (res) => ({ ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" }))
    .catch((e) => ({ ok: false, status: 0, text: "", error: String(e) }));
}

function waitForLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(async () => {
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        clearInterval(poll);
        return reject(new Error("Slate tab closed before it finished loading."));
      }
      if (tab.status === "complete") {
        clearInterval(poll);
        return resolve();
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        return reject(new Error("Slate took too long to load."));
      }
    }, 300);
  });
}

/** Uses an open Slate tab if there is one; otherwise opens a hidden one briefly. */
async function fetchIcsViaSlate(icalUrl) {
  const open = await chrome.tabs.query({ url: `${SLATE_ORIGIN}/*` });

  let tabId = open[0]?.id;
  let temporary = false;

  if (!tabId) {
    const tab = await chrome.tabs.create({ url: `${SLATE_ORIGIN}/my/`, active: false });
    tabId = tab.id;
    temporary = true;
    await waitForLoad(tabId);
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchInPage,
      args: [icalUrl],
    });

    const result = injection?.result;
    if (!result) throw new Error("Could not run inside Slate. Try opening Slate in a tab.");

    if (!result.ok) {
      throw new Error(
        result.status === 403
          ? "Slate refused the request. Open Slate, make sure you're logged in, then sync again."
          : `Slate returned ${result.status || "no response"}. Copy a fresh calendar link.`,
      );
    }

    return result.text;
  } finally {
    if (temporary) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

export async function syncNow() {
  const { deviceToken, icalUrl } = await chrome.storage.local.get(["deviceToken", "icalUrl"]);

  if (!deviceToken) throw new Error("Not paired with Recall yet.");
  if (!icalUrl) throw new Error("Add your Slate calendar link first.");

  let ics;
  try {
    ics = await fetchIcsViaSlate(icalUrl);
  } catch (err) {
    await setStatus({ ok: false, message: err.message });
    throw err;
  }

  if (!ics.includes("BEGIN:VCALENDAR")) {
    const message = ics.includes("login")
      ? "You're signed out of Slate. Log in, then sync again."
      : "That link didn't return a calendar. Copy it again from Slate.";
    await setStatus({ ok: false, message });
    throw new Error(message);
  }

  const res = await fetch(`${RECALL_ORIGIN}/api/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deviceToken}`, "Content-Type": "text/calendar" },
    body: ics,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error ?? "Recall rejected the sync.";
    await setStatus({ ok: false, message });
    throw new Error(message);
  }

  // Recorded here rather than on every attempt: this is the timestamp the
  // staleness check reads, and a failed fetch has not refreshed anything.
  await chrome.storage.local.set({ lastSyncAt: Date.now() });
  await setStatus({ ok: true, message: `Synced ${data.parsed ?? 0} events.` });
  return data;
}
