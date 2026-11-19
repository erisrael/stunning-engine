"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MetricCard } from "@/components/app/primitives";
import { saveCompanyIncomeConfigAction } from "@/app/actions/finance";
import type { CompanyIncome, CompanyIncomeConfig } from "@/server/company-income";

const fmt = (cur: string, n: number) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

// Chapa payments and Noor invoice revenue on the Company overview, from stored data (no trip to Noor or Chapa).
export function CompanyIncomePanel({ data, compact = false }: { data: CompanyIncome; compact?: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const { chapa, noor } = data;
  const nothing = !chapa && !noor;
  if (nothing && !data.canConfigure) return null;
  const maxMonth = Math.max(1, ...(chapa?.byMonth ?? []).map((m) => m.amount), ...(noor?.byMonth ?? []).map((m) => m.paidAmount));
  const months = [...new Set([...(chapa?.byMonth ?? []).map((m) => m.month), ...(noor?.byMonth ?? []).map((m) => m.month)])].sort();
  return (
    <Card data-company-income>
      <CardHeader>
        <CardTitle>Online income: Chapa and Noor</CardTitle>
        <CardDescription>
          {data.range.from} to {data.range.to}. Read from stored data; Chapa synced {when(chapa?.lastSyncAt ?? null)}, Noor figures updated {when(noor?.updatedAt ?? null)}.
        </CardDescription>
        {data.canConfigure && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Settings2Icon /> Choose what shows
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {nothing && <p className="text-sm text-muted-foreground">Chapa and Noor are both switched off for this overview.</p>}
        {chapa && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Chapa payments</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(chapa.success.length ? chapa.success : [{ currency: "ETB", amount: 0, count: 0 }]).map((m) => (
                <MetricCard key={m.currency} label={`Received (${m.count} paid)`} value={fmt(m.currency, m.amount)} />
              ))}
              <MetricCard label="Pending" value={String(chapa.pending)} />
              <MetricCard label="Failed" value={String(chapa.failed)} />
              {chapa.refunded.map((m) => <MetricCard key={`r${m.currency}`} label="Refunded" value={fmt(m.currency, m.amount)} />)}
            </div>
            {!compact && chapa.byBusiness.length > 1 && (
              <ul className="divide-y rounded-md border text-sm">
                {chapa.byBusiness.map((b) => (
                  <li key={b.id + b.currency} className="flex justify-between px-3 py-1.5">
                    <span>{b.name}</span>
                    <span className="tabular-nums">{fmt(b.currency, b.amount)} · {b.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {noor && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Noor (Legacy CMS) invoices</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label={`Paid (${noor.paid})`} value={fmt("ETB", noor.paidAmount)} />
              <MetricCard label={`Pending (${noor.pending})`} value={fmt("ETB", noor.pendingAmount)} />
              <MetricCard label="Failed" value={String(noor.failed)} />
              <MetricCard label="Days with figures" value={String(noor.days)} />
            </div>
            {noor.days === 0 && <p className="text-xs text-muted-foreground">No stored Noor figures for this range yet. They are filled each night, or from Legacy CMS, Growth.</p>}
          </div>
        )}
        {!compact && months.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">By month</p>
            {months.map((m) => {
              const c = (chapa?.byMonth ?? []).filter((x) => x.month === m).reduce((a, x) => a + x.amount, 0);
              const n = (noor?.byMonth ?? []).find((x) => x.month === m)?.paidAmount ?? 0;
              return (
                <div key={m} className="grid grid-cols-[4.5rem_1fr_9rem] items-center gap-2 text-xs">
                  <span className="tabular-nums">{m}</span>
                  <div className="space-y-0.5">
                    {chapa && <div className="h-2 rounded bg-primary" style={{ width: `${(c / maxMonth) * 100}%` }} title={`Chapa ${fmt("ETB", c)}`} />}
                    {noor && <div className="h-2 rounded bg-[var(--st-paused-fg)]" style={{ width: `${(n / maxMonth) * 100}%` }} title={`Noor ${fmt("ETB", n)}`} />}
                  </div>
                  <span className="text-right tabular-nums text-muted-foreground">{chapa ? `C ${Math.round(c).toLocaleString()}` : ""} {noor ? `N ${Math.round(n).toLocaleString()}` : ""}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-3 text-sm">
          {chapa && <Link className="underline underline-offset-2" href="/finance/chapa">Open Chapa</Link>}
          {noor && <Link className="underline underline-offset-2" href="/legacy-cms?view=revenue">Open Noor revenue</Link>}
        </div>
      </CardContent>
      {editing && <IncomeConfigDialog config={data.config} businesses={data.businesses} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function IncomeConfigDialog({ config, businesses, onClose }: { config: CompanyIncomeConfig; businesses: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const save = async () => {
    const r = await saveCompanyIncomeConfigAction(c);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Saved");
    onClose();
    router.refresh();
  };
  const row = (key: "chapa" | "noor" | "onOverall", label: string) => (
    <label className="flex items-center gap-2">
      <Checkbox checked={c[key]} onCheckedChange={(v) => setC({ ...c, [key]: v === true })} /> {label}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Online income on the Company overview</DialogTitle>
          <DialogDescription>Owners and Finance see these figures without opening Chapa or Noor. Only stored data is read.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {row("chapa", "Show Chapa payments")}
          {row("noor", "Show Noor invoice revenue")}
          {row("onOverall", "Also show a summary on the Overall view")}
          {businesses.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Chapa businesses counted</p>
              {businesses.map((b) => (
                <label key={b.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={!c.excludeBusinesses.includes(b.id)}
                    onCheckedChange={(v) => setC({ ...c, excludeBusinesses: v === true ? c.excludeBusinesses.filter((x) => x !== b.id) : [...c.excludeBusinesses, b.id] })}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
