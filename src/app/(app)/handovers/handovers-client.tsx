"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowRightIcon, ArrowUpDownIcon, ArrowUpIcon, DownloadIcon, InboxIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/primitives";
import { HandoverDialog } from "@/components/app/handover-dialog";
import type { HandoverFilter, HandoverRow, HandoverStatus } from "@/server/editorial";
import { STAGE_LABELS, STAGES } from "@/lib/domain";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const HANDOVER_STATUS: Record<HandoverStatus, { label: string; tone: string }> = {
  open: { label: "Waiting", tone: "paused" },
  partial: { label: "Partly checked", tone: "active" },
  closed: { label: "Checked", tone: "done" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function HandoverProgress({ h }: { h: Pick<HandoverRow, "total" | "accepted" | "missing" | "pending"> }) {
  const pct = (n: number) => `${h.total ? (n / h.total) * 100 : 0}%`;
  return (
    <div className="min-w-28">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span style={{ width: pct(h.accepted), background: "var(--st-done-fg)" }} />
        <span style={{ width: pct(h.missing), background: "var(--st-blocked-fg)" }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground tabular">
        {h.accepted} received{h.missing ? `, ${h.missing} missing` : ""}
        {h.pending ? `, ${h.pending} waiting` : ""}
      </p>
    </div>
  );
}

export function HandoverList({
  rows,
  box,
  counts,
  seesAll,
  filter,
  people,
  tz,
}: {
  rows: HandoverRow[];
  box: "incoming" | "outgoing" | "all";
  counts: { incoming: number; outgoing: number; all: number };
  seesAll: boolean;
  filter: HandoverFilter;
  people: { id: string; name: string }[];
  tz: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(filter.q ?? "");
  const [creating, setCreating] = React.useState(false);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const sortBy = (k: NonNullable<HandoverFilter["sort"]>) => go({ sort: k, dir: filter.sort === k && filter.dir === "desc" ? "asc" : "desc" });
  const Head = ({ k, children, className }: { k: NonNullable<HandoverFilter["sort"]>; children: React.ReactNode; className?: string }) => (
    <th className={cn("p-2 font-medium", className)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
        {children}
        {filter.sort === k ? filter.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
      </button>
    </th>
  );

  const exportCsv = () => {
    const head = ["Code", "From", "To", "Sender", "Receiver", "Status", "Items", "Received", "Missing", "Waiting", "Created", "Closed", "Note"];
    const lines = rows.map((h) => [
      h.code,
      STAGE_LABELS[h.from_stage],
      STAGE_LABELS[h.to_stage],
      h.from_name ?? "",
      h.to_name ?? `${STAGE_LABELS[h.to_stage]} team`,
      HANDOVER_STATUS[h.status].label,
      h.total,
      h.accepted,
      h.missing,
      h.pending,
      fmtDateTime(h.created_at, tz),
      h.closed_at ? fmtDateTime(h.closed_at, tz) : "",
      h.note ?? "",
    ]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `handovers-${box}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={box} onValueChange={(v) => go({ box: v })}>
          <TabsList>
            <TabsTrigger value="incoming">To check ({counts.incoming})</TabsTrigger>
            <TabsTrigger value="outgoing">Sent ({counts.outgoing})</TabsTrigger>
            <TabsTrigger value="all">{seesAll ? "All" : "Involving me"} ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <DownloadIcon /> Export
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon /> New handover
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter.status ?? "any"} onValueChange={(v) => go({ status: v === "active" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Not fully checked</SelectItem>
            <SelectItem value="open">Waiting</SelectItem>
            <SelectItem value="partial">Partly checked</SelectItem>
            <SelectItem value="closed">Checked</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="any">Any status</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.stage ?? "all"} onValueChange={(v) => go({ stage: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stage</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Combobox size="sm" className="h-8 w-44 text-xs" options={people.map((p) => ({ value: p.id, label: p.name }))} value={filter.person ?? null} onChange={(v) => go({ person: v })} placeholder="Anyone" />
        <Input type="date" aria-label="From date" value={filter.from ?? ""} onChange={(e) => go({ from: e.target.value || null })} className="h-8 w-36 text-xs" />
        <Input type="date" aria-label="To date" value={filter.to ?? ""} onChange={(e) => go({ to: e.target.value || null })} className="h-8 w-36 text-xs" />
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, note or item" className="h-8 w-52 pl-7 text-sm" />
        </form>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<InboxIcon className="size-5" />}
          title={box === "incoming" ? "Nothing to check" : "No handovers"}
          description={box === "incoming" ? "Handovers sent to you or your team appear here." : "Send finished work to the next team with New handover."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <Head k="code">Handover</Head>
                <th className="p-2 font-medium">From → To</th>
                <th className="p-2 font-medium">People</th>
                <Head k="items">Items</Head>
                <Head k="status">Status</Head>
                <Head k="created">Sent</Head>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => router.push(`/handovers/${h.id}`)}>
                  <td className="p-2">
                    <Link href={`/handovers/${h.id}`} className="font-mono text-xs font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                      {h.code}
                    </Link>
                    {h.note && <span className="block max-w-[260px] truncate text-xs text-muted-foreground">{h.note}</span>}
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {STAGE_LABELS[h.from_stage]} <ArrowRightIcon className="inline size-3" /> {STAGE_LABELS[h.to_stage]}
                  </td>
                  <td className="p-2 text-xs">
                    {h.from_name ?? "-"}
                    <span className="block text-muted-foreground">to {h.to_name ?? `${STAGE_LABELS[h.to_stage]} team`}</span>
                  </td>
                  <td className="p-2">
                    <HandoverProgress h={h} />
                  </td>
                  <td className="p-2">
                    <Badge variant="secondary" style={{ background: `var(--st-${HANDOVER_STATUS[h.status].tone}-bg)`, color: `var(--st-${HANDOVER_STATUS[h.status].tone}-fg)` }}>
                      {HANDOVER_STATUS[h.status].label}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap" title={fmtDateTime(h.created_at, tz)}>
                    {fmtRelative(h.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <HandoverDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
