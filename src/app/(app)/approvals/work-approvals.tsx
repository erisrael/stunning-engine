"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bulkAction } from "@/app/actions/items";
import type { ToApprove } from "@/server/team-flow";
import { STAGE_LABELS } from "@/lib/domain";
import { fmtMS } from "@/lib/duration";
import { cn } from "@/lib/utils";

const STATUS: Record<ToApprove["status"], string> = { lead_review: "Sent to you", finished: "Marked done" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
type SortKey = "part" | "grade" | "person" | "status" | "done" | "due";

// Approvals, work: what the team marked done or sent to the lead, in one table. Filter it, tick several (or every
// row shown) and approve them or return them with one note; a row opens the part.
export function WorkApprovals({ rows }: { rows: ToApprove[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ q: "", stage: "", status: "", person: "", grade: "", subject: "" });
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "done", dir: 1 });
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<"approve" | "return" | null>(null);
  const [returning, setReturning] = React.useState<string[] | null>(null);
  const [note, setNote] = React.useState("");
  const needle = f.q.trim().toLowerCase();
  const shown = rows
    .filter(
      (r) =>
        (!f.stage || r.stage === f.stage) &&
        (!f.status || r.status === f.status) &&
        (!f.person || (r.ownerName ?? "") === f.person) &&
        (!f.grade || r.grade === f.grade) &&
        (!f.subject || r.subject === f.subject) &&
        (!needle || `${r.code} ${r.title} ${r.ownerName ?? ""} ${r.teacher ?? ""}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      const v = (r: ToApprove): string | number =>
        sort.key === "part" ? r.title : sort.key === "grade" ? `${r.grade ?? ""} ${r.subject ?? ""} ${String(r.unitNumber ?? 0).padStart(3, "0")} ${String(r.partNumber ?? 0).padStart(3, "0")}` : sort.key === "person" ? (r.ownerName ?? "") : sort.key === "status" ? r.status : sort.key === "done" ? (r.doneAt ?? "") : (r.dueAt ?? "9999");
      return String(v(a)).localeCompare(String(v(b)), undefined, { numeric: true }) * sort.dir;
    });
  const chosen = shown.filter((r) => picked.has(r.id));
  const stages = [...new Set(rows.map((r) => r.stage))];
  const sel = "h-8 rounded-md border bg-background px-2 text-xs";

  const decide = async (ids: string[], decision: "approve" | "return", why?: string) => {
    setBusy(decision);
    const r = await bulkAction(ids, decision === "approve" ? { action: "leadApprove" } : { action: "leadReturn", note: why ?? "" });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const res = r.data ?? [];
    const bad = res.filter((x) => !x.ok);
    const okN = res.length - bad.length;
    if (bad.length) toast.warning(`${okN} ${decision === "approve" ? "approved" : "returned"}, ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.missing?.length ? `missing ${b.missing.join(", ")}` : b.error}`).join("\n").slice(0, 600) });
    else toast.success(decision === "approve" ? `${okN} approved, ready to hand over` : `${okN} returned with your note`);
    setPicked(new Set());
    setReturning(null);
    setNote("");
    router.refresh();
  };
  const head = (key: SortKey, label: string) => (
    <th className="px-2 py-2 whitespace-nowrap">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
      </button>
    </th>
  );

  return (
    <Card data-testid="approvals-work" className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle>Work to approve ({rows.length})</CardTitle>
        <CardDescription>Parts your team marked done or sent to you. Approve them for handover, or return them with a note; tick several to decide them together.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter work to approve">
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search part, code, person, presenter…" className="h-8 w-60 text-xs" aria-label="Search work to approve" />
          {stages.length > 1 && (
            <select aria-label="Stage" className={sel} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
              <option value="">Every stage</option>
              {stages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          )}
          <select aria-label="Status" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Done or sent</option>
            <option value="lead_review">Sent to you</option>
            <option value="finished">Marked done</option>
          </select>
          <select aria-label="Person" className={sel} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
            <option value="">Everyone</option>
            {uniq(rows.map((r) => r.ownerName)).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Grade" className={sel} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, subject: "" })}>
            <option value="">Every grade</option>
            {uniq(rows.map((r) => r.grade)).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select aria-label="Subject" className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
            <option value="">Every subject</option>
            {uniq(rows.filter((r) => !f.grade || r.grade === f.grade).map((r) => r.subject)).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">{shown.length} shown</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 text-xs" disabled={!!busy || !chosen.length} onClick={() => decide(chosen.map((r) => r.id), "approve")}>
              {busy === "approve" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve {chosen.length || ""}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!busy || !chosen.length} onClick={() => setReturning(chosen.map((r) => r.id))}>
              <Undo2Icon /> Return {chosen.length || ""}
            </Button>
          </div>
        </div>
        <div className="max-h-[65vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-8 px-2 py-2">
                  <Checkbox aria-label="Select every row shown" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))} onCheckedChange={(v) => setPicked(v === true ? new Set(shown.map((r) => r.id)) : new Set())} />
                </th>
                {head("part", "Part")}
                {head("grade", "Grade · subject · unit")}
                {head("person", "By")}
                {head("status", "Status")}
                <th className="px-2 py-2">Recorded</th>
                {head("done", "Done")}
                {head("due", "Due")}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={cn("border-t", picked.has(r.id) && "bg-primary/5")} data-approve-row={r.code}>
                  <td className="px-2 py-1.5">
                    <Checkbox aria-label={`Select ${r.code}`} checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((p) => { const n = new Set(p); if (v === true) n.add(r.id); else n.delete(r.id); return n; })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Link href={`/items/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.code}</span>
                    {r.priority === "urgent" || r.priority === "high" ? <Badge variant="outline" className="ml-1 text-[10px] capitalize">{r.priority}</Badge> : null}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{[r.grade, r.subject, r.unitNumber != null ? `U${r.unitNumber}` : null, r.partNumber != null ? `P${r.partNumber}` : null].filter(Boolean).join(" · ")}</td>
                  <td className="px-2 py-1.5 text-xs">{r.ownerName ?? "—"}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <Badge variant={r.status === "lead_review" ? "secondary" : "outline"}>{STATUS[r.status]}</Badge>
                    {stages.length > 1 && <span className="ml-1 text-muted-foreground">{STAGE_LABELS[r.stage]}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {r.stage === "recording" ? [r.shots ? `${r.shots} shot${r.shots === 1 ? "" : "s"}` : null, r.rawMin ? fmtMS(r.rawMin) : null, r.teacher].filter(Boolean).join(" · ") : ""}
                  </td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{when(r.doneAt)}</td>
                  <td className={cn("px-2 py-1.5 text-xs whitespace-nowrap", r.dueAt && Date.parse(r.dueAt) < Date.now() && "font-medium text-rose-600")}>{r.dueAt ? r.dueAt.slice(0, 10) : ""}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button size="xs" variant="outline" disabled={!!busy} onClick={() => decide([r.id], "approve")} aria-label={`Approve ${r.code}`}>
                      <CheckIcon /> Approve
                    </Button>
                    <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => setReturning([r.id])} aria-label={`Return ${r.code}`}>
                      <Undo2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{rows.length ? "Nothing matches these filters." : "Nothing waiting for your approval."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
      <Dialog open={!!returning} onOpenChange={(o) => !o && setReturning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return {returning?.length === 1 ? "this part" : `${returning?.length} parts`}</DialogTitle>
            <DialogDescription>They go back to the person to change, with your note.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change" aria-label="What needs to change" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturning(null)}>Cancel</Button>
            <Button disabled={!note.trim() || !!busy} onClick={() => returning && decide(returning, "return", note.trim())}>
              {busy === "return" && <Loader2Icon className="animate-spin" />} Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
