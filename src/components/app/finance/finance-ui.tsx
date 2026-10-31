"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, ClockIcon, DownloadIcon, LockIcon, PaperclipIcon, PencilIcon, PlusIcon, UnlockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/app/actions/finance";
import type { TxRow } from "@/server/finance";
import {
  ACCOUNT_KINDS,
  BILL_STATUSES,
  BUDGET_SCOPES,
  CLAIM_STATUSES,
  INVOICE_STATUSES,
  LEDGER_TYPES,
  PARTY_KINDS,
  PAYROLL_STATUSES,
  PURCHASE_STATUSES,
  type FinanceSettings,
  type PayLine,
} from "@/lib/finance";
import { cn } from "@/lib/utils";
import { FormDialog, Status, fmt, useRun, type FieldSpec, type Opt } from "./fin-kit";

import { FIN_TABS, type FinTab } from "@/lib/finance";
export type { FinTab };
const TAB_LABELS: Record<FinTab, string> = {
  overview: "Overview",
  transactions: "Transactions",
  bills: "Bills",
  invoices: "Invoices",
  claims: "Expense claims",
  purchasing: "Purchasing",
  budgets: "Budgets",
  payroll: "Payroll",
  parties: "Vendors and customers",
  accounts: "Accounts",
  reports: "Reports",
  settings: "Settings",
};

export type Rights = { access: boolean; approve: boolean; payroll: boolean; view: boolean; ownerApprove: boolean };
type Ctx = { rights: Rights; cur: string; accounts: Opt[]; parties: { id: string; name: string; kind: string }[]; ledger: Opt[]; departments: Opt[]; today: string };

const recs = <T extends string>(o: Record<T, string>): Opt[] => Object.entries(o).map(([value, label]) => ({ value, label: label as string }));

function useGo() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
    router.push(`${pathname}?${n}`);
  };
}

// The money-out dialog shared by bills, claims and payroll: which account, which date.
function payFields(ctx: Ctx): FieldSpec[] {
  return [
    { key: "accountId", label: "Pay from", type: "select", options: ctx.accounts, placeholder: "Choose an account" },
    { key: "date", label: "Date", type: "date" },
  ];
}

