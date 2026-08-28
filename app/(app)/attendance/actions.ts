"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type MarkResult = { ok: true } | { ok: false; error: string };

const STATUSES = new Set(["present", "absent", "cancelled"]);

/**
 * Records whether a class was attended.
 *
 * Upsert rather than insert: changing your mind about yesterday should correct
 * the record, not add a second contradictory one. The unique key on
 * (user, class, date) is what makes that safe.
 */
export async function markAttendance(
  classId: string,
  onDate: string,
  status: string,
): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  if (!STATUSES.has(status)) return { ok: false, error: "Unknown status." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return { ok: false, error: "Bad date." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .upsert(
      { user_id: user.id, class_id: classId, on_date: onDate, status },
      { onConflict: "user_id,class_id,on_date" },
    );

  if (error) return { ok: false, error: "Could not save that." };

  revalidatePath("/attendance");
  return { ok: true };
}

/** Removes a mark, for when it was recorded by mistake. */
export async function clearAttendance(classId: string, onDate: string): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("user_id", user.id)
    .eq("class_id", classId)
    .eq("on_date", onDate);

  if (error) return { ok: false, error: "Could not remove that." };

  revalidatePath("/attendance");
  return { ok: true };
}

/**
 * Records the first day of term.
 *
 * Without it the week-long lookback reaches into the holidays and asks about
 * days that had no classes — and any answer to those pollutes the number that
 * decides whether the student sits their exams.
 */
export async function saveSemesterStart(startsOn: string, label?: string): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { ok: false, error: "Pick a date." };

  const when = new Date(`${startsOn}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That isn't a real date." };

  // A semester is months, not years. A typo of 2016 for 2026 would silently
  // widen every lookback and quietly break the counts.
  const monthsAway = Math.abs(Date.now() - when.getTime()) / (30 * 86_400_000);
  if (monthsAway > 12) {
    return { ok: false, error: "That's more than a year away — check the date." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("semester").upsert(
    {
      user_id: user.id,
      starts_on: startsOn,
      label: label?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { ok: false, error: "Could not save that." };

  revalidatePath("/attendance");
  return { ok: true };
}

/**
 * Sets where a course already stood before Recall started counting.
 *
 * `held` is the number of classes that actually happened, `attended` how many
 * of those you were in — so held can never be the smaller of the two, and the
 * database enforces that too.
 */
export async function saveBaseline(
  course: string,
  attended: number,
  held: number,
  requiredPercent: number,
): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const a = Math.max(0, Math.round(Number(attended) || 0));
  const h = Math.max(0, Math.round(Number(held) || 0));
  const required = Math.min(99, Math.max(1, Math.round(Number(requiredPercent) || 75)));

  if (a > h) return { ok: false, error: "You can't have attended more classes than were held." };
  if (h > 400) return { ok: false, error: "That's more classes than a semester has." };

  const supabase = await createClient();

  const { error } = await supabase.from("attendance_baseline").upsert(
    {
      user_id: user.id,
      course,
      attended: a,
      held: h,
      required_percent: required,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course" },
  );

  if (error) return { ok: false, error: "Could not save that." };

  revalidatePath("/attendance");
  return { ok: true };
}
