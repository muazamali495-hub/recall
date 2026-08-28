/**
 * Checks the attendance maths.
 *
 * This decides whether a student believes they can skip a lecture, so being
 * off by one is not a rounding detail — it is the difference between sitting
 * an exam and being detained. Every boundary case below is exact.
 *
 * Run:  node --import ./scripts/register.mjs scripts/test-attendance.ts
 */
import { judge, summarise, findUnmarked, totalsByCourse, type ClassRow } from "../lib/attendance.ts";

let failures = 0;

function expect(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const at = (attended: number, held: number, requiredPercent = 75) =>
  judge({ course: "X", attended, held, requiredPercent });

console.log("\nThe number that matters — how many more can I miss?\n");

// 26/30 = 86.7%. Miss 4 more → 26/34 = 76.5%, still up. Miss 5 → 26/35 = 74.3%, under.
{
  const v = at(26, 30);
  expect("26/30 at 75% allows exactly 4 more", v.canMiss === 4, `got ${v.canMiss}`);
  expect("  and 4 more really does stay above the line", (26 * 100) / (30 + 4) >= 75);
  expect("  while 5 more really does drop under", (26 * 100) / (30 + 5) < 75);
}

// 21/28 = exactly 75%. On the line: one more absence drops you under.
{
  const v = at(21, 28);
  expect("21/28 is exactly on the line", v.percent === 75 && v.status === "warning");
  expect("  and allows no further absence", v.canMiss === 0, `got ${v.canMiss}`);
  expect("  and needs no catching up", v.mustAttend === 0);
}

// 19/27 = 70.4%, below. Attend 5 → 24/32 = 75% exactly.
{
  const v = at(19, 27);
  expect("19/27 is short", v.status === "short" && v.percent === 70);
  expect("  and needs 5 in a row to recover", v.mustAttend === 5, `got ${v.mustAttend}`);
  expect("  and 5 really does reach the line", ((19 + 5) * 100) / (27 + 5) >= 75);
  expect("  while 4 really does not", ((19 + 4) * 100) / (27 + 4) < 75);
}

console.log("\nEdges:\n");

{
  const v = at(0, 0);
  expect("no classes held reads as 100%, not 0%", v.percent === 100 && v.status === "safe");
  expect("  and says so rather than quoting a percentage", summarise(v) === "No classes marked yet.");
}

expect("a perfect record is safe", at(10, 10).status === "safe");
expect("  and allows 3 misses at 75%", at(10, 10).canMiss === 3, `got ${at(10, 10).canMiss}`);
expect("total absence is short", at(0, 5).status === "short");
expect("  and needs 15 to recover from 0/5", at(0, 5).mustAttend === 15, `got ${at(0, 5).mustAttend}`);
expect("  which checks out", (15 * 100) / (5 + 15) >= 75);

// 80% courses exist; the threshold must not be hardcoded anywhere.
{
  const v = at(24, 30, 80);
  expect("80% threshold is respected (24/30 = 80%, on the line)", v.status === "warning" && v.canMiss === 0);
}

// A required percentage of 100 would make one absence unrecoverable and the
// recovery maths divide by zero.
{
  const v = at(9, 10, 100);
  expect("an impossible 100% requirement is clamped, not divided by", Number.isFinite(v.mustAttend));
}

console.log("\nWording:\n");
expect("safe course names the number", summarise(at(26, 30)) === "You can miss 4 more.");
// 23/29 = 79.3%; miss one → 23/30 = 76.7% (fine), miss two → 23/31 = 74.2% (under).
expect("singular is not '1 more classes'", summarise(at(23, 29)) === "You can miss 1 more.");
expect("on the line warns about the next one", /missing one more/i.test(summarise(at(21, 28))));
expect("short course says how to recover", /attend the next 5/i.test(summarise(at(19, 27))));

console.log("\nOpening balance (joining mid-semester):\n");

const classes: ClassRow[] = [
  { id: "c1", course: "Operating Systems", day_of_week: 5, start_time: "08:00:00", room: "FIT-308" },
  { id: "c2", course: "Linear Algebra", day_of_week: 5, start_time: "09:30:00", room: "FIT-214" },
];

{
  const totals = totalsByCourse(
    classes,
    [
      { class_id: "c1", on_date: "2026-08-28", status: "present" },
      { class_id: "c1", on_date: "2026-08-21", status: "absent" },
    ],
    [{ course: "Operating Systems", attended: 20, held: 26, required_percent: 75 }],
  );

  const os = totals.find((t) => t.course === "Operating Systems")!;
  expect("baseline and marks add up", os.attended === 21 && os.held === 28, `got ${os.attended}/${os.held}`);

  const la = totals.find((t) => t.course === "Linear Algebra");
  expect("a course with nothing marked still appears", Boolean(la) && la!.held === 0);
}

{
  const totals = totalsByCourse(
    classes,
    [
      { class_id: "c1", on_date: "2026-08-28", status: "cancelled" },
      { class_id: "c1", on_date: "2026-08-21", status: "present" },
    ],
    [],
  );
  const os = totals.find((t) => t.course === "Operating Systems")!;
  expect("a cancelled class counts in neither total", os.attended === 1 && os.held === 1);
}

{
  const totals = totalsByCourse(classes, [{ class_id: "gone", on_date: "2026-08-28", status: "absent" }], []);
  const total = totals.reduce((n, t) => n + t.held, 0);
  expect("marks for a deleted class are ignored, not counted", total === 0);
}

console.log("\nWhat still needs marking:\n");

// Friday 28 Aug 2026, 14:00 PKT (09:00 UTC).
const NOW = new Date("2026-08-28T09:00:00Z");

{
  const unmarked = findUnmarked(NOW, classes, []);
  const today = unmarked.filter((u) => u.onDate === "2026-08-28");
  expect("today's finished classes are asked about", today.length === 2, `got ${today.length}`);
  expect("  most recent first", today[0]?.startTime === "09:30");
}

{
  const later: ClassRow[] = [
    { id: "c3", course: "Databases", day_of_week: 5, start_time: "15:30:00", room: "LAB-2" },
  ];
  const unmarked = findUnmarked(NOW, later, []);
  expect(
    "a class that hasn't started yet is not asked about",
    unmarked.every((u) => u.onDate !== "2026-08-28"),
  );
}

{
  const unmarked = findUnmarked(NOW, classes, [{ class_id: "c1", on_date: "2026-08-28", status: "present" }]);
  expect(
    "an already-marked class disappears",
    !unmarked.some((u) => u.classId === "c1" && u.onDate === "2026-08-28"),
  );
}

{
  const unmarked = findUnmarked(NOW, classes, [], 7);
  const dates = new Set(unmarked.map((u) => u.onDate));
  expect("last week's missed marking is catchable", dates.has("2026-08-21"));
  expect("  but not a fortnight back", !dates.has("2026-08-14"));
}

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
