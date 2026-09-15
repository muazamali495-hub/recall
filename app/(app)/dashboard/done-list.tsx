"use client";

import { useState } from "react";
import { DoneButton } from "./done-button";

export type DoneItem = {
  id: string;
  title: string;
  course: string;
  kind: string;
  doneAt: string;
  source: "manual" | "slate";
  sourceUrl: string | null;
};

const KIND_LABEL: Record<string, string> = {
  exam: "Exam",
  quiz: "Quiz",
  assignment: "Assignment",
  other: "Event",
};

/**
 * Finished work, folded away.
 *
 * Out of sight so the dashboard shows only what is still to do, but never
 * gone: a wrongly-marked task is one tap from being back with its
 * reminders. Where the mark came from is shown, because "Slate says you
 * submitted this" and "you tapped done" deserve different levels of trust.
 */
export function DoneList({ items }: { items: DoneItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-left transition hover:border-line-2"
      >
        <span className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md border border-mint/30 bg-mint/10 text-mint">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Done <span className="font-normal text-faint">· {items.length}</span>
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`text-faint transition ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="mt-2.5 flex flex-col gap-2">
          {items.map((x) => (
            <li
              key={x.id}
              className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 opacity-80"
              style={{ background: "linear-gradient(165deg, rgba(26,33,56,.5), rgba(16,20,34,.6))" }}
            >
              <DoneButton id={x.id} done size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium tracking-tight line-through decoration-faint/60">
                  {x.title}
                </span>
                <span className="block truncate text-[0.72rem] text-faint">
                  {KIND_LABEL[x.kind] ?? "Event"} · {x.course}
                  {x.source === "slate" ? " · submitted on Slate" : " · marked by you"}
                </span>
              </span>
              {x.sourceUrl && (
                <a
                  href={x.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-faint transition hover:text-mint"
                >
                  Open
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
