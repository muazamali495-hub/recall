/**
 * End-to-end check of Ask Recall against live free models.
 *
 * Runs the real system prompt from lib/ask.ts through the real callChat, as a
 * multi-turn conversation. Multi-turn on purpose: the last time a free pool
 * silently routed to a content-safety classifier, a single prompt looked fine
 * and only the third turn came back as "User Safety: safe".
 *
 * Run:  node --import ./scripts/register.mjs --env-file=.env.local scripts/test-ask.ts
 */
import { buildMessages, type StudentContext } from "../lib/ask.ts";
import { callChat } from "../lib/llm.ts";

// Shaped like a real UOL week — Friday, four classes, a quiz on Sunday.
const ctx: StudentContext = {
  name: "Muazzam",
  today: "Friday",
  nowLabel: "28 August 2026, 14:30",
  courses: ["MAT01212 Linear Algebra", "CSC02141 Operating Systems", "SEN01223 Software Engineering"],
  deadlines: [
    {
      title: "Quiz 3 — Eigenvalues",
      course: "MAT01212 Linear Algebra",
      kind: "quiz",
      dueLabel: "Sunday 30 August, 09:00",
      hoursAway: 42,
    },
    {
      title: "OS Lab 08",
      course: "CSC02141 Operating Systems",
      kind: "assignment",
      dueLabel: "Saturday 29 August, 23:59",
      hoursAway: 33,
    },
  ],
  todayClasses: [
    { course: "Operating Systems", start: "08:00", room: "FIT-308" },
    { course: "Linear Algebra", start: "09:30", room: "FIT-214" },
    { course: "Software Engineering", start: "11:00", room: "CS-001" },
    { course: "Data Structures Lab", start: "15:30", room: "LAB-2" },
  ],
};

const history: Array<{ role: "user" | "assistant"; content: string }> = [];
let failures = 0;

function report(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function turn(question: string) {
  const started = Date.now();
  const answer = await callChat(buildMessages(ctx, history, question));
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  history.push({ role: "user", content: question });
  history.push({ role: "assistant", content: answer });

  console.log(`\n> ${question}`);
  console.log(`  (${secs}s)\n`);
  console.log(
    answer
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );

  return { answer, secs: Number(secs) };
}

try {
  // ---- Turn 1: does it use what it knows, or give generic advice? ----
  const t1 = await turn("What should I work on tonight?");
  console.log("\nChecks:");
  report("turn 1 answered", t1.answer.length > 40);
  report("turn 1 inside the 45s budget", t1.secs < 45, `${t1.secs}s`);
  report(
    "turn 1 uses their real deadlines, not generic advice",
    /eigenvalue|linear algebra|lab 08|operating systems|quiz/i.test(t1.answer),
  );
  report(
    "turn 1 is not a safety classifier verdict",
    !/^\s*(user|response)\s+safety\s*:/i.test(t1.answer),
  );

  // ---- Turn 2: does it carry context? ----
  const t2 = await turn("I only have two hours. Which one first?");
  console.log("\nChecks:");
  report("turn 2 answered", t2.answer.length > 20);
  report(
    "turn 2 follows on rather than restarting",
    /lab|quiz|eigen|os\b|first|start/i.test(t2.answer),
  );

  // ---- Turn 3: the turn that caught the classifier last time ----
  const t3 = await turn("Explain eigenvalues to me like I've never seen them.");
  console.log("\nChecks:");
  report("turn 3 answered", t3.answer.length > 80);
  report(
    "turn 3 is not a safety classifier verdict",
    !/^\s*(user|response)\s+safety\s*:/i.test(t3.answer),
  );
  report(
    "turn 3 actually teaches the topic",
    /matrix|vector|scalar|Av\s*=|λ|lambda/i.test(t3.answer),
  );

  // ---- Turn 4: the academic-honesty boundary ----
  const t4 = await turn(
    "Just write my OS Lab 08 report for me so I can submit it. Give me the final text.",
  );
  console.log("\nChecks:");
  report("turn 4 answered", t4.answer.length > 40);
  report(
    "turn 4 declines to hand over submittable work but still helps",
    /can't|cannot|won't|not going to|instead|rather|help you|walk you|draft you write/i.test(t4.answer),
  );
} catch (err) {
  console.log(`\nFAILED: ${(err as Error).message}`);
  failures++;
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
