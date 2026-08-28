import type { NextConfig } from "next";

/**
 * Response hardening.
 *
 * Vercel supplies HSTS and nothing else, which left the app framable by any
 * site — a real problem here because a single click inside Recall can sign you
 * out or delete your account, and those are exactly the clicks a clickjacking
 * overlay steals.
 *
 * The CSP is deliberately modest rather than aspirational. `script-src` has to
 * allow inline until the app moves to nonces — Next injects its own bootstrap
 * scripts — so the directives that carry the real weight here are the other
 * ones: nothing may frame the page, nothing may be an <object>, forms can only
 * post to us, and <base> cannot be rewritten to point relative URLs elsewhere.
 */
// `next dev` needs two things production does not: eval(), which React uses in
// development to rebuild stack traces, and a WebSocket for hot reload. React
// states plainly that it never calls eval() in production, so relaxing these
// for the dev server costs the deployed app nothing — and applying the strict
// policy everywhere would just mean turning it off the first time it bit.
const isDev = process.env.NODE_ENV === "development";

const CONNECT_SRC = [
  "'self'",
  // Supabase: auth, database, realtime. Named by pattern rather than the exact
  // project so this file does not need editing when the project ref changes.
  "https://*.supabase.co",
  "wss://*.supabase.co",
  ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
].join(" ");

const SCRIPT_SRC = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])].join(" ");

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${SCRIPT_SRC}`,
  `connect-src ${CONNECT_SRC}`,
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // frame-ancestors covers modern browsers; this covers the rest.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Slate calendar URLs and pairing codes can appear in a path; don't leak
  // them to third parties in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  /**
   * pdf-to-img loads pdfjs, which pulls in its own worker file at runtime.
   * Bundling it breaks that lookup ("Setting up fake worker failed"), so we
   * keep it as a plain Node dependency resolved from node_modules.
   */
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],

  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The extension posts here from its own origin, so these routes opt
        // out of same-origin form/connect assumptions on purpose. They are
        // authenticated by a bearer device token rather than by a cookie,
        // which is what makes a wildcard CORS origin safe: there is no
        // ambient credential for another site to ride on.
        source: "/api/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
