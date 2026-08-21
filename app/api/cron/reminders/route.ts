import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { planReminders, type ClassRow, type DeadlineRow, type ReminderPrefs } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Batch = Array<{
  user_id: string;
  prefs: ReminderPrefs;
  subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }> | null;
  classes: ClassRow[];
  deadlines: DeadlineRow[];
}>;

/**
 * Sends every reminder that has come due, for every student.
 *
 * This exists so reminders no longer depend on a laptop being open. The
 * extension is still the only thing that can fetch Slate — Cloudflare sees to
 * that — but reminders only read our own database, which the server can do on
 * its own. A student with a closed laptop, or no extension at all, still gets
 * told about the deadlines we already know.
 *
 * Called on a schedule by .github/workflows/reminders.yml.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  // Constant-time-ish: compare lengths first so a short guess can't be
  // distinguished by timing alone.
  if (provided.length !== secret.length || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push is not configured." }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:recall@example.com",
    publicKey,
    privateKey,
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("cron_reminder_batch", { p_secret: secret });

  if (error) {
    console.error("[cron] batch failed:", error.message);
    return NextResponse.json({ error: "Could not load reminder batch." }, { status: 500 });
  }

  const batch = (data ?? []) as Batch;
  const now = new Date();

  let considered = 0;
  let sent = 0;
  let failed = 0;

  for (const user of batch) {
    const subs = user.subscriptions ?? [];
    if (subs.length === 0) continue;

    const planned = planReminders(now, user.prefs, user.classes ?? [], user.deadlines ?? []);
    considered += planned.length;

    for (const reminder of planned) {
      // Claim before sending so overlapping runs can't double-send.
      const { data: isNew } = await supabase.rpc("cron_record_notification", {
        p_secret: secret,
        p_user_id: user.user_id,
        p_kind: reminder.kind,
        p_ref_id: reminder.refId,
        p_window_key: reminder.windowKey,
      });

      if (!isNew) continue;

      const payload = JSON.stringify({
        title: reminder.title,
        body: reminder.body,
        url: reminder.url,
        tag: `${reminder.kind}:${reminder.refId}`,
      });

      let delivered = 0;

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          delivered++;
          sent++;
        } catch (err) {
          failed++;
          const status = (err as { statusCode?: number }).statusCode;

          // The browser threw this subscription away — stop retrying it.
          if (status === 404 || status === 410) {
            await supabase.rpc("cron_drop_subscription", {
              p_secret: secret,
              p_endpoint: sub.endpoint,
            });
          }
        }
      }

      // Every delivery failed, so release the claim rather than burying the
      // reminder forever.
      if (delivered === 0) {
        await supabase.rpc("cron_release_notification", {
          p_secret: secret,
          p_user_id: user.user_id,
          p_kind: reminder.kind,
          p_ref_id: reminder.refId,
          p_window_key: reminder.windowKey,
        });
      }
    }
  }

  console.log(`[cron] users=${batch.length} due=${considered} sent=${sent} failed=${failed}`);

  return NextResponse.json({ users: batch.length, due: considered, sent, failed });
}
