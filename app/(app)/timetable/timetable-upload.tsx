"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  extractTimetableAction,
  saveTimetableAction,
  type ExtractState,
  type SaveState,
} from "./actions";
import type { ExtractedClass } from "@/lib/vision";
import { Working } from "../working";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TimetableUpload() {
  const [extract, extractAction, extracting] = useActionState<ExtractState, FormData>(
    extractTimetableAction,
    null,
  );
  const [save, saveAction, saving] = useActionState<SaveState, FormData>(saveTimetableAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ExtractedClass[] | null>(null);

  // Seed the editable table once extraction returns.
  useEffect(() => {
    if (extract?.classes) setRows(extract.classes);
  }, [extract]);

  function update(i: number, patch: Partial<ExtractedClass>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function remove(i: number) {
    setRows((prev) => prev && prev.filter((_, idx) => idx !== i));
  }

  if (save?.saved) {
    return (
      <div className="rounded-2xl border border-mint/25 bg-mint/5 p-6 text-center">
        <p className="mb-1 text-lg font-semibold text-mint">
          Timetable saved — {save.saved} classes.
        </p>
        <p className="mb-5 text-sm text-muted">Recall knows your week now.</p>
        <Link
          href="/dashboard"
          className="inline-flex rounded-xl bg-mint px-5 py-2.5 text-sm font-semibold text-[#04231d] transition hover:-translate-y-0.5"
        >
          Go to dashboard
        </Link>
      </div>
    );
  }

  // ---------- Step 2: check and correct ----------
  if (rows) {
    return (
      <div>
        <div className="mb-5 rounded-xl border border-amber/25 bg-amber/5 p-4">
          <p className="text-sm font-medium text-amber">Check the times before saving.</p>
          <p className="mt-1 text-xs text-amber/80">
            This is a first draft. Reading a dense grid, the AI often shifts a
            class into the wrong period — and every reminder depends on these
            times being right.
          </p>
        </div>

        <ul className="mb-6 flex flex-col gap-2">
          {rows.map((c, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={c.course}
                  onChange={(e) => update(i, { course: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-line-2 bg-white/[0.04] px-2.5 py-1.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-mint"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${c.course}`}
                  className="shrink-0 rounded-lg border border-line-2 px-2.5 py-1.5 text-xs text-faint transition hover:border-rose/40 hover:text-rose"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={c.day_of_week}
                  onChange={(e) => update(i, { day_of_week: Number(e.target.value) })}
                  className="rounded-lg border border-line-2 bg-white/[0.04] px-2 py-1.5 text-xs outline-none focus-visible:outline-2 focus-visible:outline-mint"
                >
                  {DAY_LABELS.map((d, idx) => (
                    <option key={idx} value={idx} className="bg-[#141a2b]">
                      {d}
                    </option>
                  ))}
                </select>

                <input
                  type="time"
                  value={c.start_time}
                  onChange={(e) => update(i, { start_time: e.target.value })}
                  className="rounded-lg border border-line-2 bg-white/[0.04] px-2 py-1.5 font-mono text-xs tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-mint"
                />
                <span className="text-xs text-faint">to</span>
                <input
                  type="time"
                  value={c.end_time ?? ""}
                  onChange={(e) => update(i, { end_time: e.target.value || null })}
                  className="rounded-lg border border-line-2 bg-white/[0.04] px-2 py-1.5 font-mono text-xs tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-mint"
                />
                <input
                  value={c.room ?? ""}
                  placeholder="Room"
                  onChange={(e) => update(i, { room: e.target.value || null })}
                  className="w-24 rounded-lg border border-line-2 bg-white/[0.04] px-2 py-1.5 text-xs outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-mint"
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <form action={saveAction}>
            <input type="hidden" name="classes" value={JSON.stringify(rows)} />
            <button
              type="submit"
              disabled={saving || rows.length === 0}
              className="w-full rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Saving…" : `Save ${rows.length} classes`}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setRows(null)}
            className="w-full rounded-xl border border-line-2 px-5 py-3 text-sm font-medium text-muted transition hover:bg-white/5"
          >
            Start over
          </button>
        </div>

        {save?.error && (
          <p role="alert" className="mt-4 rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
            {save.error}
          </p>
        )}
      </div>
    );
  }

  // ---------- Step 1: upload ----------
  return (
    <form action={extractAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="section" className="mb-2 block text-sm font-medium">
          Your section
        </label>
        <input
          id="section"
          name="section"
          defaultValue={extract?.section ?? ""}
          placeholder="BSCS-3A"
          className="w-full rounded-xl border border-line-2 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        />
        <p className="mt-2 text-xs text-faint">
          Copy it exactly as written on the timetable. Departmental timetables
          list every section — this picks out your row.
        </p>
      </div>

      <label
        htmlFor="timetable"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 bg-white/[0.02] px-6 py-10 text-center transition hover:border-mint/40 hover:bg-mint/[0.03]"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"
            stroke="#57E6C1"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-medium">{fileName ?? "Choose your timetable"}</span>
        <span className="text-xs text-faint">A PDF, screenshot or photo — all work</span>
      </label>

      <input
        id="timetable"
        name="timetable"
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        required
        className="sr-only"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />

      {extracting && (
        <Working
          stages={[
            "Turning your file into images…",
            "Finding your section in the grid…",
            "Reading the days, times and rooms…",
            "Still going — free models queue behind other students.",
          ]}
          note="Reading a dense timetable takes 30-60 seconds on the free tier."
        />
      )}

      {extract?.error && (
        <p role="alert" className="rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {extract.error}
        </p>
      )}

      <button
        type="submit"
        disabled={extracting}
        className="rounded-xl bg-mint px-5 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        {extracting ? "Reading your timetable…" : "Read my timetable"}
      </button>
    </form>
  );
}
