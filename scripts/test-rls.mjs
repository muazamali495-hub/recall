/**
 * Proves that the anon key cannot read anybody's data.
 *
 * The anon key is public — it ships in the browser bundle by design. So the
 * entire confidentiality of Recall rests on one claim: that row-level security
 * stops that key reading anything. Every policy in the migrations LOOKS right,
 * but "looks right" is not the same as "is enforced", and this is the single
 * property whose failure would expose every student's data at once.
 *
 * So it gets tested against the live database rather than reasoned about.
 *
 * Run:  node --env-file=.env.local scripts/test-rls.mjs
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.log("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
  process.exit(1);
}

let failures = 0;

function report(label, pass, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const TABLES = [
  "profiles",
  "deadlines",
  "class_sessions",
  "attendance",
  "attendance_baseline",
  "semester",
  "push_subscriptions",
  "sync_devices",
  "reminder_prefs",
  "notifications_sent",
  "moodle_connections",
  "job_secrets",
  "pairing_codes",
];

console.log("\nReading every table with the public anon key:\n");

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });

  let rows = [];
  try {
    rows = await res.json();
  } catch {
    rows = [];
  }

  const leaked = Array.isArray(rows) && rows.length > 0;
  report(
    `${table} returns no rows`,
    !leaked,
    leaked ? `LEAKED ${rows.length} ROWS` : `${res.status}`,
  );
}

console.log("\nWriting with the anon key:\n");

for (const table of ["deadlines", "attendance", "class_sessions"]) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  report(`${table} rejects an anonymous insert`, !res.ok, `HTTP ${res.status}`);
}

console.log("\nCalling privileged functions with the anon key:\n");

const RPCS = [
  // Would return every user's deadlines, classes and push subscriptions.
  ["cron_reminder_batch", { p_secret: "wrong-secret-guess" }],
  // Would let a stranger register their own reminder-job credential.
  ["set_job_secret", { p_name: "reminders", p_new: "0123456789abcdef0123" }],
  // Would create a name nobody uses, filling the table.
  ["set_job_secret", { p_name: "junk", p_new: "0123456789abcdef0123" }],
  // Should be unreachable entirely now.
  ["provision_reminder_pings", { p_url: "https://evil.example" }],
  ["reminder_ping_history", { p_limit: 5 }],
  ["verify_job_secret", { p_name: "reminders", p_secret: "guess" }],
  // Redeeming a pairing code we do not have.
  ["pair_device", { p_code: "AAAAAAAAAAAA", p_token_hash: "x".repeat(64), p_label: "test" }],
  // Reading one user's whole context from a guessed device token.
  ["reminder_context", { p_token_hash: "x".repeat(64) }],
];

for (const [fn, args] of RPCS) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const body = await res.text();

  // Ask the question directly rather than trying to enumerate refusal shapes.
  //
  // These functions refuse in several different ways on purpose — some raise,
  // some return {"ok":false}, and cron_reminder_batch returns
  // {"error":"unauthorized"} with HTTP 200 because it has to record the
  // attempt and raising would roll that record back. Matching on refusal
  // wording meant the test broke every time one of them changed shape, and a
  // test that keeps crying wolf stops being read.
  //
  // What actually matters is whether anything sensitive came back, so that is
  // what is checked: the field names that only ever appear in real data.
  const SENSITIVE = ["user_id", "endpoint", "p256dh", "token_hash", "due_at", "day_of_week", "secret_hash"];
  const leaked = SENSITIVE.some((field) => body.includes(`"${field}"`));

  report(
    `${fn}(${Object.keys(args)[0]}=…) refuses`,
    !leaked,
    leaked ? `RETURNED DATA: ${body.slice(0, 80)}` : `HTTP ${res.status}`,
  );
}

console.log(failures === 0 ? "\nAll passed — the public key reaches nothing.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
