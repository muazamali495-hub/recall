import ICAL from "ical.js";

export type DeadlineKind = "assignment" | "quiz" | "exam" | "other";

export type ParsedDeadline = {
  uid: string;
  title: string;
  course: string | null;
  kind: DeadlineKind;
  due_at: string | null; // ISO 8601
  source_url: string | null;
};

/**
 * Blocks obviously-unsafe URLs before the server fetches them.
 *
 * This matters: the student hands us a URL and our server requests it.
 * Without these checks someone could point Recall at an internal address
 * and use our server to probe a private network (an SSRF attack).
 */
export function validateIcsUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "The link must start with https:// so your calendar travels encrypted." };
  }

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isPrivate) {
    return { ok: false, reason: "That address isn't reachable. Use the calendar link from Slate." };
  }

  return { ok: true, url };
}

/** Moodle titles look like "Assignment 3 is due" or "Quiz 2 opens". */
function classify(title: string, sourceUrl: string | null): DeadlineKind {
  const haystack = `${sourceUrl ?? ""} ${title}`.toLowerCase();

  // Exams first — they outrank "quiz" when a title mentions both.
  if (/\bexams?\b|\bexamination|\bmid[-\s]?terms?\b|\bfinals?[-\s]?terms?\b/.test(haystack)) {
    return "exam";
  }

  if (haystack.includes("/mod/quiz") || /\bquiz|\bviva\b|\btests?\b/.test(haystack)) return "quiz";

  // "... is due" is Moodle's own wording for a submission deadline, so it
  // catches real titles like "LAB 08 is due" that name no module type.
  if (
    haystack.includes("/mod/assign") ||
    /\bassign|\blab\b|\bhomework\b|\bsubmission\b|\bis due\b|\bdue\b/.test(haystack)
  ) {
    return "assignment";
  }

  return "other";
}

/**
 * Teachers often prefix the date into the title ("18-08-2026 : Quiz 4"),
 * which duplicates the due-date column and eats the space we have to show
 * the actual name.
 */
function tidyTitle(raw: string): string {
  return raw
    .replace(/^\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*[:\-–—]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim() || raw.trim();
}

/**
 * Moodle's CATEGORIES holds the full course shortname, e.g.
 * "MAT01212|11-BSCS-3A-112001-SUM26". The part before the pipe is the
 * course code a student actually recognises.
 */
function tidyCourse(raw: string | null): string | null {
  if (!raw) return null;
  const code = raw.split("|")[0]?.trim();
  return code?.length ? code : raw;
}

/** Strips Moodle's HTML out of a course/category string. */
function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

/**
 * Moodle posts a quiz twice — once for "opens" and once for "closes" — so a
 * single quiz fills two rows on the dashboard. A student only cares about one
 * thing: when it shuts. We fold the pair into one entry and keep the closing
 * time, because that is the actual deadline.
 */
function mergeOpenClosePairs(items: ParsedDeadline[]): ParsedDeadline[] {
  const kept = new Map<string, ParsedDeadline>();
  const out: ParsedDeadline[] = [];

  for (const item of items) {
    const match = item.title.match(/^(.*?)[\s—-]*\b(opens?|closes?)\b\s*$/i);

    if (!match) {
      out.push(item);
      continue;
    }

    const base = match[1].trim() || item.title;
    const isClosing = /^close/i.test(match[2]);
    const key = `${base.toLowerCase()}|${item.course ?? ""}`;
    const existing = kept.get(key);

    if (!existing) {
      const merged = { ...item, title: base };
      kept.set(key, merged);
      out.push(merged);
      continue;
    }

    // Seen this quiz already — the closing event wins, since that's the deadline.
    if (isClosing) {
      existing.due_at = item.due_at;
      existing.uid = item.uid;
      existing.source_url = item.source_url ?? existing.source_url;
    }
  }

  return out;
}

/**
 * Turns raw .ics text into deadline rows.
 * Events without a UID are skipped — we need it to de-duplicate on re-sync.
 */
export function parseIcs(icsText: string): ParsedDeadline[] {
  const comp = new ICAL.Component(ICAL.parse(icsText));
  const events = comp.getAllSubcomponents("vevent");

  const out: ParsedDeadline[] = [];

  // Moodle can emit the same deadline more than once — e.g. a quiz's "opens"
  // and "closes" events, or one copy per group a student belongs to. They
  // carry different UIDs, so the database can't collapse them; we do it here.
  const seen = new Set<string>();

  for (const vevent of events) {
    const uid = vevent.getFirstPropertyValue("uid");
    if (!uid) continue;

    const rawSummary = clean(String(vevent.getFirstPropertyValue("summary") ?? "")) ?? "Untitled";
    const summary = tidyTitle(rawSummary);
    const sourceUrl = clean(String(vevent.getFirstPropertyValue("url") ?? "")) ?? null;
    const course = tidyCourse(clean(String(vevent.getFirstPropertyValue("categories") ?? "")));

    let dueAt: string | null = null;
    const dtstart = vevent.getFirstPropertyValue("dtstart");
    if (dtstart && typeof (dtstart as { toJSDate?: unknown }).toJSDate === "function") {
      dueAt = (dtstart as unknown as ICAL.Time).toJSDate().toISOString();
    }

    const fingerprint = `${summary}|${course ?? ""}|${dueAt ?? ""}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    out.push({
      uid: String(uid),
      title: summary,
      course,
      kind: classify(rawSummary, sourceUrl),
      due_at: dueAt,
      source_url: sourceUrl,
    });
  }

  return mergeOpenClosePairs(out);
}

/** Fetches the feed and parses it. Never logs the URL — it contains a secret token. */
export async function fetchAndParseIcs(url: URL): Promise<ParsedDeadline[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Slate returned 'not found' for that link. Generate a fresh calendar URL and try again."
        : `Slate returned an error (${res.status}). Your link may have expired — generate a new one.`,
    );
  }

  const text = await res.text();

  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("That link didn't return a calendar. Make sure you copied the 'Get calendar URL' link from Slate.");
  }

  return parseIcs(text);
}
