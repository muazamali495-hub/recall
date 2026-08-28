/**
 * Checks that LaTeX from Ask Recall comes out readable.
 * The first cases are verbatim from what a live model returned when asked
 * "Explain eigenvalues to me like I've never seen them."
 * Run:  node --import ./scripts/register.mjs scripts/test-demath.ts
 */
import { demath } from "../lib/demath.ts";

let failures = 0;

function check(label: string, input: string, expected: string) {
  const got = demath(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        got:      ${JSON.stringify(got)}`);
  }
}

console.log("\nFrom a real Ask Recall reply:\n");

check("display equation", "$$A \\vec{v} = \\lambda \\vec{v}$$", "A v = λ v");
check(
  "inline equation in a sentence",
  "solving $\\det(A - \\lambda I) = 0$, then find the eigenvectors",
  "solving det(A - λ I) = 0, then find the eigenvectors",
);

console.log("\nOther shapes models produce:\n");

check("bracket display form", "\\[x = \\frac{-b}{2a}\\]", "x = -b/2a");
check("paren inline form", "where \\(\\alpha \\le \\beta\\) holds", "where α ≤ β holds");
check("fractions", "$\\frac{a}{b} + \\frac{1}{2}$", "a/b + 1/2");
check("square roots", "$\\sqrt{x + 1}$", "√x + 1");
check("bold vectors", "$\\mathbf{A}\\mathbf{x} = \\mathbf{b}$", "Ax = b");
check("unknown commands keep their name", "$\\sin(x) + \\cos(x)$", "sin(x) + cos(x)");
check("summation and infinity", "$\\sum_{i=1}^{\\infty}$", "Σ_{i=1}^{∞}");

console.log("\nLeaves ordinary text alone:\n");

check("plain prose untouched", "An eigenvector just gets longer, not tilted.", "An eigenvector just gets longer, not tilted.");
check("code spans untouched", "Use `det(A)` for the determinant.", "Use `det(A)` for the determinant.");
check("markdown bold untouched", "**Worked example:**", "**Worked example:**");
check("a lone price is not maths", "It costs $5 to print.", "It costs $5 to print.");
check("unicode maths already fine", "λ₁ = 2 and λ₂ = 3", "λ₁ = 2 and λ₂ = 3");
check("matrix literal untouched", "A = [[2, 0], [0, 3]]", "A = [[2, 0], [0, 3]]");

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
