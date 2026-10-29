"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanIcon, CheckCheckIcon, DownloadIcon, ListChecksIcon, Loader2Icon, PackageXIcon, PencilIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { KeyValue } from "@/components/app/primitives";
import { cancelHandoverAction, decideHandoverAction, updateHandoverNoteAction } from "@/app/actions/editorial";
import type { getHandover, HandoverItemRow } from "@/server/editorial";
import { STAGE_LABELS, STATUS_LABELS, type AttemptStatus } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HANDOVER_STATUS, HandoverProgress } from "../handovers-client";

type Data = NonNullable<Awaited<ReturnType<typeof getHandover>>>;

const ITEM_STATUS: Record<HandoverItemRow["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting", tone: "paused" },
  accepted: { label: "Received", tone: "done" },
  missing: { label: "Missing", tone: "blocked" },
};

export function HandoverDetail({ data, viewerId, tz }: { data: Data; viewerId: string; tz: string }) {
  const router = useRouter();
  const h = data.handover;
  const [tab, setTab] = React.useState<"all" | HandoverItemRow["status"]>(h.pending ? "pending" : "all");
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<"accepted" | "missing" | "cancel" | null>(null);
  const [missingOpen, setMissingOpen] = React.useState(false);
  const [missingNote, setMissingNote] = React.useState("");
  const [acceptNote, setAcceptNote] = React.useState("");
  const [noteEdit, setNoteEdit] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const isSender = h.from_user === viewerId || h.created_by === viewerId;

  const needle = q.trim().toLowerCase();
  const items = data.items.filter((i) => (tab === "all" || i.status === tab) && (!needle || `${i.code} ${i.title} ${i.grade ?? ""} ${i.subject ?? ""}`.toLowerCase().includes(needle)));
  const actionable = items.filter((i) => i.actionable);
  const ids = [...picked].filter((id) => data.items.some((i) => i.item_id === id && i.actionable));

  const decide = async (decision: "accepted" | "missing") => {
    setBusy(decision);
    const r = await decideHandoverAction(h.id, { itemIds: ids, decision, note: decision === "missing" ? missingNote : acceptNote || null });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const { results } = r.data as { results: { ok: boolean; code: string; error?: string }[] };
    const bad = results.filter((x) => !x.ok);
    const ok = results.length - bad.length;
    if (bad.length) toast.warning(`${ok} done, ${bad.length} failed`, { description: bad.slice(0, 4).map((b) => `${b.code}: ${b.error}`).join("\n"), duration: 10000 });
    else toast.success(decision === "accepted" ? `${ok} received` : `${ok} marked missing and sent back`);
    setPicked(new Set());
    setMissingOpen(false);
    setMissingNote("");
    router.refresh();
  };

  const exportCsv = () => {
    const head = ["Code", "Title", "Grade", "Subject", "Unit", "Part", "Status", "Note", "Checked by", "Checked at", "Checklist"];
    const lines = data.items.map((i) => [i.code, i.title, i.grade ?? "", i.subject ?? "", i.unit_number ?? "", i.part_number ?? "", ITEM_STATUS[i.status].label, i.note ?? "", i.decided_by_name ?? "", i.decided_at ? fmtDateTime(i.decided_at, tz) : "", i.checklist ?? ""]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${h.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KeyValue label="Status">
            <Badge variant="secondary" style={{ background: `var(--st-${HANDOVER_STATUS[h.status].tone}-bg)`, color: `var(--st-${HANDOVER_STATUS[h.status].tone}-fg)` }}>
              {HANDOVER_STATUS[h.status].label}
            </Badge>
          </KeyValue>
          <KeyValue label="Sent by">
            {h.from_name ?? "-"}
            <span className="block text-xs text-muted-foreground">{fmtDateTime(h.created_at, tz)}</span>
          </KeyValue>
          <KeyValue label="Receiver">{h.to_name ?? `Assigned ${STAGE_LABELS[h.to_stage]} owners and lead`}</KeyValue>
          <KeyValue label="Progress">
            <HandoverProgress h={h} />
          </KeyValue>
          <KeyValue label="Note">
            {noteEdit === null ? (
              <span className="flex items-start gap-1">
                <span className="text-sm whitespace-pre-wrap">{h.note ?? <span className="text-muted-foreground">None</span>}</span>
                {isSender && (
                  <button type="button" aria-label="Edit note" onClick={() => setNoteEdit(h.note ?? "")}>
                    <PencilIcon className="size-3 text-muted-foreground" />
                  </button>
                )}
              </span>
            ) : (
              <div className="space-y-1">
                <Textarea rows={2} value={noteEdit} onChange={(e) => setNoteEdit(e.target.value)} />
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    onClick={async () => {
                      const r = await updateHandoverNoteAction(h.id, noteEdit);
                      if (!r.ok) return toast.error(r.error);
                      setNoteEdit(null);
                      router.refresh();
                    }}
                  >
                    Save
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setNoteEdit(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </KeyValue>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => (setTab(v as typeof tab), setPicked(new Set()))}>
          <TabsList>
            <TabsTrigger value="pending">Waiting ({h.pending})</TabsTrigger>
            <TabsTrigger value="accepted">Received ({h.accepted})</TabsTrigger>
            <TabsTrigger value="missing">Missing ({h.missing})</TabsTrigger>
            <TabsTrigger value="all">All ({h.total})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-48 pl-7 text-sm" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <DownloadIcon /> Export
          </Button>
          {data.canCancel && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
              <BanIcon /> Cancel handover
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {data.canReceive && (
                <th className="w-8 p-2">
                  <Checkbox
                    aria-label="Select all waiting"
                    disabled={!actionable.length}
                    checked={actionable.length && actionable.every((i) => picked.has(i.item_id)) ? true : actionable.some((i) => picked.has(i.item_id)) ? "indeterminate" : false}
                    onCheckedChange={(v) => setPicked(v ? new Set(actionable.map((i) => i.item_id)) : new Set())}
                  />
                </th>
              )}
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 font-medium">Placement</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.item_id} className={cn("border-t", picked.has(i.item_id) && "bg-primary/5")}>
                {data.canReceive && (
                  <td className="p-2">
                    {i.actionable && <Checkbox checked={picked.has(i.item_id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(i.item_id)) : (s.delete(i.item_id), new Set(s))))} />}
                  </td>
                )}
                <td className="max-w-[320px] p-2">
                  <Link href={`/items/${i.item_id}`} className="font-medium hover:underline">
                    {i.title}
                  </Link>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {i.code}
                    {i.checklist && (
                      <span className="ml-2 inline-flex items-center gap-0.5 font-sans">
                        <ListChecksIcon className="size-3" /> {i.checklist}
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-2 text-xs whitespace-nowrap">
                  {i.grade} / {i.subject}
                  {i.unit_number != null && ` / U${i.unit_number}`}
                  {i.part_number != null && ` P${i.part_number}`}
                </td>
                <td className="p-2 text-xs">
                  <Badge variant="secondary" style={{ background: `var(--st-${ITEM_STATUS[i.status].tone}-bg)`, color: `var(--st-${ITEM_STATUS[i.status].tone}-fg)` }}>
                    {ITEM_STATUS[i.status].label}
                  </Badge>
                  {i.status === "pending" && !i.actionable && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Handled outside this handover (now {i.live_stage ? `${STAGE_LABELS[i.live_stage]}: ${STATUS_LABELS[i.live_status as AttemptStatus] ?? i.live_status}` : "closed"})
                    </span>
                  )}
                  {i.decided_by_name && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {i.decided_by_name}, {fmtDateTime(i.decided_at, tz)}
                    </span>
                  )}
                </td>
                <td className="max-w-[260px] p-2 text-xs text-muted-foreground">{i.note}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.canReceive && ids.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{ids.length} selected</span>
          <Input value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} placeholder="Note (optional)" className="h-7 w-44 text-xs" />
          <Button size="xs" disabled={!!busy} onClick={() => decide("accepted")}>
            {busy === "accepted" ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />} Received
          </Button>
          <Button size="xs" variant="outline" className="text-destructive" disabled={!!busy} onClick={() => setMissingOpen(true)}>
            <PackageXIcon /> Missing
          </Button>
        </div>
      )}

      <Dialog open={missingOpen} onOpenChange={setMissingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {ids.length} as missing</DialogTitle>
            <DialogDescription>They go back to {STAGE_LABELS[h.from_stage]} as rework, and the sender and their lead are told what is missing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>What is missing (required)</Label>
            <Textarea rows={3} value={missingNote} onChange={(e) => setMissingNote(e.target.value)} placeholder="No master file in the folder; captions not delivered" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissingOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!missingNote.trim() || !!busy} onClick={() => decide("missing")}>
              {busy === "missing" && <Loader2Icon className="animate-spin" />} Mark missing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {h.code}?</DialogTitle>
            <DialogDescription>The items stay submitted to {STAGE_LABELS[h.to_stage]} and can be accepted one by one, or put in a new handover.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy === "cancel"}
              onClick={async () => {
                setBusy("cancel");
                const r = await cancelHandoverAction(h.id);
                setBusy(null);
                setConfirmCancel(false);
                if (!r.ok) return toast.error(r.error);
                toast.success("Cancelled");
                router.refresh();
              }}
            >
              Cancel handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
