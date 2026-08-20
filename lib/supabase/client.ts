import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (runs in the browser).
 *
 * Uses the publishable/anon key, which is safe to ship to the browser —
 * every query it makes is still filtered by Row Level Security, so a user
 * can only ever reach their own rows.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
