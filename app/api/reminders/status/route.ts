import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { planReminders, type ClassRow, type DeadlineRow, type ReminderPrefs } from "@/lib/reminders";

/**
 * Diagnostic for "why didn't I get an alert?".
 *
 * The reminder path crosses four systems — browser subscription, extension
 * timer, scheduling rules, and the sent-log — and a failure in any of them
 * looks identical from the outside: silence. This shows all four at once.
 *
 * Visit /api/reminders/status while signed in.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = await createClient();

  // ?retry=1 clears claims on anything due within two hours, so a reminder
  // that was recorded but never actually delivered can fire again.
  const retry = new URL(request.url).searchParams.get("retry") === "1";
  let released = 0;

  if (retry) {
    const { data: soon } = await supabase
      .from("deadlines")
      .select("id")
      .eq("user_id", user.id)
      .gte("due_at", new Date().toISOString())
      .lte("due_at", new Date(Date.now() + 2 * 3_600_000).toISOString());

    const ids = (soon ?? []).map((d) => d.id);
    if (ids.length) {
      const { count } = await supabase
        .from("notifications_sent")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .in("ref_id", ids);
      released = count ?? 0;
    }
  }

  const [{ data: subs }, { data: device }, { data: prefsRow }, { data: classes }, { data: deadlines }, { data: sent }] =
    await Promise.all([
      supabase.from("push_subscriptions").select("endpoint, created_at").eq("user_id", user.id),
      supabase.from("sync_devices").select("label, last_seen_at").eq("user_id", user.id),
      supabase.from("reminder_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("class_sessions").select("id, course, day_of_week, start_time, room").eq("user_id", user.id),
      supabase
        .from("deadlines")
        .select("id, title, course, kind, due_at")
        .eq("user_id", user.id)
        .gte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(10),
      supabase
        .from("notifications_sent")
        .select("kind, ref_id, window_key, sent_at")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(10),
    ]);

  const prefs: ReminderPrefs = prefsRow ?? {
    class_minutes_before: 30,
    deadline_hours_ahead: [24, 2, 0.5],
    enabled: true,
  };

  const now = new Date();
  const planned = planReminders(now, prefs, (classes ?? []) as ClassRow[], (deadlines ?? []) as DeadlineRow[]);

  // Which link in the chain is broken?
  const problems: string[] = [];
  if (!subs?.length) problems.push("No push subscription — click 'Turn on reminders' on the dashboard.");
  if (!device?.length) problems.push("No paired extension — nothing is triggering the reminder check.");
  if (device?.length && !device.some((d) => d.last_seen_at))
    problems.push("Extension paired but has never called in — reload it at chrome://extensions.");
  if (!prefs.enabled) problems.push("Reminders are switched off in your preferences.");
  if (planned.length === 0)
    problems.push("Nothing is due inside a reminder window right now — see 'windows' below for why.");

  return NextResponse.json(
    {
      now: now.toISOString(),
      released: retry ? released : undefined,
      problems: problems.length ? problems : ["Everything looks wired up."],

      subscriptions: subs?.length ?? 0,
      devices: (device ?? []).map((d) => ({
        label: d.label,
        lastCalledIn: d.last_seen_at,
        minutesAgo: d.last_seen_at
          ? Math.round((now.getTime() - new Date(d.last_seen_at).getTime()) / 60_000)
          : null,
      })),

      windows: {
        classes: `${prefs.class_minutes_before} minutes before`,
        deadlines: prefs.deadline_hours_ahead.map((h) => `${h}h before`),
      },

      wouldSendRightNow: planned.map((p) => ({
        kind: p.kind,
        window: p.windowKey,
        title: p.title,
        body: p.body,
      })),

      upcoming: (deadlines ?? []).map((d) => ({
        title: d.title,
        kind: d.kind,
        dueAt: d.due_at,
        minutesAway: Math.round((new Date(d.due_at).getTime() - now.getTime()) / 60_000),
      })),

      alreadySent: sent ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
