import { createClient } from "@/lib/supabase/server";

/**
 * How many times a student may do the expensive things.
 *
 * These are not security limits — a signed-in student is not an attacker.
 * They exist because Recall runs on free tiers that everybody shares: one
 * person holding down the planner button exhausts the AI quota for the whole
 * university. The numbers are set well above real use and well below abuse,
 * so nobody doing ordinary work ever meets one.
 */
export const LIMITS = {
  // Conversation. Twenty messages in ten minutes is a fast, engaged session.
  ask: { bucket: "ask", limit: 20, window: 600 },
  // A plan takes a model several seconds and is read for minutes afterwards.
  planner: { bucket: "planner", limit: 10, window: 3600 },
  // The most expensive thing here: a vision model reading several page images.
  timetable: { bucket: "timetable", limit: 12, window: 3600 },
  // Enough to test on a laptop and two phones, several times over.
  pushTest: { bucket: "push_test", limit: 8, window: 600 },
} as const;

export type Gate = { allowed: true } | { allowed: false; message: string; retryAfter: number };

function wait(seconds: number): string {
  if (seconds <= 60) return "a moment";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return "an hour";
}

/**
 * Counts one use against the signed-in student's allowance.
 *
 * The subject is never passed in — the database reads it from the session — so
 * one student cannot spend another's allowance by asking nicely.
 *
 * Fails open. If the check itself errors the request proceeds, because these
 * limits protect a quota rather than a secret, and refusing real work over a
 * database hiccup would be a worse failure than the one being prevented.
 */
export async function checkLimit(rule: { bucket: string; limit: number; window: number }): Promise<Gate> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("consume_my_rate_limit", {
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window: rule.window,
    });

    if (error || !data) return { allowed: true };

    const result = data as { allowed: boolean; retry_after: number };
    if (result.allowed) return { allowed: true };

    return {
      allowed: false,
      retryAfter: result.retry_after,
      message: `You've done that a lot in a short time — Recall's free AI is shared between everyone using it. Try again in ${wait(result.retry_after)}.`,
    };
  } catch {
    return { allowed: true };
  }
}
