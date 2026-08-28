/**
 * Attendance, and the only question a student actually asks of it:
 * can I miss the next one?
 *
 * UOL detains students below 75%, so this number decides whether someone gets
 * to sit their exams. It is worth more than a percentage, and it is worth
 * being exactly right — "you can miss one more" when they cannot is the kind
 * of wrong that costs a semester.
 *
 * Everything here is integer arithmetic on purpose. Comparing
 * attended / held >= 0.75 in floating point gets 21/28 wrong often enough to
 * matter, and this is not the place to be approximately correct.
 */

export type CourseTotals = {
  course: string;
  /** Classes attended, including any pre-Recall opening balance. */
  attended: number;
  /** Classes actually held — attended plus missed. Cancelled ones are neither. */
  held: number;
  /** The pass mark for this course, as a whole percent. */
  requiredPercent: number;
};

export type CourseVerdict = CourseTotals & {
  /** 0–100, rounded for display. A course with no classes yet reads as 100. */
  percent: number;
  status: "safe" | "warning" | "short";
  /** How many more you could miss in a row and still be at or above the line. */
  canMiss: number;
  /** How many you must now attend in a row to climb back to it. 0 if you're fine. */
  mustAttend: number;
};

/** Nothing above 99 is satisfiable — at 100% a single absence is unrecoverable. */
function clampRequired(percent: number): number {
  if (!Number.isFinite(percent)) return 75;
  return Math.min(99, Math.max(1, Math.round(percent)));
}

export function judge(totals: CourseTotals): CourseVerdict {
  const required = clampRequired(totals.requiredPercent);
  const attended = Math.max(0, Math.round(totals.attended));
  const held = Math.max(attended, Math.round(totals.held));

  // No classes held yet is not 0% — it is "nothing to worry about".
  const percent = held === 0 ? 100 : Math.round((attended * 100) / held);

  // Largest x where required% × (held + x) ≤ attended × 100.
  // held + x can be at most floor(attended × 100 / required), so x follows.
  const canMiss = Math.max(0, Math.floor((attended * 100) / required) - held);

  // Smallest n where (attended + n) × 100 ≥ required × (held + n).
  const deficit = required * held - attended * 100;
  const mustAttend = deficit <= 0 ? 0 : Math.ceil(deficit / (100 - required));

  const meetsLine = attended * 100 >= required * held;

  // Nothing held yet is genuinely 0 further absences allowed — miss the very
  // first class and you are at 0%. But warning someone about a course that has
  // not started is noise, so it stays quiet until there is something to judge.
  const status = held === 0 ? "safe" : !meetsLine ? "short" : canMiss === 0 ? "warning" : "safe";

  return {
    course: totals.course,
    attended,
    held,
    requiredPercent: required,
    percent,
    // "Warning" is the useful state: still above the line, but one absence
    // away from dropping under it. That is the moment to tell someone.
    status,
    canMiss,
    mustAttend,
  };
}

/** The line a student reads first. Say the consequence, not the arithmetic. */
export function summarise(v: CourseVerdict): string {
  if (v.held === 0) return "No classes marked yet.";

  if (v.status === "short") {
    return v.mustAttend === 1
      ? "Below the line — attend the next one to recover."
      : `Below the line — attend the next ${v.mustAttend} to recover.`;
  }

  if (v.status === "warning") return "At the line — missing one more drops you under.";

  return v.canMiss === 1 ? "You can miss 1 more." : `You can miss ${v.canMiss} more.`;
}

export type ClassRow = {
  id: string;
  course: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  room: string | null;
};

export type Mark = { class_id: string; on_date: string; status: string };

export type UnmarkedClass = {
  classId: string;
  course: string;
  room: string | null;
  onDate: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
};

/** Everyone here is at the University of Lahore, so local time is UTC+5. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Classes that have already happened and haven't been marked yet.
 *
 * Looks back a week rather than only at today, because the students most
 * likely to be near the line are the ones least likely to have opened the app
 * every evening. Being able to catch up on Sunday is what makes the numbers
 * real rather than aspirational.
 */
export function findUnmarked(
  now: Date,
  classes: ClassRow[],
  marks: Mark[],
  daysBack = 7,
): UnmarkedClass[] {
  const done = new Set(marks.map((m) => `${m.class_id}:${m.on_date}`));
  const out: UnmarkedClass[] = [];

  for (let back = 0; back <= daysBack; back++) {
    const local = new Date(now.getTime() + PKT_OFFSET_MS - back * 86_400_000);
    const weekday = local.getUTCDay();
    const onDate = local.toISOString().slice(0, 10);

    for (const c of classes) {
      if (c.day_of_week !== weekday) continue;
      if (done.has(`${c.id}:${onDate}`)) continue;

      const [h, m] = c.start_time.split(":").map(Number);

      // Don't ask about a class that hasn't started. Today's 15:30 lecture is
      // not something you can answer at 09:00, and asking makes the list feel
      // like noise.
      if (back === 0) {
        const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
        if (h * 60 + m > minutesNow) continue;
      }

      out.push({
        classId: c.id,
        course: c.course,
        room: c.room,
        onDate,
        startTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      });
    }
  }

  // Most recent first: the class you just walked out of is the one you can
  // actually remember.
  return out.sort((a, b) =>
    a.onDate === b.onDate ? b.startTime.localeCompare(a.startTime) : b.onDate.localeCompare(a.onDate),
  );
}

/** Folds marks and any pre-Recall opening balance into one total per course. */
export function totalsByCourse(
  classes: ClassRow[],
  marks: Mark[],
  baselines: Array<{ course: string; attended: number; held: number; required_percent: number }>,
): CourseTotals[] {
  const byId = new Map(classes.map((c) => [c.id, c.course]));
  const totals = new Map<string, { attended: number; held: number; required: number }>();

  const ensure = (course: string) => {
    let row = totals.get(course);
    if (!row) {
      row = { attended: 0, held: 0, required: 75 };
      totals.set(course, row);
    }
    return row;
  };

  // Opening balance first: a student joining in week 10 has a history Recall
  // never saw, and a tracker that starts from zero would tell them they are
  // fine when they are one absence from detention.
  for (const b of baselines) {
    const row = ensure(b.course);
    row.attended += Math.max(0, b.attended);
    row.held += Math.max(0, b.held);
    row.required = b.required_percent;
  }

  for (const mark of marks) {
    const course = byId.get(mark.class_id);
    if (!course) continue; // the class was deleted; its marks mean nothing now

    const row = ensure(course);

    // A cancelled class was never held, so it belongs in neither total.
    if (mark.status === "present") {
      row.attended += 1;
      row.held += 1;
    } else if (mark.status === "absent") {
      row.held += 1;
    }
  }

  // Courses on the timetable with nothing marked still deserve a row — an
  // empty one reads as "start here", a missing one reads as a bug.
  for (const c of classes) ensure(c.course);

  return [...totals.entries()]
    .map(([course, row]) => ({
      course,
      attended: row.attended,
      held: row.held,
      requiredPercent: row.required,
    }))
    .sort((a, b) => a.course.localeCompare(b.course));
}
