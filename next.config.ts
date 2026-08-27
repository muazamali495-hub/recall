import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdf-to-img loads pdfjs, which pulls in its own worker file at runtime.
   * Bundling it breaks that lookup ("Setting up fake worker failed"), so we
   * keep it as a plain Node dependency resolved from node_modules.
   */
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
