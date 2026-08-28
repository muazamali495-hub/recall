"use client";

import { useState } from "react";
import { AndroidConnect, useIsRecallApp } from "./android-connect";
import { ExtensionConnect } from "./extension-connect";
import { PairingCode } from "./pairing-code";
import { RefreshNow } from "./refresh-now";

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Connecting Slate, told from the right altitude.
 *
 * Syncing is a property of the ACCOUNT, not the device. One device holds the
 * calendar URL and pushes deadlines in; every other device reads them. So a
 * phone must not be told "not connected" merely because it does not personally
 * hold the URL — that reads as broken when everything is working.
 */
export function ConnectSwitch({
  alreadyLinked,
  installUrl,
  accountConnected,
  syncedFrom,
  lastSyncedAt,
  deadlineCount,
  latestExtensionVersion,
}: {
  alreadyLinked: boolean;
  installUrl: string | null;
  accountConnected: boolean;
  syncedFrom: string | null;
  lastSyncedAt: string | null;
  deadlineCount: number;
  latestExtensionVersion: string;
}) {
  const inApp = useIsRecallApp();
  const [showManual, setShowManual] = useState(false);
  const [addThisDevice, setAddThisDevice] = useState(false);

  const setup = inApp ? <AndroidConnect /> : <ExtensionConnect installUrl={installUrl} />;

  // Already syncing from somewhere else — say so, and make setting this device
  // up an option rather than a demand.
  if (accountConnected && !addThisDevice) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-mint/25 bg-mint/5 p-6">
          <p className="mb-1 inline-flex items-center gap-2 text-lg font-semibold text-mint">
            <span className="h-2 w-2 rounded-full bg-mint" />
            Slate is connected
          </p>

          <p className="text-sm text-muted">
            {deadlineCount > 0
              ? `${deadlineCount} deadline${deadlineCount === 1 ? "" : "s"} synced to your account.`
              : "Connected — no deadlines posted yet."}{" "}
            {syncedFrom ? (
              <>
                Syncing from <strong className="text-ink">{syncedFrom}</strong>, last checked{" "}
                {ago(lastSyncedAt)}.
              </>
            ) : null}
          </p>

          {/* Naming the dependency rather than leaving "20 hours ago" to be
              read as a broken promise. Slate sits behind Cloudflare, so the
              fetch has to happen inside a real browser on a real machine —
              which means it cannot run while that machine is asleep. */}
          <p className="mt-4 text-xs text-faint">
            This is set up once per account, not per device — your deadlines show
            on every device you sign in on, including this one. Slate itself can
            only be checked while Chrome is open on the computer holding the
            link, so the gap between checks stretches whenever that computer is
            closed.
          </p>

          <RefreshNow
            lastSyncedAt={lastSyncedAt}
            latestVersion={latestExtensionVersion}
            installUrl={installUrl}
          />
        </div>

        <button
          onClick={() => setAddThisDevice(true)}
          className="self-center text-xs text-faint transition hover:text-mint"
        >
          Sync from this device too
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {accountConnected && (
        <p className="rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-faint">
          Your account is already syncing{syncedFrom ? ` from ${syncedFrom}` : ""}. Setting this
          device up as well is optional — it just means deadlines keep arriving when your other
          device is off.
        </p>
      )}

      {setup}

      {!inApp &&
        (showManual ? (
          <div className="rounded-2xl border border-line bg-white/[0.02] p-5">
            <p className="mb-3 text-xs text-faint">
              Use this only if the extension is installed but this page never notices it — reload
              the extension at chrome://extensions first.
            </p>
            <PairingCode alreadyLinked={alreadyLinked} />
          </div>
        ) : (
          <button
            onClick={() => setShowManual(true)}
            className="self-center text-xs text-faint transition hover:text-mint"
          >
            Link it manually instead
          </button>
        ))}
    </div>
  );
}
