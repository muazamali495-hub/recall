/**
 * Checks that a failed Slate fetch produces advice that would actually fix it.
 *
 * A 403 from Slate has at least three causes needing three different actions,
 * and for a long time all of them printed "make sure you're logged in" — right
 * about a third of the time, and a wasted afternoon the rest.
 *
 * Run:  node --import ./scripts/register.mjs scripts/test-diagnose.ts
 */
// @ts-expect-error - plain JS module shared with the extension, no types
import { explainFailure } from "../extension/diagnose.js";

let failures = 0;

function check(label: string, result: unknown, mustMention: RegExp, mustNotMention?: RegExp) {
  const message = explainFailure(result) as string;
  const ok = mustMention.test(message) && (!mustNotMention || !mustNotMention.test(message));
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  console.log(`        → ${message}`);
}

console.log("\nWhat the student gets told:\n");

check(
  "signed out — Moodle redirected to the login page",
  {
    ok: false,
    status: 403,
    finalUrl: "https://slate.uol.edu.pk/login/index.php",
    detail: "<html><body>You are not logged in.</body></html>",
  },
  /log in|signed out/i,
  /fresh calendar link/i, // wrong advice for this cause
);

check(
  "Cloudflare interstitial, not Moodle at all",
  {
    ok: false,
    status: 403,
    finalUrl: "https://slate.uol.edu.pk/calendar/export_execute.php",
    detail:
      "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>" +
      "<div id='challenge-platform'>Enable JavaScript and cookies to continue</div></body></html>",
  },
  /cloudflare|wait/i,
  /logged in|fresh calendar link/i, // logging in does not clear a challenge
);

check(
  "calendar token reset — logging in would not help",
  {
    ok: false,
    status: 403,
    finalUrl: "https://slate.uol.edu.pk/calendar/export_execute.php",
    detail: "<html><body><p>Invalid token, the calendar export link is no longer valid</p></body></html>",
  },
  /fresh calendar link|token/i,
);

check(
  "plain 403 with nothing to go on — offer both, in order",
  { ok: false, status: 403, finalUrl: "https://slate.uol.edu.pk/calendar/export_execute.php", detail: "" },
  /logged in.*fresh calendar link/is,
);

check(
  "link deleted",
  { ok: false, status: 404, finalUrl: "https://slate.uol.edu.pk/calendar/export_execute.php", detail: "" },
  /404|fresh/i,
);

check(
  "no network at all",
  { ok: false, status: 0, detail: "", error: "TypeError: Failed to fetch" },
  /internet|reach/i,
);

check(
  "Slate itself is down — do not send them off to fix a link that works",
  { ok: false, status: 503, finalUrl: "https://slate.uol.edu.pk/", detail: "<html>Service Unavailable</html>" },
  /503|trouble/i,
  /fresh calendar link|logged in/i,
);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
