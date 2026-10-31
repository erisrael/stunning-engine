import { runScheduledChecks } from "@/server/jobs";

// The scheduled jobs, called from outside with `Authorization: Bearer <CRON_SECRET>`: a Render cron job, a VPS
// crontab or systemd timer, the GitHub Actions schedule (.github/workflows/schedule.yml) or any pinger.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const counts = await runScheduledChecks(undefined, { trigger: "cron" });
  return Response.json({ ok: true, at: new Date().toISOString(), counts });
}
