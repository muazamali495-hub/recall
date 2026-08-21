"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    RecallNative?: {
      saveCalendarUrl: (url: string) => void;
      hasCalendarUrl: () => boolean;
      syncNow: () => void;
    };
  }
}

/**
 * The in-app version of connecting Slate.
 *
 * On the web this page hands out a pairing code for the browser extension.
 * Inside the Android app there is no extension and no second device — the app
 * itself does the fetching — so it just needs the calendar URL, which goes
 * straight to the phone's own storage and never to our server.
 */
export function AndroidConnect() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadySet, setAlreadySet] = useState(false);

  useEffect(() => {
    try {
      setAlreadySet(window.RecallNative?.hasCalendarUrl() ?? false);
    } catch {
      setAlreadySet(false);
    }
  }, []);

  function save() {
    const value = url.trim();

    if (!value.startsWith("https://")) {
      setError("The link must start with https://");
      return;
    }
    if (!value.includes("export_execute.php")) {
      setError("That doesn't look like a calendar export link. Copy it from Slate → Calendar → Export.");
      return;
    }

    try {
      window.RecallNative?.saveCalendarUrl(value);
      setSaved(true);
      setError(null);
    } catch {
      setError("Could not save. Reopen the app and try again.");
    }
  }

  if (saved) {
    return (
      <div className="rounded-2xl border border-mint/25 bg-mint/5 p-6 text-center">
        <p className="mb-1 text-lg font-semibold text-mint">Saved — syncing now.</p>
        <p className="text-sm text-muted">
          Your deadlines will appear on the dashboard shortly, and refresh every
          six hours from here on.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      {alreadySet && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1 text-xs font-semibold text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          Already connected
        </p>
      )}

      <h2 className="mb-2 text-base font-semibold">
        {alreadySet ? "Update your calendar link" : "Add your Slate calendar link"}
      </h2>
      <p className="mb-5 text-sm text-muted">
        In Slate: <strong>Calendar → Export calendar → Get calendar URL</strong>.
        Choose the widest date range you can.
      </p>

      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://slate.uol.edu.pk/calendar/export_execute.php?…"
        className="w-full rounded-xl border border-line-2 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />

      <p className="mt-2 text-xs text-faint">
        This stays on your phone. Recall only ever receives the deadlines it
        finds, never the link itself.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {error}
        </p>
      )}

      <button
        onClick={save}
        className="mt-5 w-full rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        Save and sync
      </button>
    </div>
  );
}

/** True when the page is running inside the Recall Android app. */
export function useIsRecallApp() {
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(
      typeof navigator !== "undefined" && navigator.userAgent.includes("RecallAndroid"),
    );
  }, []);

  return inApp;
}
