"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, FileSpreadsheetIcon, DownloadIcon, FileTextIcon, LayoutGridIcon, PhoneIcon, RefreshCwIcon, SendIcon, ShieldCheckIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import { CHAPA_STATUSES, CHAPA_STATUS_LABEL, CHAPA_TYPES, CHAPA_METHODS, CHAPA_WIDGETS, chapaMethodLabel, chapaTypeLabel, type ChapaSettings, type ChapaStatus, type ChapaTx, type ChapaWidget } from "@/lib/chapa";
import type { ChapaBusiness, FollowupRow, TxFilter } from "@/server/chapa-hub";
import * as A from "@/app/actions/chapa-hub";
import { DATE_PRESETS } from "@/lib/date-presets";
import { BalanceView, WithdrawalsView, RefundsView, SettingsView, RefundButton } from "./chapa-money";
import { SyncView } from "./chapa-sync";
import { TransactionsView } from "./chapa-transactions";

export type ChapaTab = "overview" | "transactions" | "daily" | "customers" | "followup" | "balance" | "withdrawals" | "refunds" | "funds" | "match" | "sync" | "settings";
export const money = (n: number, c = "ETB") => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
// Fixed to the workspace's zone so the server and the browser render the same text.
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" });

export function useLoad<T>(fn: () => Promise<{ ok: boolean; data?: T; error?: string }>, deps: unknown[]) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const reload = React.useCallback(async () => {
    setLoading(true);
    const r = await fn();
    setLoading(false);
    if (r.ok) (setData((r.data ?? null) as T), setError(""));
    else setError(r.error ?? "Could not load.");
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => void reload(), [reload]);
  return { data, error, loading, reload };
}

export function StatusPill({ s }: { s: ChapaStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-medium",
        s === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        s === "failed" && "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        s === "pending" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        (s === "refunded" || s === "reversed") && "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      {CHAPA_STATUS_LABEL[s] ?? s}
    </Badge>
  );
}

function BizSwitcher({ businesses, biz }: { businesses: ChapaBusiness[]; biz: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Business"
      value={biz}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value === "all") p.delete("biz");
        else p.set("biz", e.target.value);
        router.replace(`${path}?${p}`);
      }}
      className="h-8 rounded-md border bg-background px-2 text-sm font-medium"
    >
      <option value="all">All businesses</option>
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.mode === "test" ? " (test)" : ""}
        </option>
      ))}
    </select>
  );
}

export type OverviewLayout = { widgets: ChapaWidget[]; own: boolean; def: ChapaWidget[]; canSetDefault: boolean };
export function ChapaHub({ tab, biz, businesses, admin, settings, layout }: { tab: ChapaTab; biz: string; businesses: ChapaBusiness[]; admin: boolean; settings: ChapaSettings | null; layout?: OverviewLayout | null }) {
  const b = biz === "all" ? null : biz;
  const can = (a: keyof ChapaBusiness["rights"]) => (b ? !!businesses.find((x) => x.id === b)?.rights[a] : businesses.some((x) => x.rights[a]));
  if (!businesses.length)
    return <EmptyState title="No Chapa business yet" description="Add each business with its secret key in Admin, External APIs, Chapa. Then set who may do what here, in Settings." action={admin ? <Button asChild size="sm"><a href="/admin?tab=external-apis">Add a business</a></Button> : undefined} />;
  return (
    <div className="space-y-3">
      {tab !== "settings" && (
        <Toolbar label="Business" end={can("verify") && tab !== "sync" ? <SyncButton biz={b} /> : undefined}>
          <BizSwitcher businesses={businesses} biz={biz} />
          <span className="text-xs text-muted-foreground">{biz === "all" ? "Totals per currency; test businesses are left out." : businesses.find((x) => x.id === biz)?.mode === "test" ? "Test mode" : "Live"}</span>
        </Toolbar>
      )}
      {tab === "overview" && <Overview biz={b} layout={layout ?? null} />}
      {tab === "transactions" && <TransactionsView biz={b} businesses={businesses} canExport={can("export")} admin={admin} />}
      {tab === "daily" && <Daily biz={b} businesses={businesses} />}
      {tab === "customers" && <Customers biz={b} />}
      {tab === "followup" && <Followup biz={b} />}
      {tab === "balance" && <BalanceView biz={b} businesses={businesses} />}
      {tab === "withdrawals" && <WithdrawalsView biz={b} businesses={businesses} />}
      {tab === "refunds" && <RefundsView biz={b} />}
      {tab === "funds" && <Funds biz={b} />}
      {tab === "match" && <Match biz={b} />}
      {tab === "sync" && <SyncView biz={b} />}
      {tab === "settings" && settings && <SettingsView businesses={businesses} settings={settings} />}
    </div>
  );
}

function SyncButton({ biz }: { biz: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await A.chapaSyncAction(biz);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        const bad = r.data?.filter((x) => x.error) ?? [];
        const open = r.data?.filter((x) => !x.error && !x.complete) ?? [];
        if (bad.length) toast.error(bad.map((x) => `${x.name}: ${x.error}`).join("; "));
        else if (open.length) toast.warning(`${open.map((x) => x.name).join(", ")}: the history is not complete yet. See Sync and reconcile.`);
        else toast.success(`Synced: ${r.data?.map((x) => `${x.name} ${x.rows.toLocaleString()} read, ${x.inserted.toLocaleString()} new`).join("; ")}`);
        router.refresh();
      }}
    >
      <RefreshCwIcon className={cn(busy && "animate-spin")} /> Sync now
    </Button>
  );
}

