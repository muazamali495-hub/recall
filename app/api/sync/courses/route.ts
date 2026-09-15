import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bearerFrom, CORS_HEADERS, hashDeviceToken } from "@/lib/device-token";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Receives the student's enrolled courses, with full names, from the
 * extension.
 *
 * A separate route from /api/sync on purpose: that one takes a raw calendar
 * as text/calendar and its contract is shared with every installed copy of
 * the extension. Course names are a JSON list that arrives after the calendar
 * and may not arrive at all, and bolting them onto the same request would
 * have meant changing what every existing extension sends.
 */
export async function POST(request: Request) {
  const token = bearerFrom(request);
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401, headers: CORS_HEADERS });
  }

  let body: { courses?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: CORS_HEADERS });
  }

  if (!Array.isArray(body.courses)) {
    return NextResponse.json({ error: "Expected a list of courses." }, { status: 400, headers: CORS_HEADERS });
  }

  // Only the two fields the database reads, each bounded. The extension is
  // ours, but the token is a bearer credential and this is an unauthenticated
  // route as far as sessions go — the shape is checked here, not trusted.
  const courses = body.courses
    .filter((c): c is { shortname: string; fullname: string } =>
      typeof c === "object" && c !== null &&
      typeof (c as { shortname?: unknown }).shortname === "string" &&
      typeof (c as { fullname?: unknown }).fullname === "string",
    )
    .slice(0, 200)
    .map((c) => ({ shortname: c.shortname.slice(0, 120), fullname: c.fullname.slice(0, 200) }));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.rpc("sync_courses", {
    p_token_hash: hashDeviceToken(token),
    p_courses: courses,
  });

  // Enough to diagnose "names never arrived" from the log alone: how many the
  // extension sent, what the first one looked like, and what the database
  // did with them. Course titles are not sensitive; tokens are not logged.
  console.log(
    `[courses] received=${body.courses.length} kept=${courses.length}` +
      ` named=${data ?? "-"} error=${error?.code ?? "none"}` +
      (courses[0] ? ` first=${JSON.stringify(courses[0])}` : ""),
  );

  if (error) {
    const unauthorised = error.code === "28000";
    return NextResponse.json(
      { error: unauthorised ? "This device isn't linked to an account." : "Could not save course names." },
      { status: unauthorised ? 401 : 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ named: data ?? 0, received: courses.length }, { headers: CORS_HEADERS });
}
