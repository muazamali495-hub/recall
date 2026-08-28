/**
 * Checks the Content-Security-Policy.
 *
 * A CSP rots quietly: someone adds 'unsafe-inline' to unbreak a widget at
 * 2am, and the policy still looks impressive in the response headers while
 * protecting nothing. These assertions are here so that change fails loudly.
 *
 * Run:  node --import ./scripts/register.mjs scripts/test-csp.ts
 */
import { buildCsp, makeNonce } from "../lib/csp.ts";

let failures = 0;

function expect(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const nonce = makeNonce();
const prod = buildCsp(nonce, false);
const dev = buildCsp(nonce, true);

const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

console.log("\nProduction policy:\n");

const scriptSrc = directive(prod, "script-src");

// The whole point of the nonce work. If this ever passes with 'unsafe-inline'
// present, the policy is decoration.
expect("script-src does NOT allow unsafe-inline", !scriptSrc.includes("'unsafe-inline'"), scriptSrc);
expect("script-src does NOT allow unsafe-eval", !scriptSrc.includes("'unsafe-eval'"));
expect("script-src carries the nonce", scriptSrc.includes(`'nonce-${nonce}'`));
expect("script-src uses strict-dynamic", scriptSrc.includes("'strict-dynamic'"));

expect("nothing may frame the app", directive(prod, "frame-ancestors").includes("'none'"));
expect("no plugins", directive(prod, "object-src").includes("'none'"));
expect("base-uri is locked to self", directive(prod, "base-uri").includes("'self'"));
expect("forms can only post to us", directive(prod, "form-action").includes("'self'"));
expect("default-src is self", directive(prod, "default-src").includes("'self'"));
expect("the service worker is allowed", directive(prod, "worker-src").includes("'self'"));
expect("supabase is reachable", directive(prod, "connect-src").includes("https://*.supabase.co"));
expect("http is upgraded", prod.includes("upgrade-insecure-requests"));

// localhost in a production policy would be a leftover from debugging.
expect("no localhost in production", !prod.includes("localhost"));

console.log("\nDevelopment policy — relaxed, but only where it must be:\n");
expect("dev allows unsafe-eval (React needs it)", directive(dev, "script-src").includes("'unsafe-eval'"));
expect("dev still refuses unsafe-inline scripts", !directive(dev, "script-src").includes("'unsafe-inline'"));
expect("dev allows the hot-reload socket", directive(dev, "connect-src").includes("ws://localhost:*"));
expect("dev still cannot be framed", directive(dev, "frame-ancestors").includes("'none'"));

console.log("\nStyles — a deliberate, documented exception:\n");
// Nonces cannot authorise a style="..." attribute, and Recall sets widths from
// data. Inline styles cannot execute code, so this is the small concession.
expect("style-src allows inline (attributes cannot be nonced)", directive(prod, "style-src").includes("'unsafe-inline'"));

console.log("\nNonces:\n");
const a = makeNonce();
const b = makeNonce();
expect("every nonce is different", a !== b, `${a.slice(0, 8)} vs ${b.slice(0, 8)}`);
expect("nonces are long enough to be unguessable", Buffer.from(a, "base64").length >= 16);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
