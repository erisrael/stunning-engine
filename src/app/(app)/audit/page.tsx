import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { all, placeholders } from "@/server/db";
import { getSettings } from "@/server/settings";
import { userNames } from "@/server/rows";
import { fmtDateTime, tzLabel } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";

export const metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!can(viewer, "items.plan") && !can(viewer, "users.manage")) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const tz = (await getSettings()).workspace.timezone;
  const names = await userNames();
  const where: string[] = [];
  const params: string[] = [];
  if (sp.q) {
    where.push("(e.summary ILIKE ? OR i.code ILIKE ? OR e.reason ILIKE ?)");
    params.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`);
  }
  if (sp.action) {
    where.push("e.action ILIKE ?");
    params.push(`${sp.action}%`);
  }
  if (sp.actor) {
    where.push("e.actor_id = ?");
    params.push(sp.actor);
  }
  if (sp.from) {
    where.push("e.occurred_at >= ?");
    params.push(sp.from);
  }
  if (sp.to) {
    where.push("e.occurred_at <= ?");
    params.push(`${sp.to}T23:59:59Z`);
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await all<{ id: string; item_id: string | null; code: string | null; actor_id: string | null; actor_kind: string; action: string; summary: string; reason: string | null; occurred_at: string; source_occurred_at: string | null; job_id: string | null; request_id: string | null }>(
      `SELECT e.id, e.item_id, i.code, e.actor_id, e.actor_kind, e.action, e.summary, e.reason, e.occurred_at, e.source_occurred_at, e.job_id, e.request_id
     FROM audit_events e LEFT JOIN items i ON i.id = e.item_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY e.occurred_at DESC, e.seq DESC LIMIT ${PAGE + 1} OFFSET ${(page - 1) * PAGE}`,
      ...params,
    );
  const actions = await all<{ a: string; n: number }>("SELECT split_part(action, '.', 1) AS a, COUNT(*) AS n FROM audit_events GROUP BY a ORDER BY n DESC");
  const qs = (patch: Record<string, string | number>) => `/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;
  void placeholders;
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description={`Every recorded event across the workspace, append-only. ${tzLabel(tz)}. Export structured audit JSON from All content (managers only).`} />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Input name="q" defaultValue={sp.q} placeholder="Search summary, code or reason" className="h-8 w-full sm:w-64" />
        <select name="action" defaultValue={sp.action ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm" aria-label="Event type">
          <option value="">All event types</option>
          {actions.map((a) => (
            <option key={a.a} value={a.a}>
              {a.a} ({a.n})
            </option>
          ))}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm" aria-label="Actor">
          <option value="">Anyone</option>
          {Object.entries(names).map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <Input type="date" name="from" defaultValue={sp.from} className="h-8 w-40" aria-label="From" />
        <Input type="date" name="to" defaultValue={sp.to} className="h-8 w-40" aria-label="To" />
        <Button size="sm" type="submit">Apply</Button>
        <Button size="sm" variant="ghost" asChild><Link href="/audit">Reset</Link></Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Recorded</th>
              <th className="px-3 py-2 text-left font-medium">Actor</th>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">Event</th>
              <th className="px-3 py-2 text-left font-medium">Summary and reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="px-3 py-2 text-xs whitespace-nowrap tabular">
                  {fmtDateTime(e.occurred_at, tz, { seconds: true })}
                  {e.source_occurred_at && <span className="block text-muted-foreground">source {fmtDateTime(e.source_occurred_at, tz)}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{e.actor_id ? names[e.actor_id] : "System"}{e.actor_kind !== "user" && <span className="block text-muted-foreground">{e.actor_kind}</span>}</td>
                <td className="px-3 py-2">{e.item_id ? <Link href={`/items/${e.item_id}?tab=history`} className="font-mono text-xs text-primary hover:underline">{e.code}</Link> : <span className="text-xs text-muted-foreground">Workspace</span>}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{e.action}</td>
                <td className="px-3 py-2 text-sm">
                  {e.summary}
                  {e.reason && <span className="block text-xs text-muted-foreground">Reason: {e.reason}</span>}
                  {(e.job_id || e.request_id) && <span className="block font-mono text-[10px] text-muted-foreground">{e.job_id ? `job ${e.job_id}` : `request ${e.request_id}`}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        {page > 1 && <Button size="sm" variant="outline" asChild><Link href={qs({ page: page - 1 })}>Newer</Link></Button>}
        {rows.length > PAGE && <Button size="sm" variant="outline" asChild><Link href={qs({ page: page + 1 })}>Older</Link></Button>}
      </div>
    </div>
  );
}
