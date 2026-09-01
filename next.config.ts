import type { NextConfig } from "next";

/**
 * Response hardening.
 *
 * The Content-Security-Policy is deliberately NOT here — it carries a
 * per-request nonce, so it is built in proxy.ts instead. Setting it in both
 * places would be worse than setting it in one: browsers enforce every CSP
 * header they receive, so the effective policy becomes the intersection, and
 * the static copy would forbid the nonced scripts the other copy allows.
 *
 * What remains are the headers that are the same on every response. Vercel
 * supplies HSTS; none of these were present before.
 */
const SECURITY_HEADERS = [
  // frame-ancestors in the CSP covers modern browsers; this covers the rest.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Pairing codes and Slate calendar links can appear in a URL. Don't hand
  // them to third parties in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Recall is not a search result and has no business being one; more to the
  // point, signed-in pages must never be indexed.
  { key: "X-Robots-Tag", value: "noindex" },
];

const nextConfig: NextConfig = {
  /**
   * pdf-to-img loads pdfjs, which pulls in its own worker file at runtime.
   * Bundling it breaks that lookup ("Setting up fake worker failed"), so we
   * keep it as a plain Node dependency resolved from node_modules.
   */
  serverExternalPackages: [
    "pdf-to-img",
    "pdfjs-dist",
    "@napi-rs/canvas",
    // Same reasoning: the embedding model ships with native ONNX binaries and
    // ~117MB of library. Bundling it would drag that into every route rather
    // than the one that searches documents.
    "@xenova/transformers",
  ],

  // The default advertises the exact framework and version to anyone probing.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Everything except the landing page, which SHOULD be indexable —
        // it is how students find Recall in the first place.
        source: "/((?!$).*)",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/",
        headers: SECURITY_HEADERS.filter((h) => h.key !== "X-Robots-Tag"),
      },
    ];
  },
};

export default nextConfig;
