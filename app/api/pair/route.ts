import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CORS_HEADERS, generateDeviceToken, hashDeviceToken } from "@/lib/device-token";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Exchanges a one-time pairing code for a long-lived device token.
 *
 * Called by the extension, which has no user session — the `pair_device`
 * database function does the validating.
 */
export async function POST(request: Request) {
  let body: { code?: string; label?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: CORS_HEADERS });
  }

  const code = String(body.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Enter your pairing code." }, { status: 400, headers: CORS_HEADERS });
  }

  const token = generateDeviceToken();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("pair_device", {
    p_code: code,
    p_token_hash: hashDeviceToken(token),
    p_label: String(body.label ?? "Chrome extension").slice(0, 60),
  });

  if (error) {
    return NextResponse.json(
      { error: "Could not link this device. Please try again." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // A rejected code now comes back as a value rather than an error: the
  // throttle has to count failures, and raising would roll that count back
  // along with the rest of the transaction.
  const result = data as { ok: boolean; reason?: string; retry_after?: number } | null;

  if (!result?.ok) {
    if (result?.reason === "throttled") {
      return NextResponse.json(
        { error: "Too many pairing attempts right now. Try again in a few minutes." },
        {
          status: 429,
          headers: { ...CORS_HEADERS, "Retry-After": String(result.retry_after ?? 600) },
        },
      );
    }

    return NextResponse.json(
      { error: "That code is invalid or has expired. Generate a new one in Recall." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  // The only time the plaintext token is ever sent. The extension stores it.
  return NextResponse.json({ token }, { headers: CORS_HEADERS });
}
