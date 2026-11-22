import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "muntireport(?:\\.\\d{1,3}){4}\\.sslip\\.io" }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }];
  },
  turbopack: {
    // A lockfile higher up the tree would otherwise be picked as the workspace root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
