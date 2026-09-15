"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type NameResult = { ok: true } | { ok: false; error: string };

/**
 * Records what a student calls a course.
 *
 * Slate sends only the code — "CS13410" — and Moodle's export has no field for
 * the name, so this is the only way a deadline can ever read "Intro to Machine
 * Learning". Once, per course, then it shows everywhere: the dashboard, every
 * reminder, and Ask Recall's context.
 */
export async function nameCourse(code: string, name: string): Promise<NameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const cleanCode = code.trim();
  const cleanName = name.replace(/\s+/g, " ").trim();

  if (!cleanCode || cleanCode.length > 40) return { ok: false, error: "Unknown course code." };
  if (cleanName.length > 80) return { ok: false, error: "That name is too long." };

  const supabase = await createClient();

  // An empty name clears it — a student correcting a mistake should be able
  // to go back to just the code rather than being stuck with a wrong name.
  if (!cleanName) {
    await supabase.from("courses").delete().eq("user_id", user.id).eq("code", cleanCode);
  } else {
    // Marked manual so a later Slate sync leaves it alone — the student's
    // choice outranks the official title.
    const { error } = await supabase.from("courses").upsert(
      { user_id: user.id, code: cleanCode, name: cleanName, source: "manual", updated_at: new Date().toISOString() },
      { onConflict: "user_id,code" },
    );
    if (error) return { ok: false, error: "Could not save that." };
  }

  // Every surface that shows a deadline.
  revalidatePath("/dashboard");
  revalidatePath("/planner");
  revalidatePath("/timetable");
  revalidatePath("/ask");

  return { ok: true };
}
