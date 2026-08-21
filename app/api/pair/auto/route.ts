import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { generateDeviceToken, hashDeviceToken, CORS_HEADERS } from "@/lib/device-token";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Mints a device token for the student who is already signed in.
 *
 * The pairing code exists so a *separate* device (a laptop extension) can be
 * linked without sharing a session. Inside the Android app there is no second
 * device — the student signs in right there — so making them copy a code
 * between two halves of the same app would be pointless friction.
 *
 * Requires a real session, so it cannot be used to mint tokens for anyone else.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: CORS_HEADERS });
  }

  const label = await request
    .json()
    .then((b: { label?: string }) => String(b.label ?? "Android app").slice(0, 60))
    .catch(() => "Android app");

  const supabase = await createClient();
  const token = generateDeviceToken();

  const { error } = await supabase.from("sync_devices").insert({
    user_id: user.id,
    token_hash: hashDeviceToken(token),
    label,
  });

  if (error) {
    return NextResponse.json({ error: "Could not link this device." }, { status: 500, headers: CORS_HEADERS });
  }

  // The only time the plaintext token is ever sent.
  return NextResponse.json({ token }, { headers: CORS_HEADERS });
}
