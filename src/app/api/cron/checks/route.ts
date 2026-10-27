import { runScheduledChecks } from "@/server/jobs";

// Scheduled alerts (deadlines, blockers, stale timers, waiting handoffs). Called by the Netlify
// scheduled function every 15 minutes with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const counts = await runScheduledChecks();
  return Response.json({ ok: true, at: new Date().toISOString(), counts });
}
