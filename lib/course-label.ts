/**
 * How a course is named on screen.
 *
 * Slate gives Recall a code and, with some work, a section — never the name.
 * The name comes from the student, once. This is the one place that decides
 * how those three things are put together, so a deadline on the dashboard, a
 * push notification and a line in Ask Recall's prompt all say the same thing.
 */

export type CourseNames = ReadonlyMap<string, string>;

/**
 * "Intro to Machine Learning · CS13410 · BSCS-7A" when named,
 * "CS13410 · BSCS-7A" when not, and "—" when there is nothing at all.
 *
 * The code stays even once there is a name. Two courses can share a name
 * across sections and semesters; the code is the thing that is actually
 * unique, and it is what a student sees on Slate.
 */
export function courseLabel(
  code: string | null | undefined,
  section: string | null | undefined,
  names: CourseNames,
): string {
  if (!code) return "—";

  const name = names.get(code);
  return [name, code, section].filter(Boolean).join(" · ");
}

/** Just the friendly name, falling back to the code. For tight spaces. */
export function courseName(code: string | null | undefined, names: CourseNames): string {
  if (!code) return "—";
  return names.get(code) ?? code;
}

/** Turns the rows of the courses table into the lookup the label needs. */
export function namesFrom(rows: Array<{ code: string; name: string }> | null | undefined): CourseNames {
  return new Map((rows ?? []).map((r) => [r.code, r.name]));
}

/**
 * Codes that appear in the student's deadlines but have no name yet — what
 * the "name your courses" panel shows. Ordered by how often each code appears,
 * so the course with the most deadlines is asked about first.
 */
export function unnamedCodes(
  deadlines: Array<{ course: string | null }>,
  names: CourseNames,
): string[] {
  const counts = new Map<string, number>();

  for (const d of deadlines) {
    if (!d.course || names.has(d.course)) continue;
    counts.set(d.course, (counts.get(d.course) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
}

/**
 * A best guess at a course's name from its deadline titles.
 *
 * Teachers often write the course into the title — "Assignment No 1 Machine
 * Learning", "_Assignment 4_DLD Theory". Matching those against the
 * timetable's course names turns a blank field into a suggestion the student
 * only has to confirm. It is a suggestion and nothing more: when nothing
 * matches, the field is simply left empty.
 */
export function suggestName(
  code: string,
  deadlines: Array<{ course: string | null; title: string }>,
  timetableCourses: string[],
): string | null {
  const titles = deadlines
    .filter((d) => d.course === code)
    .map((d) => d.title.toLowerCase());

  if (titles.length === 0) return null;

  const haystack = titles.join(" ");

  // Prefer the longest timetable name that appears in any title, so "Machine
  // Learning" beats "ML" when both would match.
  const candidates = timetableCourses
    .map((c) => c.trim())
    .filter((c) => c.length >= 4)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    if (haystack.includes(candidate.toLowerCase())) return candidate;
  }

  return null;
}
