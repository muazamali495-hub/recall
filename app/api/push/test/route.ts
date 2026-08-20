import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends one notification to the signed-in student, right now.
 *
 * Real reminders only fire when a class or deadline is actually close, which
 * makes "is push working at all?" impossible to answer on a quiet week. This
 * separates the delivery plumbing from the scheduling rules.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push isn't configured on the server." }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:recall@example.com",
    publicKey,
    privateKey,
  );

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subscriptions?.length) {
    return NextResponse.json({ error: "No device is subscribed yet." }, { status: 400 });
  }

  const payload = JSON.stringify({
    title: "Recall is working",
    body: "This is what a reminder will look like.",
    url: "/dashboard",
    tag: "recall-test",
  });

  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser dropped this subscription — stop keeping it around.
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }

  if (sent === 0) {
    return NextResponse.json(
      { error: "Could not deliver. Turn reminders on again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent });
}
