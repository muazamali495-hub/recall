/**
 * Checks that a calendar link can only point at Slate — in the extension,
 * which is the component that actually fetches it.
 *
 * The website validated this and the extension did not, and only one of them
 * performs the request. The extension fetches whatever URL it holds from
 * inside a logged-in Slate page and posts the response body to Recall, so a
 * "starts with https://" check made it a general-purpose fetcher aimed
 * wherever the link said — including addresses on the student's own home
 * network, which no server-side check could ever reach.
 *
 * Run:  node scripts/test-calendar-url.mjs
 */
import { isSlateCalendarUrl, SLATE_ORIGIN } from "../extension/config.js";
import { readFileSync } from "node:fs";

let failures = 0;

function check(label, input, expected) {
  const got = isSlateCalendarUrl(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        ${JSON.stringify(input)} -> ${got}, wanted ${expected}`);
}

console.log(`\nAllowed — only ${SLATE_ORIGIN}:\n`);
check("a real Moodle export link", `${SLATE_ORIGIN}/calendar/export_execute.php?authtoken=abc123`, true);
check("any path on Slate", `${SLATE_ORIGIN}/anything`, true);
check("surrounding whitespace is trimmed", `  ${SLATE_ORIGIN}/calendar/export_execute.php  `, true);

console.log("\nRejected — every one of these was previously accepted:\n");
check("somewhere else entirely", "https://evil.example/feed.ics", false);
check("the student's own router", "https://192.168.1.1/admin", false);
check("loopback", "https://localhost/calendar", false);
check("link-local metadata", "https://169.254.169.254/latest/meta-data/", false);
check("a lookalike host", "https://slate.uol.edu.pk.evil.example/x", false);
check("a subdomain of Slate", "https://evil.slate.uol.edu.pk/x", false);
check("plain http", "http://slate.uol.edu.pk/calendar", false);
check("a different port", "https://slate.uol.edu.pk:8443/calendar", false);
check("userinfo pointing elsewhere", "https://slate.uol.edu.pk@evil.example/x", false);
check("not a url", "not a url", false);
check("empty", "", false);
check("missing", undefined, false);

console.log("\nThe gate is actually wired in, not merely defined:\n");

const background = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");

// Both matter. Rejecting at SET_ICAL_URL stops a bad link being stored; the
// second catches a value written before this rule existed, and is the line
// immediately before the fetch happens.
const gatedOnSet = /case "SET_ICAL_URL":[\s\S]{0,400}?isSlateCalendarUrl/.test(background);
const gatedOnUse = /if \(!isSlateCalendarUrl\(icalUrl\)\)/.test(background);

if (!gatedOnSet) failures++;
if (!gatedOnUse) failures++;
console.log(`  ${gatedOnSet ? "PASS" : "FAIL"}  SET_ICAL_URL refuses a non-Slate link`);
console.log(`  ${gatedOnUse ? "PASS" : "FAIL"}  the stored link is re-checked before fetching`);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
