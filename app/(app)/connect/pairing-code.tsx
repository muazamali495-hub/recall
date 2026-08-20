"use client";

import { useState, useTransition } from "react";
import { generatePairingCode, type PairingState } from "./actions";

export function PairingCode({ alreadyLinked }: { alreadyLinked: boolean }) {
  const [state, setState] = useState<PairingState>(null);
  const [pending, startTransition] = useTransition();

  function getCode() {
    startTransition(async () => {
      setState(await generatePairingCode());
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      {alreadyLinked && !state && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1 text-xs font-semibold text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          Extension linked
        </p>
      )}

      {state?.code ? (
        <div className="text-center">
          <p className="mb-3 text-sm text-muted">Type this into the extension:</p>
          <p className="mb-3 font-mono text-3xl font-bold tracking-[0.2em] text-mint">
            {state.code}
          </p>
          <p className="text-xs text-faint">
            Expires in {state.expiresInMinutes} minutes. Generating a new code cancels this one.
          </p>
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-base font-semibold">
            {alreadyLinked ? "Link another browser" : "Link the extension"}
          </h2>
          <p className="mb-5 text-sm text-muted">
            Generate a code, then type it into the Recall extension once. You
            won&apos;t need to do this again on this browser.
          </p>
          <button
            onClick={getCode}
            disabled={pending}
            className="w-full rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {pending ? "Generating…" : "Get pairing code"}
          </button>
        </>
      )}

      {state?.error && (
        <p role="alert" className="mt-4 rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {state.error}
        </p>
      )}
    </div>
  );
}
