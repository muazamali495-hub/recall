"use client";

import { useEffect, useState } from "react";

/**
 * Shown while a free-tier model is thinking.
 *
 * These calls routinely take 30-60 seconds because free pools are shared, and
 * a silent button is indistinguishable from a crash. Showing elapsed seconds
 * and what's happening turns "it's broken" into "it's working".
 */
export function Working({
  stages,
  note,
}: {
  stages: string[];
  note?: string;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Move to the next stage message every 12s, holding on the last one.
  const stage = stages[Math.min(Math.floor(seconds / 12), stages.length - 1)];

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-line-2 p-5"
      style={{ background: "linear-gradient(165deg, rgba(28,36,60,.9), rgba(14,18,32,.94))" }}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
        </span>

        <span className="flex-1 text-sm font-medium">{stage}</span>

        <span className="font-mono text-sm tabular-nums text-faint">{seconds}s</span>
      </div>

      {/* Indeterminate bar — we genuinely don't know how long the pool will take. */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full w-1/3 animate-[slide_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-mint to-transparent" />
      </div>

      {note && <p className="mt-3 text-xs text-faint">{note}</p>}

      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
