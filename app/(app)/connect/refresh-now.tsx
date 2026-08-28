"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TAG = "recall-extension";

type Phase = "idle" | "checking" | "done" | "absent" | "failed";

/**
 * Refreshes Slate from whichever device is looking at this page.
 *
 * The extension's own schedule is a six-hour alarm, and Chrome only fires
 * alarms while it is running — so "checks every six hours" silently becomes
 * "checks whenever Chrome happens to be awake", which is how a sync ends up a
 * day old. Opening Recall is the moment fresh deadlines actually matter, so it
 * is a better trigger than any timer.
 *
 * The request is SYNC_IF_STALE rather than SYNC_NOW: the extension decides
 * whether it is really due, so re-loading this page does not mean re-fetching
 * from Slate. The button is there for when the student wants it regardless.
 */
export function RefreshNow({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let settled = false;

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== TAG) return;

      // The extension announces itself on load; that is how we know this
      // device is the one that can talk to Slate.
      if (data.type === "READY" && data.state?.paired && data.state?.hasCalendarUrl) {
        settled = true;
        setPhase("checking");
        window.postMessage({ target: TAG, type: "SYNC_IF_STALE" }, window.location.origin);
        return;
      }

      if (data.type === "RESULT" && data.inResponseTo === "SYNC_IF_STALE") {
        if (!alive) return;
        const payload = data.payload;

        if (payload?.ok === false) {
          setPhase("failed");
          setMessage(payload.error ?? "Could not reach Slate.");
          return;
        }

        setPhase("done");
        // Only reload when something actually changed; a no-op refresh would
        // just make the page flicker on every visit.
        if (payload?.synced) {
          setMessage(`Checked just now — ${payload.parsed ?? 0} found.`);
          router.refresh();
        }
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ target: TAG, type: "PING" }, window.location.origin);

    // No answer means no extension on this device, which is normal — most
    // people read this page on their phone.
    const timer = setTimeout(() => {
      if (!settled && alive) setPhase("absent");
    }, 1200);

    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  function checkNow() {
    setPhase("checking");
    setMessage(null);
    window.postMessage({ target: TAG, type: "SYNC_NOW" }, window.location.origin);

    // A sync can legitimately take a while — it may have to open a Slate tab
    // and wait for it to load — but it must not hang on "Checking…" forever if
    // nothing is listening.
    const giveUp = setTimeout(() => {
      window.removeEventListener("message", onDone);
      setPhase("failed");
      setMessage("No answer from the extension. Reload it at chrome://extensions.");
    }, 45_000);

    // SYNC_NOW replies under its own name.
    function onDone(event: MessageEvent) {
      const data = event.data;
      if (!data || data.source !== TAG || data.inResponseTo !== "SYNC_NOW") return;
      window.removeEventListener("message", onDone);
      clearTimeout(giveUp);

      if (data.payload?.ok === false) {
        setPhase("failed");
        setMessage(data.payload.error ?? "Could not reach Slate.");
        return;
      }
      setPhase("done");
      setMessage(`Checked just now — ${data.payload?.parsed ?? 0} found.`);
      router.refresh();
    }

    window.addEventListener("message", onDone);
  }

  // Nothing to offer on a device without the extension. The page already
  // explains that syncing belongs to the account, not to this device.
  if (phase === "absent") {
    return (
      <p className="mt-3 text-xs text-faint">
        Slate is checked from the computer with the extension, and only while
        Chrome is open there. {lastSyncedAt ? "Open Recall on that computer to refresh it now." : null}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        onClick={checkNow}
        disabled={phase === "checking"}
        className="rounded-lg border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        {phase === "checking" ? "Checking Slate…" : "Check now"}
      </button>

      {message && (
        <p className={`text-xs ${phase === "failed" ? "text-amber" : "text-mint"}`}>{message}</p>
      )}
    </div>
  );
}
