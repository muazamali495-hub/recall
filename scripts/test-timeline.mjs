/**
 * The extension's reading of Moodle's action-events reply, against a fixture.
 *
 * Slate cannot be called from a test — Cloudflare, and a real session — so
 * this pins down the parsing against the shape the API documents. The one
 * rule that matters most: an event marked "not yet actionable" is still
 * OPEN, never done. Only absence from the list means finished.
 *
 * Run:  node scripts/test-timeline.mjs
 */
import { timelineRequest, extractActionable, METHOD, PAGE } from "../extension/timeline.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// ---- Request shape ----
const [req] = timelineRequest(1_700_000_000);
check("request names the action-events method", req.methodname === METHOD);
check("request starts at the given time", req.args.timesortfrom === 1_700_000_000);
check("first page has no cursor", req.args.aftereventid === 0);
check("page size is Moodle's cap", req.args.limitnum === PAGE && PAGE === 50);
check("next page carries the cursor", timelineRequest(1, 2841003)[0].args.aftereventid === 2841003);

// ---- The documented reply shape ----
const reply = [
  {
    error: false,
    data: {
      events: [
        { id: 2841003, name: "Assignment 2 is due", action: { actionable: true } },
        { id: 2841010, name: "Quiz 3 opens", action: { actionable: false } }, // not open yet
        { id: 2841022, name: "Lab report", action: { actionable: true } },
      ],
      firstid: 2841003,
      lastid: 2841022,
    },
  },
];

const page = extractActionable(reply);
check("every listed event counts as open", page.ids.join(",") === "2841003,2841010,2841022");
check("a not-yet-actionable event is still open, not done", page.ids.includes(2841010));
check("cursor is Moodle's lastid", page.lastId === 2841022);
check("fewer than a page means no more", page.more === false);

// ---- A full page asks for another ----
const full = [{ error: false, data: {
  events: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })),
  lastid: 149,
} }];
const fullPage = extractActionable(full);
check("a full page asks for the next", fullPage.more === true && fullPage.lastId === 149);

// ---- Garbage in, empty out ----
check("moodle error → nothing", extractActionable([{ error: true, exception: { message: "x" } }]).ids.length === 0);
check("missing data → nothing", extractActionable([{}]).ids.length === 0);
check("non-array → nothing", extractActionable("nope").ids.length === 0);
check("bad ids dropped", extractActionable([{ data: { events: [{ id: "abc" }, { id: -1 }, { id: 7 }] } }]).ids.join() === "7");
check("no lastid → falls back to last event", extractActionable([{ data: { events: [{ id: 5 }, { id: 9 }] } }]).lastId === 9);

// ---- The .ics UID joins to these ids ----
// The server does split_part(uid, '@', 1)::bigint; this is the same rule.
const uid = "2841003000@slate.uol.edu.pk";
check("ics uid prefix is a Moodle event id", Number(uid.split("@")[0]) === 2841003000);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
