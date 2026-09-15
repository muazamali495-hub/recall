"use client";

import { useState, useTransition } from "react";
import { setDeadlineDone } from "./actions";

/**
 * The tick beside a task.
 *
 * Sits inside a card that is itself a link to Slate, so the click must not
 * bubble — otherwise marking a task done would also open it.
 */
export function DoneButton({
  id,
  done,
  size = "md",
}: {
  id: string;
  done: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl";

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      title={error ?? (done ? "Undo" : "Done")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        start(async () => {
          const r = await setDeadlineDone(id, !done);
          if (!r.ok) setError(r.error);
        });
      }}
      className={`grid shrink-0 place-items-center border transition disabled:opacity-50 ${box} ${
        done
          ? "border-mint/40 bg-mint/15 text-mint hover:bg-mint/25"
          : error
            ? "border-rose/40 text-rose"
            : "border-line-2 text-faint hover:border-mint/50 hover:bg-mint/10 hover:text-mint"
      }`}
    >
      {done ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
        </svg>
      )}
    </button>
  );
}
