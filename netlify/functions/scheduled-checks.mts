// Runs the alert checks (deadlines, blockers, stale timers, waiting handoffs) every 15 minutes
// by calling the app's protected endpoint. Requires CRON_SECRET in the site environment.
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("scheduled-checks: URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron/checks`, { headers: { authorization: `Bearer ${secret}` } });
  console.log("scheduled-checks", res.status, await res.text());
};

export const config = { schedule: "*/15 * * * *" };
