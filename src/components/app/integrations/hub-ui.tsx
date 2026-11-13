"use client";

// The integrations hub (Update 1.0, phase 7): overview cards, the call monitor, SMS setup, email setup and the order
// of fallback connections. Every action is checked for Admin on the server (app/actions/hub.ts).

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, CopyIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/hub";
import { cn } from "@/lib/utils";

const sel = "h-9 rounded-md border bg-background px-2 text-sm";
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async <T,>(key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, done?: string | ((d: T) => string)) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error ?? "Failed");
      return null;
    }
    if (done) toast.success(typeof done === "string" ? done : done(r.data as T));
    router.refresh();
    return (r.data ?? true) as T | true;
  };
  return { act, busy };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

type Health = "healthy" | "degraded" | "failing" | "not_set_up";
const HEALTH: Record<Health, { label: string; cls: string; Icon: typeof CheckCircle2Icon }> = {
  healthy: { label: "Healthy", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30", Icon: CheckCircle2Icon },
  degraded: { label: "Degraded", cls: "text-amber-800 dark:text-amber-200 bg-amber-500/10 border-amber-500/30", Icon: CircleAlertIcon },
  failing: { label: "Failing", cls: "text-destructive bg-destructive/10 border-destructive/30", Icon: XCircleIcon },
  not_set_up: { label: "Not set up", cls: "text-muted-foreground bg-muted border-border", Icon: CircleDashedIcon },
};

export function HealthBadge({ h }: { h: Health }) {
  const x = HEALTH[h];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", x.cls)} data-health={h}>
      <x.Icon className="size-3.5" aria-hidden /> {x.label}
    </span>
  );
}

const StepIcon = ({ s }: { s: "ok" | "warn" | "fail" }) =>
  s === "ok" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Done" /> : s === "warn" ? <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Check" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Not done" />;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type CardData = { key: string; label: string; href: string; health: Health; setup: string; keys: number; lastTest: { ok: boolean; at: string } | null; calls: number; failures: number; failurePct: number; lastIn: string | null; lastError: string | null; owner: { id: string; name: string } | null };

