import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The offline desktop edition carries a self-contained server (NEXT_OUTPUT=standalone); the live site does not.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["exceljs", "@electric-sql/pglite", "postgres"],
  experimental: {
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        "ops.myseed.com.et",
        "*.myseed.com.et",
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
