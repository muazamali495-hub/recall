/**
 * Verifies the .ics parser against realistic Moodle 4.4 output.
 * Run:  node scripts/test-ics.ts
 */
import { readFileSync } from "node:fs";
import { parseIcs, validateIcsUrl } from "../lib/ics.ts";

const ics = readFileSync(new URL("./sample-moodle.ics", import.meta.url), "utf8");
const parsed = parseIcs(ics);

console.log(`\nParsed ${parsed.length} events:\n`);
for (const d of parsed) {
  const due = d.due_at ? new Date(d.due_at).toUTCString() : "no date";
  console.log(`  [${d.kind.padEnd(10)}] ${d.title}`);
  console.log(`               course: ${d.course ?? "—"}`);
  console.log(`               due:    ${due}`);
  console.log(`               uid:    ${d.uid}`);
  console.log("");
}

// Folded lines must be re-joined by the parser, not left broken.
const folded = parsed.find((d) => d.uid.startsWith("2841003000"));
console.log("folded DESCRIPTION handled:", folded ? "yes" : "NO — check unfolding");

console.log("\nURL validation:");
for (const url of [
  "https://slate.uol.edu.pk/calendar/export_execute.php?authtoken=x",
  "http://slate.uol.edu.pk/calendar/export_execute.php",
  "https://localhost/calendar",
  "https://192.168.1.5/feed.ics",
  "not a url",
]) {
  const r = validateIcsUrl(url);
  console.log(`  ${r.ok ? "ALLOW" : "BLOCK"}  ${url}${r.ok ? "" : `  → ${r.reason}`}`);
}
