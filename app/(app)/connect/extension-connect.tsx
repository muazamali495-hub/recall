"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TAG = "recall-extension";

type ExtState = { paired: boolean; hasCalendarUrl: boolean; status?: { ok: boolean; message: string } | null };

type Phase =
  | "looking" // waiting to hear from the extension
  | "missing" // not installed
  | "linking" // minting and handing over a device token
  | "needs-url" // installed and linked, waiting for the calendar link
  | "syncing"
  | "done";

/**
 * Connecting Slate, without anyone copying a code.
 *
 * The extension injects a content script into this page, so it can announce
 * itself and accept what we hand it. That removes the pairing code entirely:
 * the page already knows who is signed in, so it mints a device token and
 * passes it straight over.
 *
 * A page cannot open extension settings — Chrome forbids navigating to
 * chrome:// URLs — so there is nothing to open. There is nothing left to
 * configure by hand.
 */
export function ExtensionConnect({ installUrl }: { installUrl: string | null }) {
  const [phase, setPhase] = useState<Phase>("looking");
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const linkingRef = useRef(false);

  const send = useCallback((message: Record<string, unknown>) => {
    window.postMessage({ target: TAG, ...message }, window.location.origin);
  }, []);

  /** Gets a device token for this student and hands it to the extension. */
  const link = useCallback(async () => {
    if (linkingRef.current) return;
    linkingRef.current = true;
    setPhase("linking");
    setError(null);

    try {
      const res = await fetch("/api/pair/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Chrome extension" }),
      });

      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error ?? "Could not link the extension.");

      send({ type: "SET_TOKEN", token: data.token });
      setPhase("needs-url");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link the extension.");
      setPhase("needs-url");
    } finally {
      linkingRef.current = false;
    }
  }, [send]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;

      const msg = event.data;
      if (!msg || msg.source !== TAG) return;

      if (msg.type === "READY") {
        const state = (msg.state ?? null) as ExtState | null;

        if (!state?.paired) {
          void link();
        } else if (!state.hasCalendarUrl) {
          setPhase("needs-url");
        } else {
          setPhase("done");
        }
      }

      if (msg.type === "RESULT" && msg.inResponseTo === "SET_ICAL_URL") {
        const payload = msg.payload as { ok?: boolean; parsed?: number; error?: string } | null;

        if (payload?.ok) {
          setSynced(payload.parsed ?? 0);
          setPhase("done");
        } else {
          setError(payload?.error ?? "Saved, but the first sync failed. Try Sync now.");
          setPhase("needs-url");
        }
      }
    }

    window.addEventListener("message", onMessage);
    send({ type: "PING" });

    // No answer means the extension isn't there. Content scripts run at
    // document_idle, so give it a moment before saying so.
    const timer = setTimeout(() => {
      setPhase((p) => (p === "looking" ? "missing" : p));
    }, 1500);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, [link, send]);

  function saveUrl() {
    const value = url.trim();

    if (!value.startsWith("https://")) {
      setError("The link must start with https://");
      return;
    }
    if (!value.includes("export_execute.php")) {
      setError("That doesn't look like a calendar export link. Copy it from Slate → Calendar → Export.");
      return;
    }

    setError(null);
    setPhase("syncing");
    send({ type: "SET_ICAL_URL", url: value });
  }

  /* ---------------- Not installed ---------------- */
  if (phase === "looking" || phase === "missing") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6">
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
          Step 1
        </p>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Add the Recall extension</h2>
        <p className="mb-5 text-sm text-muted">
          Slate only accepts requests from a real browser, so Recall checks it
          through a small extension running in yours. Once it&apos;s installed,
          this page links it automatically — there&apos;s nothing to copy.
        </p>

        {installUrl ? (
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5"
          >
            Add to Chrome
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          <ol className="flex flex-col gap-2 text-sm text-muted">
            {[
              "Download the extension folder from GitHub",
              "Open chrome://extensions and turn on Developer mode",
              "Click Load unpacked and choose the extension folder",
              "Come back here — this page links it on its own",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-mint/25 bg-mint/10 text-[0.65rem] font-bold text-mint">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}

        <p className="mt-4 text-xs text-faint">
          {phase === "looking" ? "Checking for the extension…" : "Not detected yet — this page will notice the moment it appears."}
        </p>
      </div>
    );
  }

  /* ---------------- Installed, linking ---------------- */
  if (phase === "linking") {
    return (
      <div className="rounded-2xl border border-mint/25 bg-mint/5 p-6">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-mint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
          Extension found — linking it to your account…
        </p>
      </div>
    );
  }

  /* ---------------- Connected ---------------- */
  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-mint/25 bg-mint/5 p-6">
        <p className="mb-1 text-lg font-semibold text-mint">
          {synced !== null
            ? `Connected — found ${synced} deadline${synced === 1 ? "" : "s"}.`
            : "Slate is connected."}
        </p>
        <p className="mb-4 text-sm text-muted">
          Your deadlines refresh every six hours from here on. Nothing else to do.
        </p>
        <button
          onClick={() => {
            setPhase("syncing");
            send({ type: "SYNC_NOW" });
            setTimeout(() => setPhase("done"), 1200);
          }}
          className="rounded-xl border border-line-2 px-4 py-2 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-ink"
        >
          Sync now
        </button>
      </div>
    );
  }

  /* ---------------- Needs the calendar link ---------------- */
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1 text-xs font-semibold text-mint">
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
        Extension linked
      </p>

      <h2 className="mb-2 text-lg font-bold tracking-tight">Paste your Slate calendar link</h2>
      <p className="mb-5 text-sm text-muted">
        In Slate: <strong className="text-ink">Calendar → Export calendar → Get calendar URL</strong>.
        Pick the widest date range you can.
      </p>

      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && saveUrl()}
        placeholder="https://slate.uol.edu.pk/calendar/export_execute.php?…"
        disabled={phase === "syncing"}
        className="w-full rounded-xl border border-line-2 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60"
      />

      <p className="mt-2 text-xs text-faint">
        This goes straight to the extension on your computer. Recall&apos;s
        server never receives it — only the deadlines it finds.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {error}
        </p>
      )}

      <button
        onClick={saveUrl}
        disabled={phase === "syncing"}
        className="mt-5 w-full rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "syncing" ? "Checking Slate…" : "Connect Slate"}
      </button>
    </div>
  );
}
