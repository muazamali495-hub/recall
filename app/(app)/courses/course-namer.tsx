"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nameCourse } from "./actions";

export type CourseRow = {
  code: string;
  section: string | null;
  name: string | null;
  /** A guess pulled from deadline titles, offered when there is no name yet. */
  suggested: string | null;
  deadlines: number;
};

/**
 * Where a student names their courses.
 *
 * Slate only ever sends the code, so until this is filled in every deadline
 * reads "Quiz 2 - CS13410". Six courses, once a semester. The suggestion is
 * pre-filled when a title gave it away, so the common case is confirming
 * rather than typing.
 */
export function CourseNamer({ courses, compact = false }: { courses: CourseRow[]; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(courses.map((c) => [c.code, c.name ?? c.suggested ?? ""])),
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unnamed = courses.filter((c) => !c.name).length;

  function save(code: string) {
    setError(null);
    startTransition(async () => {
      const result = await nameCourse(code, drafts[code] ?? "");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(code);
      setTimeout(() => setSaved((s) => (s === code ? null : s)), 1500);
      router.refresh();
    });
  }

  if (courses.length === 0) return null;

  // On the dashboard, only nag while something is actually unnamed.
  if (compact && unnamed === 0) return null;

  return (
    <section className={compact ? "mb-8 rounded-2xl border border-violet/25 bg-violet/[0.06] p-5" : "mt-8"}>
      {compact ? (
        <>
          <p className="mb-1 text-sm font-semibold">
            {unnamed === 1 ? "One course needs a name" : `${unnamed} courses need names`}
          </p>
          <p className="mb-4 text-sm text-muted">
            Slate only sends course codes. Name them once and every deadline and
            reminder will say which course it&apos;s for.
          </p>
        </>
      ) : (
        <>
          <h2 className="mb-1 text-sm font-semibold text-muted">Your courses</h2>
          <p className="mb-3 text-xs text-faint">
            Slate sends only the code. What you type here appears on every deadline,
            every reminder and in Ask Recall.
          </p>
        </>
      )}

      <ul className="flex flex-col gap-2">
        {(compact ? courses.filter((c) => !c.name) : courses).map((c) => (
          <li
            key={c.code}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3"
          >
            <div className="min-w-[7.5rem] shrink-0">
              <p className="font-mono text-sm font-semibold">{c.code}</p>
              <p className="text-xs text-faint">
                {c.section ?? "no section"} · {c.deadlines} {c.deadlines === 1 ? "deadline" : "deadlines"}
              </p>
            </div>

            <input
              value={drafts[c.code] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.code]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save(c.code);
                }
              }}
              placeholder={c.suggested ? `Suggested: ${c.suggested}` : "Course name"}
              aria-label={`Name for ${c.code}`}
              className="min-w-0 flex-1 rounded-lg border border-line-2 bg-ground px-3 py-2 text-sm placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            />

            <button
              onClick={() => save(c.code)}
              disabled={pending || (drafts[c.code] ?? "") === (c.name ?? "")}
              className="rounded-lg bg-mint px-3.5 py-2 text-xs font-semibold text-[#04231d] transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {saved === c.code ? "Saved" : c.name ? "Update" : "Save"}
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-xs text-amber">
          {error}
        </p>
      )}
    </section>
  );
}
