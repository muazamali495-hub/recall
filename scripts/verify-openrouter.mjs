/**
 * Checks the OpenRouter key in .env.local — without ever printing it.
 *
 * Rotating a credential is easy to do halfway: a new key in one place, the old
 * one still live in another, and nothing to tell you which of the two the app
 * is actually using. This answers that in one command.
 *
 * It prints a SHA-256 fingerprint rather than the key. A fingerprint is enough
 * to say "this is a different credential than before" and useless to anyone
 * who reads it — which matters, because the point of rotating is that the old
 * value was probably somewhere it should not have been.
 *
 * Run:  node scripts/verify-openrouter.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The key that was live before this rotation. Recorded so the script can say
// "you are still on the old one" instead of leaving you to compare by eye.
const RETIRED = "d5f67a71f066";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1]?.trim();

if (!key) {
  console.log("\n  FAIL  No OPENROUTER_API_KEY in .env.local\n");
  process.exit(1);
}

const fingerprint = createHash("sha256").update(key).digest("hex").slice(0, 12);
const isOld = fingerprint === RETIRED;

console.log(`\n  key fingerprint: ${fingerprint}${isOld ? "   <-- STILL THE OLD KEY" : "   (new)"}`);
console.log(`  length: ${key.length}, starts "${key.slice(0, 8)}…"\n`);

// Counted by report() below, not here — doing both double-counts it.
let failures = 0;

function report(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

report("the key in .env.local is not the retired one", !isOld);

// Does OpenRouter still recognise it at all?
const info = await fetch("https://openrouter.ai/api/v1/key", {
  headers: { Authorization: `Bearer ${key}` },
});

report("OpenRouter accepts the key", info.ok, `HTTP ${info.status}`);

if (info.ok) {
  const data = (await info.json()).data ?? {};
  console.log(`        usage $${data.usage ?? 0}, free tier: ${data.is_free_tier}`);
}

// Accepting a key is not the same as being authorised to use it — a key can be
// valid while free models are switched off for the account, which is the
// failure that looks exactly like "the AI is broken".
//
// The question here is only ever "is this key authorised". A busy pool, an
// empty reply or a rate limit says nothing about the credential, and treating
// those as failures would make the script cry wolf on every free-tier hiccup.
// So it tries a few models and fails only on an actual auth rejection.
const MODELS = [
  "minimax/minimax-m2.7:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m3:free",
];

let authRejected = false;
let answered = null;
let lastStatus = "no response";

for (const model of MODELS) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
      max_tokens: 10,
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);

  if (!res) continue;
  lastStatus = `HTTP ${res.status}`;

  if (res.status === 401 || res.status === 403) {
    authRejected = true;
    break;
  }

  if (res.ok) {
    const text = (await res.json())?.choices?.[0]?.message?.content?.trim();
    if (text) {
      answered = { model, text };
      break;
    }
  }
}

report(
  "the key is authorised for free models",
  !authRejected,
  authRejected ? "REJECTED — check openrouter.ai/settings/privacy" : lastStatus,
);

if (answered) {
  console.log(`        ${answered.model} replied "${answered.text}"`);
} else if (!authRejected) {
  console.log("        (no free pool answered just now — that is a model problem, not a key one)");
}

console.log(
  failures === 0
    ? "\n  Rotation complete: new key, accepted, working.\n"
    : `\n  ${failures} problem(s) — see above.\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
