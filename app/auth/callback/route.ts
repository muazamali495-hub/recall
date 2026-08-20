import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Where Google sends the student back after they approve sign-in.
 *
 * Supabase hands us a one-time `code`; we swap it for a real session and
 * store it in cookies. The `on_auth_user_created` trigger in the database
 * creates their `profiles` row at this moment, automatically.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=sign-in-failed`);
}