// ---------------------------------------------------------------------------

type OverviewData = Awaited<ReturnType<typeof import("@/server/chapa-hub").chapaOverview>>;
type Cur = OverviewData["currencies"][number];
const WINDOW_LABEL = { today: "Today", d7: "Last 7 days", d30: "Last 30 days" } as const;
const WIDGET_LABEL = Object.fromEntries(CHAPA_WIDGETS) as Record<ChapaWidget, string>;

function Breakdown({ title, list, cur, isMoney }: { title: string; list: [string, number][]; cur: string; isMoney: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-xs">
        {list.slice(0, 8).map(([k, v]) => (
          <li key={k} className="flex justify-between gap-2">
            <span className="truncate">{k}</span>
            <span className="tabular-nums">{isMoney ? money(v, cur) : v.toLocaleString()}</span>
          </li>
        ))}
        {!list.length && <li className="text-muted-foreground">None</li>}
      </ul>
    </div>
  );
}

// One currency's widgets in the chosen order; neighbours of one kind (totals, breakdowns) share a row.
function CurrencyWidgets({ c, widgets }: { c: Cur; widgets: ChapaWidget[] }) {
  const max = Math.max(1, ...c.daily.map((d) => d.volume));
  const one = (k: ChapaWidget): React.ReactNode => {
    if (k === "today" || k === "d7" || k === "d30") {
      const w = c.windows[k];
      return <MetricCard key={k} label={WINDOW_LABEL[k]} value={money(w.volume, c.currency)} hint={`${w.success} paid · ${w.failed} failed · ${w.pending} pending${w.rate !== null ? ` · ${Math.round(w.rate * 100)}% success` : ""}`} />;
    }
    if (k === "daily")
      return (
        <div key={k}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Paid per day, last 30 days</p>
          <div className="flex h-32 items-end gap-0.5" role="img" aria-label={`Daily paid volume in ${c.currency}`}>
            {c.daily.map((d) => (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: ${money(d.volume, c.currency)} (${d.count})`}>
                <div className="rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(2, (d.volume / max) * 120)}px` }} />
              </div>
            ))}
          </div>
        </div>
      );
    if (k === "method") return <Breakdown key={k} title="By payment method" list={c.byMethod} cur={c.currency} isMoney />;
    if (k === "type") return <Breakdown key={k} title="By type" list={c.byType.map(([t, v]) => [chapaTypeLabel(t), v] as [string, number])} cur={c.currency} isMoney />;
    if (k === "status") return <Breakdown key={k} title="By status (count)" list={c.byStatus.map(([t, v]) => [CHAPA_STATUS_LABEL[t as ChapaStatus] ?? t, v] as [string, number])} cur={c.currency} isMoney={false} />;
    return null;
  };
  const group = (k: ChapaWidget) => (k === "today" || k === "d7" || k === "d30" ? "total" : k === "method" || k === "type" || k === "status" ? "list" : k);
  const rows: ChapaWidget[][] = [];
  for (const k of widgets.filter((x) => x !== "sync")) {
    const last = rows.at(-1);
    if (last && group(last[0]!) === group(k) && group(k) !== "daily") last.push(k);
    else rows.push([k]);
  }
  return (
    <>
      {rows.map((r) =>
        r.length === 1 && group(r[0]!) === "daily" ? (
          one(r[0]!)
        ) : (
          <div key={r.join("-")} className={cn("grid gap-3", group(r[0]!) === "total" ? "grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3")}>
            {r.map(one)}
          </div>
        ),
      )}
    </>
  );
}

