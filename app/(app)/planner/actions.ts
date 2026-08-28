"use server";

import { createClient } from "@/lib/supabase/server";
import { buildStudyPlan, type PlannerContext, type StudyPlan } from "@/lib/planner";
import { LlmNotConfigured } from "@/lib/llm";
import { checkLimit, LIMITS } from "@/lib/rate-limit";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export type PlanState = { plan?: StudyPlan; error?: string } | null;

/**
 * Builds a study plan around what the student actually has on.
 *
 * The material comes from them; the deadline and the free time come from data
 * Recall already holds. That combination is the point — a bare LLM can write a
 * study plan, but it can't know the quiz is Thursday and they're in class till
 * three.
 */
export async function createPlanAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Please sign in again." };

  const gate = await checkLimit(LIMITS.planner);
  if (!gate.allowed) return { error: gate.message };

  const material = String(formData.get("material") ?? "").trim();
  const deadlineId = String(formData.get("deadline_id") ?? "").trim();

  if (material.length < 20) {
    return { error: "Paste your topics, slide titles or course outline first." };
  }

  const [{ data: classes }, { data: deadlines }] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("course, day_of_week, start_time, end_time")
      .eq("user_id", user.id),
    supabase
      .from("deadlines")
      .select("id, title, course, kind, due_at")
      .eq("user_id", user.id)
      .gte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
  ]);

  const target = deadlines?.find((d) => d.id === deadlineId) ?? null;

  const pktNow = new Date(Date.now() + PKT_OFFSET_MS);

  const ctx: PlannerContext = {
    target: target
      ? {
          title: target.title,
          course: target.course,
          kind: target.kind,
          dueAt: new Date(target.due_at).toLocaleString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Karachi",
          }),
        }
      : null,
    material,
    busy: (classes ?? []).map((c) => ({
      day: DAYS[c.day_of_week] ?? "Monday",
      start: (c.start_time ?? "").slice(0, 5),
      end: (c.end_time ?? "").slice(0, 5) || "23:59",
      course: c.course,
    })),
    otherDeadlines: (deadlines ?? [])
      .filter((d) => d.id !== deadlineId)
      .slice(0, 5)
      .map((d) => ({
        title: d.title,
        dueAt: new Date(d.due_at).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "Asia/Karachi",
        }),
      })),
    today: DAYS[pktNow.getUTCDay()],
    nowLabel: pktNow.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }),
  };

  try {
    const plan = await buildStudyPlan(ctx);

    if (plan.blocks.length === 0) {
      return {
        error:
          "Couldn't fit any study blocks around your classes. Try picking a deadline further out, or check your timetable is right.",
      };
    }

    return { plan };
  } catch (err) {
    if (err instanceof LlmNotConfigured) {
      return { error: "AI features aren't set up yet. Add OPENROUTER_API_KEY to .env.local." };
    }
    return { error: err instanceof Error ? err.message : "Could not build a plan." };
  }
}
