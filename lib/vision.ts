import { callVisionModel, LlmNotConfigured } from "./llm";

export type ExtractedClass = {
  course: string;
  day_of_week: number; // 0 = Sunday … 6 = Saturday
  start_time: string; // "HH:MM"
  end_time: string | null;
  room: string | null;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * We go through OpenRouter rather than calling Google directly: the Gemini
 * developer API refuses requests from some regions (Pakistan included), while
 * OpenRouter proxies models from anywhere.
 *
 * Free vision pools are shared and slow under load — reading a timetable can
 * take 45 seconds or more, and it barely depends on how many pages we send.
 * callVisionModel races two pools and takes whichever answers first.
 */
const MODEL_CHAIN = (
  process.env.OPENROUTER_MODELS ??
  [
    // Tested against a real UOL timetable: minimax returned well-formed JSON
    // with 9 classes in 7 seconds. Of the other free vision pools available at
    // the time, dots, nemotron and the auto-router all returned empty content
    // on the same image, and both gemma pools were 429.
    "minimax/minimax-m3:free",
    "google/gemma-4-26b-a4b-it:free",
    "openrouter/free",
    "google/gemma-4-31b-it:free",
  ].join(",")
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export { LlmNotConfigured };

function buildPrompt(section: string) {
  const target = section.trim()
    ? `Find ONLY the row labelled "${section.trim()}". Ignore every other row completely.`
    : "Extract every class you can see.";

  return `This is a university class timetable from the University of Lahore.

It is usually a grid: rows are class sections (like BSCS-3A), columns are days of the week, and each day is split into numbered periods whose start and end times appear in the header. A filled cell normally holds a teacher name, a course name, and a room code.

${target}

For each filled cell, output one entry. Count the columns carefully so each class lands in the right day and the right period — getting the time wrong matters more than getting the name perfect.

Return ONLY JSON, no prose and no markdown fences:
{"classes":[{"course":"Calculus","day":"Monday","start_time":"09:30","end_time":"10:45","room":"FIT-308"}]}

Rules:
- "day" must be one of: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
- Times must be 24-hour "HH:MM", taken from the period header above the column.
- A class spanning two periods uses the first period's start and the last period's end.
- Copy course names and room codes exactly as printed.
- Use "" for end_time or room when they are not shown.
- Ignore break rows, empty cells, headers and footers.
- If you cannot find the requested row, return {"classes":[]}.`;
}

/**
 * Reads timetable page images and returns the classes they contain.
 *
 * Accuracy is a first draft, not gospel: free models frequently misalign a
 * column or two on dense grids, so the caller must let the student correct
 * the result before it is saved.
 */
export async function extractTimetable(
  images: string[],
  section: string,
): Promise<ExtractedClass[]> {
  if (images.length === 0) return [];

  const raw = await callVisionModel(buildPrompt(section), images, MODEL_CHAIN);

  const parsed = parseLoosely(raw);
  if (!parsed) throw new Error("Could not read that timetable. Try a clearer image.");

  return (parsed.classes ?? []).flatMap((row) => {
    const dayIndex = DAYS.indexOf(row.day as (typeof DAYS)[number]);
    const start = normaliseTime(row.start_time);

    // A class with no day or no start time can't be placed on a schedule.
    if (dayIndex < 0 || !start) return [];

    return [
      {
        course: row.course?.trim() || "Untitled",
        day_of_week: dayIndex,
        start_time: start,
        end_time: normaliseTime(row.end_time),
        room: row.room?.trim() ? row.room.trim() : null,
      },
    ];
  });
}

/**
 * Free models ignore strict JSON-schema enforcement, so they often wrap the
 * answer in prose or ```json fences. We take the outermost JSON object rather
 * than trusting the reply to be clean.
 */
function parseLoosely(text: string): { classes?: Array<Record<string, string>> } | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Accepts "9:30", "09:30", "9:30 AM" and returns "HH:MM", or null. */
function normaliseTime(value: string | undefined): string | null {
  if (!value) return null;

  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
