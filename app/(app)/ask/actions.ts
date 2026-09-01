"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { buildMessages, type StudentContext } from "@/lib/ask";
import { callChat, LlmNotConfigured } from "@/lib/llm";
import { findPassages, passagesPrompt } from "@/lib/rag";
import { checkLimit, LIMITS } from "@/lib/rate-limit";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const MAX_QUESTION = 6000;

export type Turn = { role: "user" | "assistant"; content: string };

export type AskState = { answer?: string; error?: string } | null;

/**
 * Answers a question with the student's own week loaded in.
 *
 * Anyone can ask a chatbot what to revise. The difference here is that the
 * model is told what is actually due and when they are actually free, so the
 * answer is about their Thursday quiz rather than studying in general.
 */
export async function askAction(
  history: Turn[],
  question: string,
): Promise<AskState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Please sign in again." };

  // Free model pools are shared with every other student using Recall.
  const gate = await checkLimit(LIMITS.ask);
  if (!gate.allowed) return { error: gate.message };

  const trimmed = question.trim();
  if (!trimmed) return { error: "Type a question first." };
  if (trimmed.length > MAX_QUESTION) {
    return { error: "That's too long to send at once. Try trimming it down." };
  }

  const supabase = await createClient();
  const pktNow = new Date(Date.now() + PKT_OFFSET_MS);
  const todayIndex = pktNow.getUTCDay();

  const [{ data: profile }, { data: deadlines }, { data: classes }, { data: allClasses }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("deadlines")
        .select("title, course, kind, due_at")
        .eq("user_id", user.id)
        .gte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(12),
      supabase
        .from("class_sessions")
        .select("course, start_time, room")
        .eq("user_id", user.id)
        .eq("day_of_week", todayIndex)
        .order("start_time", { ascending: true }),
      supabase.from("class_sessions").select("course").eq("user_id", user.id),
    ]);

  const ctx: StudentContext = {
    name: profile?.full_name?.split(" ")[0] ?? null,
    today: DAYS[todayIndex],
    nowLabel: pktNow.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }),
    // Course names come from the timetable and the deadline feed; together
    // they are a decent picture of what the student is actually taking.
    courses: Array.from(
      new Set([
        ...(allClasses ?? []).map((c) => c.course),
        ...(deadlines ?? []).map((d) => d.course).filter((c): c is string => Boolean(c)),
      ]),
    ).slice(0, 15),
    deadlines: (deadlines ?? []).map((d) => ({
      title: d.title,
      course: d.course,
      kind: d.kind,
      dueLabel: new Date(d.due_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Karachi",
      }),
      hoursAway: (new Date(d.due_at).getTime() - Date.now()) / 3_600_000,
    })),
    todayClasses: (classes ?? []).map((c) => ({
      course: c.course,
      start: (c.start_time ?? "").slice(0, 5),
      room: c.room,
    })),
  };

  try {
    // Look for anything in the document library that bears on the question.
    // Usually there is nothing — most questions are about the student's own
    // week, which the context above already covers — and in that case this is
    // an empty string and the behaviour is exactly as before.
    const passages = await findPassages(trimmed);

    const answer = await callChat(
      buildMessages(ctx, history, trimmed, passagesPrompt(passages)),
    );
    return { answer };
  } catch (err) {
    if (err instanceof LlmNotConfigured) {
      return { error: "AI features aren't set up yet. Add OPENROUTER_API_KEY to .env.local." };
    }
    return { error: err instanceof Error ? err.message : "Could not get an answer." };
  }
}
