// The planner calls a free model, which can take far longer than the
// default 10s function timeout.
export const maxDuration = 60;

import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { PlannerForm, type DeadlineOption } from "./planner-form";

export default async function PlannerPage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  // The layout already guards this route; this is only for the type narrowing.
  if (!user) return null;

  const [{ data: deadlines }, { count: classCount }] = await Promise.all([
    supabase
      .from("deadlines")
      .select("id, title, course, kind, due_at")
      .gte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
    supabase
      .from("class_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const options: DeadlineOption[] = (deadlines ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    course: d.course,
    kind: d.kind,
    dueLabel: new Date(d.due_at).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Karachi",
    }),
  }));

  const knowsSchedule = (classCount ?? 0) > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10">
      <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
        Study planner
      </p>
      <h1 className="mb-3 text-[2rem] font-bold leading-none tracking-tight sm:text-[2.4rem]">
        Plan around your actual week.
      </h1>
      <p className="mb-8 max-w-xl text-sm text-muted">
        Tell Recall what you need to cover. It already knows when your quiz is
        and when you&rsquo;re in class — so the plan fits the time you really
        have, not an imaginary empty week.
      </p>

      {/* What the planner is working with — makes the integration visible. */}
      <div className="mb-8 flex flex-wrap gap-2.5">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            options.length
              ? "border-mint/25 bg-mint/[0.08] text-mint"
              : "border-line-2 bg-white/[0.03] text-faint"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${options.length ? "bg-mint" : "bg-faint"}`} />
          {options.length ? `${options.length} deadlines from Slate` : "No deadlines synced"}
        </span>

        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            knowsSchedule
              ? "border-violet/25 bg-violet/[0.08] text-violet"
              : "border-line-2 bg-white/[0.03] text-faint"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${knowsSchedule ? "bg-violet" : "bg-faint"}`} />
          {knowsSchedule ? `${classCount} classes known` : "No timetable yet"}
        </span>
      </div>

      {!knowsSchedule && (
        <div className="mb-8 rounded-2xl border border-line bg-white/[0.02] p-4 text-sm">
          <p className="mb-1 font-medium">Add your timetable first for a plan that actually fits.</p>
          <p className="text-xs text-faint">
            Without it, Recall will happily schedule you to study during a lecture.{" "}
            <Link href="/timetable" className="text-mint hover:underline">
              Add it now →
            </Link>
          </p>
        </div>
      )}

      <PlannerForm deadlines={options} />
    </main>
  );
}
