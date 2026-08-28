"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TAG = "recall-extension";

type Phase = "idle" | "checking" | "done" | "absent" | "failed";

/** "0.2.0" > "0.1.0", and 0.10.0 > 0.9.0 — which a string compare gets wrong. */
function isOlder(installed: string, latest: string): boolean {
  const a = installed.split(".").map(Number);
  const b = latest.split(".").map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

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
export function RefreshNow({
  lastSyncedAt,
  latestVersion,
  installUrl,
}: {
  lastSyncedAt: string | null;
  latestVersion: string;
  installUrl: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let settled = false;

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== TAG) return;

      // The extension announces itself on load; that is how we know this
      // device is the one that can talk to Slate.
      if (data.type === "READY") {
        if (typeof data.version === "string") setInstalledVersion(data.version);

        if (data.state?.paired && data.state?.hasCalendarUrl) {
          settled = true;
          setPhase("checking");
          window.postMessage({ target: TAG, type: "SYNC_IF_STALE" }, window.location.origin);
        }
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

  const outdated = installedVersion !== null && isOlder(installedVersion, latestVersion);

  /* An unpacked extension loads from a folder on disk. Reloading it at
     chrome://extensions re-reads that folder — it does not fetch anything — so
     hitting reload after an update genuinely changes nothing until the files
     underneath are replaced. That is invisible from Chrome's side: the version
     simply stays put, which looks like the reload failed. */
  const updateNotice = outdated ? (
    <div className="mt-4 rounded-xl border border-amber/25 bg-amber/[0.06] p-3.5">
      <p className="text-xs font-semibold text-amber">
        Extension {installedVersion} — version {latestVersion} is available
      </p>
      <p className="mt-1.5 text-xs text-muted">
        Reloading at <code className="text-faint">chrome://extensions</code> re-reads the folder
        you loaded it from; it doesn&apos;t download anything. Replace that folder&apos;s contents
        with the new download, keeping the same location, then reload. Same location matters —
        a new folder is a new extension to Chrome, and you&apos;d have to link it again.
      </p>
      {/* NEXT_PUBLIC_EXTENSION_URL points at the Web Store listing once there
          is one. Until then the packaged zip is the download, same fallback
          the first-run flow uses — an update notice with no way to update
          would be worse than no notice. */}
      <a
        href={installUrl ?? "/recall-extension.zip"}
        className="mt-2.5 inline-block rounded-lg border border-amber/30 px-3 py-1.5 text-xs font-medium text-amber transition hover:bg-amber/10"
      >
        Download {latestVersion}
      </a>
    </div>
  ) : null;

  // Nothing to offer on a device without the extension. The page already
  // explains that syncing belongs to the account, not to this device.
  if (phase === "absent") {
    return (
      <>
        <p className="mt-3 text-xs text-faint">
          Slate is checked from the computer with the extension, and only while
          Chrome is open there.{" "}
          {lastSyncedAt ? "Open Recall on that computer to refresh it now." : null}
        </p>
        {updateNotice}
      </>
    );
  }

  return (
    <>
      {updateNotice}
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
    </>
  );
}
