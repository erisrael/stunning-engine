import { runScheduledChecks } from "@/server/jobs";

// The scheduled jobs, called from outside with `Authorization: Bearer <CRON_SECRET>`: a Render cron job, a VPS
// crontab or systemd timer, the GitHub Actions schedule (.github/workflows/schedule.yml) or any pinger.
async function _GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const counts = await runScheduledChecks(undefined, { trigger: "cron" });
  const { scheduledCmsSync } = await import("@/server/cms-schedule");
  await scheduledCmsSync(undefined, true);
  await (await import("@/server/cms-reports")).scheduledCmsReports();
  await (await import("@/server/chapa-hub")).scheduledChapa();
  await (await import("@/server/cms-metrics")).scheduledCmsMetrics();
  return Response.json({ ok: true, at: new Date().toISOString(), counts });
}

// Counted in Admin, Platform, API usage.
export const GET = (r: Request) => import("@/server/platform").then((p) => p.tracked("cron", () => _GET(r)));
