"use client";

import { AndroidConnect, useIsRecallApp } from "./android-connect";
import { PairingCode } from "./pairing-code";

/**
 * The same page means two different things depending on where it is open.
 *
 * In a desktop browser, connecting Slate means pairing the extension. Inside
 * the Android app, the app itself does the fetching, so all it needs is the
 * calendar URL. Showing extension instructions to a phone user would be
 * nonsense, and vice versa.
 */
export function ConnectSwitch({
  alreadyLinked,
  steps,
}: {
  alreadyLinked: boolean;
  steps: React.ReactNode;
}) {
  const inApp = useIsRecallApp();

  if (inApp) return <AndroidConnect />;

  return (
    <>
      {steps}
      <PairingCode alreadyLinked={alreadyLinked} />
    </>
  );
}
