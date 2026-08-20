export type ReminderPrefs = {
  class_minutes_before: number;
  deadline_hours_ahead: number[];
  enabled: boolean;
};

export type ClassRow = {
  id: string;
  course: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  room: string | null;
};

export type DeadlineRow = {
  id: string;
  title: string;
  course: string | null;
  kind: string;
  due_at: string;
};

export type PlannedReminder = {
  kind: "class" | "deadline";
  refId: string;
  windowKey: string;
  title: string;
  body: string;
  url: string;
};

/** Everyone here is at the University of Lahore, so local time is UTC+5. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function pakistanNow(now: Date) {
  return new Date(now.getTime() + PKT_OFFSET_MS);
}

const KIND_WORDS: Record<string, string> = {
  quiz: "Quiz",
  exam: "Exam",
  assignment: "Assignment",
  other: "Deadline",
};

/**
 * Works out which reminders are due right now.
 *
 * Kept as a pure function so it can be tested without a database, a browser,
 * or a push service — the scheduling logic is the part most likely to be
 * subtly wrong, so it needs to be checkable in isolation.
 */
export function planReminders(
  now: Date,
  prefs: ReminderPrefs,
  classes: ClassRow[],
  deadlines: DeadlineRow[],
): PlannedReminder[] {
  if (!prefs.enabled) return [];

  const planned: PlannedReminder[] = [];

  // ---- Classes ----
  const local = pakistanNow(now);
  const today = local.getUTCDay();
  const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
  const lead = prefs.class_minutes_before;

  for (const c of classes) {
    if (c.day_of_week !== today) continue;

    const [h, m] = c.start_time.split(":").map(Number);
    const startsAt = h * 60 + m;
    const minutesUntil = startsAt - minutesNow;

    // Fire once inside the lead window, never after the class has begun.
    if (minutesUntil <= 0 || minutesUntil > lead) continue;

    const dateKey = local.toISOString().slice(0, 10);

    planned.push({
      kind: "class",
      refId: `${c.id}:${dateKey}`,
      windowKey: `${lead}m`,
      title:
        minutesUntil <= 5
          ? `${c.course} is starting`
          : `${c.course} in ${minutesUntil} min`,
      body: c.room ? `Room ${c.room}` : "Room not set",
      url: "/dashboard",
    });
  }

  // ---- Deadlines ----
  for (const d of deadlines) {
    const dueMs = new Date(d.due_at).getTime() - now.getTime();
    if (dueMs <= 0) continue;

    const hoursUntil = dueMs / 3_600_000;

    // Each configured lead time fires once. Sorting ascending means the
    // tightest matching window wins, so "2 hours left" beats "1 day left".
    //
    // Number() is not decorative: the column is numeric[], and Postgres
    // numerics can arrive as strings, which would make the sort and the
    // comparison below silently wrong.
    const windows = prefs.deadline_hours_ahead.map(Number).sort((a, b) => a - b);
    const hit = windows.find((w) => hoursUntil <= w);
    if (hit === undefined) continue;

    const label = KIND_WORDS[d.kind] ?? "Deadline";
    const hours = Math.round(hoursUntil);
    const when =
      hoursUntil < 1
        ? `due in ${Math.max(1, Math.round(hoursUntil * 60))} min`
        : hoursUntil < 24
          ? `due in ${hours} ${hours === 1 ? "hour" : "hours"}`
          : `due tomorrow`;

    planned.push({
      kind: "deadline",
      refId: d.id,
      windowKey: `${hit}h`,
      title: `${label} ${when}`,
      body: d.course ? `${d.title} · ${d.course}` : d.title,
      url: "/dashboard",
    });
  }

  return planned;
}
