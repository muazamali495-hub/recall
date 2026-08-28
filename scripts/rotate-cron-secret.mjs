/**
 * Rotates the reminder job's shared secret.
 *
 * The secret authenticates the GitHub workflow to /api/cron/reminders. It
 * exists in two places that must agree — .env.local and the repository secret
 * — and the database holds only its hash, so a rotation that updates one and
 * not the other fails silently, hours later, as reminders that stop arriving.
 *
 * So this does all of it in one pass, and never prints the value. Nothing is
 * echoed, nothing reaches a shell history, and the new secret is written
 * straight to the file the next command reads it from.
 *
 * Deliberately NOT touched: pg_cron's own credential. Two callers hold a
 * reminders secret and either must be revocable without the other — pg_cron is
 * what actually fires reminders on time, GitHub is the unreliable backup.
 *
 * Run:  node scripts/rotate-cron-secret.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";

const ENV_PATH = new URL("../.env.local", import.meta.url);
const env = readFileSync(ENV_PATH, "utf8");

const read = (name) => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();

const url = read("NEXT_PUBLIC_SUPABASE_URL");
const anon = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const current = read("CRON_SECRET");

if (!url || !anon) {
  console.log("  FAIL  Supabase URL/anon key missing from .env.local");
  process.exit(1);
}
if (!current) {
  console.log("  FAIL  No CRON_SECRET in .env.local — nothing to rotate from");
  process.exit(1);
}

const fp = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const next = randomBytes(32).toString("hex");

console.log(`\n  current: ${fp(current)}`);
console.log(`  new:     ${fp(next)}  (${next.length} chars)\n`);

// The database refuses to replace an existing secret without being shown the
// present one, so this both proves we hold it and retires it in one step.
const res = await fetch(`${url}/rest/v1/rpc/set_job_secret`, {
  method: "POST",
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_name: "reminders", p_new: next, p_current: current }),
});

if (!res.ok) {
  const detail = await res.text();
  console.log(`  FAIL  the database refused the rotation — HTTP ${res.status}`);
  console.log(`        ${detail.slice(0, 200)}`);
  console.log("\n  Nothing was changed.\n");
  process.exit(1);
}

console.log("  PASS  registered with the database");

// Only after the database accepted it: if the write below failed first, we
// would be left holding a secret the server has never heard of.
writeFileSync(ENV_PATH, env.replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${next}`), "utf8");
console.log("  PASS  .env.local updated");

// Written for `gh secret set` to read. The caller deletes it straight after —
// it is the only moment the value touches disk outside .env.local.
const handoff = process.argv[2];
if (handoff) {
  writeFileSync(handoff, next, "utf8");
  console.log(`  PASS  handed off for the GitHub secret`);
}

console.log("\n  Rotated. The old secret no longer authenticates.\n");
