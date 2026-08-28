/**
 * End-to-end check of the study planner against live free models.
 *
 * The unit tests prove the parsing and clash rules; this proves the part that
 * actually broke — that some free pool answers, in time, with a usable plan.
 *
 * Run:  node --env-file=.env.local scripts/test-planner.ts
 */
import { buildStudyPlan, type PlannerContext } from "../lib/planner.ts";

const ctx: PlannerContext = {
  target: {
    title: "Quiz 3 — Eigenvalues",
    course: "MAT01212 Linear Algebra",
    kind: "quiz",
    dueAt: "30 August 2026, 09:00",
  },
  material: `Eigenvalues and eigenvectors. Characteristic polynomial and how to compute it.
Diagonalisation, and when a matrix is not diagonalisable. Cayley-Hamilton theorem.
Applications to Markov chains and steady-state vectors. Similar matrices.`,
  busy: [
    { day: "Friday", start: "08:00", end: "09:15", course: "Multivariable Calculus" },
    { day: "Saturday", start: "11:00", end: "12:15", course: "Operating Systems" },
    // Deliberately covers a prime study slot: if a block lands here, the clash
    // filter is not doing its job.
    { day: "Saturday", start: "18:00", end: "19:30", course: "Software Engineering" },
  ],
  otherDeadlines: [{ title: "OS Lab 08", dueAt: "29 August 2026, 23:59" }],
  today: "Friday",
  nowLabel: "28 August 2026, 14:30",
};

const started = Date.now();

try {
  const plan = await buildStudyPlan(ctx);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nAnswered in ${secs}s\n`);
  console.log(`  ${plan.headline}\n`);

  console.log("  Priorities:");
  for (const p of plan.priorities) console.log(`    - ${p}`);

  console.log("\n  Blocks:");
  for (const b of plan.blocks) {
    console.log(`    ${b.day.padEnd(10)} ${b.start}-${b.end}  ${b.topic}`);
    console.log(`               ${b.why}`);
  }

  const clash = plan.blocks.some((b) =>
    ctx.busy.some((c) => c.day === b.day && b.start < c.end && b.end > c.start),
  );

  console.log("\nChecks:");
  console.log(`  ${plan.blocks.length > 0 ? "PASS" : "FAIL"}  produced at least one block`);
  console.log(`  ${plan.headline.length > 0 ? "PASS" : "FAIL"}  produced a headline`);
  console.log(`  ${!clash ? "PASS" : "FAIL"}  no block overlaps a class`);
  console.log(`  ${Number(secs) < 45 ? "PASS" : "FAIL"}  answered inside the 45s budget (${secs}s)`);
} catch (err) {
  console.log(`\nFAILED after ${((Date.now() - started) / 1000).toFixed(1)}s:\n`);
  console.log((err as Error).message);
  process.exitCode = 1;
}
