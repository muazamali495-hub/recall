/**
 * Checks the reminder scheduling rules without a database or a browser.
 * Run:  node scripts/test-reminders.ts
 */
import { planReminders, type ClassRow, type DeadlineRow } from "../lib/reminders.ts";

const prefs = { class_minutes_before: 15, deadline_hours_ahead: [24, 2, 0.5], enabled: true };

// 2026-08-19 is a Wednesday. 09:00 UTC = 14:00 in Pakistan.
const NOW = new Date("2026-08-19T09:00:00Z");

const classes: ClassRow[] = [
  { id: "c1", course: "Calculus", day_of_week: 3, start_time: "14:10:00", room: "FIT-308" }, // in 10 min
  { id: "c2", course: "OOP", day_of_week: 3, start_time: "16:00:00", room: "CS-001" }, // in 120 min
  { id: "c3", course: "Physics", day_of_week: 3, start_time: "13:00:00", room: "LB3-01" }, // started 60 min ago
  { id: "c4", course: "Discrete", day_of_week: 4, start_time: "14:20:00", room: "CS-005" }, // tomorrow
  { id: "c5", course: "Databases", day_of_week: 3, start_time: "13:52:00", room: "CS-110" }, // started 8 min ago
  { id: "c6", course: "Networks", day_of_week: 3, start_time: "14:14:00", room: "CS-204" }, // in 14 min
];

const deadlines: DeadlineRow[] = [
  { id: "d1", title: "Quiz 5", course: "MAT01212", kind: "quiz", due_at: "2026-08-19T10:00:00Z" }, // 1h
  { id: "d2", title: "LAB 08", course: "CSC02141", kind: "assignment", due_at: "2026-08-20T06:00:00Z" }, // 21h
  { id: "d3", title: "Project", course: "SE", kind: "assignment", due_at: "2026-08-22T09:00:00Z" }, // 72h
  { id: "d4", title: "Old quiz", course: "X", kind: "quiz", due_at: "2026-08-19T08:00:00Z" }, // passed
  { id: "d5", title: "Quiz 6", course: "MAT", kind: "quiz", due_at: "2026-08-19T09:23:00Z" }, // 23 min
];

const planned = planReminders(NOW, prefs, classes, deadlines);

console.log(`\nPlanned ${planned.length} reminders:\n`);
for (const p of planned) {
  console.log(`  [${p.kind.padEnd(8)} ${p.windowKey.padEnd(4)}] ${p.title}`);
  console.log(`                   ${p.body}`);
}

const ids = planned.map((p) => p.refId.split(":")[0]);
const expect = (label: string, pass: boolean) =>
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);

console.log("\nRules:");
expect("class 10 min away is reminded", ids.includes("c1"));
expect("class 2 hours away is not (outside the 15 min lead)", !ids.includes("c2"));
expect("class that started an hour ago is not", !ids.includes("c3"));
expect("tomorrow's class is not", !ids.includes("c4"));

// The bug this catches: with a strict window, a run that landed a few minutes
// late skipped the class entirely and it was never announced. On a four-class
// day that showed up as a single notification.
expect("class that started 8 min ago still gets a catch-up", ids.includes("c5"));
expect(
  "and the catch-up says so rather than pretending it is upcoming",
  planned.find((p) => p.refId.startsWith("c5"))?.title === "Databases started 8 min ago",
);
expect("class 14 min away is reminded", ids.includes("c6"));

// Every class stands alone: three of today's six are inside the band, and all
// three must be planned. A shared dedupe key would collapse them into one.
const classCount = planned.filter((p) => p.kind === "class").length;
expect(`all three in-band classes are planned (got ${classCount})`, classCount === 3);
expect(
  "each class has its own dedupe key",
  new Set(planned.filter((p) => p.kind === "class").map((p) => `${p.refId}|${p.windowKey}`)).size === 3,
);

// Changing the lead-time preference must not re-open reminders already sent
// today — the key is per class per day, never per lead time.
const otherLead = planReminders(NOW, { ...prefs, class_minutes_before: 30 }, classes, deadlines);
expect(
  "the dedupe key does not move when the lead time changes",
  otherLead.find((p) => p.refId.startsWith("c1"))?.windowKey ===
    planned.find((p) => p.refId.startsWith("c1"))?.windowKey,
);
expect("quiz due in 1h is reminded", ids.includes("d1"));
expect("assignment due in 21h is reminded", ids.includes("d2"));
expect("deadline 3 days out is not", !ids.includes("d3"));
expect("passed deadline is not", !ids.includes("d4"));

const quiz = planned.find((p) => p.refId === "d1");
expect("tightest window wins for the 1h quiz (2h, not 24h)", quiz?.windowKey === "2h");
const last = planned.find((p) => p.refId === "d5");
expect("quiz 23 min away gets a last-minute alert", Boolean(last));
expect("and it uses the 0.5h window", last?.windowKey === "0.5h");
