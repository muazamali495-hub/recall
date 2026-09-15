/**
 * Reading course names out of Moodle's own API.
 *
 * The calendar export carries only a course's shortname —
 * "CS13410|11-BSCS-7A-112001-FALL26" — and no field for the full name. But
 * the extension already runs inside a logged-in Slate page, and Moodle's
 * dashboard fetches the student's courses through an internal web service
 * that returns both. Asking it the same question gives every name in one
 * request, with nothing for the student to type.
 *
 * Kept apart from background.js so the response handling can be tested
 * against a captured payload. This cannot be exercised against Slate from a
 * test, so the shape it expects is pinned down here instead.
 */

export const METHOD = "core_course_get_enrolled_courses_by_timeline_classification";

/**
 * The request Moodle's own "My courses" block makes. `classification` narrows
 * to in-progress, past, future and so on; "all" is what we want, with
 * "inprogress" as a fallback for installs that reject it.
 */
export function courseRequest(classification = "all") {
  return [
    {
      index: 0,
      methodname: METHOD,
      args: {
        offset: 0,
        limit: 0,
        classification,
        sort: "fullname",
        customfieldname: "",
        customfieldvalue: "",
      },
    },
  ];
}

/**
 * Turns Moodle's reply into [{ shortname, fullname }].
 *
 * The service wraps everything: an array of results, each with an `error`
 * flag and a `data` object holding `courses`. Anything malformed yields an
 * empty list rather than a throw — a missing course name is a blank field,
 * not a broken sync.
 */
export function extractCourses(payload) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || first.error) return [];

  const courses = first.data?.courses ?? first.courses;
  if (!Array.isArray(courses)) return [];

  const out = [];

  for (const c of courses) {
    const shortname = typeof c?.shortname === "string" ? c.shortname.trim() : "";
    const fullname = typeof c?.fullname === "string" ? stripHtml(c.fullname) : "";
    if (!shortname || !fullname) continue;

    out.push({ shortname, fullname });
  }

  return out;
}

/** Moodle allows HTML in course names and entities in the export. */
function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
