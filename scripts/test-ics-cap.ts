/**
 * Checks that one calendar cannot fill the database.
 *
 * /api/sync caps the raw feed at 2MB, but a minimal VEVENT is about 200 bytes,
 * so that alone allows roughly ten thousand deadlines from a single sync —
 * enough to exhaust a free-tier database and take Recall down for everyone.
 *
 * Run:  node --import ./scripts/register.mjs scripts/test-ics-cap.ts
 */
import { parseIcs, MAX_EVENTS } from "../lib/ics.ts";

const CRLF = "\r\n";
const HEADER = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ""].join(CRLF);
const FOOTER = ["END:VCALENDAR", ""].join(CRLF);

function calendarOf(count: number): string {
  const events = Array.from({ length: count }, (_, i) =>
    [
      "BEGIN:VEVENT",
      `UID:flood-${i}@example.test`,
      `SUMMARY:Flood ${i}`,
      "DTSTART:20260901T090000Z",
      "END:VEVENT",
      "",
    ].join(CRLF),
  ).join("");

  return HEADER + events + FOOTER;
}

let failures = 0;

function expect(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log(`\nEvent cap (MAX_EVENTS = ${MAX_EVENTS}):\n`);

// A real student's calendar. The busiest account on this system holds twelve,
// so fifty is already generous.
{
  let parsed = -1;
  try {
    parsed = parseIcs(calendarOf(50)).length;
  } catch (err) {
    console.log(`        unexpected: ${(err as Error).message}`);
  }
  expect("an ordinary calendar still parses", parsed === 50, `${parsed} events`);
}

// Exactly at the limit must be allowed — an off-by-one here would refuse a
// legitimate feed, and the student would have no idea why.
{
  let ok = false;
  try {
    ok = parseIcs(calendarOf(MAX_EVENTS)).length === MAX_EVENTS;
  } catch {
    ok = false;
  }
  expect(`exactly ${MAX_EVENTS} is allowed`, ok);
}

{
  let refused = false;
  let message = "";
  try {
    parseIcs(calendarOf(MAX_EVENTS + 1));
  } catch (err) {
    refused = true;
    message = (err as Error).message;
  }

  expect(`${MAX_EVENTS + 1} is refused`, refused);
  expect(
    "and says something a student can act on",
    /far more than a semester/i.test(message) && /\d+/.test(message),
  );
  if (refused) console.log(`        "${message.slice(0, 90)}…"`);
}

// The point of refusing rather than truncating: silently keeping the first
// thousand would hide whether the feed is broken or someone is probing.
{
  let truncated = false;
  try {
    truncated = parseIcs(calendarOf(MAX_EVENTS + 500)).length === MAX_EVENTS;
  } catch {
    truncated = false;
  }
  expect("oversized calendars are refused, never silently truncated", !truncated);
}

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
