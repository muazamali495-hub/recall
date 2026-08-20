/**
 * Runs the real extraction against a local timetable file.
 * Usage:  node scripts/test-timetable.ts "<path to pdf or image>"
 */
import { readFileSync } from "node:fs";
import { extractTimetable } from "../lib/vision.ts";

const path = process.argv[2];
if (!path) {
  console.log('Usage: node scripts/test-timetable.ts "<file>"');
  process.exit(1);
}

// The library reads the key from the environment; load it from .env.local.
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const bytes = readFileSync(path);
const mime = path.toLowerCase().endsWith(".pdf")
  ? "application/pdf"
  : path.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

console.log(`Reading ${path} (${(bytes.length / 1024).toFixed(0)} KB, ${mime})…\n`);

const classes = await extractTimetable(bytes.toString("base64"), mime);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

console.log(`Extracted ${classes.length} classes:\n`);
for (const c of classes.sort((a, b) =>
  a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
)) {
  const time = `${c.start_time}${c.end_time ? "-" + c.end_time : ""}`;
  console.log(`  ${DAYS[c.day_of_week]}  ${time.padEnd(13)} ${(c.room ?? "—").padEnd(12)} ${c.course}`);
}
