import { createClient } from "@/lib/supabase/server";
import { namesFrom, suggestName, type CourseNames } from "@/lib/course-label";
import type { CourseRow } from "@/app/(app)/courses/course-namer";

/**
 * Everything a page needs to name courses and label deadlines.
 *
 * One loader rather than four copies of the same three queries, so the
 * dashboard, the timetable page and Ask Recall cannot drift into labelling the
 * same course three different ways.
 */
export async function loadCourses(userId: string): Promise<{ names: CourseNames; rows: CourseRow[] }> {
  const supabase = await createClient();

  const [{ data: named }, { data: deadlines }, { data: classes }] = await Promise.all([
    supabase.from("courses").select("code, name").eq("user_id", userId),
    supabase.from("deadlines").select("course, section, title").eq("user_id", userId),
    supabase.from("class_sessions").select("course").eq("user_id", userId),
  ]);

  const names = namesFrom(named);
  const timetable = [...new Set((classes ?? []).map((c) => c.course))];

  // Group the student's deadlines by code. The section is taken from whichever
  // deadline carries one — they are all the same section for one student, and
  // older rows synced before the column existed have none.
  const byCode = new Map<string, { section: string | null; count: number }>();

  for (const d of deadlines ?? []) {
    if (!d.course) continue;
    const entry = byCode.get(d.course) ?? { section: null, count: 0 };
    entry.count += 1;
    if (!entry.section && d.section) entry.section = d.section;
    byCode.set(d.course, entry);
  }

  const rows: CourseRow[] = [...byCode.entries()]
    .map(([code, { section, count }]) => ({
      code,
      section,
      name: names.get(code) ?? null,
      suggested: names.has(code) ? null : suggestName(code, deadlines ?? [], timetable),
      deadlines: count,
    }))
    // Unnamed first, then by how many deadlines each has — the course that
    // matters most is the one asked about first.
    .sort((a, b) => Number(Boolean(a.name)) - Number(Boolean(b.name)) || b.deadlines - a.deadlines);

  return { names, rows };
}
