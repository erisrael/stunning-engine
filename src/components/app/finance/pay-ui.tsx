"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, FileTextIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { submitClaimAction, decideClaimAction, requestPurchaseAction, movePurchaseAction } from "@/app/actions/finance";
import { CLAIM_STATUSES, PURCHASE_STATUSES } from "@/lib/finance";
import { FormDialog, Status, fmt, useRun, type Opt } from "./fin-kit";

type Claim = { id: string; name: string; date: string; amount: number; description: string; status: string; note: string | null; receipt_name: string | null };
type Purchase = { id: string; number: string; title: string; lines: string; estimate: number; status: string; note: string | null; vendor: string | null };
type Slip = { id: string; period: string; net: number; gross: number };

export type PayTab = "claims" | "purchases" | "payslips" | "approve";

// Claims and pay: everyone claims expenses, asks to buy things and reads their payslips; line managers approve
// their team's claims here.
export function PayHome({ tab, tabParam = "tab", claims, purchases, payslips, toApprove, departments, ledger, cur, today }: { tab: PayTab; tabParam?: string; claims: Claim[]; purchases: Purchase[]; payslips: Slip[]; toApprove: Claim[]; departments: Opt[]; ledger: Opt[]; cur: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { go } = useRun();
  const [dialog, setDialog] = React.useState<"claim" | "purchase" | null>(null);
  const [rejecting, setRejecting] = React.useState<Claim | null>(null);
  const setTab = (t: string) => {
    const n = new URLSearchParams(params.toString());
    n.set(tabParam, t);
    router.push(`${pathname}?${n}`);
  };
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="claims">Expense claims</TabsTrigger>
          <TabsTrigger value="purchases">Purchase requests</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          {toApprove.length > 0 && <TabsTrigger value="approve">To approve ({toApprove.length})</TabsTrigger>}
        </TabsList>
      </Tabs>
      {tab === "claims" && (
        <Card>
          <CardHeader>
            <CardTitle>Your expense claims</CardTitle>
            <CardDescription>Spent your own money on work? Claim it with the receipt. Your line manager approves, then Finance pays you.</CardDescription>
            <CardAction>
              <Button size="sm" onClick={() => setDialog("claim")}>
                <PlusIcon /> New claim
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.date}</TableCell>
                    <TableCell>
                      {c.description}
                      {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular">{fmt(c.amount, cur)}</TableCell>
                    <TableCell>
                      <Status s={c.status} labels={CLAIM_STATUSES} />
                    </TableCell>
                  </TableRow>
                ))}
                {!claims.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No claims yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {tab === "purchases" && (
        <Card>
          <CardHeader>
            <CardTitle>Your purchase requests</CardTitle>
            <CardDescription>Need equipment or supplies? Ask here; Finance approves and orders, and you confirm when it arrives.</CardDescription>
            <CardAction>
              <Button size="sm" onClick={() => setDialog("purchase")}>
                <PlusIcon /> New request
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{p.number}</span> {p.title}
                      {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular">{fmt(p.estimate, cur)}</TableCell>
                    <TableCell>
                      <Status s={p.status} labels={PURCHASE_STATUSES} />
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "ordered" && (
                        <Button size="xs" variant="outline" onClick={() => go(() => movePurchaseAction(p.id, { step: "receive" }), "Thanks; Finance is told")}>
                          It arrived
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!purchases.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No requests yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {tab === "payslips" && (
        <Card>
          <CardHeader>
            <CardTitle>Your payslips</CardTitle>
            <CardDescription>Open one to see the breakdown and print or save it as PDF.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {payslips.map((s) => (
              <Link key={s.id} href={`/pay/payslip/${s.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary">
                <FileTextIcon className="size-5 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block font-medium">{s.period}</span>
                  <span className="text-xs text-muted-foreground">Gross {fmt(s.gross)}</span>
                </span>
                <span className="font-semibold tabular">{fmt(s.net, cur)}</span>
              </Link>
            ))}
            {!payslips.length && <p className="text-sm text-muted-foreground">No payslips yet. They appear here when salaries are paid.</p>}
          </CardContent>
        </Card>
      )}
      {tab === "approve" && (
        <Card>
          <CardHeader>
            <CardTitle>Claims to approve</CardTitle>
            <CardDescription>From people who report to you. After you approve, Finance checks the receipt and pays.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {toApprove.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.name} · {fmt(c.amount, cur)}
                  </div>
                  <div className="text-muted-foreground">
                    {c.date} · {c.description}
                  </div>
                </div>
                {c.receipt_name && (
                  <Button size="xs" variant="ghost" asChild>
                    <a href={`/api/finance?receipt=${c.id}`}>Receipt</a>
                  </Button>
                )}
                <Button size="sm" onClick={() => go(() => decideClaimAction(c.id, { approve: true }), "Approved; sent to Finance")}>
                  <CheckIcon /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(c)}>
                  <XIcon /> Not approve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {dialog === "claim" && (
        <FormDialog
          title="New expense claim"
          fields={[
            { key: "date", label: "Date you spent it", type: "date" },
            { key: "amount", label: `Amount (${cur})`, type: "number" },
            { key: "description", label: "What for", type: "text", wide: true, placeholder: "Taxi to the studio shoot" },
            { key: "ledgerCode", label: "Kind of cost", type: "select", options: ledger, placeholder: "General expenses" },
            { key: "department", label: "Department", type: "select", options: departments, placeholder: "None" },
            { key: "project", label: "Project or campaign", type: "text" },
            { key: "receipt", label: "Receipt (photo or PDF)", type: "file", wide: true },
          ]}
          initial={{ date: today }}
          okLabel="Send claim"
          onClose={() => setDialog(null)}
          submit={(v) => submitClaimAction({ ...v, amount: Number(v.amount) } as never)}
        />
      )}
      {dialog === "purchase" && (
        <FormDialog
          title="New purchase request"
          fields={[
            { key: "title", label: "What do you need", type: "text", wide: true, placeholder: "Two wireless microphones" },
            { key: "department", label: "Department", type: "select", options: departments, placeholder: "None" },
            { key: "project", label: "Project or campaign", type: "text" },
            { key: "lines", label: "Items and estimated prices", type: "lines" },
            { key: "note", label: "Why, and any shop or link", type: "textarea" },
          ]}
          okLabel="Send request"
          onClose={() => setDialog(null)}
          submit={(v) => requestPurchaseAction(v as never)}
        />
      )}
      {rejecting && <FormDialog title="Why not?" fields={[{ key: "note", label: "Reason (they are told)", type: "textarea" }]} okLabel="Not approve" onClose={() => setRejecting(null)} submit={(v) => decideClaimAction(rejecting.id, { approve: false, note: String(v.note ?? "") })} />}
    </div>
  );
}
