/**
 * Checks the service worker's navigation guard.
 *
 * sw.js is a standalone script with no build step, so it cannot import
 * lib/safe-next.ts and the logic is duplicated there. Duplicated logic drifts,
 * which is exactly why it needs its own test — the copy in the service worker
 * is the one that runs when someone taps a notification on a lock screen, and
 * that is a far more convincing place to be phished from than a link in a page.
 *
 * Run:  node scripts/test-sw-target.mjs
 */
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

// Pull the real function out of the shipped file rather than reimplementing
// it here — a test of a copy of a copy proves nothing.
const match = source.match(/function safeTarget\(raw\) \{[\s\S]*?\n\}/);

if (!match) {
  console.log("\n  FAIL  safeTarget() is missing from public/sw.js\n");
  process.exit(1);
}

const safeTarget = new Function(`${match[0]}; return safeTarget;`)();

let failures = 0;

function check(label, input, expected) {
  const got = safeTarget(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        ${JSON.stringify(input)} -> ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`);
}

console.log("\nAllowed — real reminder destinations:\n");
check("the dashboard", "/dashboard", "/dashboard");
check("attendance", "/attendance", "/attendance");
check("a path with a query", "/planner?for=quiz-3", "/planner?for=quiz-3");

console.log("\nRejected — every one of these leaves the site:\n");
check("absolute url", "https://evil.com", "/dashboard");
check("protocol-relative", "//evil.com", "/dashboard");
check("userinfo trick", "@evil.com", "/dashboard");
check("backslash form", "/\\evil.com", "/dashboard");
check("javascript scheme", "javascript:alert(1)", "/dashboard");
check("data scheme", "data:text/html,<script>alert(1)</script>", "/dashboard");
check("missing", undefined, "/dashboard");
check("null", null, "/dashboard");
check("a number", 42, "/dashboard");
check("an object", { toString: () => "/evil" }, "/dashboard");

console.log("\nThe property that matters — openWindow can never leave the origin:\n");

const ORIGIN = "https://recall-kohl-mu.vercel.app";
const ATTACKS = ["https://evil.com", "//evil.com", "@evil.com", "/\\evil.com", "\\\\evil.com"];

let escaped = 0;
for (const attack of ATTACKS) {
  const resolved = new URL(safeTarget(attack), ORIGIN);
  if (resolved.host !== "recall-kohl-mu.vercel.app") {
    escaped++;
    console.log(`  FAIL  ${JSON.stringify(attack)} escaped to ${resolved.host}`);
  }
}
failures += escaped;
console.log(`  ${escaped === 0 ? "PASS" : "FAIL"}  ${ATTACKS.length} attacks, ${escaped} escaped`);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
