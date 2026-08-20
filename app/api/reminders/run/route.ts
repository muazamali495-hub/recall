import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { bearerFrom, CORS_HEADERS, hashDeviceToken } from "@/lib/device-token";
import { planReminders, type ClassRow, type DeadlineRow, type ReminderPrefs } from "@/lib/reminders";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Sends any reminders that have come due for one student.
 *
 * Triggered by the browser extension on a timer — Recall has no paid cron and
 * no service-role key, so the work is scoped to whoever owns the device token
 * by the `reminder_context` database function.
 */
export async function POST(request: Request) {
  const token = bearerFrom(request);
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401, headers: CORS_HEADERS });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { error: "Push is not configured on the server." },
      { status: 500, headers: CORS_HEADERS },
    );
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

  const tokenHash = hashDeviceToken(token);

  const { data: context, error } = await supabase.rpc("reminder_context", {
    p_token_hash: tokenHash,
  });

  if (error || !context) {
    return NextResponse.json(
      { error: "This device isn't linked to an account." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const prefs = context.prefs as ReminderPrefs;
  const subscriptions = context.subscriptions as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no subscriptions" }, { headers: CORS_HEADERS });
  }

  const planned = planReminders(
    new Date(),
    prefs,
    context.classes as ClassRow[],
    context.deadlines as DeadlineRow[],
  );

  let sent = 0;
  const failures: string[] = [];

  console.log(
    `[reminders] subs=${subscriptions.length} classes=${(context.classes as unknown[]).length} deadlines=${(context.deadlines as unknown[]).length} planned=${planned.length} windows=${JSON.stringify(prefs.deadline_hours_ahead)}`,
  );

  for (const reminder of planned) {
    // Claim the reminder first. If another run already sent it, the insert is
    // a no-op and we skip — this is what stops repeat pings every few minutes.
    const { data: isNew } = await supabase.rpc("record_notification", {
      p_token_hash: tokenHash,
      p_kind: reminder.kind,
      p_ref_id: reminder.refId,
      p_window_key: reminder.windowKey,
    });

    if (!isNew) {
      console.log(`[reminders] skip (already sent): ${reminder.windowKey} ${reminder.title}`);
      continue;
    }

    let deliveredThis = 0;

    const payload = JSON.stringify({
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
      tag: `${reminder.kind}:${reminder.refId}`,
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
        deliveredThis++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        const body = (err as { body?: string }).body;
        failures.push(`${status ?? "?"}: ${body ?? (err as Error).message}`);
        console.error(`[reminders] send failed ${status}: ${body ?? (err as Error).message}`);

        // 404/410 mean the browser threw the subscription away — clean it up
        // rather than retrying it forever.
        if (status === 404 || status === 410) {
          await supabase.rpc("drop_push_subscription", {
            p_token_hash: tokenHash,
            p_endpoint: sub.endpoint,
          });
        }
      }
    }

    // Claiming the reminder before sending stops two overlapping runs from
    // double-sending. But if every delivery then failed, the claim would
    // bury it forever — so release it and let the next run try again.
    if (deliveredThis === 0) {
      await supabase.rpc("release_notification", {
        p_token_hash: tokenHash,
        p_kind: reminder.kind,
        p_ref_id: reminder.refId,
        p_window_key: reminder.windowKey,
      });
      console.warn(`[reminders] released unsent reminder: ${reminder.windowKey} ${reminder.title}`);
    }
  }

  console.log(`[reminders] done sent=${sent} failures=${failures.length}`);

  return NextResponse.json(
    { sent, planned: planned.length, failures },
    { headers: CORS_HEADERS },
  );
}
