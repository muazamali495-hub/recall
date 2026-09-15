/**
 * Checks the extension's handling of Moodle's enrolled-courses response.
 *
 * This cannot be run against Slate — there is no session to run it in from a
 * test — so the response shape is pinned down here from Moodle's own
 * service. If Slate's API ever moves, this is what tells us the parser needs
 * to move with it, rather than course names quietly going blank.
 *
 * Run:  node scripts/test-courses.mjs
 */
import { courseRequest, extractCourses, METHOD } from "../extension/courses.js";

let failures = 0;

function expect(label, pass, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\nThe request:\n");

const req = courseRequest();
expect("names the method Moodle's dashboard uses", req[0].methodname === METHOD);
expect("asks for every course, not just this term's", req[0].args.classification === "all");
expect("limit 0 means no limit in this service", req[0].args.limit === 0);
expect("the fallback asks for in-progress courses", courseRequest("inprogress")[0].args.classification === "inprogress");

console.log("\nThe response — Moodle's real shape:\n");

// What core_course_get_enrolled_courses_by_timeline_classification returns
// through /lib/ajax/service.php: an array of results, each wrapping data.
const REAL = [
  {
    error: false,
    data: {
      courses: [
        { id: 4471, fullname: "Introduction to Machine Learning", shortname: "CS13410|11-BSCS-7A-112001-FALL26", idnumber: "", visible: 1 },
        { id: 4472, fullname: "Artificial Intelligence", shortname: "CS13213|11-BSCS-7A-112001-FALL26" },
        { id: 4473, fullname: "Entrepreneurship &amp; Innovation", shortname: "MGT11806|11-BSCS-7A-112001-FALL26" },
        { id: 4474, fullname: "<span lang=\"en\">Compiler Construction</span>", shortname: "CS09233|11-BSCS-7A-112001-FALL26" },
      ],
      nextoffset: 4,
    },
  },
];

const got = extractCourses(REAL);
expect("every course comes out", got.length === 4, `got ${got.length}`);
expect("shortname is kept verbatim for the server to split", got[0].shortname === "CS13410|11-BSCS-7A-112001-FALL26");
expect("fullname is kept", got[0].fullname === "Introduction to Machine Learning");
expect("HTML entities are decoded", got[2].fullname === "Entrepreneurship & Innovation", got[2].fullname);
expect("HTML tags are stripped", got[3].fullname === "Compiler Construction", got[3].fullname);

console.log("\nWhen Moodle says no, or something is off:\n");

expect("a service error yields nothing", extractCourses([{ error: true, exception: { message: "invalid sesskey" } }]).length === 0);
expect("an empty list yields nothing", extractCourses([{ error: false, data: { courses: [] } }]).length === 0);
expect("a course with no name is skipped", extractCourses([{ error: false, data: { courses: [{ shortname: "X|1", fullname: "" }] } }]).length === 0);
expect("a course with no shortname is skipped", extractCourses([{ error: false, data: { courses: [{ fullname: "Orphan" }] } }]).length === 0);
expect("null yields nothing", extractCourses(null).length === 0);
expect("a bare string yields nothing", extractCourses("<html>login page</html>").length === 0);
expect("the unwrapped form is also accepted", extractCourses({ courses: [{ shortname: "A|1", fullname: "Alpha" }] }).length === 1);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
