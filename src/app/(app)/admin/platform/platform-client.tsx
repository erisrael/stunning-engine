"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlertIcon, CopyIcon, DownloadIcon, Loader2Icon, PlayIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import { MetricCard } from "@/components/app/primitives";
import { runQueryAction } from "@/app/actions/platform";
import type * as P from "@/server/platform";
import { cn } from "@/lib/utils";

type State = "ok" | "warn" | "bad";
const STATE = { ok: { icon: CheckCircle2Icon, c: "text-[#1E8E3E]", label: "Working" }, warn: { icon: TriangleAlertIcon, c: "text-[#B06000]", label: "Needs a look" }, bad: { icon: CircleAlertIcon, c: "text-[#D93025]", label: "Not working" } } as const;
const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
const dur = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

function Checks({ checks }: { checks: { key: string; label: string; state: State; text: string }[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card text-sm">
      {checks.map((c) => {
        const S = STATE[c.state];
        return (
          <li key={c.key} className="flex items-start gap-2 px-3 py-2" data-check={c.key} data-state={c.state}>
            <S.icon className={cn("mt-0.5 size-4 shrink-0", S.c)} />
            <span className="w-44 shrink-0 font-medium">{c.label}</span>
            <span className="text-muted-foreground">{c.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export function DatabaseView({ info }: { info: Awaited<ReturnType<typeof P.databaseInfo>> }) {
  const [sql, setSql] = React.useState("SELECT role, COUNT(*) AS people FROM role_assignments GROUP BY role ORDER BY people DESC");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<Awaited<ReturnType<typeof P.runQuery>> | null>(null);
  const [filter, setFilter] = React.useState("");
  const runIt = async () => {
    setBusy(true);
    const r = await runQueryAction(sql);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setRes(r.data!);
  };
  return (
    <div className="space-y-4" data-database>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Database" value={<span className="text-base">{info.kind}</span>} hint={info.version} />
        <MetricCard label="Size" value={bytes(info.size)} hint={`${info.tables.length} tables`} />
        <MetricCard label="Rows" value={info.rows.toLocaleString()} />
        <MetricCard label="Answers in" value={`${info.ping} ms`} tone={info.ping > 200 ? "warning" : "default"} hint={`${info.connections} connections`} />
        <MetricCard label="Schema" value={`v${info.schemaVersion}`} tone={info.schemaVersion === info.expectedSchema ? "success" : "warning"} hint={info.schemaVersion === info.expectedSchema ? "Up to date" : `The app expects v${info.expectedSchema}`} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Read-only query</CardTitle>
          <CardDescription>SELECT, WITH, EXPLAIN or SHOW, one at a time, stopped after 5 seconds, up to 500 rows. Passwords, keys, tokens and file contents are hidden. Every query is in the audit log. Changes go through the pages or the Data manager.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea aria-label="SQL" className="min-h-24 w-full rounded-md border bg-background p-2 font-mono text-xs" value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && void runIt()} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={runIt} disabled={busy} data-run-query>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />} Run (Ctrl+Enter)
            </Button>
            {res && (
              <span className="text-xs text-muted-foreground">
                {res.rows.length}
                {res.more ? "+" : ""} rows in {res.ms} ms{res.hidden.length ? ` · hidden: ${res.hidden.join(", ")}` : ""}
              </span>
            )}
          </div>
          {res && (
            <div className="max-h-96 overflow-auto rounded border" data-query-result>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {res.columns.map((c) => (
                      <th key={c} className="px-2 py-1 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {r.map((v, j) => (
                        <td key={j} className="px-2 py-0.5 font-mono whitespace-nowrap">
                          {v ?? <span className="text-muted-foreground">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tables</CardTitle>
          <CardDescription>Largest first. Tables marked "backup" are in the workspace backups; the rest are short-lived (sessions, logs, caches).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <input aria-label="Filter tables" placeholder="Filter" className="h-8 w-56 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Table</th>
                  <th>Rows</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {info.tables
                  .filter((t) => t.name.includes(filter.toLowerCase()))
                  .map((t) => (
                    <tr key={t.name} className="border-t" data-table={t.name}>
                      <td className="py-1 font-mono text-xs">
                        <button type="button" className="hover:underline" onClick={() => setSql(`SELECT * FROM ${t.name} LIMIT 50`)}>
                          {t.name}
                        </button>
                      </td>
                      <td className="tabular-nums">{t.rows.toLocaleString()}</td>
                      <td className="tabular-nums">{t.bytes ? bytes(t.bytes) : "–"}</td>
                      <td>{t.backedUp && <span className="rounded bg-[#1E8E3E]/10 px-1.5 text-[11px] text-[#1E8E3E]">backup</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ApiUsageView({ data }: { data: Awaited<ReturnType<typeof P.apiUsage>> }) {
  return (
    <div className="space-y-4" data-api-usage>
      <div className="flex flex-wrap gap-1 text-xs">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/platform?tab=api&days=${d}`} className={cn("rounded-full border px-2.5 py-0.5", data.days === d && "border-primary bg-primary text-primary-foreground")}>
            {d} days
          </Link>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Calls to the app's APIs" value={data.total.toLocaleString()} />
        <MetricCard label="Errors" value={`${data.errorPct}%`} tone={data.errorPct > 5 ? "warning" : "default"} hint={`${data.errors} calls`} />
        <MetricCard label="Calls to connected platforms" value={data.outbound.reduce((s, o) => s + o.calls, 0)} hint={`${data.outbound.reduce((s, o) => s + o.failed, 0)} failed`} />
        <MetricCard label="AI questions" value={data.ai.total} />
      </div>
      <ChartFrame title="Calls per day" table={{ columns: ["Day", "Calls", "Errors"], rows: data.daily.map((d) => [d.day, d.calls, d.errors]) }}>
        <BarsChart data={data.daily.map((d) => ({ day: d.day.slice(5), calls: d.calls - d.errors, errors: d.errors }))} xKey="day" stacked series={[{ key: "calls", label: "Answered", color: "#1A73E8" }, { key: "errors", label: "Errors", color: "#D93025" }]} />
      </ChartFrame>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By API</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-api-routes>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">API</th>
                  <th>Calls</th>
                  <th>Errors</th>
                  <th>Average</th>
                  <th>Slowest</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r) => (
                  <tr key={r.route} className="border-t" data-route={r.route}>
                    <td className="py-1 font-mono text-xs">{r.route}</td>
                    <td>{r.calls}</td>
                    <td className={r.errors ? "text-[#D93025]" : ""}>{r.errors}</td>
                    <td>{r.avgMs} ms</td>
                    <td>{r.max} ms</td>
                  </tr>
                ))}
                {!data.routes.length && (
                  <tr>
                    <td colSpan={5} className="py-2 text-muted-foreground">
                      No calls yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Keys and connected platforms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.keys.map((k) => (
              <div key={k.prefix} className="flex justify-between gap-2">
                <span>
                  {k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span>
                  {k.revoked && <span className="ml-1 text-xs text-[#D93025]">revoked</span>}
                </span>
                <span className="text-xs text-muted-foreground">last used {ago(k.lastUsedAt)}</span>
              </div>
            ))}
            {data.outbound.map((o) => (
              <div key={o.name} className="flex justify-between gap-2">
                <span>
                  {o.name} <span className="text-xs text-muted-foreground">{o.capability}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {o.calls} calls, {o.failed} failed, {o.avgMs} ms
                </span>
              </div>
            ))}
            {!data.keys.length && !data.outbound.length && <p className="text-muted-foreground">No keys or connected platforms yet (Admin, Integrations).</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function StatusView({ data }: { data: Awaited<ReturnType<typeof P.statusInfo>> }) {
  const S = STATE[data.overall as State];
  return (
    <div className="space-y-4" data-status-view>
      <Card className={cn("border-l-8", data.overall === "ok" ? "border-l-[#1E8E3E]" : data.overall === "warn" ? "border-l-[#F9AB00]" : "border-l-[#D93025]")}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-4">
          <S.icon className={cn("size-8", S.c)} />
          <div>
            <p className="text-lg font-semibold" data-overall={data.overall}>{data.overall === "ok" ? "Everything is working" : data.overall === "warn" ? "Working, some parts need a look" : "Something is not working"}</p>
            <p className="text-sm text-muted-foreground">
              Version {data.build.version} · build {data.build.build.slice(0, 12)}
              {data.build.commit ? ` · commit ${data.build.commit.slice(0, 8)}` : ""} · {data.build.host} · Next.js {data.build.next} · Node {data.build.node} · {data.build.env}
            </p>
            <p className="text-sm text-muted-foreground">
              Running since {ago(data.startedAt)} ({dur(data.uptimeSec)})
            </p>
          </div>
        </CardContent>
      </Card>
      <Checks checks={data.parts as { key: string; label: string; state: State; text: string }[]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deploys</CardTitle>
            <CardDescription>Noted each time a new build starts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm" data-deploys>
              {data.deploys.map((d, i) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2" data-deploy={d.build}>
                  <span className={cn("size-2.5 rounded-full", i === 0 ? "bg-[#1E8E3E]" : "bg-muted-foreground/40")} />
                  <span className="font-medium">v{d.version}</span>
                  <span className="font-mono text-xs">{d.commit ? d.commit.slice(0, 8) : d.build.slice(0, 10)}</span>
                  <span className="text-xs text-muted-foreground">
                    {ago(d.at)} · {d.host} · Node {d.node}
                  </span>
                  {i === 0 && <span className="rounded bg-[#1E8E3E]/10 px-1.5 text-[11px] text-[#1E8E3E]">running</span>}
                  {d.message && <span className="w-full pl-4 text-xs text-muted-foreground">{d.message}</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Incidents (errors, last 14 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.incidents.length ? (
              data.incidents.map((x) => (
                <div key={x.day} className="flex justify-between">
                  <span>{x.day}</span>
                  <span className="text-muted-foreground">
                    {x.kinds} kinds, {x.times} times
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">None.</p>
            )}
            <Link href="/admin?tab=system" className="text-xs text-primary underline">
              Errors, jobs and backups in Admin, System
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DeveloperView({ data }: { data: Awaited<ReturnType<typeof P.developerInfo>> }) {
  const copy = (t: string) => void navigator.clipboard?.writeText(t).then(() => toast.success("Copied"));
  const groups = [...new Set(data.endpoints.map((e) => e.group))];
  const feed = data.endpoints.find((e) => e.path.startsWith("/api/feeds/"));
  const examples = [
    { title: "Read a data feed (Power BI, Excel, scripts)", code: `curl -H "Authorization: Bearer msk_YOUR_KEY" \\\n  "${data.origin}${feed?.path ?? "/api/feeds/dept_tasks"}?format=csv"` },
    { title: "Customer support from another app (server side)", code: `curl -X POST "${data.origin}/api/support/v1/identify" \\\n  -H "X-App-Key: ${data.apps[0]?.key ?? "APP_PUBLIC_KEY"}" -H "Content-Type: application/json" \\\n  -d '{"id":"user-42","name":"Abebe","email":"abebe@example.com"}'` },
    { title: "The support widget on a website", code: `<script src="${data.origin}/support-sdk.js" data-app-key="${data.apps[0]?.key ?? "APP_PUBLIC_KEY"}" async></script>` },
    { title: "Uptime monitors", code: `curl "${data.origin}/api/health"   # 200 up, 503 down` },
  ];
  return (
    <div className="space-y-4" data-developer>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">The app's APIs</CardTitle>
          <CardDescription>
            Base address <span className="font-mono">{data.origin}</span>. The OpenAPI file opens in Postman, Insomnia, Swagger UI, or a code generator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="/api/openapi.json" target="_blank" rel="noreferrer" data-openapi>
                <DownloadIcon /> OpenAPI file
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(`${data.origin}/api/openapi.json`)}>
              <CopyIcon /> Copy its address
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin?tab=integrations">Keys and integrations</Link>
            </Button>
          </div>
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs font-medium text-muted-foreground">{g}</p>
              <ul className="text-sm">
                {data.endpoints
                  .filter((e) => e.group === g)
                  .map((e) => (
                    <li key={`${e.method} ${e.path}`} className="flex gap-2 py-0.5" data-endpoint={e.path}>
                      <span className={cn("w-12 shrink-0 rounded px-1 text-center font-mono text-[11px]", e.method === "GET" ? "bg-[#1A73E8]/10 text-[#1A73E8]" : "bg-[#1E8E3E]/10 text-[#1E8E3E]")}>{e.method}</span>
                      <span className="font-mono text-xs">{e.path}</span>
                      <span className="text-xs text-muted-foreground">{e.summary}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {examples.map((x) => (
          <Card key={x.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{x.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">{x.code}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 size-7" aria-label="Copy" onClick={() => copy(x.code)}>
                  <CopyIcon />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Data feed keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.keys.map((k) => (
              <div key={k.prefix} className="flex justify-between gap-2">
                <span>
                  {k.name} <span className="font-mono text-xs">{k.prefix}…</span> {k.revoked && <span className="text-xs text-[#D93025]">revoked</span>}
                </span>
                <span className="text-xs text-muted-foreground">{k.datasets.length} datasets · {ago(k.lastUsedAt)}</span>
              </div>
            ))}
            {!data.keys.length && <p className="text-muted-foreground">No keys yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apps using customer support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.apps.map((a) => (
              <div key={a.key} className="flex justify-between gap-2">
                <span>{a.name}</span>
                <button type="button" className="font-mono text-xs text-muted-foreground hover:underline" onClick={() => copy(a.key)}>
                  {a.key.slice(0, 14)}… {a.active ? "" : "(off)"}
                </button>
              </div>
            ))}
            {!data.apps.length && (
              <p className="text-muted-foreground">
                None yet (<Link className="underline" href="/support/setup">Support setup</Link>).
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function HealthView({ data }: { data: Awaited<ReturnType<typeof P.systemHealth>> }) {
  const router = useRouter();
  const m = data.metrics;
  const color = data.state === "ok" ? "#1E8E3E" : data.state === "warn" ? "#F9AB00" : "#D93025";
  return (
    <div className="space-y-4" data-health>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 pt-4">
          <div className="relative size-28" aria-label={`Health ${data.score} out of 100`} data-score={data.score}>
            <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${data.score} 100`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums">{data.score}</span>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">{data.state === "ok" ? "Healthy" : data.state === "warn" ? "Some things need a look" : "Needs attention now"}</p>
            <p className="text-sm text-muted-foreground">Checked {new Date(data.at).toLocaleTimeString()} · up {dur(m.uptimeSec)}</p>
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>
              <RefreshCwIcon /> Check again
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Database" value={`${m.dbP50} ms`} hint={`slowest ${m.dbMax} ms`} tone={m.dbP50 > 50 ? "warning" : "default"} />
        <MetricCard label="App memory" value={`${m.rssMb} MB`} hint={`heap ${m.heapMb} of ${m.heapTotalMb} MB · ${m.freeMemMb} MB free`} />
        <MetricCard label="Disk free" value={m.disk ? `${(m.disk.free / 1e9).toFixed(1)} GB` : "–"} hint={m.disk ? `of ${(m.disk.total / 1e9).toFixed(0)} GB` : undefined} tone={m.disk && m.disk.free < 5e9 ? "warning" : "default"} />
        <MetricCard label="Load" value={m.load[0]} hint={`${m.cpus} cores · ${m.load.join(" / ")}`} />
        <MetricCard label="Errors in a day" value={m.errors24h} tone={m.errors24h ? "warning" : "success"} />
        <MetricCard label="Email" value={m.outboxQueued} hint={`waiting · ${m.emailsFailed} failed`} tone={m.emailsFailed ? "warning" : "default"} />
        <MetricCard label="API calls in a day" value={m.apiCalls} hint={`${m.apiErrors} errors · ${m.apiAvgMs} ms`} />
        <MetricCard label="Jobs" value={m.jobsFailing.length ? `${m.jobsFailing.length} failing` : m.jobsLate ? "Late" : "All good"} tone={m.jobsFailing.length || m.jobsLate ? "danger" : "success"} hint={m.jobsFailing.join(", ")} />
      </div>
      <Checks checks={data.checks as { key: string; label: string; state: State; text: string }[]} />
      {data.slow.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Slowest pages this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.slow.map((s) => (
              <div key={s.section} className="flex items-center gap-2">
                <span className="w-40">{s.section}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-2 rounded" style={{ width: `${Math.min(100, s.avgMs / 40)}%`, background: s.avgMs > 2000 ? "#D93025" : s.avgMs > 1000 ? "#F9AB00" : "#1E8E3E" }} />
                </div>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {(s.avgMs / 1000).toFixed(1)} s · {s.samples}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
