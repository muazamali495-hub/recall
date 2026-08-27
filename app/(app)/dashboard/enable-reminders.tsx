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

  async function enable() {
    setBusy(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) throw new Error("Could not save your subscription.");

      setStatus("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn on reminders.");
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
    </div>
  );
}
