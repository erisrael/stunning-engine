"use client";
import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/app/primitives";
import { StatusStrip } from "@/components/app/page-kit";
import { noorTotalsAction } from "@/app/actions/cms-admin";
import type { NoorTotals } from "@/server/noor-totals";

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));
const card = (t: NoorTotals, re: RegExp) => t.cards.find((c) => re.test(c.label));

// Noor's numbers as Noor shows them, on top of every Legacy CMS view: its lists' totals (what a filter in Noor
// shows) and its dashboard cards, side by side where Noor itself counts two ways.
export function NoorTotalsStrip() {
  const [t, setT] = React.useState<NoorTotals | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async (refresh: boolean) => {
    setBusy(true);
    const r = await noorTotalsAction(refresh);
    setBusy(false);
    if (r.ok) (setT(r.data as NoorTotals), setError(null));
    else setError(r.error ?? "Noor's totals could not be read.");
  }, []);
  React.useEffect(() => void load(false), [load]);
  if (error && !t) return <StatusStrip tone="warning">{error}</StatusStrip>;
  if (!t) return <div className="h-24 animate-pulse rounded-xl bg-muted/50" data-noor-totals="loading" />;
  const list = (k: string) => t.lists.find((l) => l.key === k);
  const students = list("students");
  const parents = list("parents");
  const active = list("activeSubscriptions");
  const waiting = list("waitingApproval");
  const paid = list("paidInvoices");
  const revenue = card(t, /^revenue$/i);
  const totalStudents = card(t, /total students/i);
  const activeCard = card(t, /active subscriptions/i);
  const pendingCard = card(t, /pending.*total/i) ?? card(t, /bank.*pending/i);
  const differs = (a?: number | null, b?: number | null) => a !== null && a !== undefined && b !== null && b !== undefined && a !== b;
  return (
    <section className="space-y-2" aria-label="Noor totals" data-noor-totals>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Noor</span>
        <span data-noor-totals-source={t.source}>
          {t.source === "saved" ? "From the saved copy, collected" : "Read from Noor"} {new Date(t.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        {t.canRefresh && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void load(true)} data-noor-totals-refresh>
            <RefreshCwIcon className={busy ? "animate-spin" : ""} /> Read Noor now
          </Button>
        )}
        {t.errors.length > 0 && <span className="text-amber-600">Some figures could not be read: {t.errors.join("; ")}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {students && <MetricCard label="Students" value={n(students.total)} hint={differs(students.total, totalStudents?.number) ? `Noor's dashboard card: ${n(totalStudents!.number)}` : "In Noor's list"} href="/legacy-cms?view=live&category=students" />}
        {parents && <MetricCard label="Parents" value={n(parents.total)} hint="In Noor's list" href="/legacy-cms?view=live&category=parents" />}
        {active && <MetricCard label="Active subscriptions" value={n(active.total)} hint={differs(active.total, activeCard?.number) ? `Noor's dashboard card: ${n(activeCard!.number)}` : "Status Active"} />}
        {revenue && <MetricCard label="Revenue" value={revenue.value} hint={revenue.description ? `${revenue.description}, bank and Chapa` : "Bank and Chapa"} tone="success" />}
        {waiting && (
          <MetricCard
            label="Waiting for approval"
            value={n(waiting.total)}
            hint={differs(waiting.total, pendingCard?.number) ? `In Noor's list. Noor's card and menu say ${n(pendingCard!.number)}` : "Bank receipts to review"}
            tone={waiting.total ? "warning" : "default"}
            href="/legacy-cms?view=revenue"
          />
        )}
        {paid && <MetricCard label="Paid invoices" value={n(paid.total)} hint="In Noor's list" />}
      </div>
    </section>
  );
}
