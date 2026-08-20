import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bearerFrom, CORS_HEADERS, hashDeviceToken } from "@/lib/device-token";
import { parseIcs } from "@/lib/ics";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const MAX_ICS_BYTES = 2_000_000;

/**
 * Receives raw .ics text from the extension and stores the deadlines.
 *
 * Note what is NOT here: the student's calendar URL. The extension keeps
 * that locally and only sends us the calendar contents, so Recall never
 * holds a credential for anyone's Slate account.
 */
export async function POST(request: Request) {
  const token = bearerFrom(request);
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401, headers: CORS_HEADERS });
  }

  const ics = await request.text();

  if (ics.length > MAX_ICS_BYTES) {
    return NextResponse.json({ error: "Calendar too large." }, { status: 413, headers: CORS_HEADERS });
  }

  if (!ics.includes("BEGIN:VCALENDAR")) {
    return NextResponse.json({ error: "That wasn't a calendar file." }, { status: 400, headers: CORS_HEADERS });
  }

  let events;
  try {
    events = parseIcs(ics);
  } catch {
    return NextResponse.json({ error: "Could not read that calendar." }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("sync_deadlines", {
    p_token_hash: hashDeviceToken(token),
    p_events: events,
  });

  if (error) {
    return NextResponse.json(
      { error: "This extension isn't linked to an account. Pair it again in Recall." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ synced: data ?? 0, parsed: events.length }, { headers: CORS_HEADERS });
}
