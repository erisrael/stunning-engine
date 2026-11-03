// Admin, Usage (Phase 18): which parts of the app are used, by whom (counts only), and who has not signed in for a
// while, to plan training. Nothing about what is on the pages is kept.
import type { UsageReport } from "@/server/announcements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const NAMES: Record<string, string> = { "/": "Start", "/dashboard": "Home", "/attendance": "Attendance", "/email": "Email", "/chat": "Chat", "/dev": "Dev team", "/studio": "Studio", "/marketing": "Marketing", "/hr": "HR", "/finance": "Finance", "/admin": "Admin", "/overview": "Overview", "/routines": "Routines", "/announcements": "Announcements" };

function Bars({ rows, label }: { rows: { key: string; visits: number; people: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[10rem_1fr_6rem] items-center gap-2 text-sm">
          <span className="truncate">{label(r.key)}</span>
          <span className="h-2.5 rounded-full bg-[#1A73E8]/70" style={{ width: `${Math.max(2, (r.visits / max) * 100)}%` }} />
          <span className="text-right text-xs text-muted-foreground tabular-nums">
            {r.visits} · {r.people} people
          </span>
        </li>
      ))}
    </ul>
  );
}

export function UsageAdmin({ report, roleLabel }: { report: UsageReport; roleLabel: Record<string, string> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-usage-admin>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most used, last {report.days} days</CardTitle>
          <CardDescription>Page visits by section, and how many people opened it.</CardDescription>
        </CardHeader>
        <CardContent>{report.sections.length ? <Bars rows={report.sections} label={(k) => NAMES[k] ?? k} /> : <p className="text-sm text-muted-foreground">No visits recorded yet.</p>}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By role</CardTitle>
        </CardHeader>
        <CardContent>
          <Bars rows={report.roles} label={(k) => roleLabel[k] ?? k} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People using the app each day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-28 items-end gap-0.5">
            {report.daily.map((d) => (
              <div key={d.key} title={`${d.key}: ${d.people} people, ${d.visits} visits`} className="flex-1 rounded-t bg-[#188038]/70" style={{ height: `${Math.max(4, (d.people / Math.max(1, ...report.daily.map((x) => x.people))) * 100)}%` }} />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card data-slow-pages>
        <CardHeader>
          <CardTitle className="text-base">Slowest pages</CardTitle>
          <CardDescription>How long each section takes to open, on average, and how often it takes more than 2 seconds (as people use it).</CardDescription>
        </CardHeader>
        <CardContent>
          {report.timings.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Section</th>
                  <th>Average</th>
                  <th>Over 2 s</th>
                  <th>Slowest</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {report.timings.map((t) => (
                  <tr key={t.section} className="border-t">
                    <td className="py-1">{t.section}</td>
                    <td className={t.avgMs > 2000 ? "text-[#D93025]" : t.avgMs > 1000 ? "text-[#B06000]" : ""}>{(t.avgMs / 1000).toFixed(1)} s</td>
                    <td>{t.slowPct}%</td>
                    <td>{(t.maxMs / 1000).toFixed(1)} s</td>
                    <td>{t.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No timings yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not signed in for 14 days or more</CardTitle>
          <CardDescription>Worth a word or some training.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.quiet.length ? (
            <ul className="space-y-0.5 text-sm">
              {report.quiet.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.last_login_at ? new Date(p.last_login_at).toLocaleDateString() : "never"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Everyone signed in recently.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
