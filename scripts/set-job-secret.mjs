/**
 * Registers the reminder job's CRON_SECRET in the database (hashed).
 * Reads it from .env.local — never prints it.
 * Run:  node scripts/set-job-secret.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const secret = get("CRON_SECRET");

if (!url || !anon || !secret) {
  console.log("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or CRON_SECRET in .env.local");
  process.exit(1);
}

const supabase = createClient(url, anon);
const { error } = await supabase.rpc("set_job_secret", { p_name: "reminders", p_new: secret });

if (error) {
  console.log("Failed:", error.message);
  console.log("(If it says 'current secret required', a secret is already set — pass the old one to rotate.)");
  process.exit(1);
}

console.log(`Registered job secret 'reminders' (${secret.length} chars, stored as a SHA-256 hash).`);
