"use client";

// The live admin dashboard (Update 1.1 phase 16): the desk's numbers, the staff roster and traffic per system,
// updated by the server's stream (/api/admin/live) as they change. Every number comes from the database.
import * as React from "react";
import Link from "next/link";
import { CircleIcon, CoffeeIcon, HeadphonesIcon, MoonIcon, PhoneCallIcon, RadioIcon, SearchIcon, ZapIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import type { liveDashboard, LiveStatus } from "@/server/live-dashboard";

export type LiveData = Awaited<ReturnType<typeof liveDashboard>>;

const STATUS: Record<LiveStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  on_call: { label: "On call", icon: <PhoneCallIcon className="size-3" />, cls: "bg-[var(--st-active-bg)] text-[var(--st-active-fg)]" },
  busy: { label: "Busy", icon: <ZapIcon className="size-3" />, cls: "bg-[var(--st-paused-bg)] text-[var(--st-paused-fg)]" },
  online: { label: "Online", icon: <CircleIcon className="size-2.5 fill-current" />, cls: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" },
  away: { label: "Away", icon: <CoffeeIcon className="size-3" />, cls: "bg-[var(--st-queued-bg)] text-[var(--st-queued-fg)]" },
  offline: { label: "Offline", icon: <MoonIcon className="size-3" />, cls: "bg-muted text-muted-foreground" },
};
const ORDER: LiveStatus[] = ["on_call", "busy", "online", "away", "offline"];

const dur = (min: number | null) => (min === null ? "" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`);
const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

export function StatusPill({ s }: { s: LiveStatus }) {
  const x = STATUS[s];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", x.cls)} data-live-status={s}>
      {x.icon}
      {x.label}
    </span>
  );
}

// The stream, with the page's first numbers until it connects; "live", "reconnecting" or the error.
function useLive(initial: LiveData) {
  const [data, setData] = React.useState(initial);
  const [state, setState] = React.useState<"connecting" | "live" | "reconnecting" | "failed">("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [at, setAt] = React.useState(() => Date.now());
  React.useEffect(() => {
    const es = new EventSource("/api/admin/live");
    es.onopen = () => setState("live");
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data) as LiveData);
        setAt(Date.now());
        setState("live");
        setError(null);
      } catch {
        /* a partial message: the next one replaces it */
      }
    };
    es.addEventListener("failed", (e) => {
      setState("failed");
      try {
        setError((JSON.parse((e as MessageEvent).data) as { error?: string }).error ?? "The live view stopped.");
      } catch {
        setError("The live view stopped.");
      }
    });
    es.onerror = () => setState((s) => (s === "failed" ? s : "reconnecting"));
    return () => es.close();
  }, []);
  return { data, state, error, at };
}

function useNow(ms = 5000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function LiveOps({ initial }: { initial: LiveData }) {
  const { data, state, error, at } = useLive(initial);
  const now = useNow();
  const [filter, setFilter] = React.useState<LiveStatus | "all" | "working">("working");
  const [q, setQ] = React.useState("");
  const { roster, metrics: m } = data;
  const rows = roster.rows.filter((r) => (filter === "all" ? true : filter === "working" ? r.status !== "offline" : r.status === filter) && (!q.trim() || `${r.name} ${r.title ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const maxTraffic = Math.max(1, ...m.traffic.map((t) => t.created + t.messages));
  const sms = m.sms;
  return (
    <section className="space-y-3" data-live-ops={state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          <RadioIcon className="size-4" aria-hidden /> Live operations
        </h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <span className={cn("size-2 rounded-full", state === "live" ? "bg-[var(--success)]" : state === "failed" ? "bg-destructive" : "bg-[var(--warning)]")} aria-hidden />
          {state === "live" ? `Live · updated ${ago(new Date(at).toISOString(), now)}` : state === "failed" ? (error ?? "Stopped") : state === "connecting" ? "Connecting…" : "Reconnecting…"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-live-metrics>
        <MetricCard label="Open tickets" value={m.tickets.open} href="/support?view=all" hint={`${m.tickets.waiting} waiting for an agent${m.tickets.oldestWaitMin !== null ? `, oldest ${dur(m.tickets.oldestWaitMin)}` : ""}`} tone={m.tickets.waiting > 0 && (m.tickets.oldestWaitMin ?? 0) > 30 ? "warning" : "default"} />
        <MetricCard label="Active chats" value={m.chats.active} hint="Customer wrote in the last 15 min" />
        <MetricCard label="Calls now" value={m.calls.now} href="/support?tab=calls" hint={`${m.calls.ringing} ringing · ${m.calls.today} today · ${m.calls.missedToday} missed`} tone={m.calls.ringing > 0 ? "warning" : "default"} />
        <MetricCard label="First response today" value={m.firstResponseMin === null ? "–" : dur(m.firstResponseMin)} hint={`${m.tickets.awaitingFirst} still waiting for a first reply`} />
        <MetricCard label="Tickets today" value={`${m.tickets.solvedToday} / ${m.tickets.createdToday}`} hint="Solved / new" />
        <MetricCard
          label="SMS, last 24 h"
          value={sms.rate === null ? (sms.total ? `${sms.total} queued` : "None sent") : `${sms.rate}% sent`}
          href="/admin/integrations?tab=monitor"
          hint={sms.total ? `${sms.delivered} delivered · ${sms.sent} sent · ${sms.failed} failed${sms.queued ? ` · ${sms.queued} queued` : ""}` : "No messages in the last day"}
          tone={sms.rate !== null && sms.rate < 90 ? "danger" : sms.failed > 0 ? "warning" : "default"}
        />
      </div>
      {sms.lastError && (
        <p className="text-xs text-muted-foreground" data-sms-error>
          Last SMS failure {ago(sms.lastErrorAt, now)}: {sms.lastError}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" data-live-roster>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeadphonesIcon className="size-4 text-primary" aria-hidden /> Staff right now
            </CardTitle>
            <CardDescription>
              {roster.counts.on_call} on call · {roster.counts.busy} busy · {roster.counts.online} online · {roster.counts.away} away · {roster.counts.offline} offline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
                {(["working", ...ORDER, "all"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", filter === k ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
                    data-roster-filter={k}
                  >
                    {k === "working" ? `Working (${roster.rows.length - roster.counts.offline})` : k === "all" ? `Everyone (${roster.rows.length})` : `${STATUS[k].label} (${roster.counts[k]})`}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label="Find a person" placeholder="Find a person" className="h-8 w-44 pl-7 text-xs" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[26rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 font-medium">Person</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">For</th>
                    <th className="px-3 py-2 font-medium">Workload</th>
                    <th className="px-3 py-2 font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" data-roster-row={r.name}>
                      <td className="px-3 py-2">
                        <Link href={`/people/${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        {r.title && <span className="block text-xs text-muted-foreground">{r.title}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill s={r.status} />
                        {r.onCallWith && <span className="block text-xs text-muted-foreground">with {r.onCallWith}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{dur(r.sessionMin) || "–"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.agent && (
                          <span className={cn("block tabular-nums", r.maxOpen !== null && r.openTickets >= r.maxOpen && "font-medium text-[var(--st-paused-fg)]")}>
                            {r.openTickets}
                            {r.maxOpen !== null ? ` / ${r.maxOpen}` : ""} tickets
                          </span>
                        )}
                        {r.workItems > 0 && <span className="block tabular-nums text-muted-foreground">{r.workItems} in production</span>}
                        {!r.agent && !r.workItems && <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ago(r.lastActive, now)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {filter === "working" ? "Nobody is working in the app right now." : "Nobody matches."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card data-live-traffic>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Traffic per system today</CardTitle>
            <CardDescription>New conversations and customer messages; open now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!m.traffic.length && <p className="text-sm text-muted-foreground">No connected systems yet.</p>}
            {m.traffic.map((t) => (
              <div key={t.id ?? "other"} className="space-y-1" data-traffic={t.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t.created} new · {t.messages} {t.messages === 1 ? "message" : "messages"} · {t.open} open
                  </span>
                </div>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t.name}: ${t.created} new conversations and ${t.messages} customer messages today`}>
                  {t.created > 0 && <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(t.created / maxTraffic) * 100}%` }} />}
                  {t.messages > 0 && <div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${(t.messages / maxTraffic) * 100}%` }} />}
                </div>
              </div>
            ))}
            {m.traffic.length > 0 && (
              <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[var(--chart-1)]" /> New conversations
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Customer messages
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
