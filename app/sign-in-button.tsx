"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRIMARY_DOMAIN, wrongDomainMessage } from "@/lib/allowed-email";

/**
 * Starts the Google OAuth flow.
 *
 * We never see the student's password — Google authenticates them and
 * sends them back to /auth/callback with a one-time code.
 */
export function SignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The callback redirects here with ?error=wrong-domain when someone signs
  // in with a non-UOL Google account.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "wrong-domain") setError(wrongDomainMessage());
    else if (reason === "sign-in-failed") setError("Sign-in did not complete. Please try again.");
  }, []);

  async function signIn() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          // Asks Google to show only University of Lahore accounts. This is a
          // convenience, NOT the restriction — it can be bypassed, so the real
          // check happens server-side in /auth/callback.
          hd: PRIMARY_DOMAIN,
        },
      },
    });

    if (error) {
      setError("Could not reach Google. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={signIn}
        disabled={loading}
        className="inline-flex items-center justify-center gap-3 rounded-xl bg-white px-6 py-3.5 font-semibold text-[#1f2430] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-mint"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4h6.6c-.1 1.1-.9 2.8-2.5 3.9l3.8 3c2.3-2.1 3.6-5.2 3.6-8.7z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.1 14.3c-.3-.8-.4-1.5-.4-2.3s.2-1.6.4-2.3l-4-3C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3z"
          />
          <path
            fill="#EA4335"
            d="M12 4.8c2.3 0 3.8.9 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l3.9 3c1-2.9 3.7-4.9 6.9-4.9z"
          />
        </svg>
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>

      <p className="text-xs text-faint">
        Use your @student.uol.edu.pk account. We never see your password.
      </p>

      {error && (
        <p role="alert" className="text-sm font-medium text-amber">
          {error}
        </p>
      )}
    </div>
  );
}
