import { getViewer } from "@/server/auth";
import { teamScorecards } from "@/server/performance";

// Scorecards of a month as a spreadsheet (CSV, opens in Excel): ?period=YYYY-MM. Leads get their team, HR and
// owners everyone.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const period = new URL(request.url).searchParams.get("period");
  try {
    const cards = await teamScorecards(viewer, period);
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Person", "Month", "Template", "Score", "Rating", "KRA", "KPI", "Actual", "Target", "KPI score"].map(q).join(",")];
    for (const c of cards)
      for (const k of c.kras)
        for (const x of k.kpis) rows.push([c.name, c.period, c.template, c.score, c.rating, k.name, x.name, x.value, x.target, x.score].map(q).join(","));
    return new Response(`\ufeff${rows.join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="scorecards-${cards[0]?.period ?? period ?? "month"}.csv"` } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
