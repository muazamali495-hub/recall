"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "off" | "on" | "blocked";

/** base64url (what VAPID gives us) → the Uint8Array the browser wants. */
function toUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * WhatsApp, Instagram, Facebook and friends open links in their own WebView,
 * which has no push service — subscribe() throws "push service error" and
 * nothing the student does inside that window can fix it. Tell them to open
 * Recall in the real browser instead.
 */
function inAppBrowser() {
  const ua = navigator.userAgent;
  // "; wv)" is how Android marks a WebView in its user agent.
  return /;\s*wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok|Twitter/i.test(ua);
}

/**
 * pushManager.subscribe() on Android Chrome, made to stick.
 *
 * Three ways it fails that have nothing to do with the student:
 *
 *   "push service error" / AbortError right after the service worker installs
 *   — Chrome has not finished talking to Google's push service yet. A second
 *   try a moment later usually works, so it gets three.
 *
 *   InvalidStateError — a subscription from an earlier VAPID key still exists
 *   on this browser. It is dropped and made afresh.
 *
 *   Anything else is surfaced with the browser's own words attached, because
 *   "Push error" on its own cannot be diagnosed.
 */
async function subscribeWithRetries(registration: ServiceWorkerRegistration, vapidKey: string) {
  const options = { userVisibleOnly: true, applicationServerKey: toUint8Array(vapidKey) };
  let last: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await registration.pushManager.subscribe(options);
    } catch (err) {
      last = err;
      const name = err instanceof Error ? err.name : "";

      if (name === "InvalidStateError") {
        const old = await registration.pushManager.getSubscription();
        await old?.unsubscribe().catch(() => {});
        continue;
      }

      if (name === "NotAllowedError") throw err;

      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  throw last;
}

function explain(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);

  if (name === "NotAllowedError") {
    return "Notifications are blocked for Recall. Allow them in your browser's site settings, then try again.";
  }
  if (/push service|could not connect|registration failed/i.test(raw) || name === "AbortError") {
    if (/Brave/i.test(navigator.userAgent) || "brave" in navigator) {
      return "Brave blocks Google's push service by default. Turn on \"Use Google services for push messaging\" in Brave settings → Privacy, then try again.";
    }
    return (
      "Your browser couldn't reach Google's push service. This is usually the Wi-Fi network — switch to mobile data and try again. " +
      "If it still fails: open Recall in Chrome itself (not inside WhatsApp or Instagram), check Google Play Services is on and updated, then try again."
    );
  }
  if (/service worker|sw\.js/i.test(raw)) {
    return "Recall's background worker couldn't start. Reload the page and try again.";
  }
  return raw || "Could not turn on reminders.";
}

export function EnableReminders({
  vapidKey,
  subscribedOnServer,
}: {
  vapidKey: string;
  subscribedOnServer: boolean;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<number | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then(async (sub) => {
        if (!sub) {
          setStatus("off");
          return;
        }

        // Re-register this device's endpoint every time.
        //
        // "Does this user have a subscription?" was the wrong question: with a
        // laptop and a phone on one account, the server can hold the phone's
        // endpoint while the laptop shows "reminders on" and never receives
        // anything. Re-sending is idempotent and guarantees the device you are
        // actually looking at is registered.
        try {
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub.toJSON()),
          });
          setStatus(res.ok ? "on" : "off");
        } catch {
          setStatus(subscribedOnServer ? "on" : "off");
        }
      })
      .catch(() => setStatus("off"));
  }, [subscribedOnServer]);

  const [detail, setDetail] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    setDetail(null);

    if (inAppBrowser()) {
      setError("Reminders can't be turned on inside this app's browser. Open recall-kohl-mu.vercel.app in Chrome (tap ⋮ → Open in browser) and try again.");
      setBusy(false);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }

      // Register (a no-op if already registered) and wait until it is
      // actually active — subscribing against an installing worker is one of
      // the ways Android produces "push service error".
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;

      const subscription = await subscribeWithRetries(registration, vapidKey);

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error === "Not signed in." ? "Your session expired. Sign in again." : "Could not save your subscription. Try again.");
      }

      setStatus("on");
    } catch (err) {
      setError(explain(err));
      // The browser's own words, small, so a screenshot is enough to diagnose.
      const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // Browser and install mode too — "push service error" reads the same
      // in Chrome, Brave and Samsung Internet, and each has a different fix.
      const ua = navigator.userAgent;
      const browser =
        /Brave/i.test(ua) || "brave" in navigator ? "Brave"
        : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
        : /OPR\//i.test(ua) ? "Opera"
        : /EdgA/i.test(ua) ? "Edge"
        : /Chrome/i.test(ua) ? "Chrome"
        : "other";
      const mode = window.matchMedia("(display-mode: standalone)").matches ? "installed app" : "browser tab";
      setDetail(`${raw} · ${browser}, ${mode}${/Android/i.test(ua) ? ", Android" : ""}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send.");

      // Saying how many devices it reached matters: a push that succeeds but
      // lands on a phone you are not holding looks identical to one that
      // failed.
      setSentTo(data.sent ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported") return null;

  // Already subscribed — offer a way to prove delivery works on a quiet week.
  if (status === "on") {
    return (
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          Reminders on
        </span>
        <button
          onClick={sendTest}
          disabled={busy}
          className="ml-auto rounded-lg border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          {busy ? "Sending…" : "Send a test"}
        </button>
        {sentTo !== null && !error && (
          <p className="w-full text-xs text-mint">
            {sentTo > 0
              ? `Sent to ${sentTo} device${sentTo === 1 ? "" : "s"}. If nothing appeared, check the notification settings for this browser.`
              : "Nothing to send to — turn reminders on again."}
          </p>
        )}

        {error && (
          <p role="alert" className="w-full text-xs text-amber">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-violet/25 bg-violet/[0.06] p-5">
      <p className="mb-1 text-sm font-semibold">Get told before it happens</p>
      <p className="mb-4 text-sm text-muted">
        {status === "blocked"
          ? "Notifications are blocked for this site. Allow them in your browser's site settings, then reload."
          : "Recall can nudge you before each class and before every quiz or assignment is due."}
      </p>

      {status !== "blocked" && (
        <button
          onClick={enable}
          disabled={busy}
          className="rounded-xl bg-mint px-5 py-2.5 text-sm font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          {busy ? "Turning on…" : "Turn on reminders"}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-amber">
          {error}
        </p>
      )}
      {detail && (
        <p className="mt-1.5 break-all font-mono text-[0.65rem] text-faint">{detail}</p>
      )}
    </div>
  );
}
