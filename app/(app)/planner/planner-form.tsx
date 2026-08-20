"use client";

import { useActionState } from "react";
import { createPlanAction, type PlanState } from "./actions";
import { Working } from "../working";

export type DeadlineOption = {
  id: string;
  title: string;
  course: string | null;
  kind: string;
  dueLabel: string;
};

const KIND_COLOR: Record<string, string> = {
  exam: "#ff8080",
  quiz: "#ffb65c",
  assignment: "#9aa0ff",
  other: "#98a2be",
};

export function PlannerForm({ deadlines }: { deadlines: DeadlineOption[] }) {
  const [state, action, pending] = useActionState<PlanState, FormData>(createPlanAction, null);

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-5">
        {deadlines.length > 0 && (
          <div>
            <label htmlFor="deadline_id" className="mb-2 block text-sm font-medium">
              What are you preparing for?
            </label>
            <select
              id="deadline_id"
              name="deadline_id"
              defaultValue={deadlines[0]?.id}
              className="w-full rounded-xl border border-line-2 bg-white/[0.04] px-4 py-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {deadlines.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#141a2b]">
                  {d.title} · {d.dueLabel}
                </option>
              ))}
              <option value="" className="bg-[#141a2b]">
                Nothing specific — general revision
              </option>
            </select>
            <p className="mt-2 text-xs text-faint">
              Pulled from Slate. The plan works backwards from this date.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="material" className="mb-2 block text-sm font-medium">
            What do you need to cover?
          </label>
          <textarea
            id="material"
            name="material"
            rows={8}
            required
            placeholder={
              "Paste your topics, slide titles, or the course outline. For example:\n\nTrees, binary search trees, AVL rotations, graph representations, BFS and DFS, Dijkstra's algorithm, minimum spanning trees"
            }
            className="w-full resize-y rounded-xl border border-line-2 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <p className="mt-2 text-xs text-faint">
            The more specific you are, the better the plan. Rough notes are fine.
          </p>
        </div>

        {pending && (
          <Working
            stages={[
              "Reading your topics…",
              "Checking your timetable for free slots…",
              "Working around your other deadlines…",
              "Still going — free models queue behind other students.",
            ]}
            note="Free-tier models can take up to a minute. It has not frozen."
          />
        )}

        {state?.error && (
          <p role="alert" className="rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-xl bg-mint px-6 py-3 font-semibold text-[#04231d] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          {pending ? "Working it out…" : "Build my plan"}
        </button>
      </form>

      {state?.plan && (
        <section>
          <div
            className="mb-6 rounded-2xl border border-line-2 p-5 shadow-[0_30px_80px_-45px_rgba(0,0,0,.9)]"
            style={{ background: "linear-gradient(165deg, rgba(28,36,60,.9), rgba(14,18,32,.94))" }}
          >
            <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
              The strategy
            </p>
            <p className="text-[1.05rem] font-semibold leading-snug tracking-tight">
              {state.plan.headline}
            </p>

            {state.plan.priorities.length > 0 && (
              <ol className="mt-4 flex flex-col gap-2">
                {state.plan.priorities.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-mint/25 bg-mint/10 text-[0.65rem] font-bold text-mint">
                      {i + 1}
                    </span>
                    {p}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <h2 className="mb-4 text-lg font-semibold tracking-tight">Your study blocks</h2>

          <ul className="flex flex-col gap-2.5">
            {state.plan.blocks.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-4 rounded-2xl border border-line p-4"
                style={{ background: "linear-gradient(165deg, rgba(26,33,56,.7), rgba(16,20,34,.82))" }}
              >
                <span className="w-[4.5rem] shrink-0">
                  <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-mint">
                    {b.day.slice(0, 3)}
                  </span>
                  <span className="block font-mono text-xs tabular-nums text-muted">{b.start}</span>
                  <span className="block font-mono text-[0.7rem] tabular-nums text-faint">{b.end}</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-medium tracking-tight">{b.topic}</span>
                  <span className="mt-0.5 block text-xs text-faint">{b.why}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs text-faint">
            Blocks are scheduled around your timetable — anything clashing with a
            class was dropped automatically.
          </p>
        </section>
      )}
    </div>
  );
}

export { KIND_COLOR };
