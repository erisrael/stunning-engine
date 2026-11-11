import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "@electric-sql/pglite", "postgres"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        "ops.myseed.com.et",
        "myseedops.tech",
        "*.myseed.com.et",
        "*.myseedops.tech",
        "localhost:3000",
        "127.0.0.1:3000",
      ],
    },
  },
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
