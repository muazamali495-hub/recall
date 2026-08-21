/**
 * Checks who is allowed to sign in.
 * Run:  node scripts/test-allowed-email.mjs
 */
import { isAllowedEmail } from "../lib/allowed-email.ts";
const cases = [
  ["70146316@student.uol.edu.pk", true,  "real UOL student"],
  ["70149337@student.uol.edu.pk", true,  "another UOL student"],
  ["ali@gmail.com",               false, "personal gmail"],
  ["someone@uol.edu.pk",          false, "staff domain (not enabled by default)"],
  ["x@notstudent.uol.edu.pk",     false, "lookalike prefix"],
  ["x@student.uol.edu.pk.evil.com", false, "suffix attack"],
  ["x@STUDENT.UOL.EDU.PK",        true,  "uppercase"],
  ["no-at-sign",                  false, "malformed"],
  [null,                          false, "missing email"],
];
let pass = 0;
for (const [email, want, label] of cases) {
  const got = isAllowedEmail(email);
  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${String(email).padEnd(32)} ${label}`);
}
console.log(`\n  ${pass}/${cases.length} passed`);
