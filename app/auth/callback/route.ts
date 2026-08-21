import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowed-email";

/**
 * Where Google sends the student back after they approve sign-in.
 *
 * Supabase hands us a one-time `code`; we swap it for a real session and
 * store it in cookies. The `on_auth_user_created` trigger in the database
 * creates their `profiles` row at this moment, automatically.
 *
 * This is also where the University of Lahore restriction is ENFORCED. The
 * `hd` hint on the sign-in button only nudges Google's account picker — a
 * determined person can still authenticate with any Google account, so the
 * decision has to be made here, on the server, after we can see the email.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Where to send them, honouring the proxy host in production.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

  if (!code) return NextResponse.redirect(`${base}/?error=sign-in-failed`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return NextResponse.redirect(`${base}/?error=sign-in-failed`);

  const email = data.user?.email ?? null;

  if (!isAllowedEmail(email)) {
    // Supabase has already created the account by this point, so rejecting
    // them means undoing it — otherwise every stranger who tries the link
    // leaves a permanent row behind.
    await supabase.rpc("delete_own_account").then(
      () => {},
      () => {
        // If cleanup fails the sign-out below still blocks access; the
        // orphaned row is untidy but harmless.
      },
    );

    await supabase.auth.signOut();

    return NextResponse.redirect(`${base}/?error=wrong-domain`);
  }

  return NextResponse.redirect(`${base}${next}`);
}
