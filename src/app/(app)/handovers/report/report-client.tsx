"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardListIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/primitives";
import type { ReportOutcome, ReportRow } from "@/server/handover-report";
import { RETURN_REASON_LABELS, STAGE_LABELS, STAGES } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

const OUTCOME: Record<ReportOutcome, { label: string; tone: string }> = {
  waiting: { label: "Waiting", tone: "paused" },
  accepted: { label: "Accepted", tone: "done" },
  in_check: { label: "Rejected, in cross-check", tone: "paused" },
  rejected: { label: "Rejected", tone: "blocked" },
  overturned: { label: "Accepted, rejection overturned", tone: "done" },
};

type Filter = { stage: string | null; outcome: string | null; person: string | null; q: string | null; from: string | null; to: string | null };
type Totals = { sent: number; waiting: number; accepted: number; rejected: number; inCheck: number; avgHours: number | null };

export function ReportClient({ rows, totals, tz, filter, people }: { rows: ReportRow[]; totals: Totals; tz: string; filter: Filter; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(filter.q ?? "");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const when = (v: string | null) => (v ? fmtDateTime(v, tz) : "");

  const exportCsv = () => {
    const head = ["Handover", "Part code", "Part", "Place", "From", "To", "Sent by", "Sent", "Result", "Decided", "Decided by", "Reason", "Note", "Cross-checked", "Checked by", "Check note", "Hours to decide"];
    const lines = rows.map((r) => [r.code ?? "One at a time", r.itemCode, r.title, r.place, STAGE_LABELS[r.from], STAGE_LABELS[r.to], r.sender ?? "", when(r.sentAt), OUTCOME[r.outcome].label, when(r.decidedAt), r.decidedBy ?? "", r.reason ? (RETURN_REASON_LABELS[r.reason] ?? r.reason) : "", r.note ?? "", when(r.checkedAt), r.checkedBy ?? "", r.checkNote ?? "", r.hours ?? ""]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `handover-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tiles = [
    { label: "Handed over", value: totals.sent },
    { label: "Waiting", value: totals.waiting },
    { label: "Accepted", value: totals.accepted },
    { label: "Rejected", value: totals.rejected },
    { label: "In cross-check", value: totals.inCheck },
    { label: "Average hours to decide", value: totals.avgHours ?? "-" },
  ];

  return (
    <div className="space-y-3" data-handover-report>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-0 p-3">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="text-xl font-semibold tabular" data-tile={t.label}>
              {t.value}
            </p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Result" className="h-8 rounded-md border bg-background px-2 text-xs" value={filter.outcome ?? ""} onChange={(e) => go({ outcome: e.target.value || null })}>
          <option value="">Any result</option>
          {Object.entries(OUTCOME).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select aria-label="Stage" className="h-8 rounded-md border bg-background px-2 text-xs" value={filter.stage ?? ""} onChange={(e) => go({ stage: e.target.value || null })}>
          <option value="">Any stage</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <Combobox size="sm" className="h-8 w-44 text-xs" options={people.map((p) => ({ value: p.id, label: p.name }))} value={filter.person ?? null} onChange={(v) => go({ person: v })} placeholder="Anyone" />
        <Input type="date" aria-label="Sent from" value={filter.from ?? ""} onChange={(e) => go({ from: e.target.value || null })} className="h-8 w-36 text-xs" />
        <Input type="date" aria-label="Sent to" value={filter.to ?? ""} onChange={(e) => go({ to: e.target.value || null })} className="h-8 w-36 text-xs" />
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, part or note" aria-label="Search the report" className="h-8 w-48 pl-7 text-sm" />
        </form>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv} disabled={!rows.length}>
          <DownloadIcon /> Export
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState icon={<ClipboardListIcon className="size-5" />} title="Nothing to report" description="Handovers appear here with their dates once work is sent to the next team." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Part</th>
                <th className="p-2 font-medium">From → To</th>
                <th className="p-2 font-medium">Sent</th>
                <th className="p-2 font-medium">Result</th>
                <th className="p-2 font-medium">Accepted or rejected</th>
                <th className="p-2 font-medium">Cross-check</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 1000).map((r) => (
                <tr key={r.key} className="border-t align-top" data-report-row={r.itemCode}>
                  <td className="p-2">
                    <Link href={`/items/${r.itemId}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      <span className="font-mono">{r.itemCode}</span> · {r.place}
                    </span>
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {STAGE_LABELS[r.from]} → {STAGE_LABELS[r.to]}
                    {r.handoverId ? (
                      <Link href={`/handovers/${r.handoverId}`} className="block font-mono text-muted-foreground hover:underline">
                        {r.code}
                      </Link>
                    ) : (
                      <span className="block text-muted-foreground">One at a time</span>
                    )}
                  </td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {when(r.sentAt) || "-"}
                    <span className="block text-muted-foreground">{r.sender}</span>
                  </td>
                  <td className="p-2">
                    <Badge variant="secondary" style={{ background: `var(--st-${OUTCOME[r.outcome].tone}-bg)`, color: `var(--st-${OUTCOME[r.outcome].tone}-fg)` }}>
                      {OUTCOME[r.outcome].label}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs">
                    <span className="whitespace-nowrap">{when(r.decidedAt) || "-"}</span>
                    <span className="block text-muted-foreground">
                      {r.decidedBy}
                      {r.hours != null ? ` · ${r.hours < 0.1 ? "within minutes of being sent" : `${r.hours} h after it was sent`}` : ""}
                    </span>
                    {r.reason && <span className="block">{RETURN_REASON_LABELS[r.reason] ?? r.reason}</span>}
                    {r.note && <span className="block text-muted-foreground">{r.note}</span>}
                  </td>
                  <td className="p-2 text-xs">
                    <span className="whitespace-nowrap">{when(r.checkedAt) || "-"}</span>
                    <span className="block text-muted-foreground">{r.checkedBy}</span>
                    {r.checkNote && <span className="block">{r.checkNote}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 1000 && <p className="border-t p-2 text-xs text-muted-foreground">Showing the latest 1000 of {rows.length}. Export has them all.</p>}
        </div>
      )}
    </div>
  );
}