export function FinanceHome(props: {
  tab: FinTab;
  ctx: Ctx;
  // Data for the open tab (loaded by the page).
  data: Record<string, unknown>;
}) {
  const go = useGo();
  const { tab, ctx } = props;
  const show = (t: FinTab) => (t === "payroll" ? ctx.rights.payroll || ctx.rights.ownerApprove : t === "settings" ? ctx.rights.approve || ctx.rights.access : ctx.rights.view);
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => go({ tab: v === "overview" ? null : v })}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {FIN_TABS.filter(show).map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "overview" && <Overview ctx={ctx} d={props.data.overview as OverviewData} />}
      {tab === "transactions" && <Transactions ctx={ctx} rows={props.data.rows as TxRow[]} />}
      {tab === "bills" && <Bills ctx={ctx} rows={props.data.rows as BillRow[]} />}
      {tab === "invoices" && <Invoices ctx={ctx} rows={props.data.rows as InvoiceRow[]} />}
      {tab === "claims" && <Claims ctx={ctx} rows={props.data.rows as ClaimRow[]} />}
      {tab === "purchasing" && <Purchasing ctx={ctx} rows={props.data.rows as PurchaseRow[]} />}
      {tab === "budgets" && <Budgets ctx={ctx} rows={props.data.rows as BudgetRow[]} year={props.data.year as number} />}
      {tab === "payroll" && <Payroll ctx={ctx} runs={props.data.runs as RunRow[]} structures={props.data.structures as StructureRow[]} open={props.data.open as SlipRow[] | null} openId={props.data.openId as string | null} />}
      {tab === "parties" && <Parties ctx={ctx} rows={props.data.rows as PartyRow[]} />}
      {tab === "accounts" && <Accounts ctx={ctx} rows={props.data.rows as AccountRow[]} />}
      {tab === "reports" && <Reports ctx={ctx} d={props.data as ReportData} />}
      {tab === "settings" && <SettingsTab ctx={ctx} settings={props.data.settings as FinanceSettings} ledger={props.data.ledger as LedgerRow[]} periods={props.data.periods as PeriodRow[]} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type OverviewData = {
  cash: number;
  accounts: AccountRow[];
  month: { revenue: number; expenses: number; payroll: number };
  year: { revenue: number; expenses: number; payroll: number; byMonth: { month: string; revenue: number; expenses: number }[] };
  billsDue: { id: string; description: string | null; vendor: string | null; amount: number; due_date: string | null; status: string }[];
  receivable: { id: string; number: string; customer: string | null; amount: number; due_date: string | null }[];
  owed: number;
  toCollect: number;
  claimsWaiting: number;
  purchasesWaiting: number;
  payrollOpen: number;
  budgets: { label: string; amount: number; spent: number }[];
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular", tone === "good" && "text-[var(--st-done-fg)]", tone === "bad" && "text-[var(--st-blocked-fg)]")}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Overview({ ctx, d }: { ctx: Ctx; d: OverviewData }) {
  const net = d.year.revenue - d.year.expenses;
  const max = Math.max(1, ...d.year.byMonth.flatMap((m) => [m.revenue, m.expenses]));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash in all accounts" value={fmt(d.cash, ctx.cur)} />
        <Stat label="This month in" value={fmt(d.month.revenue, ctx.cur)} hint={`Out ${fmt(d.month.expenses, ctx.cur)}`} />
        <Stat label="This year, net" value={fmt(net, ctx.cur)} tone={net >= 0 ? "good" : "bad"} hint={`In ${fmt(d.year.revenue)} · out ${fmt(d.year.expenses)} (payroll ${fmt(d.year.payroll)})`} />
        <Stat label="We owe / are owed" value={`${fmt(d.owed)} / ${fmt(d.toCollect)}`} hint={`${d.claimsWaiting} claims and ${d.purchasesWaiting} purchases waiting${d.payrollOpen ? ` · payroll open` : ""}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Money in and out by month</CardTitle>
          </CardHeader>
          <CardContent>
            {d.year.byMonth.length ? (
              <div className="flex h-48 items-stretch gap-3">
                {d.year.byMonth.map((m) => (
                  <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1" title={`${m.month}: in ${fmt(m.revenue)}, out ${fmt(m.expenses)}`}>
                    <div className="flex w-full flex-1 items-end justify-center gap-1">
                      <div className="w-1/3 rounded-t bg-[var(--st-done-fg)]" style={{ height: `${(m.revenue / max) * 100}%` }} />
                      <div className="w-1/3 rounded-t bg-[var(--st-blocked-fg)]/70" style={{ height: `${(m.expenses / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing recorded this year yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {d.accounts.filter((a) => a.active).map((a) => (
              <div key={a.id} className="flex justify-between">
                <span>{a.name}</span>
                <span className="font-medium tabular">{fmt(a.balance)}</span>
              </div>
            ))}
            {!d.accounts.length && <p className="text-muted-foreground">Add your bank and cash accounts in Accounts.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bills to approve or pay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {d.billsDue.map((b) => (
              <div key={b.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {b.vendor ?? b.description ?? "Bill"} {b.due_date && <span className="text-xs text-muted-foreground">due {b.due_date}</span>}
                </span>
                <span className="tabular">{fmt(b.amount)}</span>
              </div>
            ))}
            {!d.billsDue.length && <p className="text-muted-foreground">Nothing waiting.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoices to collect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {d.receivable.map((i) => (
              <div key={i.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {i.number} · {i.customer ?? "Customer"} {i.due_date && i.due_date < ctx.today && <span className="text-xs text-[var(--st-blocked-fg)]">overdue</span>}
                </span>
                <span className="tabular">{fmt(i.amount)}</span>
              </div>
            ))}
            {!d.receivable.length && <p className="text-muted-foreground">Nothing outstanding.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Budgets this year</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.budgets.map((b) => {
              const p = Math.round((b.spent / Math.max(1, b.amount)) * 100);
              return (
                <div key={b.label}>
                  <div className="flex justify-between text-xs">
                    <span>{b.label}</span>
                    <span className={cn("tabular", p >= 100 ? "text-[var(--st-blocked-fg)]" : p >= 80 && "text-[var(--st-paused-fg)]")}>{p}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full", p >= 100 ? "bg-[var(--st-blocked-fg)]" : "bg-primary")} style={{ width: `${Math.min(100, p)}%` }} />
                  </div>
                </div>
              );
            })}
            {!d.budgets.length && <p className="text-muted-foreground">No budgets set.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function Transactions({ ctx, rows }: { ctx: Ctx; rows: TxRow[] }) {
  const params = useSearchParams();
  const go = useGo();
  const { go: run } = useRun();
  const [dialog, setDialog] = React.useState<"in" | "out" | "transfer" | null>(null);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const txFields = (dir: "in" | "out"): FieldSpec[] => [
    { key: "date", label: "Date", type: "date" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "accountId", label: dir === "in" ? "Into" : "From", type: "select", options: ctx.accounts, placeholder: "Choose" },
    { key: "ledgerCode", label: "Ledger account", type: "select", options: ctx.ledger, placeholder: "Choose" },
    { key: "partyId", label: dir === "in" ? "From (customer)" : "To (vendor)", type: "select", options: ctx.parties.map((p) => ({ value: p.id, label: p.name })), placeholder: "Nobody" },
    { key: "department", label: "Department", type: "select", options: ctx.departments, placeholder: "None" },
    { key: "project", label: "Project or campaign", type: "text" },
    ...(dir === "in"
      ? ([
          { key: "product", label: "Product", type: "text", placeholder: "Courses, subscriptions" },
          { key: "channel", label: "Channel", type: "text", placeholder: "Schools, app, YouTube" },
        ] as FieldSpec[])
      : []),
    { key: "description", label: "What for", type: "text", wide: true },
    { key: "reference", label: "Reference", type: "text" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>Every payment and receipt, in every account. Bills, invoices, claims and payroll post here by themselves.</CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          {ctx.rights.access && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog("in")}>
                <ArrowDownLeftIcon /> Money in
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog("out")}>
                <ArrowUpRightIcon /> Payment
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog("transfer")}>
                <ArrowLeftRightIcon /> Transfer
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" asChild>
            <a href={`/api/finance?report=transactions&from=${from}&to=${to}`}>
              <DownloadIcon /> Excel
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => go({ from: e.target.value })} className="w-40" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => go({ to: e.target.value })} className="w-40" aria-label="To" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Ledger</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.status === "void" ? "opacity-40 line-through" : ""}>
                  <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                  <TableCell>
                    {r.description ?? "-"}
                    <div className="text-xs text-muted-foreground">{[r.party, r.reference, r.source !== "manual" ? r.source : null].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>{r.account}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ledger_code}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell className="text-right tabular text-[var(--st-done-fg)]">{r.direction === "in" ? fmt(r.amount) : ""}</TableCell>
                  <TableCell className="text-right tabular">{r.direction === "out" ? fmt(r.amount) : ""}</TableCell>
                  <TableCell className="text-right">
                    {ctx.rights.approve && r.status === "posted" && ["manual", "transfer"].includes(r.source) && (
                      <Button size="xs" variant="ghost" onClick={() => window.confirm("Cancel this transaction?") && run(() => A.voidTransactionAction(r.id), "Cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No transactions in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {(dialog === "in" || dialog === "out") && (
        <FormDialog
          title={dialog === "in" ? "Record money in" : "Record a payment"}
          fields={txFields(dialog)}
          initial={{ date: ctx.today }}
          onClose={() => setDialog(null)}
          submit={(v) => A.postTransactionAction({ ...v, direction: dialog, amount: Number(v.amount) } as never)}
        />
      )}
      {dialog === "transfer" && (
        <FormDialog
          title="Move money between accounts"
          fields={[
            { key: "date", label: "Date", type: "date" },
            { key: "amount", label: "Amount", type: "number" },
            { key: "fromId", label: "From", type: "select", options: ctx.accounts },
            { key: "toId", label: "To", type: "select", options: ctx.accounts },
            { key: "description", label: "Note", type: "text", wide: true },
          ]}
          initial={{ date: ctx.today }}
          onClose={() => setDialog(null)}
          submit={(v) => A.transferAction({ ...v, amount: Number(v.amount) } as never)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

type BillRow = { id: string; vendor: string | null; vendor_id: string | null; number: string | null; date: string; due_date: string | null; amount: number; ledger_code: string | null; department: string | null; project: string | null; description: string | null; status: string; recurring: string | null; file_name: string | null; created_by_name: string | null; approved_by_name: string | null };

function Bills({ ctx, rows }: { ctx: Ctx; rows: BillRow[] }) {
  const { go } = useRun();
  const [edit, setEdit] = React.useState<BillRow | "new" | null>(null);
  const [paying, setPaying] = React.useState<BillRow | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bills</CardTitle>
        <CardDescription>What we owe. Whoever records a bill does not approve it; amounts above the limit need the Finance Manager.</CardDescription>
        {ctx.rights.access && (
          <CardAction>
            <Button size="sm" onClick={() => setEdit("new")}>
              <PlusIcon /> New bill
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    {b.vendor ?? "-"}
                    {b.number && <div className="text-xs text-muted-foreground">#{b.number}</div>}
                  </TableCell>
                  <TableCell className="max-w-72">
                    {b.description}
                    <div className="text-xs text-muted-foreground">
                      {[b.department, b.ledger_code, b.recurring && "monthly", b.created_by_name && `by ${b.created_by_name}`, b.approved_by_name && `approved by ${b.approved_by_name}`].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{b.date}</TableCell>
                  <TableCell className={cn("whitespace-nowrap", b.due_date && b.due_date < ctx.today && b.status !== "paid" && "text-[var(--st-blocked-fg)]")}>{b.due_date ?? "-"}</TableCell>
                  <TableCell className="text-right tabular">{fmt(b.amount)}</TableCell>
                  <TableCell>
                    <Status s={b.status} labels={BILL_STATUSES} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {b.file_name && (
                      <Button size="icon-xs" variant="ghost" asChild aria-label="Attachment">
                        <a href={`/api/finance?bill=${b.id}`}>
                          <PaperclipIcon />
                        </a>
                      </Button>
                    )}
                    {b.status === "awaiting_approval" && ctx.rights.access && (
                      <>
                        <Button size="xs" onClick={() => go(() => A.approveBillAction(b.id, true), "Approved")}>
                          Approve
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => go(() => A.approveBillAction(b.id, false), "Cancelled")}>
                          Cancel
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEdit(b)}>
                          <PencilIcon />
                        </Button>
                      </>
                    )}
                    {b.status === "approved" && ctx.rights.access && (
                      <Button size="xs" onClick={() => setPaying(b)}>
                        Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No bills yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {edit && (
        <FormDialog
          title={edit === "new" ? "New bill" : "Edit bill"}
          fields={[
            { key: "vendorId", label: "Vendor", type: "select", options: ctx.parties.filter((p) => p.kind !== "customer").map((p) => ({ value: p.id, label: p.name })), placeholder: "Choose" },
            { key: "number", label: "Their invoice number", type: "text" },
            { key: "date", label: "Bill date", type: "date" },
            { key: "dueDate", label: "Due", type: "date" },
            { key: "amount", label: "Amount", type: "number" },
            { key: "ledgerCode", label: "Ledger account", type: "select", options: ctx.ledger, placeholder: "General expenses" },
            { key: "department", label: "Department", type: "select", options: ctx.departments, placeholder: "None" },
            { key: "project", label: "Project or campaign", type: "text" },
            { key: "description", label: "What for", type: "text", wide: true },
            { key: "recurring", label: "Comes back every month (rent, internet)", type: "check" },
            ...(edit === "new" ? ([{ key: "file", label: "Their invoice (PDF or photo)", type: "file" }] as FieldSpec[]) : []),
          ]}
          initial={
            edit === "new"
              ? { date: ctx.today }
              : { vendorId: edit.vendor_id, number: edit.number, date: edit.date, dueDate: edit.due_date, amount: edit.amount, ledgerCode: edit.ledger_code, department: edit.department, project: edit.project, description: edit.description, recurring: !!edit.recurring }
          }
          onClose={() => setEdit(null)}
          submit={(v) => A.saveBillAction({ ...v, id: edit === "new" ? null : edit.id, amount: Number(v.amount), recurring: v.recurring ? "monthly" : null } as never)}
        />
      )}
      {paying && <FormDialog title={`Pay ${paying.vendor ?? "bill"}: ${fmt(paying.amount, ctx.cur)}`} fields={[...payFields(ctx), { key: "reference", label: "Cheque or transfer reference", type: "text" }]} initial={{ date: ctx.today }} okLabel="Pay" onClose={() => setPaying(null)} submit={(v) => A.payBillAction(paying.id, v as never)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

type InvoiceRow = { id: string; number: string; customer: string | null; customer_id: string | null; date: string; due_date: string | null; lines: string; amount: number; vat: number; product: string | null; channel: string | null; department: string | null; status: string };

function Invoices({ ctx, rows }: { ctx: Ctx; rows: InvoiceRow[] }) {
  const { go } = useRun();
  const [edit, setEdit] = React.useState<InvoiceRow | "new" | null>(null);
  const [receiving, setReceiving] = React.useState<InvoiceRow | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>What customers owe us. Paid invoices count as revenue by product and channel.</CardDescription>
        {ctx.rights.access && (
          <CardAction>
            <Button size="sm" onClick={() => setEdit("new")}>
              <PlusIcon /> New invoice
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.number}</TableCell>
                  <TableCell>
                    {i.customer ?? "-"}
                    <div className="text-xs text-muted-foreground">{[i.product, i.channel].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>{i.date}</TableCell>
                  <TableCell className={cn(i.due_date && i.due_date < ctx.today && i.status === "sent" && "text-[var(--st-blocked-fg)]")}>{i.due_date ?? "-"}</TableCell>
                  <TableCell className="text-right tabular">
                    {fmt(i.amount)}
                    {Number(i.vat) > 0 && <div className="text-xs text-muted-foreground">VAT {fmt(i.vat)}</div>}
                  </TableCell>
                  <TableCell>
                    <Status s={i.status} labels={INVOICE_STATUSES} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {i.status === "draft" && ctx.rights.access && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => go(() => A.setInvoiceStatusAction(i.id, "sent"), "Marked sent")}>
                          Mark sent
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEdit(i)}>
                          <PencilIcon />
                        </Button>
                      </>
                    )}
                    {["draft", "sent"].includes(i.status) && ctx.rights.access && (
                      <Button size="xs" onClick={() => setReceiving(i)}>
                        Paid
                      </Button>
                    )}
                    {["draft", "sent"].includes(i.status) && ctx.rights.approve && (
                      <Button size="xs" variant="ghost" onClick={() => window.confirm("Cancel this invoice?") && go(() => A.setInvoiceStatusAction(i.id, "void"), "Cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {edit && (
        <FormDialog
          title={edit === "new" ? "New invoice" : `Edit ${edit.number}`}
          fields={[
            { key: "customerId", label: "Customer", type: "select", options: ctx.parties.filter((p) => p.kind !== "vendor").map((p) => ({ value: p.id, label: p.name })), placeholder: "Choose" },
            { key: "date", label: "Date", type: "date" },
            { key: "dueDate", label: "Due", type: "date" },
            { key: "product", label: "Product", type: "text", placeholder: "Courses, subscriptions" },
            { key: "channel", label: "Channel", type: "text", placeholder: "Schools, app, partners" },
            { key: "department", label: "Department", type: "select", options: ctx.departments, placeholder: "None" },
            { key: "withVat", label: "Add VAT", type: "check" },
            { key: "lines", label: "Lines", type: "lines" },
          ]}
          initial={edit === "new" ? { date: ctx.today, withVat: true } : { customerId: edit.customer_id, date: edit.date, dueDate: edit.due_date, product: edit.product, channel: edit.channel, department: edit.department, withVat: Number(edit.vat) > 0, lines: JSON.parse(edit.lines) }}
          onClose={() => setEdit(null)}
          submit={(v) => A.saveInvoiceAction({ ...v, id: edit === "new" ? null : edit.id } as never)}
        />
      )}
      {receiving && (
        <FormDialog
          title={`Payment for ${receiving.number}: ${fmt(receiving.amount, ctx.cur)}`}
          fields={[{ key: "accountId", label: "Received into", type: "select", options: ctx.accounts, placeholder: "Choose" }, { key: "date", label: "Date", type: "date" }, { key: "reference", label: "Reference", type: "text" }]}
          initial={{ date: ctx.today }}
          okLabel="Record payment"
          onClose={() => setReceiving(null)}
          submit={(v) => A.receiveInvoiceAction(receiving.id, v as never)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Expense claims (the Finance side; people claim from Claims and pay)
// ---------------------------------------------------------------------------

type ClaimRow = { id: string; name: string; date: string; amount: number; ledger_code: string | null; department: string | null; description: string; receipt_name: string | null; status: string; note: string | null; created_at: string; user_id: string };

function Claims({ ctx, rows }: { ctx: Ctx; rows: ClaimRow[] }) {
  const { go } = useRun();
  const [paying, setPaying] = React.useState<ClaimRow | null>(null);
  const [rejecting, setRejecting] = React.useState<ClaimRow | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense claims</CardTitle>
        <CardDescription>Claims approved by the line manager come here; Finance checks the receipt, approves and pays.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="max-w-72">
                    {c.description}
                    <div className="text-xs text-muted-foreground">{[c.department, c.ledger_code, c.note].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>{c.date}</TableCell>
                  <TableCell className="text-right tabular">{fmt(c.amount)}</TableCell>
                  <TableCell>
                    <Status s={c.status} labels={CLAIM_STATUSES} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {c.receipt_name && (
                      <Button size="icon-xs" variant="ghost" asChild aria-label="Receipt">
                        <a href={`/api/finance?receipt=${c.id}`}>
                          <PaperclipIcon />
                        </a>
                      </Button>
                    )}
                    {c.status === "lead_approved" && ctx.rights.access && (
                      <>
                        <Button size="xs" onClick={() => go(() => A.decideClaimAction(c.id, { approve: true }), "Approved")}>
                          Approve
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setRejecting(c)}>
                          Not approve
                        </Button>
                      </>
                    )}
                    {c.status === "approved" && ctx.rights.access && (
                      <Button size="xs" onClick={() => setPaying(c)}>
                        Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No claims yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {paying && <FormDialog title={`Pay ${paying.name}: ${fmt(paying.amount, ctx.cur)}`} fields={payFields(ctx)} initial={{ date: ctx.today }} okLabel="Pay" onClose={() => setPaying(null)} submit={(v) => A.payClaimAction(paying.id, v as never)} />}
      {rejecting && <FormDialog title="Why not?" fields={[{ key: "note", label: "Reason (they are told)", type: "textarea" }]} okLabel="Not approve" onClose={() => setRejecting(null)} submit={(v) => A.decideClaimAction(rejecting.id, { approve: false, note: String(v.note ?? "") })} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

type PurchaseRow = { id: string; number: string; requester: string | null; department: string | null; title: string; lines: string; estimate: number; vendor: string | null; status: string; note: string | null; received_note: string | null; created_at: string };

function Purchasing({ ctx, rows }: { ctx: Ctx; rows: PurchaseRow[] }) {
  const { go } = useRun();
  const [step, setStep] = React.useState<{ row: PurchaseRow; step: "reject" | "order" | "bill" } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchasing</CardTitle>
        <CardDescription>Requests from the teams: approve, order from a vendor, confirm delivery, then bill. A bill far from the approved amount is flagged.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{p.number}</span> {p.title}
                    <div className="text-xs text-muted-foreground">{(JSON.parse(p.lines) as { description: string; qty: number }[]).map((l) => `${l.qty} × ${l.description}`).join(", ")}</div>
                    {(p.note || p.received_note) && <div className="text-xs text-muted-foreground">{[p.note, p.received_note].filter(Boolean).join(" · ")}</div>}
                  </TableCell>
                  <TableCell>
                    {p.requester}
                    <div className="text-xs text-muted-foreground">{p.department}</div>
                  </TableCell>
                  <TableCell>{p.vendor ?? "-"}</TableCell>
                  <TableCell className="text-right tabular">{fmt(p.estimate)}</TableCell>
                  <TableCell>
                    <Status s={p.status} labels={PURCHASE_STATUSES} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {ctx.rights.access && p.status === "submitted" && (
                      <>
                        <Button size="xs" onClick={() => go(() => A.movePurchaseAction(p.id, { step: "approve" }), "Approved")}>
                          Approve
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setStep({ row: p, step: "reject" })}>
                          Not approve
                        </Button>
                      </>
                    )}
                    {ctx.rights.access && p.status === "approved" && (
                      <Button size="xs" onClick={() => setStep({ row: p, step: "order" })}>
                        Order
                      </Button>
                    )}
                    {ctx.rights.access && p.status === "ordered" && (
                      <Button size="xs" variant="outline" onClick={() => go(() => A.movePurchaseAction(p.id, { step: "receive" }), "Delivery confirmed")}>
                        Received
                      </Button>
                    )}
                    {ctx.rights.access && p.status === "received" && (
                      <Button size="xs" onClick={() => setStep({ row: p, step: "bill" })}>
                        Record bill
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No requests yet. People ask from Claims and pay, Purchase requests.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {step?.step === "reject" && <FormDialog title="Why not?" fields={[{ key: "note", label: "Reason (they are told)", type: "textarea" }]} okLabel="Not approve" onClose={() => setStep(null)} submit={(v) => A.movePurchaseAction(step.row.id, { step: "reject", note: String(v.note ?? "") })} />}
      {step?.step === "order" && (
        <FormDialog title={`Order ${step.row.number}`} fields={[{ key: "vendorId", label: "Vendor", type: "select", options: ctx.parties.filter((p) => p.kind !== "customer").map((p) => ({ value: p.id, label: p.name })), placeholder: "Choose" }]} okLabel="Mark ordered" onClose={() => setStep(null)} submit={(v) => A.movePurchaseAction(step.row.id, { step: "order", vendorId: String(v.vendorId ?? "") || null })} />
      )}
      {step?.step === "bill" && (
        <FormDialog
          title={`Bill for ${step.row.number}`}
          description={`Approved estimate ${fmt(step.row.estimate, ctx.cur)}.`}
          fields={[{ key: "amount", label: "Amount on the vendor's invoice", type: "number" }, { key: "date", label: "Bill date", type: "date" }]}
          initial={{ amount: step.row.estimate, date: ctx.today }}
          okLabel="Record bill"
          onClose={() => setStep(null)}
          submit={(v) => A.movePurchaseAction(step.row.id, { step: "bill", amount: Number(v.amount), date: String(v.date) })}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

type BudgetRow = { id: string; scope_type: string; scope_key: string; scope_label: string; year: number; amount: number; alert_pct: number; spent: number };

function Budgets({ ctx, rows, year }: { ctx: Ctx; rows: BudgetRow[]; year: number }) {
  const go = useGo();
  const [edit, setEdit] = React.useState<BudgetRow | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets {year}</CardTitle>
        <CardDescription>Spending against the budget for each department, project, campaign or production line. Finance and the department heads are told at the alert level and at 100%.</CardDescription>
        <CardAction className="flex gap-2">
          <Input type="number" value={year} onChange={(e) => go({ year: e.target.value })} className="w-24" aria-label="Year" />
          {ctx.rights.approve && (
            <Button size="sm" onClick={() => setEdit("new")}>
              <PlusIcon /> Set budget
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((b) => {
          const p = Math.round((b.spent / Math.max(1, b.amount)) * 100);
          return (
            <div key={b.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{b.scope_label}</span>
                <span className="text-xs text-muted-foreground">{BUDGET_SCOPES[b.scope_type as keyof typeof BUDGET_SCOPES]}</span>
                <span className="ml-auto tabular">
                  {fmt(b.spent)} of {fmt(b.amount, ctx.cur)} ({p}%)
                </span>
                {ctx.rights.approve && (
                  <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEdit(b)}>
                    <PencilIcon />
                  </Button>
                )}
              </div>
              <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full", p >= 100 ? "bg-[var(--st-blocked-fg)]" : p >= b.alert_pct ? "bg-[var(--st-paused-fg)]" : "bg-primary")} style={{ width: `${Math.min(100, p)}%` }} />
                <div className="absolute top-0 h-full w-0.5 bg-foreground/40" style={{ left: `${b.alert_pct}%` }} title={`Alert at ${b.alert_pct}%`} />
              </div>
            </div>
          );
        })}
        {!rows.length && <EmptyState title="No budgets for this year" description={ctx.rights.approve ? "Press Set budget." : "The Finance Manager sets budgets."} />}
      </CardContent>
      {edit && (
        <FormDialog
          title={edit === "new" ? "Set a budget" : `Budget: ${edit.scope_label}`}
          fields={[
            { key: "scopeType", label: "For a", type: "select", options: recs(BUDGET_SCOPES) },
            { key: "scopeKey", label: "Department (for departments)", type: "select", options: ctx.departments, placeholder: "Choose" },
            { key: "project", label: "Or the project, campaign or line name", type: "text", hint: "Use the same name as on transactions and bills." },
            { key: "amount", label: "Amount for the year", type: "number" },
            { key: "alertPct", label: "Alert at (%)", type: "number" },
          ]}
          initial={edit === "new" ? { scopeType: "department", alertPct: 80 } : { scopeType: edit.scope_type, scopeKey: edit.scope_type === "department" ? edit.scope_key : "", project: edit.scope_type === "department" ? "" : edit.scope_key, amount: edit.amount, alertPct: edit.alert_pct }}
          onClose={() => setEdit(null)}
          submit={(v) => {
            const dept = v.scopeType === "department";
            const key = String(dept ? v.scopeKey : v.project) || "";
            return A.saveBudgetAction({ scopeType: String(v.scopeType), scopeKey: key, scopeLabel: dept ? (ctx.departments.find((d) => d.value === key)?.label ?? key) : key, year, amount: Number(v.amount), alertPct: Number(v.alertPct) });
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

type RunRow = { id: string; period: string; status: string; prepared: string | null; checked: string | null; approved: string | null; people: number; gross: number; net: number; tax: number; pension: number; employer: number };
type StructureRow = { employeeId: string; code: string; name: string; department: string | null; jobTitle: string | null; basic: number | null; allowances: PayLine[]; deductions: PayLine[]; bank: string | null; account: string | null };
type SlipRow = { id: string; code: string; name: string; department: string | null; basic: number; allowances: string; deductions: string; overtime_hours: number; overtime_rate: number; unpaid_days: number; gross: number; taxable: number; income_tax: number; pension_employee: number; pension_employer: number; other_deductions: number; net: number; bank_account: string | null };

function Payroll({ ctx, runs, structures, open, openId }: { ctx: Ctx; runs: RunRow[]; structures: StructureRow[]; open: SlipRow[] | null; openId: string | null }) {
  const go = useGo();
  const { go: run, busy } = useRun();
  const [newRun, setNewRun] = React.useState(false);
  const [editPay, setEditPay] = React.useState<StructureRow | null>(null);
  const [paying, setPaying] = React.useState<RunRow | null>(null);
  const [back, setBack] = React.useState<RunRow | null>(null);
  const current = runs.find((r) => r.id === openId) ?? null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Payroll runs</CardTitle>
          <CardDescription>HR or Finance prepares, the Finance Manager checks, the owner approves, Finance pays and closes the month. Tax and pension follow Finance, Settings.</CardDescription>
          {ctx.rights.payroll && (
            <CardAction>
              <Button size="sm" onClick={() => setNewRun(true)}>
                <PlusIcon /> New payroll run
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Pension (7% + 11%)</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className={cn(r.id === openId && "bg-primary/5")}>
                    <TableCell>
                      <button type="button" className="font-medium hover:underline" onClick={() => go({ run: r.id })}>
                        {r.period}
                      </button>
                      <div className="text-xs text-muted-foreground">{[r.prepared && `prepared by ${r.prepared}`, r.checked && `checked by ${r.checked}`, r.approved && `approved by ${r.approved}`].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell>
                      <Status s={r.status} labels={PAYROLL_STATUSES} />
                    </TableCell>
                    <TableCell className="text-right tabular">{r.people}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.gross)}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.tax)}</TableCell>
                    <TableCell className="text-right tabular">{fmt(Number(r.pension) + Number(r.employer))}</TableCell>
                    <TableCell className="text-right font-medium tabular">{fmt(r.net)}</TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      {r.status === "draft" && ctx.rights.approve && (
                        <Button size="xs" disabled={busy} onClick={() => run(() => A.movePayrollAction(r.id, { step: "check" }), "Checked; the owner is asked to approve")}>
                          Check
                        </Button>
                      )}
                      {r.status === "checked" && ctx.rights.ownerApprove && (
                        <Button size="xs" disabled={busy} onClick={() => run(() => A.movePayrollAction(r.id, { step: "approve" }), "Approved")}>
                          Approve
                        </Button>
                      )}
                      {["checked", "approved"].includes(r.status) && (ctx.rights.approve || ctx.rights.ownerApprove) && (
                        <Button size="xs" variant="ghost" onClick={() => setBack(r)}>
                          Send back
                        </Button>
                      )}
                      {r.status === "approved" && ctx.rights.approve && (
                        <Button size="xs" onClick={() => setPaying(r)}>
                          Pay
                        </Button>
                      )}
                      {r.status === "paid" && ctx.rights.approve && (
                        <Button size="xs" variant="outline" onClick={() => window.confirm(`Close ${r.period}? Nothing in that month can change afterwards unless it is reopened.`) && run(() => A.movePayrollAction(r.id, { step: "lock" }), "Month closed")}>
                          <LockIcon /> Close month
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!runs.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No payroll yet. Set salaries below, then start a run.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {current && open && (
        <Card>
          <CardHeader>
            <CardTitle>
              Payslips {current.period} <Status s={current.status} labels={PAYROLL_STATUSES} />
            </CardTitle>
            <CardDescription>{current.status === "draft" ? "Enter overtime hours and unpaid days; everything else is calculated." : "Locked for changes. Send it back to change it."}</CardDescription>
            <CardAction className="flex gap-2">
              {current.status === "draft" && ctx.rights.payroll && (
                <Button size="sm" variant="outline" disabled={busy} title="Overtime past the end of each shift; absent days without leave, half days and unpaid leave" onClick={() => run(() => A.fillFromAttendanceAction(current.id), "Filled from Attendance")}>
                  <ClockIcon /> Fill from Attendance
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <a href={`/api/finance?report=payroll&run=${current.id}`}>
                  <DownloadIcon /> Excel
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/api/finance?report=tax&period=${current.period}`}>
                  <DownloadIcon /> Tax and pension
                </a>
              </Button>
              {ctx.rights.approve && ["approved", "paid", "locked"].includes(current.status) && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/finance?bank=${current.id}`}>
                    <DownloadIcon /> Bank file
                  </a>
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Overtime hours</TableHead>
                    <TableHead className="text-right">Unpaid days</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Pension 7%</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {open.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {s.name}
                        <div className="text-xs text-muted-foreground">
                          {s.code}
                          {!s.bank_account && " · no bank account"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular">{fmt(s.basic)}</TableCell>
                      <TableCell className="text-right">
                        {current.status === "draft" && ctx.rights.payroll ? (
                          <Input type="number" defaultValue={Number(s.overtime_hours)} className="ml-auto h-7 w-20 text-right" aria-label={`Overtime hours for ${s.name}`} onBlur={(e) => Number(e.target.value) !== Number(s.overtime_hours) && run(() => A.updatePayslipAction(s.id, { overtimeHours: Number(e.target.value) }))} />
                        ) : (
                          Number(s.overtime_hours)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {current.status === "draft" && ctx.rights.payroll ? (
                          <Input type="number" defaultValue={Number(s.unpaid_days)} className="ml-auto h-7 w-20 text-right" aria-label={`Unpaid days for ${s.name}`} onBlur={(e) => Number(e.target.value) !== Number(s.unpaid_days) && run(() => A.updatePayslipAction(s.id, { unpaidDays: Number(e.target.value) }))} />
                        ) : (
                          Number(s.unpaid_days)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular">{fmt(s.gross)}</TableCell>
                      <TableCell className="text-right tabular">{fmt(s.income_tax)}</TableCell>
                      <TableCell className="text-right tabular">{fmt(s.pension_employee)}</TableCell>
                      <TableCell className="text-right tabular">{fmt(s.other_deductions)}</TableCell>
                      <TableCell className="text-right font-medium tabular">{fmt(s.net)}</TableCell>
                      <TableCell>
                        <Button size="xs" variant="ghost" asChild>
                          <Link href={`/pay/payslip/${s.id}`} target="_blank">
                            Payslip
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {ctx.rights.payroll && (
        <Card>
          <CardHeader>
            <CardTitle>Salaries</CardTitle>
            <CardDescription>Basic salary, allowances (taxable or not) and regular deductions per person. New runs copy these.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead>Allowances</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {structures.map((s) => (
                    <TableRow key={s.employeeId}>
                      <TableCell>
                        {s.name}
                        <div className="text-xs text-muted-foreground">{s.jobTitle}</div>
                      </TableCell>
                      <TableCell>{ctx.departments.find((d) => d.value === s.department)?.label ?? s.department}</TableCell>
                      <TableCell className="text-right tabular">{s.basic === null ? <span className="text-muted-foreground">not set</span> : fmt(s.basic)}</TableCell>
                      <TableCell className="text-xs">{s.allowances.map((a) => `${a.name} ${fmt(a.amount)}${a.taxable === false ? " (tax free)" : ""}`).join(", ") || "-"}</TableCell>
                      <TableCell className="text-xs">{s.deductions.map((a) => `${a.name} ${fmt(a.amount)}`).join(", ") || "-"}</TableCell>
                      <TableCell>
                        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditPay(s)}>
                          <PencilIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {newRun && <FormDialog title="New payroll run" fields={[{ key: "period", label: "Month (YYYY-MM)", type: "text", placeholder: ctx.today.slice(0, 7) }]} initial={{ period: ctx.today.slice(0, 7) }} okLabel="Start" onClose={() => setNewRun(false)} submit={(v) => A.createPayrollRunAction(String(v.period))} />}
      {editPay && <PayEditor row={editPay} onClose={() => setEditPay(null)} />}
      {paying && <FormDialog title={`Pay salaries ${paying.period}: ${fmt(paying.net, ctx.cur)} net`} description="Posts the net salaries, income tax and pension as payments from this account, and tells everyone their payslip is ready." fields={payFields(ctx)} initial={{ date: ctx.today }} okLabel="Pay" onClose={() => setPaying(null)} submit={(v) => A.movePayrollAction(paying.id, { step: "pay", accountId: String(v.accountId), date: String(v.date) })} />}
      {back && <FormDialog title={`Send ${back.period} back`} fields={[{ key: "note", label: "What needs to change", type: "textarea" }]} okLabel="Send back" onClose={() => setBack(null)} submit={(v) => A.movePayrollAction(back.id, { step: "reopen", note: String(v.note ?? "") })} />}
    </div>
  );
}

function PayEditor({ row, onClose }: { row: StructureRow; onClose: () => void }) {
  const { go, busy } = useRun();
  const [basic, setBasic] = React.useState(String(row.basic ?? ""));
  const [allow, setAllow] = React.useState<PayLine[]>(row.allowances);
  const [ded, setDed] = React.useState<PayLine[]>(row.deductions);
  const editor = (list: PayLine[], set: (l: PayLine[]) => void, taxable: boolean) => (
    <div className="space-y-1.5">
      {list.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={l.name} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label="Name" />
          <Input type="number" value={l.amount} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} className="w-28" aria-label="Amount" />
          {taxable && (
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <input type="checkbox" checked={l.taxable !== false} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)))} /> taxable
            </label>
          )}
          <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => set(list.filter((_, j) => j !== i))}>
            ×
          </Button>
        </div>
      ))}
      <Button size="xs" variant="outline" onClick={() => set([...list, { name: "", amount: 0, taxable: true }])}>
        <PlusIcon /> Add
      </Button>
    </div>
  );
  return (
    <FormDialogShell title={`Salary: ${row.name}`} onClose={onClose} busy={busy} onSave={async () => (await go(() => A.savePayStructureAction(row.employeeId, { basic: Number(basic), allowances: allow, deductions: ded }), "Saved")) && onClose()}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="basic">Basic salary per month</Label>
          <Input id="basic" type="number" value={basic} onChange={(e) => setBasic(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Allowances</Label>
          {editor(allow, setAllow, true)}
          <p className="text-xs text-muted-foreground">Untick taxable for allowances the law exempts (for example part of transport).</p>
        </div>
        <div className="space-y-1">
          <Label>Regular deductions (loans, advances)</Label>
          {editor(ded, setDed, false)}
        </div>
      </div>
    </FormDialogShell>
  );
}

function FormDialogShell({ title, children, onClose, onSave, busy }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; busy: boolean }) {
  return (
    <FormDialogFrame title={title} onClose={onClose}>
      {children}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy}>
          Save
        </Button>
      </div>
    </FormDialogFrame>
  );
}

function FormDialogFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Vendors, customers and accounts
// ---------------------------------------------------------------------------

type PartyRow = { id: string; kind: string; name: string; tin: string | null; phone: string | null; email: string | null; bank: string | null; bank_account: string | null; active: number };
type AccountRow = { id: string; name: string; kind: string; number: string | null; ledgerCode: string | null; opening: number; active: boolean; balance: number };

function Parties({ ctx, rows }: { ctx: Ctx; rows: PartyRow[] }) {
  const [edit, setEdit] = React.useState<PartyRow | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendors and customers</CardTitle>
        {ctx.rights.access && (
          <CardAction>
            <Button size="sm" onClick={() => setEdit("new")}>
              <PlusIcon /> Add
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className={p.active ? "" : "opacity-50"}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{PARTY_KINDS[p.kind as keyof typeof PARTY_KINDS]}</TableCell>
                <TableCell>{p.tin}</TableCell>
                <TableCell className="text-xs">{[p.phone, p.email].filter(Boolean).join(" · ")}</TableCell>
                <TableCell className="text-xs">{[p.bank, p.bank_account].filter(Boolean).join(" ")}</TableCell>
                <TableCell>
                  {ctx.rights.access && (
                    <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEdit(p)}>
                      <PencilIcon />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {edit && (
        <FormDialog
          title={edit === "new" ? "Add vendor or customer" : edit.name}
          fields={[
            { key: "kind", label: "Kind", type: "select", options: recs(PARTY_KINDS) },
            { key: "name", label: "Name", type: "text" },
            { key: "tin", label: "TIN", type: "text" },
            { key: "phone", label: "Phone", type: "text" },
            { key: "email", label: "Email", type: "text" },
            { key: "bank", label: "Bank", type: "text" },
            { key: "bankAccount", label: "Bank account", type: "text" },
            { key: "active", label: "Active", type: "check" },
          ]}
          initial={edit === "new" ? { kind: "vendor", active: true } : { kind: edit.kind, name: edit.name, tin: edit.tin, phone: edit.phone, email: edit.email, bank: edit.bank, bankAccount: edit.bank_account, active: !!edit.active }}
          onClose={() => setEdit(null)}
          submit={(v) => A.savePartyAction({ ...v, id: edit === "new" ? null : edit.id } as never)}
        />
      )}
    </Card>
  );
}

function Accounts({ ctx, rows }: { ctx: Ctx; rows: AccountRow[] }) {
  const [edit, setEdit] = React.useState<AccountRow | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Money accounts</CardTitle>
        <CardDescription>Bank accounts, cash, petty cash and mobile money. Balances are the opening balance plus everything recorded since.</CardDescription>
        {ctx.rights.approve && (
          <CardAction>
            <Button size="sm" onClick={() => setEdit("new")}>
              <PlusIcon /> Add account
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((a) => (
          <div key={a.id} className={cn("rounded-xl border p-4", !a.active && "opacity-50")}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-muted-foreground">{ACCOUNT_KINDS[a.kind as keyof typeof ACCOUNT_KINDS]}</span>
              {ctx.rights.approve && (
                <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Edit" onClick={() => setEdit(a)}>
                  <PencilIcon />
                </Button>
              )}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular">{fmt(a.balance, ctx.cur)}</div>
            <div className="text-xs text-muted-foreground">{[a.number, a.ledgerCode && `ledger ${a.ledgerCode}`, `opened with ${fmt(a.opening)}`].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">No accounts yet.</p>}
      </CardContent>
      {edit && (
        <FormDialog
          title={edit === "new" ? "Add account" : edit.name}
          fields={[
            { key: "name", label: "Name", type: "text", placeholder: "Commercial Bank of Ethiopia, main" },
            { key: "kind", label: "Kind", type: "select", options: recs(ACCOUNT_KINDS) },
            { key: "number", label: "Account number", type: "text" },
            { key: "ledgerCode", label: "Ledger account", type: "select", options: ctx.ledger, placeholder: "None" },
            { key: "opening", label: "Opening balance", type: "number" },
            { key: "active", label: "In use", type: "check" },
          ]}
          initial={edit === "new" ? { kind: "bank", active: true, opening: 0 } : { name: edit.name, kind: edit.kind, number: edit.number, ledgerCode: edit.ledgerCode, opening: edit.opening, active: edit.active }}
          onClose={() => setEdit(null)}
          submit={(v) => A.saveAccountAction({ ...v, id: edit === "new" ? null : edit.id, opening: Number(v.opening) } as never)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

type ReportData = {
  from: string;
  to: string;
  pnl: { byDept: { key: string; label: string; income: number; spend: number; payroll: number; net: number }[]; byLedger: { code: string; name: string; income: number; spend: number }[] };
  cost: { published: number; spend: number; payroll: number; total: number; perVideo: number | null; hours: number; hourlyCost: number; timeCostPerVideo: number | null };
  summary: { revenue: number; expenses: number; payroll: number };
};

function Reports({ ctx, d }: { ctx: Ctx; d: ReportData }) {
  const go = useGo();
  const q = `from=${d.from}&to=${d.to}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="r-from">From</Label>
          <Input id="r-from" type="date" value={d.from} onChange={(e) => go({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-to">To</Label>
          <Input id="r-to" type="date" value={d.to} onChange={(e) => go({ to: e.target.value })} />
        </div>
        <Button variant="outline" asChild>
          <a href={`/api/finance?report=pnl&${q}`}>
            <DownloadIcon /> Profit and loss (Excel)
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/finance?report=cost&${q}`}>
            <DownloadIcon /> Cost per video (Excel)
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/finance?report=transactions&${q}`}>
            <DownloadIcon /> All transactions (Excel)
          </a>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Revenue" value={fmt(d.summary.revenue, ctx.cur)} />
        <Stat label="Spending" value={fmt(d.summary.expenses, ctx.cur)} hint={`Payroll ${fmt(d.summary.payroll)}`} />
        <Stat label="Net" value={fmt(d.summary.revenue - d.summary.expenses, ctx.cur)} tone={d.summary.revenue >= d.summary.expenses ? "good" : "bad"} />
        <Stat label="Cost per published video" value={d.cost.perVideo === null ? "-" : fmt(d.cost.perVideo, ctx.cur)} hint={`${d.cost.published} published · ${fmt(d.cost.total)} Production cost`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profit and loss by department</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Spending</TableHead>
                  <TableHead className="text-right">Payroll</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.pnl.byDept.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.income)}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.spend)}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.payroll)}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular", r.net < 0 && "text-[var(--st-blocked-fg)]")}>{fmt(r.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By ledger account</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Spending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.pnl.byLedger.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                    </TableCell>
                    <TableCell className="text-right tabular">{fmt(r.income)}</TableCell>
                    <TableCell className="text-right tabular">{fmt(r.spend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Cost per published video</CardTitle>
            <CardDescription>Production spending and payroll divided by videos published in the period; and the time logged on production work, valued at Production&apos;s average hourly cost.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <Stat label="Published" value={String(d.cost.published)} />
            <Stat label="Production cost" value={fmt(d.cost.total)} hint={`Spending ${fmt(d.cost.spend)} · payroll ${fmt(d.cost.payroll)}`} />
            <Stat label="Hours logged" value={String(d.cost.hours)} hint={`At ${fmt(d.cost.hourlyCost)} an hour`} />
            <Stat label="Time cost per video" value={d.cost.timeCostPerVideo === null ? "-" : fmt(d.cost.timeCostPerVideo)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings: currency, VAT, pension, tax brackets, approval limit, chart of accounts, closed months
// ---------------------------------------------------------------------------

type LedgerRow = { code: string; name: string; type: string; active: boolean };
type PeriodRow = { period: string; locked_at: string; name: string | null };

function SettingsTab({ ctx, settings, ledger, periods }: { ctx: Ctx; settings: FinanceSettings; ledger: LedgerRow[]; periods: PeriodRow[] }) {
  const { go, busy } = useRun();
  const [s, setS] = React.useState(settings);
  const [led, setLed] = React.useState<LedgerRow | "new" | null>(null);
  const [period, setPeriod] = React.useState(ctx.today.slice(0, 7));
  const can = ctx.rights.approve;
  const n = (k: keyof FinanceSettings, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`fs-${k}`}>{label}</Label>
      <Input id={`fs-${k}`} type="number" disabled={!can} value={String(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>{can ? "Check the tax brackets against the current Proclamation before the first payroll." : "Only the Finance Manager changes these."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="fs-cur">Currency</Label>
              <Input id="fs-cur" disabled={!can} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} />
            </div>
            {n("vatRate", "VAT (%)")}
            {n("approvalLimit", "Approval limit", "Above it, the Finance Manager approves.")}
            {n("pensionEmployee", "Pension, employee (%)")}
            {n("pensionEmployer", "Pension, employer (%)")}
            {n("fiscalStartMonth", "Fiscal year starts (month)", "7 = July (Hamle).")}
            {n("daysPerMonth", "Days per month", "For daily rates and unpaid days.")}
            {n("hoursPerDay", "Hours per day", "For overtime.")}
          </div>
          <div className="space-y-1">
            <Label>Monthly income tax brackets</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Up to</TableHead>
                  <TableHead>Rate (%)</TableHead>
                  <TableHead>Deduct</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.taxBrackets.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input disabled={!can} value={b.upTo ?? ""} placeholder="and above" onChange={(e) => setS({ ...s, taxBrackets: s.taxBrackets.map((x, j) => (j === i ? { ...x, upTo: e.target.value === "" ? null : Number(e.target.value) } : x)) })} className="h-8" aria-label={`Bracket ${i + 1} upper limit`} />
                    </TableCell>
                    <TableCell>
                      <Input disabled={!can} type="number" value={b.rate} onChange={(e) => setS({ ...s, taxBrackets: s.taxBrackets.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) })} className="h-8" aria-label={`Bracket ${i + 1} rate`} />
                    </TableCell>
                    <TableCell>
                      <Input disabled={!can} type="number" value={b.deduct} onChange={(e) => setS({ ...s, taxBrackets: s.taxBrackets.map((x, j) => (j === i ? { ...x, deduct: Number(e.target.value) } : x)) })} className="h-8" aria-label={`Bracket ${i + 1} deduction`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {can && (
              <Button size="xs" variant="outline" onClick={() => setS({ ...s, taxBrackets: [...s.taxBrackets.slice(0, -1), { upTo: 0, rate: 0, deduct: 0 }, s.taxBrackets[s.taxBrackets.length - 1]!] })}>
                <PlusIcon /> Add bracket
              </Button>
            )}
          </div>
          {can && (
            <Button disabled={busy} onClick={() => go(() => A.saveFinanceSettingsAction(s), "Saved")}>
              Save rules
            </Button>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Chart of accounts</CardTitle>
            {can && (
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => setLed("new")}>
                  <PlusIcon /> Add
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="max-h-96 space-y-1 overflow-y-auto text-sm">
            {ledger.map((l) => (
              <div key={l.code} className={cn("flex items-center gap-2", !l.active && "opacity-50")}>
                <span className="w-16 font-mono text-xs">{l.code}</span>
                <span className="flex-1">{l.name}</span>
                <span className="text-xs text-muted-foreground">{LEDGER_TYPES[l.type as keyof typeof LEDGER_TYPES]}</span>
                {can && (
                  <Button size="icon-xs" variant="ghost" aria-label={`Edit ${l.code}`} onClick={() => setLed(l)}>
                    <PencilIcon />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Closed months</CardTitle>
            <CardDescription>Nothing dated in a closed month can be added or changed. Closing a payroll run closes its month.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {can && (
              <div className="flex gap-2">
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" aria-label="Month" />
                <Button size="sm" variant="outline" onClick={() => go(() => A.lockPeriodAction(period, true), "Month closed")}>
                  <LockIcon /> Close
                </Button>
              </div>
            )}
            {periods.map((p) => (
              <div key={p.period} className="flex items-center gap-2">
                <LockIcon className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{p.period}</span>
                <span className="text-xs text-muted-foreground">by {p.name ?? "?"}</span>
                {can && (
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={() => window.confirm(`Reopen ${p.period}?`) && go(() => A.lockPeriodAction(p.period, false), "Reopened")}>
                    <UnlockIcon /> Reopen
                  </Button>
                )}
              </div>
            ))}
            {!periods.length && <p className="text-muted-foreground">None closed.</p>}
          </CardContent>
        </Card>
      </div>
      {led && (
        <FormDialog
          title={led === "new" ? "Add ledger account" : `${led.code} ${led.name}`}
          fields={[
            { key: "code", label: "Code", type: "text" },
            { key: "name", label: "Name", type: "text" },
            { key: "type", label: "Type", type: "select", options: recs(LEDGER_TYPES) },
            { key: "active", label: "In use", type: "check" },
          ]}
          initial={led === "new" ? { type: "expense", active: true } : { ...led }}
          onClose={() => setLed(null)}
          submit={(v) => A.saveLedgerAction(v as never)}
        />
      )}
    </div>
  );
}
