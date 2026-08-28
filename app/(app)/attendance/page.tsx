import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  findUnmarked,
  judge,
  totalsByCourse,
  type ClassRow,
  type Mark,
} from "@/lib/attendance";
import { AttendanceBoard } from "./attendance-board";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) return null; // the layout already guards this route

  const supabase = await createClient();

  const [{ data: classes }, { data: marks }, { data: baselines }, { data: semester }] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id, course, day_of_week, start_time, room")
      .eq("user_id", user.id),
    supabase
      .from("attendance")
      .select("class_id, on_date, status")
      .eq("user_id", user.id),
    supabase
      .from("attendance_baseline")
      .select("course, attended, held, required_percent")
      .eq("user_id", user.id),
    supabase.from("semester").select("starts_on, label").eq("user_id", user.id).maybeSingle(),
  ]);

  const classRows = (classes ?? []) as ClassRow[];
  const markRows = (marks ?? []) as Mark[];
  const startsOn = semester?.starts_on ?? null;

  const verdicts = totalsByCourse(classRows, markRows, baselines ?? [], startsOn).map(judge);
  const unmarked = findUnmarked(new Date(), classRows, markRows, 7, startsOn);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-10">
      <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
        Attendance
      </p>
      <h1 className="mb-3 text-[2rem] font-bold leading-none tracking-tight sm:text-[2.4rem]">
        Know before you skip.
      </h1>
      <p className="mb-8 text-sm text-muted">
        UOL detains you below 75%. Mark each class and Recall keeps the one number
        that matters — how many more you can afford to miss.
      </p>

      {classRows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="mb-1 text-sm font-semibold">No timetable yet</p>
          <p className="mb-4 text-sm text-muted">
            Attendance is counted against your classes, so Recall needs your timetable first.
          </p>
          <Link
            href="/timetable"
            className="inline-block rounded-xl bg-mint px-5 py-2.5 text-sm font-semibold text-[#04231d] transition hover:-translate-y-0.5"
          >
            Add your timetable
          </Link>
        </div>
      ) : (
        <AttendanceBoard verdicts={verdicts} unmarked={unmarked} semesterStart={startsOn} />
      )}
    </main>
  );
}
