import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Reads the session from cookies so the request runs as the signed-in user,
 * which is what makes Row Level Security apply to it.
 *
 * Wrapped in React's cache() so one request reuses one client instead of
 * rebuilding it for the layout, the page, and every component in between.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. Safe to ignore here:
            // proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  );
});

/**
 * The signed-in user, fetched at most once per request.
 *
 * getUser() is a network call to Supabase — roughly 150ms from Pakistan to
 * the Tokyo region. The layout guards the route and the page needs the id,
 * so without this they would each pay that cost separately for the same
 * answer. cache() collapses them into one call per request.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});
