import { parseJsonLoosely } from "./json";
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

  // The output contract is stated first and repeated last. Weak free models
  // reliably obey one end of a prompt or the other, and which end varies by
  // model — nemotron narrated its reasoning before answering until the shape
  // was put up front. Saying it twice costs a few tokens and fixed it.
  return `Output JSON only. No prose before it, no explanation after it, no markdown fences.

You are a study coach for a university student in Pakistan. Today is ${ctx.today}, ${ctx.nowLabel}.

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
  // Not typed as string: a truncated reply can be repaired into a block whose
  // last field never arrived, and a bare .match() on undefined throws — which
  // would turn a recoverable plan into a 500.
  const toMinutes = (t: unknown) => {
    if (typeof t !== "string") return null;
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  const blocks = plan.blocks.filter((b) => {
    if (!b || typeof b !== "object") return false;
    if (!DAYS.includes(b.day)) return false;
    if (typeof b.topic !== "string" || !b.topic.trim()) return false;

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
  // 3500, not the 2500 default: a plan with six blocks plus reasons runs long,
  // and a model that hits the ceiling stops mid-object. parseJsonLoosely can
  // rescue those, but a plan that was never cut off is better than a repaired
  // one.
  const raw = await callModel(buildPrompt(ctx), 3500);

  const parsed = parseJsonLoosely<StudyPlan>(raw);

  if (!parsed) {
    throw new Error("Could not build a plan from that. Try adding a bit more detail.");
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
