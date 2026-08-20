/**
 * Diagnostic: which FREE OpenRouter models will actually answer right now?
 * Prints statuses and real error bodies — never the key.
 * Run:  node scripts/check-vision.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1]?.trim();

if (!key) {
  console.log("No OPENROUTER_API_KEY found in .env.local");
  process.exit(1);
}

console.log(`Key loaded (${key.length} chars, starts "${key.slice(0, 8)}…")\n`);

// Account status first — tells us the real rate-limit picture.
const keyRes = await fetch("https://openrouter.ai/api/v1/key", {
  headers: { Authorization: `Bearer ${key}` },
});
const keyInfo = await keyRes.json().catch(() => null);
console.log("Account:", JSON.stringify(keyInfo?.data ?? keyInfo, null, 2), "\n");

const CANDIDATES = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "openrouter/free",
];

for (const model of CANDIDATES) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
      max_tokens: 20,
    }),
  });

  if (res.ok) {
    const b = await res.json();
    console.log(`  OK   ${model.padEnd(38)} -> ${JSON.stringify(b.choices?.[0]?.message?.content)}`);
  } else {
    const b = await res.json().catch(() => null);
    console.log(`  FAIL ${model.padEnd(38)} ${res.status}  ${(b?.error?.message ?? "").slice(0, 120)}`);
  }
}
