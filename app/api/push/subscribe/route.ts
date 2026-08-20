import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Stores the browser's push subscription for the signed-in student.
 *
 * One row per device: the same person on a laptop and a phone gets two, and
 * both should be pinged.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: "Incomplete subscription." }, { status: 400 });
  }

  // Re-subscribing on the same device reuses the endpoint, so upsert.
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({ endpoint: null }));
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
