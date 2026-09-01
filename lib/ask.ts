import type { ChatMessage } from "./llm";

export type StudentContext = {
  name: string | null;
  today: string; // "Wednesday"
  nowLabel: string; // "21 August 2026, 14:30"
  courses: string[];
  deadlines: Array<{ title: string; course: string | null; kind: string; dueLabel: string; hoursAway: number }>;
  todayClasses: Array<{ course: string; start: string; room: string | null }>;
};

/**
 * Builds the instructions Ask Recall runs under.
 *
 * The point of this feature is not that it can answer questions — anything
 * can. It is that it already knows the quiz is on Thursday and that the
 * student is in class until three. Everything below exists to put that in
 * front of the model so "what should I do tonight?" gets a real answer
 * instead of a generic one.
 */
export function buildSystemPrompt(ctx: StudentContext): string {
  const courses = ctx.courses.length ? ctx.courses.join(", ") : "not known yet";

  const deadlines = ctx.deadlines.length
    ? ctx.deadlines
        .map((d) => {
          const when =
            d.hoursAway < 24
              ? `in ${Math.max(1, Math.round(d.hoursAway))} hours`
              : `in ${Math.round(d.hoursAway / 24)} days`;
          return `- ${d.kind}: "${d.title}"${d.course ? ` (${d.course})` : ""} — due ${d.dueLabel}, ${when}`;
        })
        .join("\n")
    : "- nothing due in the next two weeks";

  const classes = ctx.todayClasses.length
    ? ctx.todayClasses
        .map((c) => `- ${c.start} ${c.course}${c.room ? ` in ${c.room}` : ""}`)
        .join("\n")
    : "- no classes today";

  return `You are Recall, a study assistant for a student at the University of Lahore.

It is ${ctx.today}, ${ctx.nowLabel}.
${ctx.name ? `The student's name is ${ctx.name}.` : ""}

Their courses: ${courses}

What is due:
${deadlines}

Today's classes:
${classes}

How to answer:
- Use what you know above. If they ask what to work on, answer from their real deadlines and the time they actually have — never give generic advice when specific advice is possible.
- Be direct and brief. A student on a phone between classes is reading this. Lead with the answer, then the reasoning if it helps.
- Teach the thing, don't just state it. Show a worked example, or the steps, so they could do the next one alone.
- If you don't know something about their courses, say so and ask rather than inventing it.
- Plain language. No filler, no "great question", no restating what they asked.
- Use markdown sparingly: short paragraphs, and lists only when the content is genuinely a list.
- No LaTeX. Recall renders plain text, so write maths as you would say it: "det(A - λI) = 0", not "$\\det(A - \\lambda I) = 0$". Greek letters and symbols like λ, ×, ≤, √ are fine typed directly. Put multi-line working in a \`\`\` code block.

One boundary, and hold it warmly: you help them *learn* and *prepare*. If they ask you to write a graded assignment for them to hand in as their own, don't produce a submittable answer — explain the concepts, work a similar example, review a draft they wrote, or plan the work with them. Say why in one line and move on; don't lecture. Everything else — explaining, quizzing, summarising, checking understanding, planning — is exactly what you are for.`;
}

/** Assembles the full message list for a turn. */
export function buildMessages(
  ctx: StudentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
  /**
   * Passages retrieved from the document library, already formatted with
   * their citation rules. Empty when nothing relevant was found, which is the
   * common case — most questions are about the student's own week, and the
   * library has nothing to add to those.
   */
  reference = "",
): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(ctx) + reference },
    // Only the last few turns: free models have modest context windows, and
    // older turns rarely change the answer.
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: question },
  ];
}
