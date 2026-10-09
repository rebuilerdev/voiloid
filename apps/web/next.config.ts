import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker イメージ用に、実行に必要なファイルだけを .next/standalone に出力する
  output: "standalone",
  // monorepo のルートから依存を辿る
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