// Pick and arrange the widgets: for me, back to the default, or (Admin) for everyone.
function CustomizeOverview({ layout, onClose }: { layout: OverviewLayout; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = React.useState<ChapaWidget[]>(layout.widgets);
  const [busy, setBusy] = React.useState(false);
  const order: ChapaWidget[] = [...list, ...CHAPA_WIDGETS.map(([k]) => k).filter((k) => !list.includes(k))];
  const move = (k: ChapaWidget, by: number) => {
    const i = list.indexOf(k);
    const next = [...list];
    next.splice(i, 1);
    next.splice(i + by, 0, k);
    setList(next);
  };
  const save = async (scope: "me" | "default" | "reset") => {
    setBusy(true);
    const r = await A.saveChapaOverviewLayoutAction(list, scope);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Could not save.");
    toast.success(scope === "default" ? "Saved for everyone" : scope === "reset" ? "Back to the default" : "Overview saved");
    onClose();
    router.refresh();
  };
  return (
    <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-4" data-customize-overview>
      <div>
        <h2 className="text-sm font-semibold">Customize the Overview</h2>
        <p className="text-xs text-muted-foreground">Tick the widgets to show and put them in order. {layout.own ? "You have your own layout." : "You see the default layout."}</p>
      </div>
      <ul className="space-y-1">
        {order.map((k) => {
          const on = list.includes(k);
          const i = list.indexOf(k);
          return (
            <li key={k} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm" data-widget-row={k}>
              <Checkbox id={`w-${k}`} checked={on} onCheckedChange={(v) => setList(v ? [...list, k] : list.filter((x) => x !== k))} aria-label={`Show ${WIDGET_LABEL[k]}`} />
              <label htmlFor={`w-${k}`} className={cn("flex-1", !on && "text-muted-foreground")}>
                {WIDGET_LABEL[k]}
              </label>
              {on && (
                <>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${WIDGET_LABEL[k]} up`} disabled={i === 0} onClick={() => move(k, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${WIDGET_LABEL[k]} down`} disabled={i === list.length - 1} onClick={() => move(k, 1)}>
                    <ArrowDownIcon />
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !list.length} onClick={() => save("me")}>
          Save for me
        </Button>
        {layout.canSetDefault && (
          <Button size="sm" variant="outline" disabled={busy || !list.length} onClick={() => save("default")}>
            Save for everyone
          </Button>
        )}
        {layout.own && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save("reset")}>
            Use the default
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

// The Overview's filters: the same dates, statuses, methods and types as Transactions, on the real stored data.
const OV_PRESETS = DATE_PRESETS.filter(([p]) => ["today", "yesterday", "7days", "14days", "30days", "month", "lastmonth", "year", "all", "custom"].includes(p));
type OvFilter = { preset: string; start: string; end: string; status: string[]; method: string[]; type: string[]; q: string; sort: "newest" | "oldest" | "amount_desc" | "amount_asc" };
const OV_DEFAULT: OvFilter = { preset: "30days", start: "", end: "", status: [], method: [], type: [], q: "", sort: "newest" };

function Overview({ biz, layout }: { biz: string | null; layout: OverviewLayout | null }) {
  const [f, setF] = React.useState<OvFilter>(OV_DEFAULT);
  const [q, setQ] = React.useState("");
  const { data, error } = useLoad(() => A.chapaOverviewAction(biz, { ...f, start: f.start || null, end: f.end || null, q: f.q || null }), [biz, JSON.stringify(f)]);
  const [custom, setCustom] = React.useState(false);
  const widgets = layout?.widgets ?? CHAPA_WIDGETS.map(([k]) => k);
  // Search as you type, a moment after the last key.
  React.useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q })), 350);
    return () => window.clearTimeout(t);
  }, [q]);
  const filtered = f.status.length + f.method.length + f.type.length > 0 || !!f.q || f.preset !== "30days";
  const bar = (
    <div className="space-y-2 rounded-xl border bg-card p-3" data-overview-filters>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Dates" className="h-8 rounded-md border bg-background px-2 text-sm" value={f.preset} onChange={(e) => setF({ ...f, preset: e.target.value })} data-overview-preset>
          {OV_PRESETS.map(([p, l]) => (
            <option key={p} value={p}>{l}</option>
          ))}
        </select>
        {f.preset === "custom" && (
          <>
            <Input aria-label="From" type="date" className="h-8 w-36" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            <Input aria-label="To" type="date" className="h-8 w-36" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </>
        )}
        <Input aria-label="Search transactions" className="h-8 w-56" placeholder="Reference, name, email, phone, amount" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sort" className="h-8 rounded-md border bg-background px-2 text-sm" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as OvFilter["sort"] })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount_desc">Largest amount</option>
          <option value="amount_asc">Smallest amount</option>
        </select>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => (setF(OV_DEFAULT), setQ(""))}>
            Clear filters
          </Button>
        )}
      </div>
      <MultiChips label="Status" options={CHAPA_STATUSES} value={f.status as ChapaStatus[]} onChange={(v) => setF({ ...f, status: v })} />
      <MultiChips label="Method" options={CHAPA_METHODS.map((m) => [m, chapaMethodLabel(m)] as const)} value={f.method as never[]} onChange={(v) => setF({ ...f, method: v })} />
      <MultiChips label="Type" options={CHAPA_TYPES} value={f.type as never[]} onChange={(v) => setF({ ...f, type: v })} />
    </div>
  );
  if (error) return <div className="space-y-4">{bar}<StatusStrip tone="danger">{error}</StatusStrip></div>;
  if (!data) return <div className="space-y-4">{bar}<StatusStrip>Loading…</StatusStrip></div>;
  const rangeLabel = data.filter.preset === "all" ? "All time" : data.filter.from === data.filter.until ? (data.filter.from ?? "") : `${data.filter.from ?? "start"} to ${data.filter.until ?? "today"}`;
  return (
    <div className="space-y-4" data-overview={widgets.join(",")}>
      {bar}
      {layout && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setCustom(!custom)} aria-expanded={custom}>
            <LayoutGridIcon /> Customize
          </Button>
        </div>
      )}
      {custom && layout && <CustomizeOverview layout={layout} onClose={() => setCustom(false)} />}
      {widgets.includes("sync") && (
        <div className="flex flex-wrap gap-2 text-xs" data-widget="sync">
          {data.businesses.map((b) => (
            <span key={b.id} className={cn("rounded-full border px-2.5 py-1", b.health === "error" ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : "text-muted-foreground")} title={b.lastError ?? undefined}>
              {b.name}: {b.health === "error" ? `sync failed (${b.lastError?.slice(0, 60)})` : b.lastSyncAt ? `synced ${when(b.lastSyncAt)}` : "not synced yet"}
            </span>
          ))}
        </div>
      )}
      {!data.currencies.length && !data.rangeOnly.length && <EmptyState title={filtered ? "No transactions match" : "No transactions in the last 30 days"} description={filtered ? "Change the dates or the filters." : "Sync now to read them from Chapa, or wait for the next automatic sync."} />}
      {[...data.currencies.map((c) => ({ currency: c.currency, range: c.range, c })), ...data.rangeOnly.map((r) => ({ currency: r.currency, range: r.range, c: null }))].map(({ currency, range, c }) => (
        <section key={currency} className="space-y-3 rounded-xl border bg-card p-4" data-overview-currency={currency}>
          <h2 className="text-sm font-semibold">{currency}</h2>
          {range && <RangeWidgets r={range} currency={currency} label={rangeLabel} />}
          {c && <CurrencyWidgets c={c} widgets={widgets.filter((w) => !["daily", "method", "type", "status"].includes(w) || !range)} />}
        </section>
      ))}
      <section className="space-y-2 rounded-xl border bg-card p-4" data-overview-transactions>
        <h2 className="text-sm font-semibold">
          Transactions in this range <span className="font-normal text-muted-foreground">({data.matching.toLocaleString()} match{data.matching > 25 ? ", showing 25" : ""})</span>
        </h2>
        {!data.transactions.length ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Reference</th>
                  <th className="p-2">Method</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={`${t.accountId}-${t.txRef}`} className="border-b last:border-0" data-overview-tx={t.txRef}>
                    <td className="p-2 whitespace-nowrap" suppressHydrationWarning>{when(t.createdAt)}</td>
                    <td className="p-2">{t.customer || t.email || t.phone || "—"}</td>
                    <td className="p-2 font-mono text-xs">{t.txRef}</td>
                    <td className="p-2">{chapaMethodLabel(t.method)}</td>
                    <td className="p-2">{CHAPA_STATUS_LABEL[t.status as ChapaStatus] ?? t.status}</td>
                    <td className="p-2 text-right tabular-nums">{money(t.amount, t.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type RangeData = NonNullable<OverviewData["currencies"][number]["range"]>;
// The selected range: total paid, the counts and the success rate, paid per day (or month), and the breakdowns.
function RangeWidgets({ r, currency, label }: { r: RangeData; currency: string; label: string }) {
  const max = Math.max(1, ...r.series.map((d) => d.volume));
  return (
    <div className="space-y-3" data-overview-range>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={`Paid · ${label}`} value={money(r.volume, currency)} hint={`${r.success.toLocaleString()} paid`} />
        <MetricCard label="Transactions" value={r.count.toLocaleString()} hint={`${r.failed} failed · ${r.pending} pending`} />
        <MetricCard label="Success rate" value={r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`} hint="Paid out of paid and failed" />
        <MetricCard label="Average payment" value={r.success ? money(r.volume / r.success, currency) : "—"} />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Paid per {r.monthly ? "month" : "day"}</p>
        <div className="flex h-32 items-end gap-0.5" role="img" aria-label={`Paid volume per ${r.monthly ? "month" : "day"} in ${currency}`} data-overview-chart={r.series.length}>
          {r.series.map((d) => (
            <div key={d.day} className="group relative flex-1" title={`${d.day}: ${money(d.volume, currency)} (${d.count})`}>
              <div className="rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(2, (d.volume / max) * 120)}px` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Breakdown title="By payment method" list={r.byMethod} cur={currency} isMoney />
        <Breakdown title="By type" list={r.byType.map(([t, v]) => [chapaTypeLabel(t), v] as [string, number])} cur={currency} isMoney />
        <Breakdown title="By status (count)" list={r.byStatus.map(([t, v]) => [CHAPA_STATUS_LABEL[t as ChapaStatus] ?? t, v] as [string, number])} cur={currency} isMoney={false} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MultiChips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {options.map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function TxTable({ rows, showBiz, onOpen, select }: { rows: ChapaTx[]; showBiz: boolean; onOpen?: (t: ChapaTx) => void; select?: { selected: Set<string>; onChange: (s: Set<string>) => void } }) {
  const [limit, setLimit] = React.useState(100);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2">Method</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Chapa reference</th>
              {showBiz && <th className="px-2 py-2">Business</th>}
              <th className="px-2 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((t) => (
              <tr key={`${t.accountId}:${t.txRef}`} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => onOpen?.(t)}>
                <td className="px-2 py-1.5"><StatusPill s={t.status} /></td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{t.customer}</div>
                  <div className="text-[11px] text-muted-foreground">{[t.phone, t.email].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(t.amount, t.currency)}</td>
                <td className="px-2 py-1.5">{chapaMethodLabel(t.method)}</td>
                <td className="px-2 py-1.5">{chapaTypeLabel(t.type ?? "")}</td>
                <td className="px-2 py-1.5 font-mono text-[11px]">{t.refId ?? t.txRef}</td>
                {showBiz && <td className="px-2 py-1.5">{t.business}</td>}
                <td className="px-2 py-1.5 whitespace-nowrap">{when(t.createdAt)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No transactions match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="border-t p-2 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 200)}>Show more ({rows.length - limit} left)</Button>
        </div>
      )}
      {select && null}
    </div>
  );
}

export function TxDrawer({ tx, onClose, onChanged, businesses }: { tx: ChapaTx | null; onClose: () => void; onChanged: () => void; businesses: ChapaBusiness[] }) {
  const [d, setD] = React.useState<Awaited<ReturnType<typeof A.chapaTxDetailAction>> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const rights = businesses.find((b) => b.id === tx?.accountId)?.rights;
  React.useEffect(() => {
    setD(null);
    if (tx) void A.chapaTxDetailAction(tx.accountId, tx.txRef).then(setD);
  }, [tx]);
  const det = d?.ok ? d.data : null;
  return (
    <Sheet open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {tx && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">{money(tx.amount, tx.currency)} <StatusPill s={(det?.tx.status ?? tx.status) as ChapaStatus} /></SheetTitle>
              <SheetDescription>{tx.customer} · {tx.business} · {when(tx.createdAt)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{tx.txRef}</dd>
                <dt className="text-muted-foreground">Chapa reference</dt><dd className="font-mono">{tx.refId ?? "-"}</dd>
                <dt className="text-muted-foreground">Method</dt><dd>{chapaMethodLabel(tx.method)}</dd>
                <dt className="text-muted-foreground">Type</dt><dd>{chapaTypeLabel(tx.type ?? "")}</dd>
                <dt className="text-muted-foreground">Fee</dt><dd>{money(tx.charge, tx.currency)}</dd>
                <dt className="text-muted-foreground">Phone</dt><dd>{tx.phone ? <a className="text-primary" href={`tel:${tx.phone}`}>{tx.phone}</a> : "-"}</dd>
                <dt className="text-muted-foreground">Email</dt><dd>{tx.email ?? "-"}</dd>
                {det?.tx.providerStatus && <><dt className="text-muted-foreground">Chapa's status</dt><dd>{det.tx.providerStatus}</dd></>}
                <dt className="text-muted-foreground">Created</dt><dd>{when(tx.createdAt)}{det?.tx.undated ? " (Chapa gave no date)" : ""}</dd>
                {det?.tx.providerUpdatedAt && <><dt className="text-muted-foreground">Updated at Chapa</dt><dd>{when(det.tx.providerUpdatedAt)}</dd></>}
                <dt className="text-muted-foreground">Last verified</dt><dd>{det?.tx.verifiedAt ? when(det.tx.verifiedAt) : "Never"}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                {rights?.verify && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); const r = await A.chapaVerifyAction(tx.accountId, tx.txRef); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success(`Chapa says: ${CHAPA_STATUS_LABEL[r.data as ChapaStatus]}`); setD(await A.chapaTxDetailAction(tx.accountId, tx.txRef)); onChanged(); }}>
                    <ShieldCheckIcon /> Re-verify with Chapa
                  </Button>
                )}
                {rights?.refund && (det?.tx.status ?? tx.status) === "success" && <RefundButton tx={tx} onDone={onChanged} />}
              </div>
              {!det && !d && <p className="text-xs text-muted-foreground">Loading details…</p>}
              {d && !d.ok && <StatusStrip tone="danger">{d.error}</StatusStrip>}
              {det && (
                <>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold">Status history</h3>
                    <ol className="space-y-1 text-xs">
                      {det.history.map((h, i) => (
                        <li key={i} className="flex items-center gap-2"><StatusPill s={h.status as ChapaStatus} /> {when(h.at)} <span className="text-muted-foreground">from {h.source}</span></li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold">Chapa events</h3>
                    {det.eventsError ? <p className="text-xs text-muted-foreground">Not available: {det.eventsError}</p> : !det.events.length ? <p className="text-xs text-muted-foreground">None.</p> : (
                      <ol className="space-y-1 text-xs">{det.events.map((e, i) => <li key={i} className="rounded border p-1.5 font-mono text-[11px]">{JSON.stringify(e)}</li>)}</ol>
                    )}
                  </section>
                  <section data-webhooks>
                    <h3 className="mb-1 text-xs font-semibold">Callbacks from Chapa</h3>
                    {!det.webhooks.length ? <p className="text-xs text-muted-foreground">None received for this payment.</p> : (
                      <ol className="space-y-1 text-xs">
                        {det.webhooks.map((w, i) => (
                          <li key={i} className="rounded border p-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{w.event ?? "Callback"}{w.status ? ` · ${w.status}` : ""}</span>
                              <span className="text-muted-foreground">{when(w.at)}</span>
                            </div>
                            <div className={cn("text-[11px]", w.signed ? "text-muted-foreground" : "text-destructive")}>{w.outcome ?? (w.signed ? "Received" : "Refused")}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold">Noor (matched by phone)</h3>
                    <p className="text-xs">{det.cms ? `Student ${det.cms.student} (${det.cms.grade}), parent ${det.cms.parent}` : "No Noor student or parent with this phone in the synchronized mirror."}</p>
                  </section>
                  <section>
                    <h3 className="mb-1 text-xs font-semibold">Follow-up</h3>
                    <p className="text-xs">{det.ticket ? <a className="text-primary" href={`/support?ticket=${tx.followupTicketId}`}>Ticket #{det.ticket.number}: {det.ticket.status}{det.ticket.assignee ? `, ${det.ticket.assignee}` : ""}</a> : "No follow-up case."}</p>
                  </section>
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold">Raw payload from Chapa</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(det.raw, null, 2)}</pre>
                  </details>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function Daily({ biz, businesses }: { biz: string | null; businesses: ChapaBusiness[] }) {
  const [day, setDay] = React.useState(today());
  const [tab, setTab] = React.useState<"success" | "failed" | "pending">("failed");
  const [open, setOpen] = React.useState<ChapaTx | null>(null);
  const { data, error, reload } = useLoad(() => A.chapaDailyAction(day, biz), [day, biz]);
  const t = data?.tabs.find((x) => x.status === tab);
  return (
    <div className="space-y-3">
      <Toolbar label="Day">
        <Input type="date" aria-label="Day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-8 w-[10rem] text-xs" />
        {data && (
          <ViewSwitcher
            label="Daily status"
            value={tab}
            onChange={setTab}
            options={data.tabs.map((x) => [x.status, `${CHAPA_STATUS_LABEL[x.status]} ${x.n}`] as const)}
          />
        )}
      </Toolbar>
      {error && <StatusStrip tone="danger">{error}</StatusStrip>}
      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.tabs.map((x) => {
            const diff = x.n - x.prev.n;
            return <MetricCard key={x.status} label={CHAPA_STATUS_LABEL[x.status]} value={x.n.toLocaleString()} hint={`${x.sum.toLocaleString()} total · ${diff === 0 ? "same as" : diff > 0 ? `${diff} more than` : `${-diff} fewer than`} ${data.prevDay}`} tone={x.status === "failed" && x.n ? "danger" : x.status === "pending" && x.n ? "warning" : "default"} />;
          })}
        </div>
      )}
      {t && <TxTable rows={t.rows} showBiz={!biz && businesses.length > 1} onOpen={setOpen} />}
      <TxDrawer tx={open} onClose={() => setOpen(null)} onChanged={reload} businesses={businesses} />
    </div>
  );
}

// Customers (Update 1.2): filtered by date range, outcome and method, and compared over their tries. The cards say how
// many failed at least once and how many of those paid on a later try; a row opens every try of that customer.
const OUTCOMES = [
  ["paid_first", "Paid first time"],
  ["recovered", "Paid after failing"],
  ["failed_only", "Never paid"],
  ["pending_only", "Pending only"],
] as const;
type Outcome = (typeof OUTCOMES)[number][0];
const OUTCOME_TONE: Record<Outcome, string> = {
  paid_first: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  recovered: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  failed_only: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  pending_only: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
};
const span = (ms: number | null) => (ms === null ? "-" : ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min` : ms < 86400e3 ? `${Math.round(ms / 3600e3)} h` : `${Math.round(ms / 86400e3)} days`);

function Customers({ biz }: { biz: string | null }) {
  const [q, setQ] = React.useState("");
  const [sent, setSent] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [outcome, setOutcome] = React.useState<Outcome | "">("");
  const [method, setMethod] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "paid" | "failed" | "name">("recent");
  const [open, setOpen] = React.useState<string | null>(null);
  // Call list: each unpaid person once, leaving out duplicates and people who paid under another phone or email.
  const [callList, setCallList] = React.useState(false);
  const filter = { from: from || undefined, until: until || undefined, outcome: outcome ? [outcome] : undefined, method: method ? [method] : undefined, sort, callList };
  const { data, error } = useLoad(() => A.chapaCustomersAction(biz, sent, filter), [biz, sent, from, until, outcome, method, sort, callList]);
  const qs = new URLSearchParams({ ...(biz ? { biz } : {}), ...(sent ? { q: sent } : {}), ...(from ? { from } : {}), ...(until ? { until } : {}), ...(outcome ? { outcome } : {}), ...(method ? { method } : {}), ...(callList ? { calllist: "1" } : {}), sort }).toString();
  const sum = data?.summary;
  const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);
  const sel = "h-8 rounded-md border bg-background px-2 text-xs";
  const active = !!(sent || from || until || outcome || method || callList);
  return (
    <div className="space-y-3" data-chapa-customers>
      <Toolbar
        label="Customers"
        end={
          <>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs"><a href={`/api/finance/chapa/customers-export?format=xlsx&${qs}`}><FileSpreadsheetIcon /> Excel</a></Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs"><a href={`/api/finance/chapa/customers-export?format=csv&${qs}`}><DownloadIcon /> CSV</a></Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs"><a href={`/export/cms-report?list=chapa-customers&${qs}`} target="_blank" rel="noreferrer" data-customers-pdf><FileTextIcon /> PDF</a></Button>
          </>
        }
      >
        <form onSubmit={(e) => (e.preventDefault(), setSent(q.trim()))}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" className="h-8 w-60 text-xs" aria-label="Search customers" />
        </form>
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        <Input type="date" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        <select aria-label="Outcome" className={sel} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "")}>
          <option value="">Every outcome</option>
          {OUTCOMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Method" className={sel} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Every method</option>
          {CHAPA_METHODS.map((m) => <option key={m} value={m}>{chapaMethodLabel(m)}</option>)}
        </select>
        <select aria-label="Sort customers" className={sel} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="recent">Latest activity</option>
          <option value="paid">Paid most</option>
          <option value="failed">Most failed tries</option>
          <option value="name">Name</option>
        </select>
        <label className="flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs" title="Each unpaid person once: no duplicates, and nobody who paid under another phone, email or business">
          <input type="checkbox" className="size-3.5" checked={callList} onChange={(e) => setCallList(e.target.checked)} data-call-list /> Call list (no duplicates)
        </label>
        {active && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => (setQ(""), setSent(""), setFrom(""), setUntil(""), setOutcome(""), setMethod(""), setCallList(false))}>Reset</Button>}
      </Toolbar>
      {error && <StatusStrip tone="danger">{error}</StatusStrip>}
      {sum && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-customers-summary>
          <MetricCard label="Customers" value={sum.customers.toLocaleString()} hint={`${sum.paying.toLocaleString()} paid at least once`} />
          <MetricCard label="Paid first time" value={sum.paidFirst.toLocaleString()} hint="Their first try went through" />
          <MetricCard label="Paid after failing" value={sum.recovered.toLocaleString()} hint={`${pct(sum.recoveryRate)} of the ${sum.failedOnce.toLocaleString()} who failed · typically ${span(sum.medianRecoveryMs)} later`} />
          <MetricCard label="Never paid" value={sum.neverPaid.toLocaleString()} hint={`${sum.pendingOnly.toLocaleString()} more only pending`} />
        </div>
      )}
      {sum && !callList && (sum.duplicateUnpaid > 0 || sum.paidElsewhere > 0) && (
        <StatusStrip tone="warning">
          <span data-duplicate-summary>
            {sum.duplicateUnpaid.toLocaleString()} unpaid rows are the same person as another row
            {sum.paidElsewhere ? `, and ${sum.paidElsewhere.toLocaleString()} of them already paid under another phone, email or business` : ""}. {sum.toCall.toLocaleString()} people left to call.{" "}
            <button type="button" className="font-medium underline" onClick={() => setCallList(true)}>Show the call list</button>
          </span>
        </StatusStrip>
      )}
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Customer</th><th className="px-2 py-2">Outcome</th><th className="px-2 py-2 text-right">Paid</th><th className="px-2 py-2 text-right">Tries</th><th className="px-2 py-2">First failure → paid</th><th className="px-2 py-2">Methods</th><th className="px-2 py-2">Last payment</th><th className="px-2 py-2">Noor</th><th className="px-2 py-2">Business</th><th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.list ?? []).map((c) => {
              const id = `${c.accountId}:${c.key}`;
              return (
                <React.Fragment key={id}>
                  <tr className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpen(open === id ? null : id)} data-customer-row={c.outcome} aria-expanded={open === id}>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                      {c.dup && c.paidCount === 0 && (
                        <div className="mt-0.5 text-[11px]" title={c.dup.others.map((o) => [o.name, o.phone ?? o.email, o.business].filter(Boolean).join(" / ")).join("; ")} data-duplicate={c.dup.paidElsewhere ? "paid" : c.dup.primary ? "primary" : "duplicate"}>
                          {c.dup.paidElsewhere ? (
                            <span className="rounded bg-emerald-500/15 px-1 text-emerald-800 dark:text-emerald-200">Paid elsewhere: don&apos;t call</span>
                          ) : c.dup.primary ? (
                            <span className="rounded bg-sky-500/15 px-1 text-sky-800 dark:text-sky-200">Call this one ({c.dup.size - 1} duplicate{c.dup.size > 2 ? "s" : ""})</span>
                          ) : (
                            <span className="rounded bg-amber-500/15 px-1 text-amber-800 dark:text-amber-200">Duplicate: don&apos;t call</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap", OUTCOME_TONE[c.outcome as Outcome])}>{OUTCOMES.find(([k]) => k === c.outcome)?.[1]}</span></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(c.paid, c.currency)} <span className="text-muted-foreground">({c.paidCount})</span></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.tries}{c.failed ? <span className="text-rose-600"> · {c.failed} failed</span> : null}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{c.outcome === "recovered" ? `${when(c.firstFailed!)} → ${when(c.lastPaid!)} (${c.failedBeforePaid} failed first)` : c.firstFailed ? `Failed ${when(c.firstFailed)}` : "-"}</td>
                    <td className="px-2 py-1.5">{c.methods.join(", ")}</td>
                    <td className="px-2 py-1.5">{c.lastPaid ? when(c.lastPaid) : "Never"}</td>
                    <td className="px-2 py-1.5">{c.cms ? `${c.cms.student} (${c.cms.grade})` : "-"}</td>
                    <td className="px-2 py-1.5">{c.business}</td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>{c.phone && !(c.dup && c.paidCount === 0 && (c.dup.paidElsewhere || !c.dup.primary)) && <Button asChild size="icon" variant="ghost" className="size-7" aria-label={`Call ${c.name}`}><a href={`tel:${c.phone}`}><PhoneIcon /></a></Button>}</td>
                  </tr>
                  {open === id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={10} className="px-3 py-2"><CustomerTries accountId={c.accountId} k={c.key} /></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {data && !data.list.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">{active ? "No customer matches these filters." : "No customers yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.list.length && <p className="text-xs text-muted-foreground">Showing the first {data.list.length.toLocaleString()} of {data.total.toLocaleString()} customers. Narrow the filters, or export them all.</p>}
    </div>
  );
}

// Every try of one customer, oldest first: status, amount, method and the time since the try before.
function CustomerTries({ accountId, k }: { accountId: string; k: string }) {
  const { data, error } = useLoad(() => A.chapaCustomerTriesAction(accountId, k), [accountId, k]);
  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!data) return <p className="text-xs text-muted-foreground">Loading the tries…</p>;
  return (
    <ol className="space-y-1" data-customer-tries>
      {data.map((t, i) => {
        const gap = i ? Date.parse(t.createdAt) - Date.parse(data[i - 1].createdAt) : null;
        return (
          <li key={t.txRef} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", t.status === "success" ? OUTCOME_TONE.paid_first : t.status === "failed" ? OUTCOME_TONE.failed_only : OUTCOME_TONE.pending_only)}>{CHAPA_STATUS_LABEL[t.status]}</span>
            <span className="tabular-nums">{money(t.amount, t.currency)}</span>
            <span>{chapaMethodLabel(t.method)}</span>
            <span className="text-muted-foreground">{when(t.createdAt)}{gap !== null ? ` · ${span(gap)} after the try before` : ""}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{t.txRef}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Followup({ biz }: { biz: string | null }) {
  const [day, setDay] = React.useState(today());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const { data, error, reload } = useLoad(() => A.chapaFollowupsAction(day, biz), [day, biz]);
  const send = async (keys: string[] | "all") => {
    setBusy(true);
    const r = await A.chapaSendFollowupsAction(day, keys, biz);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.data?.created} case${r.data?.created === 1 ? "" : "s"} sent to the Payment follow-up queue${r.data?.merged ? `, ${r.data.merged} added to open cases` : ""}`);
    setSelected(new Set());
    void reload();
  };
  const waiting = (data ?? []).filter((g: FollowupRow) => !g.ticketId || ["solved", "closed"].includes(g.ticketStatus ?? ""));
  return (
    <div className="space-y-3">
      <Toolbar label="Follow-up" end={<><Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !selected.size} onClick={() => send([...selected])}><SendIcon /> Send {selected.size || ""} selected</Button><Button size="sm" className="h-8 text-xs" disabled={busy || !waiting.length} onClick={() => send("all")}><SendIcon /> Send all {waiting.length}</Button></>}>
        <Input type="date" aria-label="Day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-8 w-[10rem] text-xs" />
        <span className="text-xs text-muted-foreground">Failed and stuck pending payments, one row per customer. Customers who paid later are left out. A case closes by itself when they pay.</span>
      </Toolbar>
      {error && <StatusStrip tone="danger">{error}</StatusStrip>}
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
            <tr><th className="w-8 px-2 py-2" /><th className="px-2 py-2">Customer</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Tries</th><th className="px-2 py-2">Why</th><th className="px-2 py-2">Method</th><th className="px-2 py-2">Noor</th><th className="px-2 py-2">Last try</th><th className="px-2 py-2">Case</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((g) => {
              const sent = !!g.ticketId && !["solved", "closed"].includes(g.ticketStatus ?? "");
              return (
                <tr key={g.key} className="border-t">
                  <td className="px-2 py-1.5">{!sent && <Checkbox aria-label={`Select ${g.name}`} checked={selected.has(g.key)} onCheckedChange={(v) => { const n = new Set(selected); if (v === true) n.add(g.key); else n.delete(g.key); setSelected(n); }} />}</td>
                  <td className="px-2 py-1.5"><div className="font-medium">{g.name}</div><div className="text-[11px] text-muted-foreground">{[g.phone ?? "no phone", g.email].filter(Boolean).join(" · ")} · {g.business}</div></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(g.amount, g.currency)}</td>
                  <td className="px-2 py-1.5">{g.attempts}</td>
                  <td className="px-2 py-1.5">{g.reasons.join(", ")}</td>
                  <td className="px-2 py-1.5">{g.methods.join(", ")}</td>
                  <td className="px-2 py-1.5">{g.cms ? `${g.cms.student} (${g.cms.grade})` : "-"}</td>
                  <td className="px-2 py-1.5">{when(g.last)}</td>
                  <td className="px-2 py-1.5">{g.ticketId ? <a className="text-primary" href={`/support?ticket=${g.ticketId}`}>#{g.ticketNumber} {g.ticketStatus}</a> : <span className="text-muted-foreground">Not sent</span>}</td>
                </tr>
              );
            })}
            {data && !data.length && <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">Nobody to follow up on this day.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Funds({ biz }: { biz: string | null }) {
  const { data, error } = useLoad(() => A.chapaFundsAction(biz), [biz]);
  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!data) return <StatusStrip>Loading…</StatusStrip>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Money in (Funding transactions)</h2>
        <TxTable rows={data.credits} showBiz={!biz} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Money out (withdrawals made here)</h2>
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-xs">
            <tbody>
              {data.debits.map((o) => (
                <tr key={o.id} className="border-t first:border-0"><td className="px-2 py-1.5">{when(o.createdAt)}</td><td className="px-2 py-1.5">{o.detail.account_name ?? o.detail.title ?? o.kind}</td><td className="px-2 py-1.5 text-right tabular-nums">{money(o.amount, o.currency)}</td><td className="px-2 py-1.5">{o.status}</td></tr>
              ))}
              {!data.debits.length && <tr><td className="px-3 py-8 text-center text-muted-foreground">No withdrawals made from Myseed.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">Chapa virtual-account statements are not in its public API; Funding-type transactions show the money that came in.</p>
      </section>
    </div>
  );
}

function Match({ biz }: { biz: string | null }) {
  const [from, setFrom] = React.useState(new Date(Date.now() + 3 * 3600e3 - 6 * 86400e3).toISOString().slice(0, 10));
  const [until, setUntil] = React.useState(today());
  const { data, error, loading } = useLoad(() => A.chapaMatchAction({ from, until, biz }), [from, until, biz]);
  return (
    <div className="space-y-3">
      <Toolbar label="Match range">
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" />–
        <Input type="date" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
        <span className="text-xs text-muted-foreground">Paid Chapa payments against Noor invoices loaded for these days (Legacy CMS, Live or Invoices) and the synchronized mirror. Matched by reference, else by phone and amount on the same day.</span>
      </Toolbar>
      {error && <StatusStrip tone="danger">{error}</StatusStrip>}
      {loading && <StatusStrip>Matching…</StatusStrip>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Matched" value={data.matched.length} tone="success" />
            <MetricCard label="Chapa without a Noor invoice" value={data.unmatchedChapa.length} tone={data.unmatchedChapa.length ? "warning" : "default"} />
            <MetricCard label="Noor invoices without a Chapa payment" value={data.unmatchedNoor.length} hint={`${data.invoicesChecked} invoices checked`} />
          </div>
          <h3 className="text-sm font-semibold">Chapa payments with no Noor invoice</h3>
          <TxTable rows={data.unmatchedChapa} showBiz={!biz} />
          <h3 className="text-sm font-semibold">Noor invoices with no Chapa payment</h3>
          <div className="overflow-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Invoice</th><th className="px-2 py-2">Student</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Method</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Date</th></tr></thead>
              <tbody>
                {data.unmatchedNoor.slice(0, 500).map((n, i) => <tr key={i} className="border-t"><td className="px-2 py-1.5">{n.id}</td><td className="px-2 py-1.5">{n.student}</td><td className="px-2 py-1.5 text-right">{n.amount.toLocaleString()}</td><td className="px-2 py-1.5">{n.method}</td><td className="px-2 py-1.5">{n.status}</td><td className="px-2 py-1.5">{n.date}</td></tr>)}
                {!data.unmatchedNoor.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">None.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

void RotateCcwIcon;
