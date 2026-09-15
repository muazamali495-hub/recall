/**
 * Checks course parsing and labelling against what Slate really sends.
 * Run:  node --import ./scripts/register.mjs scripts/test-course-label.ts
 */
import { splitCourse } from "../lib/ics.ts";
import { courseLabel, courseName, namesFrom, suggestName, unnamedCodes } from "../lib/course-label.ts";

let failures = 0;

function expect(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\nSplitting Slate's shortname:\n");

// The real UOL format, from the comment that has sat on tidyCourse since the
// first sync. The section was inside it the whole time.
{
  const r = splitCourse("MAT01212|11-BSCS-3A-112001-SUM26");
  expect("code comes out clean", r.code === "MAT01212", r.code ?? "null");
  expect("section is recovered from the suffix", r.section === "BSCS-3A", r.section ?? "null");
}

{
  const r = splitCourse("CS13410|11-BSCS-7A-112001-FALL26");
  expect("a 7th-semester section", r.section === "BSCS-7A", r.section ?? "null");
}

{
  const r = splitCourse("MGT11806|12-BBA-5-330011-FALL26");
  expect("a section with no letter", r.section === "BBA-5", r.section ?? "null");
}

{
  const r = splitCourse("Object Oriented Programming");
  expect("a plain name with no pipe is kept as the code", r.code === "Object Oriented Programming");
  expect("  and has no section", r.section === null);
}

expect("null in, nulls out", splitCourse(null).code === null && splitCourse(null).section === null);
expect("empty suffix gives no section", splitCourse("CS101|").section === null);

console.log("\nLabelling:\n");

const names = namesFrom([
  { code: "CS13410", name: "Intro to Machine Learning" },
  { code: "CS13213", name: "Artificial Intelligence" },
]);

expect(
  "named: name · code · section",
  courseLabel("CS13410", "BSCS-7A", names) === "Intro to Machine Learning · CS13410 · BSCS-7A",
  courseLabel("CS13410", "BSCS-7A", names),
);
expect(
  "unnamed: code · section",
  courseLabel("EES07104", "BSCS-7A", names) === "EES07104 · BSCS-7A",
);
expect("no section: name · code", courseLabel("CS13213", null, names) === "Artificial Intelligence · CS13213");
expect("nothing at all", courseLabel(null, null, names) === "—");
expect("short form prefers the name", courseName("CS13410", names) === "Intro to Machine Learning");
expect("short form falls back to the code", courseName("EES07104", names) === "EES07104");

console.log("\nWhat still needs naming:\n");

const deadlines = [
  { course: "CS13410", title: "Assignment No 1 Machine Learning 30-09-26 is due" },
  { course: "EES07104", title: "Quiz 1" },
  { course: "EES07104", title: "Quiz 2" },
  { course: "EES07104", title: "Assinment no 1 is due" },
  { course: "MGT11806", title: "Assignment-01 is due" },
  { course: "CS09233", title: "Assignment _04(Theory)_Compiler Construction_" },
  { course: null, title: "Orphan" },
];

const todo = unnamedCodes(deadlines, names);
expect("named codes are not listed", !todo.includes("CS13410"));
expect("unnamed codes are", todo.includes("EES07104") && todo.includes("MGT11806"));
expect("the busiest course is asked about first", todo[0] === "EES07104", todo.join(", "));
expect("a deadline with no course is ignored", !todo.includes("null"));

console.log("\nSuggesting a name from titles:\n");

const timetable = ["Intro to Machine Learning", "Compiler Construction", "Entrepreneurship", "ML", "OS"];

expect(
  "finds the course written into a title",
  suggestName("CS09233", deadlines, timetable) === "Compiler Construction",
  suggestName("CS09233", deadlines, timetable) ?? "null",
);
expect(
  "prefers the long name over its abbreviation",
  suggestName("CS13410", deadlines, ["ML", "Machine Learning"]) === "Machine Learning",
);
expect("suggests nothing when nothing matches", suggestName("EES07104", deadlines, timetable) === null);
expect("suggests nothing for an unknown code", suggestName("ZZ999", deadlines, timetable) === null);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
