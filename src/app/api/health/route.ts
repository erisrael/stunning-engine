import { get } from "@/server/db";

// For uptime checks (the GitHub Actions schedule, UptimeRobot, a VPS monitor): 200 when the app and its
// database answer, 503 when not. Says nothing else about the system.
export const dynamic = "force-dynamic";

async function _GET() {
  const t0 = Date.now();
  try {
    await get("SELECT 1 AS x");
    return Response.json({ ok: true, ms: Date.now() - t0 }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

// Counted in Admin, Platform, API usage.
export const GET = (...a: Parameters<typeof _GET>) => import("@/server/platform").then((p) => p.tracked("health", () => _GET(...a)));
