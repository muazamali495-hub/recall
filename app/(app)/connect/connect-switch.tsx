"use client";

import { useState } from "react";
import { AndroidConnect, useIsRecallApp } from "./android-connect";
import { ExtensionConnect } from "./extension-connect";
import { PairingCode } from "./pairing-code";

/**
 * The same page means three different things depending on where it is open.
 *
 * In the Android app, the app itself fetches Slate, so it only needs the
 * calendar URL. In a desktop browser, the extension does — and if it is
 * installed it can be linked automatically, with nothing to copy. The manual
 * pairing code stays as a fallback for anyone whose extension cannot talk to
 * the page.
 */
export function ConnectSwitch({
  alreadyLinked,
  installUrl,
}: {
  alreadyLinked: boolean;
  installUrl: string | null;
}) {
  const inApp = useIsRecallApp();
  const [showManual, setShowManual] = useState(false);

  if (inApp) return <AndroidConnect />;

  return (
    <div className="flex flex-col gap-4">
      <ExtensionConnect installUrl={installUrl} />

      {showManual ? (
        <div className="rounded-2xl border border-line bg-white/[0.02] p-5">
          <p className="mb-3 text-xs text-faint">
            Use this only if the extension is installed but this page never
            notices it — reload the extension at chrome://extensions first.
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
      )}
    </div>
  );
}
