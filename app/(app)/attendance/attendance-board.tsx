"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { summarise, type CourseVerdict, type UnmarkedClass } from "@/lib/attendance";
import { markAttendance, saveBaseline } from "./actions";

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function friendlyDate(onDate: string, todayIso: string): string {
  if (onDate === todayIso) return "Today";
  return DAY_LABEL.format(new Date(`${onDate}T00:00:00Z`));
}

const TONE = {
  safe: { text: "text-mint", bar: "bg-mint", ring: "border-line" },
  warning: { text: "text-amber", bar: "bg-amber", ring: "border-amber/30" },
  short: { text: "text-rose", bar: "bg-rose", ring: "border-rose/30" },
} as const;

export function AttendanceBoard({
  verdicts,
  unmarked,
}: {
  verdicts: CourseVerdict[];
  unmarked: UnmarkedClass[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // Marking removes the row it came from, so the list shrinks as you work
  // through it. Doing that optimistically keeps a phone on a slow connection
  // feeling like a checklist rather than a form.
  const [done, setDone] = useState<Set<string>>(new Set());

  const todayIso = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const pendingList = unmarked.filter((u) => !done.has(`${u.classId}:${u.onDate}`));

  function mark(item: UnmarkedClass, status: "present" | "absent" | "cancelled") {
    const key = `${item.classId}:${item.onDate}`;
    setBusyKey(key);
    setError(null);

    startTransition(async () => {
      const result = await markAttendance(item.classId, item.onDate, status);
      setBusyKey(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDone((prev) => new Set(prev).add(key));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ---------- What still needs answering ---------- */}
      {pendingList.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold tracking-tight">
            {pendingList.length} to mark
          </h2>
          <p className="mb-4 text-xs text-faint">
            Only classes that have already finished. Going back a week, so a day off
            doesn&apos;t lose the count.
          </p>

          <ul className="flex flex-col gap-2">
            {pendingList.map((item) => {
              const key = `${item.classId}:${item.onDate}`;
              const busy = busyKey === key;

              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.course}</p>
                    <p className="text-xs text-faint">
                      {friendlyDate(item.onDate, todayIso)} · {item.startTime}
                      {item.room ? ` · ${item.room}` : ""}
                    </p>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => mark(item, "present")}
                      disabled={busy || pending}
                      className="rounded-lg border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint transition hover:bg-mint/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      Went
                    </button>
                    <button
                      onClick={() => mark(item, "absent")}
                      disabled={busy || pending}
                      className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose transition hover:bg-rose/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
                    >
                      Missed
                    </button>
                    {/* A cancelled class counts in neither total — without this
                        a cancelled lecture would show up as an absence. */}
                    <button
                      onClick={() => mark(item, "cancelled")}
                      disabled={busy || pending}
                      className="rounded-lg border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      Cancelled
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {error}
        </p>
      )}

      {/* ---------- Where each course stands ---------- */}
      <section>
        <h2 className="mb-4 text-sm font-semibold tracking-tight">By course</h2>

        <ul className="flex flex-col gap-3">
          {verdicts.map((v) => {
            const tone = TONE[v.status];

            return (
              <li key={v.course} className={`rounded-2xl border ${tone.ring} bg-surface p-4`}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">{v.course}</p>
                  <p className={`shrink-0 text-sm font-bold tabular-nums ${tone.text}`}>
                    {v.held === 0 ? "—" : `${v.percent}%`}
                  </p>
                </div>

                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${tone.bar} transition-[width] duration-500`}
                    style={{ width: `${v.held === 0 ? 0 : Math.min(100, v.percent)}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className={`text-xs ${v.status === "safe" ? "text-muted" : tone.text}`}>
                    {summarise(v)}
                  </p>
                  <p className="text-xs tabular-nums text-faint">
                    {v.attended}/{v.held} · needs {v.requiredPercent}%
                  </p>
                </div>

                {editing === v.course ? (
                  <BaselineForm
                    verdict={v}
                    onDone={() => {
                      setEditing(null);
                      router.refresh();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <button
                    onClick={() => setEditing(v.course)}
                    className="mt-2.5 text-xs text-faint underline-offset-2 transition hover:text-mint hover:underline"
                  >
                    {v.held === 0 ? "Enter where you already stand" : "Adjust starting count"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/**
 * The count from before Recall was installed.
 *
 * Nobody starts a tracker in week one. Without this, a student joining in week
 * ten is told they're fine while sitting one absence from detention — the exact
 * failure the feature exists to prevent.
 */
function BaselineForm({
  verdict,
  onDone,
  onCancel,
}: {
  verdict: CourseVerdict;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [attended, setAttended] = useState("");
  const [held, setHeld] = useState("");
  const [required, setRequired] = useState(String(verdict.requiredPercent));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveBaseline(
        verdict.course,
        Number(attended),
        Number(held),
        Number(required),
      );
      if (!result.ok) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-line bg-white/[0.02] p-3">
      <p className="mb-3 text-xs text-faint">
        Before Recall started counting, how did this course stand? Leave it blank
        if you&apos;re starting fresh.
      </p>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-wider text-faint">Attended</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={attended}
            onChange={(e) => setAttended(e.target.value)}
            className="w-20 rounded-lg border border-line-2 bg-ground px-2.5 py-1.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-wider text-faint">Held</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={held}
            onChange={(e) => setHeld(e.target.value)}
            className="w-20 rounded-lg border border-line-2 bg-ground px-2.5 py-1.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-wider text-faint">Needs %</span>
          <input
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={required}
            onChange={(e) => setRequired(e.target.value)}
            className="w-20 rounded-lg border border-line-2 bg-ground px-2.5 py-1.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-amber">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-mint px-3.5 py-1.5 text-xs font-semibold text-[#04231d] transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line-2 px-3.5 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
