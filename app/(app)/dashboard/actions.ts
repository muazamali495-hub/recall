"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type DoneResult = { ok: true } | { ok: false; error: string };

/**
 * A student marks a task finished, or takes that back.
 *
 * Nothing is deleted: the row keeps its date and reminders simply stop, and
 * the task moves to the collapsed "Done" list where one tap brings it back.
 * Slate can also mark tasks done on its own (a submitted assignment drops
 * out of its timeline); a manual mark is recorded as such so a later Slate
 * sync never overrides the student's own decision.
 */
export async function setDeadlineDone(deadlineId: string, done: boolean): Promise<DoneResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  if (!/^[0-9a-f-]{36}$/i.test(deadlineId)) return { ok: false, error: "Unknown task." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_deadline_done", {
    p_deadline_id: deadlineId,
    p_done: done,
  });

  if (error) return { ok: false, error: "Could not save that." };
  if (!data) return { ok: false, error: "That task is no longer here." };

  // Every surface that lists what is due.
  revalidatePath("/dashboard");
  revalidatePath("/planner");
  revalidatePath("/ask");

  return { ok: true };
}
