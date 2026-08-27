// Ask Recall waits on a free model; the default 10s timeout is not enough.
export const maxDuration = 60;

import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { AskChat } from "./ask-chat";

export default async function AskPage() {
  const user = await getCurrentUser();
  if (!user) return null; // the layout already guards this route

  const supabase = await createClient();

  const [{ count: deadlineCount }, { count: classCount }] = await Promise.all([
    supabase
      .from("deadlines")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("due_at", new Date().toISOString()),
    supabase
      .from("class_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const deadlines = deadlineCount ?? 0;
  const classes = classCount ?? 0;
  const hasContext = deadlines > 0 || classes > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-8 pt-10">
      <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
        Ask Recall
      </p>
      <h1 className="mb-3 text-[2rem] font-bold leading-none tracking-tight sm:text-[2.4rem]">
        It already knows your week.
      </h1>
      <p className="mb-6 max-w-xl text-sm text-muted">
        Ask anything about your courses. Unlike a general chatbot, Recall can
        see what&rsquo;s due and when you&rsquo;re in class — so &ldquo;what
        should I do tonight?&rdquo; gets a real answer.
      </p>

      {/* Makes the difference visible rather than claimed. */}
      <div className="mb-8 flex flex-wrap gap-2.5">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            deadlines
              ? "border-mint/25 bg-mint/[0.08] text-mint"
              : "border-line-2 bg-white/[0.03] text-faint"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${deadlines ? "bg-mint" : "bg-faint"}`} />
          {deadlines ? `${deadlines} deadlines known` : "No deadlines synced"}
        </span>

        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            classes
              ? "border-violet/25 bg-violet/[0.08] text-violet"
              : "border-line-2 bg-white/[0.03] text-faint"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${classes ? "bg-violet" : "bg-faint"}`} />
          {classes ? `${classes} classes known` : "No timetable yet"}
        </span>
      </div>

      {!hasContext && (
        <div className="mb-8 rounded-2xl border border-line bg-white/[0.02] p-4 text-sm">
          <p className="mb-1 font-medium">Recall doesn&rsquo;t know your courses yet.</p>
          <p className="text-xs text-faint">
            It will still answer, but generically — the useful part comes from
            your own deadlines and timetable.{" "}
            <Link href="/connect" className="text-mint hover:underline">
              Connect Slate
            </Link>{" "}
            or{" "}
            <Link href="/timetable" className="text-mint hover:underline">
              add your timetable
            </Link>
            .
          </p>
        </div>
      )}

      <AskChat hasContext={hasContext} />
    </main>
  );
}
