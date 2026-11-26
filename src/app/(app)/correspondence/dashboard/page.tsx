import Link from "next/link";
import { corrPage } from "@/server/corr/page";
import { dashboard } from "@/server/corr/delivery";
import { PageHeader } from "@/components/app/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { CAT } from "@/lib/chart-colors";

export const metadata = { title: "Correspondence dashboard" };

// Figures over the letters this person may see: totals as tiles, letters out and in per month, and the busiest
// departments, templates and organisations. Each chart also has its numbers as a table.
export default async function CorrDashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; until?: string }> }) {
  const { viewer, rights } = await corrPage();
  const sp = await searchParams;
  const d = await dashboard(viewer, { from: sp.from, until: sp.until });
  const t = d.totals;
  const tiles: [string, number, string?][] = [
    ["Letters written", t.created],
    ["Drafts", t.drafts, "/correspondence?status=draft"],
    ["Pending approval", t.pendingApproval, "/correspondence?status=pending_approval"],
    ["Awaiting signature", t.awaitingSignature, "/correspondence?status=pending_signature"],
    ["Issued", t.issued],
    ["Sent", t.dispatched],
    ["Incoming", t.incoming, "/correspondence?dir=incoming"],
    ["Answers overdue", t.overdueAnswers, "/correspondence?dir=incoming"],
    ["Delivery failures", t.deliveryFailures],
    ["Voided", t.voided, "/correspondence?status=void"],
    ["Waiting for me", t.myPending, "/correspondence/inbox"],
  ];
  const months = [...new Set(d.monthly.map((m) => m.month))].sort();
  const val = (m: string, dir: string) => d.monthly.find((x) => x.month === m && x.direction === dir)?.n ?? 0;
  const max = Math.max(1, ...months.flatMap((m) => [val(m, "outgoing"), val(m, "incoming")]));
  const Rank = ({ title, rows }: { title: string; rows: { name: string; n: number }[] }) => {
    const top = Math.max(1, ...rows.map((r) => r.n));
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.name} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="tabular text-muted-foreground">{r.n}</span>
              </div>
              <div className="mt-0.5 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full" style={{ width: `${(r.n / top) * 100}%`, background: CAT[0] }} />
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-xs text-muted-foreground">No letters in this period.</p>}
        </CardContent>
      </Card>
    );
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Correspondence dashboard" description="Letters out and in, approvals and deliveries, over the letters you may see." />
      <CorrNav active="dashboard" rights={rights} />
      <form className="flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="block font-medium">From</span>
          <input type="date" name="from" defaultValue={sp.from} className="h-8 rounded-md border bg-background px-2" />
        </label>
        <label className="space-y-1">
          <span className="block font-medium">Until</span>
          <input type="date" name="until" defaultValue={sp.until} className="h-8 rounded-md border bg-background px-2" />
        </label>
        <button className="h-8 rounded-md border px-3 hover:bg-muted">Show</button>
        <span className="text-muted-foreground">{sp.from || sp.until ? "" : "Last 12 months"}</span>
      </form>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {tiles.map(([l, n, href]) => {
          const body = (
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">{l}</p>
              <p className="text-2xl font-semibold tabular">{n.toLocaleString()}</p>
            </div>
          );
          return href ? <Link key={l} href={href} className="hover:opacity-80">{body}</Link> : <div key={l}>{body}</div>;
        })}
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">Average approval time</p>
          <p className="text-2xl font-semibold tabular">{d.approval.avgHours == null ? "-" : `${d.approval.avgHours} h`}</p>
          <p className="text-[11px] text-muted-foreground">{d.approval.completed} workflows</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Letters per month</CardTitle>
          <span className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: CAT[0] }} /> Outgoing</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: CAT[1] }} /> Incoming</span>
          </span>
        </CardHeader>
        <CardContent>
          {months.length ? (
            <div className="flex h-48 items-end gap-2 overflow-x-auto border-b pb-1" role="img" aria-label="Letters out and in per month (numbers in the table below)">
              {months.map((m) => (
                <div key={m} className="flex min-w-10 flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-0.5">
                    {(["outgoing", "incoming"] as const).map((dir, i) => (
                      <div key={dir} className="w-3 rounded-t" style={{ height: `${(val(m, dir) / max) * 100}%`, minHeight: val(m, dir) ? 2 : 0, background: CAT[i] }} title={`${m} ${dir}: ${val(m, dir)}`} />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular">{m.slice(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No letters in this period.</p>
          )}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Table</summary>
            <table className="mt-1 w-full max-w-md">
              <thead className="text-left text-muted-foreground">
                <tr><th>Month</th><th className="text-right">Out</th><th className="text-right">In</th></tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m} className="border-t"><td>{m}</td><td className="text-right tabular">{val(m, "outgoing")}</td><td className="text-right tabular">{val(m, "incoming")}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Rank title="Departments" rows={d.departments} />
        <Rank title="Templates used" rows={d.templates} />
        <Rank title="Organisations written to most" rows={d.organisations} />
      </div>
    </div>
  );
}
