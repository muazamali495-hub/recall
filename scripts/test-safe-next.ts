/**
 * Checks that sign-in can only send you somewhere on this site.
 *
 * Each rejection case below is a real open-redirect technique, and the final
 * assertion is the one that matters: after joining the origin to the result,
 * the host must still be this site.
 *
 * Run:  node --import ./scripts/register.mjs scripts/test-safe-next.ts
 */
import { safeNextPath } from "../lib/safe-next.ts";

const ORIGIN = "https://recall-kohl-mu.vercel.app";
let failures = 0;

function check(label: string, input: string | null, expected: string) {
  const got = safeNextPath(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        ${JSON.stringify(input)} → ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`);
}

console.log("\nAllowed — ordinary internal destinations:\n");
check("dashboard", "/dashboard", "/dashboard");
check("a nested route", "/attendance", "/attendance");
check("a route with a query", "/planner?for=quiz-3", "/planner?for=quiz-3");
check("nothing supplied falls back", null, "/dashboard");
check("empty string falls back", "", "/dashboard");

console.log("\nRejected — every one of these leaves the site:\n");
// The one that actually worked: origin + "@evil.com" parses evil.com as the host.
check("userinfo trick", "@evil.com", "/dashboard");
check("absolute url", "https://evil.com", "/dashboard");
check("protocol-relative", "//evil.com", "/dashboard");
check("backslash form browsers normalise", "/\\evil.com", "/dashboard");
check("backslash anywhere", "/dashboard\\@evil.com", "/dashboard");
check("javascript scheme", "javascript:alert(1)", "/dashboard");
check("data scheme", "data:text/html,<script>alert(1)</script>", "/dashboard");
check("bare host", "evil.com", "/dashboard");
check("tab smuggling", "/\tevil.com", "/dashboard");
check("newline smuggling", "/\nevil.com", "/dashboard");
check("leading space", " //evil.com", "/dashboard");

console.log("\nThe property that matters — the host never changes:\n");

const ATTACKS = [
  "@evil.com",
  "//evil.com",
  "/\\evil.com",
  "https://evil.com",
  "\\\\evil.com",
  "/%09@evil.com",
  "@evil.com/dashboard",
];

let escaped = 0;
for (const attack of ATTACKS) {
  const target = new URL(ORIGIN + safeNextPath(attack));
  if (target.host !== "recall-kohl-mu.vercel.app") {
    escaped++;
    console.log(`  FAIL  ${JSON.stringify(attack)} escaped to ${target.host}`);
  }
}
if (escaped > 0) failures += escaped;
console.log(`  ${escaped === 0 ? "PASS" : "FAIL"}  ${ATTACKS.length} attacks, ${escaped} escaped`);

// And prove the vulnerability was real, so this test cannot quietly become
// a test of nothing.
const wasVulnerable = new URL(ORIGIN + "@evil.com").host === "evil.com";
console.log(`  ${wasVulnerable ? "PASS" : "FAIL"}  the unguarded form really did reach evil.com`);
if (!wasVulnerable) failures++;

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
