"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, DownloadIcon, KeyRoundIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountingExportAction, createTokenAction, revokeTokenAction, saveAccountingMapAction } from "@/app/actions/integrations";
import type { ApiToken, Dataset } from "@/server/feeds";
import type { AccountingFormat, AccountingMap } from "@/server/accounting";

const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"));

// ---------------------------------------------------------------------------
// Admin, Integrations: API keys and ready-to-paste links for Power BI and Excel
// ---------------------------------------------------------------------------

export function IntegrationsAdmin({ tokens, datasets, origin }: { tokens: ApiToken[]; datasets: Record<Dataset, string>; origin: string }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("Power BI");
  const [picked, setPicked] = React.useState<Dataset[]>(["production_parts", "dept_tasks"]);
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    const r = await createTokenAction({ name, datasets: picked });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setFresh(r.data as string);
    router.refresh();
  };
  const url = (d: string, key: string, fmt: "csv" | "json") => `${origin}/api/feeds/${d}?key=${key}${fmt === "csv" ? "&format=csv" : ""}`;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <Card>
        <CardHeader>
          <CardTitle>API keys for data feeds</CardTitle>
          <CardDescription>Power BI, Excel, Google Sheets and other tools read live data with a key. Each key covers the datasets you choose, and only what you can see yourself.</CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => (setFresh(null), setCreating(true))}>
              <PlusIcon /> New key
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Datasets</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id} className={t.revokedAt ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {t.prefix}… · {t.createdBy ?? "?"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{t.datasets.join(", ")}</TableCell>
                  <TableCell className="text-xs">{t.revokedAt ? "Revoked" : t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}</TableCell>
                  <TableCell className="text-right">
                    {!t.revokedAt && (
                      <Button size="xs" variant="ghost" onClick={async () => {
                        const r = await revokeTokenAction(t.id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Revoked. Tools using it stop at their next refresh.");
                        router.refresh();
                      }}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!tokens.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No keys yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connect Power BI</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Create a key here and copy a feed link.</li>
            <li>In Power BI Desktop: Get data, Web, paste the link (the CSV link loads as a table directly).</li>
            <li>Choose Anonymous access; the key is in the link.</li>
            <li>Publish the report and set a scheduled refresh in the Power BI service.</li>
            <li>Excel: Data, From Web, paste the same link. Google Sheets: =IMPORTDATA(&quot;link&quot;).</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Treat a key like a password. Revoke it if it leaks; tools using it stop at their next refresh.</p>
        </CardContent>
      </Card>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{fresh ? "Copy your links now" : "New API key"}</DialogTitle>
            <DialogDescription>{fresh ? "The key is shown only once. Copy the links you need." : "Name it after where it is used."}</DialogDescription>
          </DialogHeader>
          {fresh ? (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Input readOnly value={fresh} className="font-mono text-xs" aria-label="API key" />
                <Button size="icon" variant="outline" aria-label="Copy key" onClick={() => copy(fresh)}>
                  <CopyIcon />
                </Button>
              </div>
              {picked.map((d) => (
                <div key={d} className="space-y-1">
                  <p className="text-xs font-medium">{datasets[d]}</p>
                  <div className="flex gap-2">
                    <Input readOnly value={url(d, fresh, "csv")} className="font-mono text-[11px]" aria-label={`${d} link`} />
                    <Button size="icon" variant="outline" aria-label="Copy link" onClick={() => copy(url(d, fresh, "csv"))}>
                      <CopyIcon />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="tok-name">Name</Label>
                <Input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Datasets</Label>
                {(Object.keys(datasets) as Dataset[]).map((d) => (
                  <label key={d} className="flex items-center gap-2">
                    <Checkbox checked={picked.includes(d)} onCheckedChange={(v) => setPicked(v === true ? [...picked, d] : picked.filter((x) => x !== d))} /> {datasets[d]}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            {fresh ? (
              <Button onClick={() => setCreating(false)}>Done</Button>
            ) : (
              <Button onClick={create} disabled={busy || !picked.length || !name.trim()}>
                <KeyRoundIcon /> Create key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A Finance department's Accounting tab: export paid items to Sage 50 (Peachtree), QuickBooks or Xero
// ---------------------------------------------------------------------------

export function FinanceAccounting({ dept, map, types, formats, canConfigure }: { dept: string; map: AccountingMap; types: { key: string; label: string }[]; formats: Record<AccountingFormat, string>; canConfigure: boolean }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const first = `${today.slice(0, 8)}01`;
  const [f, setF] = React.useState({ format: "sage50_disbursements" as AccountingFormat, from: first, to: today });
  const [m, setM] = React.useState(map);
  const [vendors, setVendors] = React.useState(Object.entries(map.vendorIds).map(([k, v]) => `${k} = ${v}`).join("\n"));
  const [busy, setBusy] = React.useState(false);
  const exportNow = async () => {
    setBusy(true);
    const r = await accountingExportAction(dept, f);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const d = r.data as { csv: string; count: number; total: number; missingVendor: string[] };
    if (!d.count) return void toast.info("No paid items in this period.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([d.csv], { type: "text/csv" }));
    a.download = `${dept}-${f.format}-${f.from}-to-${f.to}.csv`;
    a.click();
    toast.success(`${d.count} paid items, total ${d.total.toLocaleString()}`, {
      description: d.missingVendor.length ? `No vendor ID mapped for: ${d.missingVendor.slice(0, 5).join(", ")}. The payee name was used.` : undefined,
      duration: 10000,
    });
  };
  const saveMap = async () => {
    const vendorIds = Object.fromEntries(
      vendors
        .split("\n")
        .map((l) => l.split("="))
        .filter((p) => p.length === 2)
        .map(([a, b]) => [a!.trim(), b!.trim()]),
    );
    const r = await saveAccountingMapAction(dept, { ...m, vendorIds });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Mapping saved");
    router.refresh();
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Export to accounting</CardTitle>
          <CardDescription>Paid items in the period become journal lines. In Sage 50: File, Select Import/Export, choose the journal, then Import and match the columns once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Select value={f.format} onValueChange={(v) => setF({ ...f, format: v as AccountingFormat })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(formats) as AccountingFormat[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {formats[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-from">Paid from</Label>
              <Input id="acc-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-to">Paid to</Label>
              <Input id="acc-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
          </div>
          <Button onClick={exportNow} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Download CSV
          </Button>
          <p className="text-xs text-muted-foreground">
            For Power BI dashboards of payments, Admin creates a key for the Finance dataset in{" "}
            <Link href="/admin?tab=integrations" className="underline">
              Admin, Integrations
            </Link>
            .
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account mapping</CardTitle>
          <CardDescription>The accounts in your chart of accounts that each kind of item posts to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-cash">Cash or bank account</Label>
              <Input id="acc-cash" value={m.cashAccount} disabled={!canConfigure} onChange={(e) => setM({ ...m, cashAccount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-gl">Default expense account</Label>
              <Input id="acc-gl" value={m.defaultGl} disabled={!canConfigure} onChange={(e) => setM({ ...m, defaultGl: e.target.value })} />
            </div>
            {types.map((t) => (
              <div key={t.key} className="space-y-1.5">
                <Label htmlFor={`acc-${t.key}`}>{t.label} account</Label>
                <Input id={`acc-${t.key}`} value={m.glByType[t.key] ?? ""} placeholder={m.defaultGl} disabled={!canConfigure} onChange={(e) => setM({ ...m, glByType: { ...m.glByType, [t.key]: e.target.value } })} />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-vendors">Vendor IDs (one per line: Payee name = Vendor ID)</Label>
            <Textarea id="acc-vendors" rows={4} value={vendors} disabled={!canConfigure} onChange={(e) => setVendors(e.target.value)} placeholder={"Ethio Telecom = ETHTEL\nAddis Stationery = ADDSTA"} />
          </div>
          {canConfigure && <Button onClick={saveMap}>Save mapping</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
