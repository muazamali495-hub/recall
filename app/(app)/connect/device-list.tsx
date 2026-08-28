"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeDevice } from "./device-actions";

export type Device = {
  id: string;
  label: string | null;
  last_seen_at: string | null;
  created_at: string;
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * What each device's state means, said plainly.
 *
 * A student looking at this is deciding whether a row is theirs and whether to
 * remove it, so the useful thing is not a timestamp but what is about to happen
 * to it.
 */
function describe(device: Device): { text: string; tone: string } {
  if (!device.last_seen_at) {
    const hours = Math.floor((Date.now() - new Date(device.created_at).getTime()) / 3_600_000);
    return {
      text: hours >= 20 ? "never synced — expires shortly" : "never synced — expires in 24h",
      tone: "text-amber",
    };
  }

  const idle = daysSince(device.last_seen_at);
  const when = DATE.format(new Date(device.last_seen_at));

  if (idle >= 53) return { text: `last synced ${when} — expires soon`, tone: "text-amber" };
  if (idle >= 1) return { text: `last synced ${when}`, tone: "text-faint" };
  return { text: "synced today", tone: "text-mint" };
}

export function DeviceList({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function remove(id: string) {
    setBusy(id);
    setError(null);

    startTransition(async () => {
      const result = await revokeDevice(id);
      setBusy(null);
      setConfirming(null);

      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  if (devices.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-muted">Linked browsers</h2>
      <p className="mb-3 text-xs text-faint">
        Each one can read your deadlines and timetable. Remove any you don&apos;t
        recognise — the browser it belonged to simply links again next time you
        use it.
      </p>

      <ul className="flex flex-col gap-2">
        {devices.map((d) => {
          const state = describe(d);

          return (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate">{d.label ?? "Browser"}</p>
                <p className={`text-xs ${state.tone}`}>{state.text}</p>
              </div>

              {confirming === d.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Remove it?</span>
                  <button
                    onClick={() => remove(d.id)}
                    disabled={pending}
                    className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose transition hover:bg-rose/20 disabled:opacity-50"
                  >
                    {busy === d.id ? "Removing…" : "Yes, remove"}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="rounded-lg border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-ink"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(d.id)}
                  className="rounded-lg border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-rose/30 hover:text-rose"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-xs text-amber">
          {error}
        </p>
      )}
    </section>
  );
}
