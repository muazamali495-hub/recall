/**
 * The Content-Security-Policy, built fresh for every request.
 *
 * It lives here rather than in next.config.ts because a nonce has to be new
 * each time — a reused one is no better than 'unsafe-inline', since an
 * attacker who can read one page can read the value and reuse it.
 *
 * ---- Why nonces are affordable here ----
 *
 * Nonces force dynamic rendering: a nonce cannot be baked into a page built
 * ahead of time. For most apps that is a real cost. Recall's pages are already
 * dynamic — every one of them reads the signed-in student's own data — so the
 * only things given up are the two generated icon routes, which contain no
 * scripts and need no nonce.
 *
 * ---- Why styles still allow 'unsafe-inline' ----
 *
 * A nonce cannot authorise a `style="..."` attribute; nonces only apply to
 * <style> elements. Recall sets widths from data in several places — the
 * attendance bars, the dashboard countdown ring — and those are attributes.
 * Removing 'unsafe-inline' would break them.
 *
 * That is a far smaller concession than it sounds: inline *styles* cannot
 * execute code. The attack CSP exists to stop is script injection, and
 * script-src below permits nothing but the nonce.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",

    // 'strict-dynamic' means scripts loaded BY a trusted script are trusted
    // too, which is what lets Next's bootstrap pull in its own bundles without
    // listing every file. 'self' stays as a fallback for browsers that predate
    // strict-dynamic and would otherwise ignore the whole directive.
    // 'unsafe-eval' is development only: React uses eval() to rebuild
    // server-side stack traces, and never uses it in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // See the note above on style attributes.
    "style-src 'self' 'unsafe-inline'",

    "img-src 'self' data: blob:",
    "font-src 'self' data:",

    // Supabase by pattern rather than by project ref, so rotating the project
    // does not silently break sign-in. ws: is the dev server's hot reload.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${
      isDev ? " ws://localhost:* http://localhost:*" : ""
    }`,

    // The service worker that delivers reminders, and the PWA manifest.
    "worker-src 'self'",
    "manifest-src 'self'",

    // Nothing may frame Recall. One click inside it signs you out or deletes
    // your account, which is exactly what a clickjacking overlay wants.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",

    // Stops an injected <base> from re-pointing every relative URL, and stops
    // a form being made to post credentials somewhere else.
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

/** A fresh, unguessable nonce. Base64 because that is what the header wants. */
export function makeNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
