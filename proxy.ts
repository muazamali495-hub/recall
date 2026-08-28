import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp";

/**
 * Runs before every page: refreshes the session, and stamps the request with a
 * one-time CSP nonce.
 *
 * (In Next.js 16 this file is `proxy.ts` — it was called `middleware.ts`
 * in earlier versions. Same job, new name.)
 *
 * Auth tokens expire. Without the refresh below, a signed-in student would get
 * logged out mid-semester.
 *
 * The nonce has to be minted here because it must differ per request, which
 * rules out next.config.ts. Next reads it back off the request's own
 * Content-Security-Policy header and applies it to the scripts it injects, so
 * nothing downstream has to remember to do it by hand.
 */
export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Next parses the nonce out of the CSP on the REQUEST — setting it only on
  // the response would produce a policy whose nonce matches nothing, and a
  // blank page.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuilt here, so the nonce header has to be reapplied — otherwise
          // refreshing a token would silently drop the CSP for that request.
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: this call is what actually refreshes the token.
  await supabase.auth.getUser();

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
