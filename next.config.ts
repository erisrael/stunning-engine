import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The offline desktop edition carries a self-contained server (NEXT_OUTPUT=standalone); the live site does not.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["exceljs", "@electric-sql/pglite", "postgres"],
  // Do not announce the framework.
  poweredByHeader: false,
  // Security headers on every page and file. Pages may not be framed by other sites (clickjacking), except the
  // support widget (embedded in customers' apps and sites), the support app and the help pages (opened inside
  // Telegram); the last matching rule wins, so those come after.
  async headers() {
    const base = [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), display-capture=(self), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    const embeddable = [{ key: "Content-Security-Policy", value: "frame-ancestors *; base-uri 'self'; object-src 'none'" }, { key: "X-Frame-Options", value: "ALLOWALL" }];
    return [
      { source: "/:path*", headers: base },
      { source: "/support-widget/:path*", headers: embeddable },
      { source: "/support-widget", headers: embeddable },
      { source: "/support-app/:path*", headers: embeddable },
      { source: "/support-app", headers: embeddable },
      { source: "/help/:path*", headers: embeddable },
      { source: "/help", headers: embeddable },
    ];
  },
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
