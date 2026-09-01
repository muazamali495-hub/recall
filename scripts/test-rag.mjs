/**
 * Checks that retrieval finds the right passage, and refuses to invent one.
 *
 * Retrieval quality is the whole feature. A search that returns loosely-related
 * text is worse than no search at all, because the model will use it and the
 * answer arrives wearing a citation — which is exactly what makes it
 * believable. So this asserts two things: the correct passage comes back for a
 * real question, and nothing comes back for a question the corpus cannot
 * answer.
 *
 * Run:  node --env-file=.env.local scripts/test-rag.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

async function search(question, min = 0.22) {
  const out = await embed(question, { pooling: "mean", normalize: true });
  const { data, error } = await db.rpc("match_document_chunks", {
    p_embedding: JSON.stringify(Array.from(out.data)),
    p_count: 3,
    p_min_score: min,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

let failures = 0;

function report(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Each question is phrased the way a student would ask it, deliberately using
// different words from the document. Matching on shared keywords would prove
// nothing that a LIKE query could not already do.
const CASES = [
  ["How many classes am I allowed to skip?", /75%|attendance/i],
  ["My phone isn't buzzing for quizzes", /notification|reminder/i],
  ["Why is my Slate stuff old?", /six hours|Chrome|check/i],
  ["Can I put this on my iPhone home screen?", /Safari|Home Screen/i],
  ["Does it know my university password?", /password|Google/i],
  ["The lecture was called off, what do I mark?", /Cancelled|cancelled/i],
];

console.log("\nFinding the right passage from a question phrased differently:\n");

for (const [question, expected] of CASES) {
  const hits = await search(question);

  // Every retrieved passage is given to the model, so the requirement is that
  // the right one is among them — not that it ranked first. Asserting rank
  // would be testing the sort order rather than the feature.
  const matched = hits.some((h) => expected.test(`${h.heading ?? ""} ${h.content}`));

  report(
    `"${question}"`,
    matched,
    hits.length
      ? `${hits.length} passages, best ${hits[0].score.toFixed(2)} (${hits[0].heading ?? "-"})`
      : "nothing returned",
  );
}

console.log("\nRefusing to answer what the corpus does not cover:\n");

// A corpus about one app must not confidently return passages for questions
// about something else entirely.
const OFF_TOPIC = [
  "What is the capital of France?",
  "How do I cook biryani?",
  "Explain quantum entanglement",
];

for (const question of OFF_TOPIC) {
  const hits = await search(question);
  report(
    `"${question}" returns nothing`,
    hits.length === 0,
    hits.length ? `returned ${hits.length} at ${hits[0].score.toFixed(2)}` : "",
  );
}

console.log("\nScores separate a real match from a weak one:\n");

const good = await search("How many classes can I miss?", -1);
const bad = await search("What is the capital of France?", -1);

const goodScore = good[0]?.score ?? 0;
const badScore = bad[0]?.score ?? 0;

console.log(`        on-topic best:  ${goodScore.toFixed(3)}`);
console.log(`        off-topic best: ${badScore.toFixed(3)}`);
report("an on-topic question scores well above an off-topic one", goodScore > badScore + 0.2);
report("the 0.22 floor sits between them", badScore < 0.22 && goodScore > 0.22);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
