"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, InboxIcon, Loader2Icon, PenLineIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createLetterAction, registerIncomingAction } from "@/app/actions/correspondence";
import { STATUS_TONE } from "@/components/app/corr/corr-nav";
import { downloadBlob, toCsv } from "@/components/app/tools/shared";
import { cn } from "@/lib/utils";

type Row = { id: string; ref: string | null; direction: string; status: string; classification: string; priority: string; subject: string; categoryName: string | null; creatorName: string | null; toLine: string | null; issuedAt: string | null; updatedAt: string; dueAt: string | null; externalRef: string | null };
type Rights = { create: boolean; issue: boolean; viewAll: boolean; directory: boolean; admin: boolean; audit: boolean };
const sel = "h-8 rounded-md border bg-background px-2 text-xs";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export function RegistryClient({ list, categories, rights, filter, statusLabels }: { list: { rows: Row[]; total: number; counts: Record<string, number> }; categories: { id: string; code: string; name: string }[]; rights: Rights; filter: { q?: string; page?: number }; statusLabels: Record<string, string> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(filter.q ?? "");
  const [newOpen, setNewOpen] = React.useState(false);
  const [inOpen, setInOpen] = React.useState(false);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== "page") p.delete("page");
    router.push(`/correspondence?${p}`);
  };
  const c = list.counts;
  const cards: [string, string, number][] = [
    ["draft", "Drafts", c.draft ?? 0],
    ["issued", "Issued, not sent", c.issued ?? 0],
    ["dispatched", "Sent, not delivered", c.dispatched ?? 0],
    ["delivered,acknowledged", "Delivered", (c.delivered ?? 0) + (c.acknowledged ?? 0)],
    ["void", "Void", c.void ?? 0],
  ];
  const page = filter.page ?? 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cards.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => set("status", sp.get("status") === k ? null : k)} className={cn("rounded-lg border p-3 text-left hover:bg-muted", sp.get("status") === k && "border-primary bg-primary/5")}>
            <span className="block text-[11px] text-muted-foreground">{l}</span>
            <span className="text-xl font-semibold tabular">{n.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => (e.preventDefault(), set("q", q.trim() || null))} className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, subject, recipient or document ID" className="h-8 w-72 pl-7 text-xs" aria-label="Search letters" />
        </form>
        <select aria-label="Direction" className={sel} value={sp.get("dir") ?? ""} onChange={(e) => set("dir", e.target.value || null)}>
          <option value="">In and out</option>
          <option value="outgoing">Outgoing</option>
          <option value="incoming">Incoming</option>
        </select>
        <select aria-label="Category" className={sel} value={sp.get("cat") ?? ""} onChange={(e) => set("cat", e.target.value || null)}>
          <option value="">Every category</option>
          {categories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select aria-label="Classification" className={sel} value={sp.get("cls") ?? ""} onChange={(e) => set("cls", e.target.value || null)}>
          <option value="">Any classification</option>
          {["public", "internal", "confidential", "restricted"].map((x) => (
            <option key={x} value={x}>
              {x[0]!.toUpperCase() + x.slice(1)}
            </option>
          ))}
        </select>
        <Input type="date" aria-label="From" className="h-8 w-[9.5rem] text-xs" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value || null)} />
        <Input type="date" aria-label="Until" className="h-8 w-[9.5rem] text-xs" value={sp.get("until") ?? ""} onChange={(e) => set("until", e.target.value || null)} />
        <label className="flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs">
          <input type="checkbox" checked={sp.get("mine") === "1"} onChange={(e) => set("mine", e.target.checked ? "1" : null)} /> Mine
        </label>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadBlob(
                new Blob([toCsv(["Reference", "Document ID", "Direction", "Status", "Category", "Subject", "To / from", "Their ref", "Classification", "Written by", "Issued", "Due"], list.rows.map((r) => [r.ref ?? "", r.id, r.direction, statusLabels[r.status] ?? r.status, r.categoryName ?? "", r.subject, r.toLine ?? "", r.externalRef ?? "", r.classification, r.creatorName ?? "", r.issuedAt?.slice(0, 10) ?? "", r.dueAt?.slice(0, 10) ?? ""]))], { type: "text/csv" }),
                "correspondence.csv",
              )
            }
          >
            <DownloadIcon /> CSV
          </Button>
          {rights.create && (
            <>
              <Button size="sm" variant="outline" onClick={() => setInOpen(true)}>
                <InboxIcon /> Register incoming
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <PenLineIcon /> New letter
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">To / from</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => router.push(`/correspondence/${r.id}`)}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    <Link href={`/correspondence/${r.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {r.ref ?? <span className="text-muted-foreground">Draft</span>}
                    </Link>
                    {r.direction === "incoming" && <span className="ml-1 rounded bg-muted px-1 font-sans text-[10px]">IN</span>}
                  </td>
                  <td className="max-w-80 truncate px-3 py-2" title={r.subject}>
                    {r.subject || <span className="text-muted-foreground">(no subject yet)</span>}
                    {(r.classification === "confidential" || r.classification === "restricted") && <span className="ml-1 text-[10px] text-red-700 uppercase dark:text-red-300">{r.classification}</span>}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2">{r.toLine ?? "-"}</td>
                  <td className="px-3 py-2">{r.categoryName ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap", STATUS_TONE[r.status] ?? "bg-muted")}>{statusLabels[r.status] ?? r.status}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{when(r.issuedAt)}</td>
                  <td className="px-3 py-2">{r.creatorName ?? "-"}</td>
                </tr>
              ))}
              {!list.rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                    {sp.toString() ? "No letter matches these filters." : rights.create ? "No letters yet. Press New letter to write the first." : "No letters you can see yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {list.total > 50 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => set("page", String(page - 1))}>
            Previous
          </Button>
          <span className="tabular">
            {page * 50 + 1}–{Math.min(list.total, page * 50 + 50)} of {list.total.toLocaleString()}
          </span>
          <Button size="sm" variant="ghost" disabled={(page + 1) * 50 >= list.total} onClick={() => set("page", String(page + 1))}>
            Next
          </Button>
        </div>
      )}

      <NewLetterDialog open={newOpen} onClose={() => setNewOpen(false)} categories={categories.filter((x) => x.code !== "IN")} />
      <IncomingDialog open={inOpen} onClose={() => setInOpen(false)} />
    </div>
  );
}

function NewLetterDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New letter</DialogTitle>
          <DialogDescription>Choose the kind of letter. It decides the reference number, the classification and, later, who approves and signs.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-2 overflow-auto sm:grid-cols-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!!busy}
              onClick={async () => {
                setBusy(c.id);
                const r = await createLetterAction({ categoryId: c.id });
                if (!r.ok) {
                  setBusy(null);
                  return toast.error(r.error);
                }
                router.push(`/correspondence/${r.data as string}`);
              }}
              className="flex items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span>
                <span className="block font-medium">{c.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
              </span>
              {busy === c.id && <Loader2Icon className="size-4 animate-spin" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IncomingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = React.useState({ sender: "", subject: "", externalRef: "", receivedAt: new Date().toISOString().slice(0, 10), dueAt: "", department: "", summary: "", priority: "normal" });
  const [busy, setBusy] = React.useState(false);
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="space-y-1 text-xs">
      <span className="font-medium">{label}</span>
      <Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Register an incoming letter</DialogTitle>
          <DialogDescription>It gets an internal tracking number at once and appears in the registry.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("sender", "From (organisation or person)")}
          {field("externalRef", "Their reference")}
          <div className="sm:col-span-2">{field("subject", "Subject")}</div>
          {field("receivedAt", "Received", "date")}
          {field("dueAt", "Answer by", "date")}
          {field("department", "Department it goes to")}
          <label className="space-y-1 text-xs">
            <span className="font-medium">Priority</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {["low", "normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="font-medium">Summary</span>
            <Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} rows={3} />
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !f.sender.trim() || !f.subject.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await registerIncomingAction({ ...f, receivedAt: f.receivedAt ? new Date(`${f.receivedAt}T12:00:00`).toISOString() : null, dueAt: f.dueAt ? new Date(`${f.dueAt}T17:00:00`).toISOString() : null, department: f.department || null });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              const d = r.data as { id: string; ref: string };
              toast.success(`Registered as ${d.ref}`);
              router.push(`/correspondence/${d.id}`);
            }}
          >
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
