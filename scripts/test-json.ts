/**
 * Checks the loose JSON parser against the ways free models actually fail.
 * Every case here is a shape one of them really returned.
 * Run:  node scripts/test-json.ts
 */
import { parseJsonLoosely } from "../lib/json.ts";

type Plan = { headline?: string; priorities?: string[]; blocks?: Array<Record<string, string>> };

let failures = 0;

function check(label: string, input: string, verify: (p: Plan | null) => boolean) {
  const parsed = parseJsonLoosely<Plan>(input);
  const ok = verify(parsed);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got: ${JSON.stringify(parsed)}`);
}

const CLEAN = `{"headline":"Plan","priorities":["Eigenvalues"],"blocks":[{"day":"Friday","start":"18:00","end":"19:30","topic":"A","why":"x"}]}`;

console.log("\nLoose JSON parsing:\n");

check("clean JSON", CLEAN, (p) => p?.blocks?.length === 1);

check("wrapped in markdown fences", "```json\n" + CLEAN + "\n```", (p) => p?.blocks?.length === 1);

check(
  "narrated before answering",
  "We need to create a study plan for a student.\n\n" + CLEAN,
  (p) => p?.blocks?.length === 1,
);

check("trailing chatter after the object", CLEAN + "\n\nHope this helps!", (p) => p?.blocks?.length === 1);

// The big one: hit the token ceiling mid-object. Previously the whole plan was
// discarded; three usable blocks are worth far more than an error message.
check(
  "truncated part-way through a block",
  `{"headline":"Plan","priorities":["Eigenvalues","Diagonalisation"],"blocks":[
    {"day":"Friday","start":"18:00","end":"19:30","topic":"Eigenvalues","why":"core"},
    {"day":"Saturday","start":"09:00","end":"10:30","topic":"Diagonalisation","why":"builds on it"},
    {"day":"Saturday","start":"14:00","end":"15:3`,
  (p) => p?.blocks?.length === 2 && p.headline === "Plan",
);

check(
  "truncated immediately after a complete block",
  `{"headline":"Plan","blocks":[{"day":"Friday","start":"18:00","end":"19:30","topic":"A","why":"x"}`,
  (p) => p?.blocks?.length === 1,
);

check(
  "truncated inside a string value",
  `{"headline":"Focused eigenvalues review plan to ace the quiz on Sund`,
  (p) => p === null || p.headline === undefined,
);

check(
  "truncated with a dangling comma",
  `{"headline":"Plan","blocks":[{"day":"Friday","start":"18:00","end":"19:30","topic":"A","why":"x"},`,
  (p) => p?.blocks?.length === 1,
);

// Nested structures must close innermost-first. Exactly how much of the tail
// survives is not worth pinning down — only that the result parses and the
// part before the cut is intact.
check("nested structures close in the right order", `{"a":{"b":[1,2,{"c":[3,4`, (p) => {
  const a = (p as unknown as { a?: { b?: unknown[] } })?.a;
  return Array.isArray(a?.b) && a.b[0] === 1 && a.b[1] === 2;
});

console.log("\nNot JSON at all:\n");
check("empty string", "", (p) => p === null);
check("prose with no object", "I cannot help with that request.", (p) => p === null);
check("only an opening brace", "{", (p) => p === null);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