export function HubOverview({ cards, people }: { cards: CardData[]; people: { id: string; name: string }[] }) {
  const { act, busy } = useAct();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-hub-overview>
      {cards.map((c) => (
        <Card key={c.key} data-integration={c.key} className="gap-3">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">{c.label}</CardTitle>
              <CardDescription className="truncate">{c.setup}</CardDescription>
            </div>
            <HealthBadge h={c.health} />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Keys</dt>
              <dd className="tabular-nums">{c.keys}</dd>
              <dt className="text-muted-foreground">Last test</dt>
              <dd>{c.lastTest ? <span className={c.lastTest.ok ? "" : "text-destructive"}>{c.lastTest.ok ? "Passed" : "Failed"} {when(c.lastTest.at)}</span> : "none"}</dd>
              <dt className="text-muted-foreground">Calls (24 h)</dt>
              <dd className="tabular-nums">{c.calls}</dd>
              <dt className="text-muted-foreground">Failure rate</dt>
              <dd className={cn("tabular-nums", c.failurePct >= 10 && "text-destructive")}>{c.calls ? `${c.failurePct}% (${c.failures})` : "–"}</dd>
              <dt className="text-muted-foreground">Last callback</dt>
              <dd>{when(c.lastIn)}</dd>
            </dl>
            {c.lastError && <p className="truncate text-xs text-destructive" title={c.lastError}>Last error: {c.lastError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={cn(sel, "h-8 flex-1 text-xs")}
                aria-label={`Owner of ${c.label}`}
                value={c.owner?.id ?? ""}
                disabled={!!busy}
                onChange={(e) => act(`own-${c.key}`, () => A.setIntegrationOwnerAction(c.key, e.target.value || null), "Owner saved")}
              >
                <option value="">No owner</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {c.key !== "attendance" && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/admin/integrations?tab=monitor&source=${c.key === "payments" ? "chapa" : c.key}`}>Calls</Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={c.href}>Configure</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart: calls per bucket, the failed part stacked on top in the critical colour. Hover shows the numbers.
// ---------------------------------------------------------------------------

type Point = { at: string; calls: number; failures: number };

export function CallsChart({ series, bucketH, label = "calls" }: { series: Point[]; bucketH: number; label?: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...series.map((p) => p.calls));
  const fmt = (iso: string) => new Date(iso).toLocaleString([], bucketH >= 24 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" });
  const h = hover !== null ? series[hover] : null;
  return (
    <figure className="space-y-2" data-calls-chart>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/70" aria-hidden /> Succeeded
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" aria-hidden /> Failed
        </span>
        <span className="ml-auto tabular-nums" aria-live="polite">
          {h ? `${fmt(h.at)}: ${h.calls} ${label}, ${h.failures} failed` : `Most in one ${bucketH >= 24 ? "day" : "hour"}: ${max}`}
        </span>
      </div>
      <div className="relative h-36 border-b border-border" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border/60" aria-hidden />
        <div className="flex h-full items-end gap-[2px]">
          {series.map((p, i) => {
            const ok = p.calls - p.failures;
            return (
              <div
                key={p.at}
                className={cn("flex h-full min-w-0 flex-1 cursor-default flex-col justify-end", hover === i && "bg-muted/60")}
                onMouseEnter={() => setHover(i)}
                role="img"
                aria-label={`${fmt(p.at)}: ${p.calls} ${label}, ${p.failures} failed`}
              >
                {p.failures > 0 && <div className={cn("w-full bg-destructive", ok > 0 ? "rounded-t-[4px] mb-[2px]" : "rounded-t-[4px]")} style={{ height: `${(p.failures / max) * 100}%` }} />}
                {ok > 0 && <div className={cn("w-full bg-primary/70", p.failures ? "" : "rounded-t-[4px]")} style={{ height: `${(ok / max) * 100}%` }} />}
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{series[0] ? fmt(series[0].at) : ""}</span>
        <span>{series.at(-1) ? fmt(series.at(-1)!.at) : ""}</span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

type MonRow = { id: string; source: string; direction: string; ok: number; status: number; ms: number; summary: string; error: string | null; ref: string | null; test: number; at: string; name: string | null; tokens_in: number | null; tokens_out: number | null; cost: number | null };
type Stat = { source: string; calls: number; failures: number; failurePct: number; avgMs: number; lastAt: string | null; lastIn: string | null; lastError: string | null };
type Rules = { on: boolean; failurePct: number; minCalls: number; windowMin: number };
type Mon = { hours: number; bucketH: number; rows: MonRow[]; stats: Stat[]; series: Point[]; alerts: { id: string; source: string; calls: number; failures: number; window_min: number; at: string }[]; rules: Rules };

export function Monitor({ data, sources }: { data: Mon; sources: { key: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    n.set("tab", "monitor");
    router.replace(`${path}?${n.toString()}`);
  };
  const label = (s: string) => sources.find((x) => x.key === s)?.label ?? s;
  return (
    <div className="space-y-4" data-monitor>
      <div className="flex flex-wrap items-center gap-2" data-monitor-filters>
        <select className={sel} aria-label="Source" value={sp.get("source") ?? ""} onChange={(e) => set("source", e.target.value || null)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select className={sel} aria-label="Direction" value={sp.get("dir") ?? ""} onChange={(e) => set("dir", e.target.value || null)}>
          <option value="">Out and in</option>
          <option value="out">Calls out</option>
          <option value="in">Callbacks in</option>
        </select>
        <select className={sel} aria-label="Period" value={String(data.hours)} onChange={(e) => set("hours", e.target.value)}>
          <option value="1">Last hour</option>
          <option value="24">Last 24 hours</option>
          <option value="168">Last 7 days</option>
          <option value="720">Last 30 days</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={sp.get("failed") === "1"} onCheckedChange={(v) => set("failed", v ? "1" : null)} aria-label="Failures only" /> Failures only
        </label>
        <form className="flex flex-1 gap-2" onSubmit={(e) => (e.preventDefault(), set("q", q.trim() || null))}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, error or reference" aria-label="Search calls" className="min-w-40 flex-1" />
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Search
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calls over time</CardTitle>
          <CardDescription>Tests are left out.</CardDescription>
        </CardHeader>
        <CardContent>
          <CallsChart series={data.series} bucketH={data.bucketH} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By source</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-monitor-stats>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Source</th>
                  <th className="py-1 text-right font-medium">Calls</th>
                  <th className="py-1 text-right font-medium">Failed</th>
                  <th className="py-1 text-right font-medium">Avg time</th>
                  <th className="py-1 pl-3 font-medium">Last callback</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.map((s) => (
                  <tr key={s.source} className="border-t">
                    <td className="py-1.5">
                      <button type="button" className="hover:underline" onClick={() => set("source", s.source)}>
                        {label(s.source)}
                      </button>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{s.calls}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", s.failurePct >= 10 && "text-destructive")}>{s.failures ? `${s.failures} (${s.failurePct}%)` : "0"}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.avgMs} ms</td>
                    <td className="py-1.5 pl-3 text-xs text-muted-foreground">{when(s.lastIn)}</td>
                  </tr>
                ))}
                {!data.stats.length && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted-foreground">
                      No calls in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <AlertRulesCard rules={data.rules} alerts={data.alerts} label={label} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calls ({data.rows.length})</CardTitle>
          <CardDescription>Addresses are shown without their query and keys.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-monitor-rows>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Source</th>
                <th className="py-1 font-medium">What</th>
                <th className="py-1 text-right font-medium">Status</th>
                <th className="py-1 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t align-top" data-call-ok={r.ok ? "1" : "0"}>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs text-muted-foreground">{when(r.at)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2">
                    {label(r.source)}
                    <span className="ml-1 text-xs text-muted-foreground">{r.direction === "in" ? "in" : "out"}</span>
                    {r.test ? <span className="ml-1 rounded bg-muted px-1 text-[10px]">test</span> : null}
                  </td>
                  <td className="min-w-0 py-1.5 pr-2">
                    <p className="break-all">{r.summary}</p>
                    {r.error && <p className="break-all text-xs text-destructive">{r.error}</p>}
                    {(r.ref || r.tokens_in) && (
                      <p className="text-xs text-muted-foreground">
                        {r.ref && `Ref ${r.ref}`}
                        {r.tokens_in ? ` · ${r.tokens_in} in / ${r.tokens_out ?? 0} out tokens${r.cost ? ` · $${r.cost.toFixed(4)}` : ""}` : ""}
                      </p>
                    )}
                  </td>
                  <td className={cn("py-1.5 text-right tabular-nums", !r.ok && "text-destructive")}>
                    {r.ok ? "OK" : "Failed"} {r.status || ""}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.ms} ms</td>
                </tr>
              ))}
              {!data.rows.length && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted-foreground">
                    Nothing matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertRulesCard({ rules, alerts, label }: { rules: Rules; alerts: Mon["alerts"]; label: (s: string) => string }) {
  const { act, busy } = useAct();
  const [r, setR] = React.useState(rules);
  const num = (k: keyof Omit<Rules, "on">, l: string, suffix: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{l}</span>
      <span className="flex items-center gap-1">
        <Input type="number" className="h-8 w-20" aria-label={l} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
        <span className="w-8 text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
  return (
    <Card data-alert-rules>
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
        <CardDescription>Admins are told when a source fails too often.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between text-sm">
          Alerts on <Switch checked={r.on} onCheckedChange={(v) => setR({ ...r, on: v })} aria-label="Alerts on" />
        </label>
        {num("failurePct", "Failures at least", "%")}
        {num("minCalls", "Of at least", "calls")}
        {num("windowMin", "Within", "min")}
        <Button size="sm" className="w-full" disabled={!!busy} data-save-alerts onClick={() => act("rules", () => A.saveAlertRulesAction(r), "Alert rules saved")}>
          {busy === "rules" && <Loader2Icon className="animate-spin" />} Save
        </Button>
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">Recent alerts</p>
          {alerts.length ? (
            alerts.slice(0, 6).map((a) => (
              <p key={a.id} className="text-xs" data-alert>
                <span className="font-medium text-destructive">{label(a.source)}</span>: {a.failures} of {a.calls} failed · {when(a.at)}
              </p>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">None.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fallback order
// ---------------------------------------------------------------------------

type Conn = { id: string; name: string; lastTest: { ok: boolean; at: string } | null };

export function ConnectorOrder({ capability, title, list }: { capability: string; title: string; list: Conn[] }) {
  const { act, busy } = useAct();
  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void act(`order-${capability}`, () => A.setConnectorOrderAction(capability, ids), "Order saved");
  };
  return (
    <Card data-connector-order={capability}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>The first is used; if it fails, the next one is tried.</CardDescription>
      </CardHeader>
      <CardContent>
        {list.length ? (
          <ol className="divide-y rounded-lg border">
            {list.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-order-item={c.name}>
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 font-medium">
                  {c.name}
                  {i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">primary</span>}
                </span>
                <span className="text-xs text-muted-foreground">{c.lastTest ? `${c.lastTest.ok ? "Test passed" : "Test failed"} ${when(c.lastTest.at)}` : "Not tested"}</span>
                <Button size="icon" variant="ghost" className="size-7" disabled={!!busy || i === 0} aria-label={`Move ${c.name} up`} onClick={() => move(i, -1)}>
                  <ArrowUpIcon />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" disabled={!!busy || i === list.length - 1} aria-label={`Move ${c.name} down`} onClick={() => move(i, 1)}>
                  <ArrowDownIcon />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">None connected. Add one below under Integrate a platform.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

type Purpose = "otp" | "alerts" | "marketing";
type SmsTemplate = { key: string; name: string; purpose: Purpose; text: string };
type SmsData = {
  counts: Record<string, number>;
  recent: { id: string; to_phone: string; purpose: string; sender: string | null; preview: string | null; status: string; error: string | null; attempts: number; created_at: string; delivered_at: string | null; provider: string | null }[];
  providers: { id: string; name: string; preset: string | null; lastTest: { ok: boolean; at: string } | null }[];
  config: { routes: Record<Purpose, { connectors: string[]; sender: string }>; retries: number; templates: SmsTemplate[]; balance: Record<string, { path: string; valuePath: string }> };
  lastReport: string | null;
};

const PURPOSES: { key: Purpose; label: string }[] = [
  { key: "otp", label: "Sign-in codes (OTP)" },
  { key: "alerts", label: "Alerts and reminders" },
  { key: "marketing", label: "Marketing" },
];

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button size="icon" variant="outline" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("Copied"), () => toast.error("Copy it by hand"))}>
        <CopyIcon />
      </Button>
    </div>
  );
}

export function SmsSetup({ data, dlrUrl }: { data: SmsData; dlrUrl: string }) {
  const { act, busy } = useAct();
  const [routes, setRoutes] = React.useState(data.config.routes);
  const [retries, setRetries] = React.useState(data.config.retries);
  const [templates, setTemplates] = React.useState<SmsTemplate[]>(data.config.templates);
  const [balances, setBalances] = React.useState<Record<string, string>>({});
  const [test, setTest] = React.useState<{ to: string; purpose: Purpose; template: string }>({ to: "", purpose: "alerts", template: "" });
  const save = () => act("sms", () => A.saveSmsConfigAction({ routes, retries, templates }), "SMS setup saved");
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4" data-sms-setup>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["sent", "delivered", "failed", "queued"] as const).map((k) => (
          <Card key={k} className="gap-1 py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground capitalize">{k} (7 days)</p>
              <p className={cn("text-2xl font-semibold tabular-nums", k === "failed" && (data.counts[k] ?? 0) > 0 && "text-destructive")} data-sms-count={k}>
                {data.counts[k] ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConnectorOrder capability="sms" title="SMS providers, in order" list={data.providers} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routing by purpose</CardTitle>
          <CardDescription>Choose which providers send each kind of message and the sender ID they use. None chosen: all providers, in the order above.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PURPOSES.map((p) => (
            <div key={p.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[12rem_1fr_10rem]" data-sms-route={p.key}>
              <p className="text-sm font-medium">{p.label}</p>
              <div className="flex flex-wrap gap-3">
                {data.providers.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={routes[p.key].connectors.includes(c.id)}
                      onChange={(e) =>
                        setRoutes({ ...routes, [p.key]: { ...routes[p.key], connectors: e.target.checked ? [...routes[p.key].connectors, c.id] : routes[p.key].connectors.filter((x) => x !== c.id) } })
                      }
                    />
                    {c.name}
                  </label>
                ))}
                {!data.providers.length && <span className="text-sm text-muted-foreground">No provider yet.</span>}
              </div>
              <Input placeholder="Sender ID" aria-label={`Sender ID for ${p.label}`} value={routes[p.key].sender} maxLength={20} onChange={(e) => setRoutes({ ...routes, [p.key]: { ...routes[p.key], sender: e.target.value } })} />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            Retries per provider before the next one
            <select className={sel} aria-label="Retries" value={retries} onChange={(e) => setRetries(Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>
            Use {"{{name}}"}, {"{{code}}"} or any other name; the sender fills it in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((t, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_12rem_1fr_auto]" data-sms-template={t.key || i}>
              <Input placeholder="key" aria-label="Template key" value={t.key} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              <select className={sel} aria-label="Template purpose" value={t.purpose} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, purpose: e.target.value as Purpose } : x)))}>
                {PURPOSES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Textarea rows={2} aria-label="Template text" value={t.text} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, text: e.target.value, name: x.name || x.key } : x)))} />
              <Button size="sm" variant="ghost" onClick={() => setTemplates(templates.filter((_, j) => j !== i))}>
                Remove
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-4">{t.text.length} characters · {Math.max(1, Math.ceil(t.text.length / 160))} SMS</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setTemplates([...templates, { key: "", name: "", purpose: "alerts", text: "" }])}>
              Add template
            </Button>
            <Button size="sm" disabled={!!busy} onClick={save} data-save-sms>
              {busy === "sms" && <Loader2Icon className="animate-spin" />} Save SMS setup
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery reports</CardTitle>
            <CardDescription>Give this address to the provider as its delivery report (DLR) callback. Last report: {when(data.lastReport)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CopyField label="Delivery report address" value={dlrUrl} />
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => confirm("Make a new address? The old one stops working.") && act("dlr", () => A.saveSmsConfigAction({ newToken: true }), "New address made")}>
              Make a new address
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance and test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.providers.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.name}</span>
                {balances[c.id] && <span className="tabular-nums" data-sms-balance>{balances[c.id]}</span>}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={async () => {
                    const r = await act<{ balance: string }>(`bal-${c.id}`, () => A.smsBalanceAction(c.id));
                    if (r && r !== true) setBalances((b) => ({ ...b, [c.id]: r.balance }));
                  }}
                >
                  Check balance
                </Button>
              </div>
            ))}
            <form
              className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_9rem]"
              onSubmit={(e) => {
                e.preventDefault();
                void act<{ provider: string; attempts: number; fallback: boolean }>("test-sms", () => A.testSmsAction({ to: test.to, purpose: test.purpose, template: test.template || null }), (d) => `Sent through ${d.provider}${d.fallback ? " (fallback)" : ""}`);
              }}
            >
              <Input placeholder="Phone, as 0911…" aria-label="Test phone" value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} />
              <select className={sel} aria-label="Test purpose" value={test.purpose} onChange={(e) => setTest({ ...test, purpose: e.target.value as Purpose })}>
                {PURPOSES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select className={sel} aria-label="Test template" value={test.template} onChange={(e) => setTest({ ...test, template: e.target.value })}>
                <option value="">Plain test text</option>
                {data.config.templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" className="h-9" disabled={!!busy || !test.to.trim()}>
                Send test
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages ({total} in 7 days)</CardTitle>
          <CardDescription>Sign-in codes are never kept.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-sms-messages>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">To</th>
                <th className="py-1 font-medium">Purpose</th>
                <th className="py-1 font-medium">Message</th>
                <th className="py-1 font-medium">Provider</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((m) => (
                <tr key={m.id} className="border-t align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs text-muted-foreground">{when(m.created_at)}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{m.to_phone}</td>
                  <td className="py-1.5 pr-2 text-xs">{m.purpose}</td>
                  <td className="py-1.5 pr-2 text-xs">{m.preview ?? "–"}</td>
                  <td className="py-1.5 pr-2 text-xs">
                    {m.provider ?? "–"}
                    {m.attempts > 1 ? ` (${m.attempts} tries)` : ""}
                  </td>
                  <td className={cn("py-1.5 text-xs", m.status === "failed" && "text-destructive", m.status === "delivered" && "text-emerald-700 dark:text-emerald-300")} title={m.error ?? undefined}>
                    {m.status}
                    {m.delivered_at ? ` ${when(m.delivered_at)}` : ""}
                  </td>
                </tr>
              ))}
              {!data.recent.length && (
                <tr>
                  <td colSpan={6} className="py-3 text-muted-foreground">
                    No messages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

type Step = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; href?: string };

export function EmailSetup({ steps, eventsUrl, domain, bounces }: { steps: Step[]; eventsUrl: string; domain: string | null; bounces: { id: string; address: string; kind: string; reason: string | null; provider: string | null; at: string }[] }) {
  const { act, busy } = useAct();
  const [d, setD] = React.useState(domain ?? "");
  const [dns, setDns] = React.useState<{ domain: string; steps: { label: string; status: "ok" | "warn" | "fail"; detail: string }[] } | null>(null);
  const [to, setTo] = React.useState("");
  return (
    <div className="space-y-4" data-email-setup>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set up email, step by step</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.key} className="flex gap-2 rounded-lg border p-3 text-sm" data-email-step={s.key} data-status={s.status}>
                <StepIcon s={s.status} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
                {s.href && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={s.href}>Open</Link>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domain check</CardTitle>
            <CardDescription>SPF, DKIM and DMARC decide whether mail lands in the inbox.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await act<NonNullable<typeof dns>>("dns", () => A.checkEmailDnsAction(d));
                if (r && r !== true) setDns(r);
              }}
            >
              <Input value={d} onChange={(e) => setD(e.target.value)} placeholder="myseed.com.et" aria-label="Domain" />
              <Button type="submit" size="sm" className="h-9" disabled={!!busy || !d.trim()}>
                {busy === "dns" && <Loader2Icon className="animate-spin" />} Check
              </Button>
            </form>
            {dns && (
              <ul className="space-y-2" data-dns-result>
                {dns.steps.map((s) => (
                  <li key={s.label} className="flex gap-2 text-sm" data-dns={s.label} data-status={s.status}>
                    <StepIcon s={s.status} />
                    <div className="min-w-0">
                      <p className="font-medium">{s.label}</p>
                      <p className="break-all text-xs text-muted-foreground">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test send and bounce reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), void act("test-email", () => A.testEmailAction(to), `Test email sent to ${to}`))}>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-label="Send a test to" />
              <Button type="submit" size="sm" className="h-9" disabled={!!busy || !to.includes("@")}>
                {busy === "test-email" && <Loader2Icon className="animate-spin" />} Send test
              </Button>
            </form>
            <div className="space-y-1 border-t pt-3">
              <p className="text-sm">Add this address as a webhook in Resend or Brevo, for bounced and complained events:</p>
              <CopyField label="Bounce report address" value={eventsUrl} />
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => confirm("Make a new address? The old one stops working.") && act("ev", () => A.newEmailEventsTokenAction(), "New address made")}>
                Make a new address
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bounces and complaints (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-bounces>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Address</th>
                <th className="py-1 font-medium">Kind</th>
                <th className="py-1 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {bounces.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs text-muted-foreground">{when(b.at)}</td>
                  <td className="py-1.5 pr-2">{b.address}</td>
                  <td className={cn("py-1.5 pr-2", b.kind !== "soft" && "text-destructive")}>{b.kind}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{b.reason ?? "–"}</td>
                </tr>
              ))}
              {!bounces.length && (
                <tr>
                  <td colSpan={4} className="py-3 text-muted-foreground">
                    No bounces.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
