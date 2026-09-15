import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bearerFrom, CORS_HEADERS, hashDeviceToken } from "@/lib/device-token";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Receives the ids of events Slate still lists as open. Recall marks any
 * upcoming assignment or quiz that is missing from the list as done.
 *
 * The database refuses an empty list, and this route refuses to send one:
 * a failed Slate call must not look like a student who finished everything.
 */
export async function POST(request: Request) {
  const token = bearerFrom(request);
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401, headers: CORS_HEADERS });
  }

  let body: { actionable?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(body.actionable)) {
    return NextResponse.json({ error: "Expected a list of event ids." }, { status: 400, headers: CORS_HEADERS });
  }

  // Positive integers only, bounded. Moodle event ids are well under 2^53,
  // and a student has nowhere near a thousand open events.
  const actionable = [...new Set(
    body.actionable.filter(
      (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0 && id < 2 ** 53,
    ),
  )].slice(0, 1000);

  if (actionable.length === 0) {
    return NextResponse.json({ done: 0, undone: 0, skipped: "empty list" }, { headers: CORS_HEADERS });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("sync_deadline_status", {
    p_token_hash: hashDeviceToken(token),
    p_actionable: actionable,
  });

  console.log(
    `[status] open=${actionable.length} done=${data?.done ?? "-"} undone=${data?.undone ?? "-"}` +
      ` error=${error?.code ?? "none"}`,
  );

  if (error) {
    const unauthorised = error.code === "28000";
    return NextResponse.json(
      { error: unauthorised ? "This device isn't linked to an account." : "Could not update task status." },
      { status: unauthorised ? 401 : 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    { done: data?.done ?? 0, undone: data?.undone ?? 0, open: actionable.length },
    { headers: CORS_HEADERS },
  );
}
