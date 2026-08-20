import { callModel } from "./llm";

export type StudyBlock = {
  day: string; // "Wednesday"
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  topic: string;
  why: string;
};

export type StudyPlan = {
  headline: string;
  priorities: string[];
  blocks: StudyBlock[];
};

export type PlannerContext = {
  target: { title: string; course: string | null; kind: string; dueAt: string } | null;
  material: string;
  busy: Array<{ day: string; start: string; end: string; course: string }>;
  otherDeadlines: Array<{ title: string; dueAt: string }>;
  today: string; // "Wednesday"
  nowLabel: string; // "19 August 2026, 14:30"
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function buildPrompt(ctx: PlannerContext) {
  const busy = ctx.busy.length
    ? ctx.busy.map((b) => `- ${b.day} ${b.start}-${b.end}: ${b.course}`).join("\n")
    : "- (no classes on record)";

  const others = ctx.otherDeadlines.length
    ? ctx.otherDeadlines.map((d) => `- ${d.title} (due ${d.dueAt})`).join("\n")
    : "- (nothing else due soon)";

  const target = ctx.target
    ? `${ctx.target.kind} "${ctx.target.title}"${ctx.target.course ? ` for ${ctx.target.course}` : ""}, due ${ctx.target.dueAt}`
    : "no specific assessment — general revision";

  return `You are a study coach for a university student in Pakistan. Today is ${ctx.today}, ${ctx.nowLabel}.

They are preparing for: ${target}

Material they need to cover:
"""
${ctx.material.slice(0, 6000)}
"""

Their weekly class schedule (they are BUSY during these):
${busy}

Other deadlines competing for their time:
${others}

Build a realistic study plan.

Hard rules:
- NEVER schedule a study block that overlaps a class listed above.
- Only schedule between 07:00 and 23:00.
- Only schedule between now and the deadline. Do not plan past it.
- Prefer shorter focused blocks (45-90 minutes) over marathon sessions.
- Order topics by what earns the most marks for the least time, not alphabetically.
- Base everything on the material given. Do not invent topics that aren't in it.

Return ONLY JSON in exactly this shape, with no prose and no markdown fences:
{"headline":"one sentence on the strategy","priorities":["most important topic first","..."],"blocks":[{"day":"Wednesday","start":"18:00","end":"19:30","topic":"what to study","why":"one short reason"}]}`;
}

/** Drops anything the model produced that breaks the scheduling rules. */
function sanitise(plan: StudyPlan, ctx: PlannerContext): StudyPlan {
  const toMinutes = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  const blocks = plan.blocks.filter((b) => {
    if (!DAYS.includes(b.day)) return false;

    const start = toMinutes(b.start);
    const end = toMinutes(b.end);
    if (start === null || end === null || end <= start) return false;
    if (start < 7 * 60 || end > 23 * 60) return false;

    // The model is told not to double-book classes, but it is not trusted to
    // obey — a study block over a lecture is the one mistake that makes the
    // whole plan useless.
    const clash = ctx.busy.some((c) => {
      if (c.day !== b.day) return false;
      const cs = toMinutes(c.start);
      const ce = toMinutes(c.end);
      if (cs === null || ce === null) return false;
      return start < ce && end > cs;
    });

    return !clash;
  });

  return { ...plan, blocks };
}

export async function buildStudyPlan(ctx: PlannerContext): Promise<StudyPlan> {
  const raw = await callModel(buildPrompt(ctx));

  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("Could not build a plan from that. Try adding a bit more detail.");
  }

  let parsed: StudyPlan;
  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    throw new Error("Could not build a plan from that. Try again.");
  }

  return sanitise(
    {
      headline: String(parsed.headline ?? "Here's a plan."),
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.map(String).slice(0, 8) : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    },
    ctx,
  );
}
