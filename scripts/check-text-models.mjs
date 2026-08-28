/**
 * Diagnostic: which FREE OpenRouter text models can actually do the study
 * planner's job right now?
 *
 * "Does it reply?" is the wrong question — we learned that the hard way when
 * openrouter/free routed to a content-safety classifier that answered every
 * prompt with "User Safety: safe". So this asks for the real thing: strict
 * JSON, in the planner's exact shape, and only counts a model as usable if the
 * JSON parses and contains blocks.
 *
 * Run:  node scripts/check-text-models.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1]?.trim();

if (!key) {
  console.log("No OPENROUTER_API_KEY found in .env.local");
  process.exit(1);
}

// Ask OpenRouter what is free *today* rather than trusting a hardcoded list.
const listRes = await fetch("https://openrouter.ai/api/v1/models");
const list = await listRes.json();

const free = (list.data ?? [])
  .filter((m) => m.id.endsWith(":free") || m.id === "openrouter/free")
  .filter((m) => (m.context_length ?? 0) >= 16000)
  .map((m) => ({ id: m.id, ctx: m.context_length }));

console.log(`${free.length} free text-capable models listed by OpenRouter.\n`);

const PROMPT = `You are a study coach. Today is Friday, 28 August 2026, 14:30.

They are preparing for: quiz "Eigenvalues" for Linear Algebra, due 30 August 2026, 09:00

Material they need to cover:
"""
Eigenvalues and eigenvectors. Characteristic polynomial. Diagonalisation.
Cayley-Hamilton theorem. Applications to Markov chains.
"""

Their weekly class schedule (they are BUSY during these):
- Friday 08:00-09:15: Multivariable Calculus

Build a realistic study plan.

Hard rules:
- NEVER schedule a study block that overlaps a class listed above.
- Only schedule between 07:00 and 23:00.
- Prefer shorter focused blocks (45-90 minutes).

Return ONLY JSON in exactly this shape, with no prose and no markdown fences:
{"headline":"one sentence","priorities":["topic"],"blocks":[{"day":"Friday","start":"18:00","end":"19:30","topic":"what","why":"why"}]}`;

function parseLoosely(text) {
  const clean = text.replace(/```(?:json)?/gi, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(clean.slice(s, e + 1));
  } catch {
    return null;
  }
}

async function test(model) {
  const started = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(75_000),
    });

    const secs = ((Date.now() - started) / 1000).toFixed(1);

    if (!res.ok) {
      const b = await res.json().catch(() => null);
      return { model, ok: false, secs, note: `${res.status} ${(b?.error?.message ?? "").slice(0, 70)}` };
    }

    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content;

    if (typeof text !== "string" || !text.trim()) {
      return { model, ok: false, secs, note: "empty content" };
    }
    if (/^\s*(user|response)\s+safety\s*:/i.test(text)) {
      return { model, ok: false, secs, note: "safety classifier, not a chat model" };
    }

    const parsed = parseLoosely(text);
    if (!parsed) return { model, ok: false, secs, note: `unparseable: ${text.slice(0, 60)}` };

    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks.length : 0;
    if (blocks === 0) return { model, ok: false, secs, note: "JSON parsed but no blocks" };

    return { model, ok: true, secs, note: `${blocks} blocks, ${parsed.priorities?.length ?? 0} priorities` };
  } catch (err) {
    return {
      model,
      ok: false,
      secs: ((Date.now() - started) / 1000).toFixed(1),
      note: err.name === "TimeoutError" ? "timed out (>75s)" : err.message.slice(0, 70),
    };
  }
}

// A few at a time: hammering every free pool at once gets us rate-limited on
// the account, which would make working models look broken.
const results = [];
for (let i = 0; i < free.length; i += 4) {
  const chunk = free.slice(i, i + 4);
  const done = await Promise.all(chunk.map((m) => test(m.id)));
  for (const r of done) {
    console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.model.padEnd(46)} ${String(r.secs).padStart(5)}s  ${r.note}`);
    results.push(r);
  }
}

const winners = results.filter((r) => r.ok).sort((a, b) => Number(a.secs) - Number(b.secs));

console.log(`\n${winners.length} of ${results.length} produced a usable plan.`);
if (winners.length) {
  console.log("\nFastest first — paste into OPENROUTER_TEXT_MODELS:\n");
  console.log(winners.map((w) => w.model).join(","));
}
