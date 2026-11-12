"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { CalendarPlusIcon, CheckIcon, DownloadIcon, Loader2Icon, PencilIcon, RotateCcwIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSessionsAction, importSessionsAction, setSessionsStatusAction } from "@/app/actions/sessions";
import type { Booking, SessionImportLine, SessionImportRow } from "@/server/sessions";
import { addMin, BookDialog, local, type Candidate, type Result } from "./sessions-planner";
import { cn } from "@/lib/utils";

const COLUMNS = ["session_id", "date", "start", "minutes", "studio", "presenter", "operator", "parts", "status", "note"] as const;
const STATUS_LABEL: Record<string, string> = { scheduled: "Booked", completed: "Recorded", cancelled: "Cancelled" };
const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Studio sessions as a table: any span of days, filters, tick several to mark them recorded, cancel, book again or
// delete; change one in place; export the rows and import them back (rows with a session id are changed, so the
// sheet stays in sync with the planner), or import new bookings from the template, with a preview first.
export function SessionsTable(props: {
  rows: Booking[];
  from: string;
  until: string;
  today: string;
  tz: string;
  studios: string[];
  staff: { id: string; name: string }[];
  candidates: Candidate[];
  canPlan: boolean;
  me: string;
}) {
  const { rows, from, until, today, tz, studios, staff, candidates, canPlan, me } = props;
  const router = useRouter();
  const [f, setF] = React.useState({ q: "", status: "", studio: "", operator: "" });
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ batchId: string; date: string; time: string; booking: Booking } | null>(null);
  const [booking, setBooking] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
  const [importing, setImporting] = React.useState(false);
  const needle = f.q.trim().toLowerCase();
  const shown = rows.filter(
    (b) =>
      (!f.status || b.status === f.status) &&
      (!f.studio || b.room === f.studio) &&
      (!f.operator || b.operatorId === f.operator) &&
      (!needle || `${b.presenter ?? ""} ${b.operator ?? ""} ${b.room ?? ""} ${b.note ?? ""} ${b.items.map((i) => `${i.code} ${i.title}`).join(" ")}`.toLowerCase().includes(needle)),
  );
  const chosen = shown.filter((b) => picked.has(b.batchId));
  const presenters = [...new Set(rows.map((b) => b.presenter).filter((x): x is string => !!x))].sort();
  const minutes = shown.filter((b) => b.status !== "cancelled").reduce((n, b) => n + b.durationMin, 0);
  const run = async (p: Promise<Result>, done: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong."), false;
    const list = Array.isArray(r.data) ? (r.data as { ok: boolean; error?: string }[]) : null;
    const bad = list?.filter((x) => !x.ok) ?? [];
    if (bad.length) toast.warning(`${list!.length - bad.length} done, ${bad.length} not`, { description: bad.map((b) => b.error).join("\n").slice(0, 500) });
    else toast.success(done);
    setPicked(new Set());
    router.refresh();
    return true;
  };
  const exportRows = (list: Booking[]) =>
    download(`studio-sessions-${from}-to-${until}.csv`, [
      [...COLUMNS],
      ...list.map((b) => {
        const t = local(b.start, tz);
        return [b.batchId, t.date, t.time, b.durationMin, b.room ?? "", b.presenter ?? "", b.operator ?? "", b.items.map((i) => i.code).join("; "), b.status === "completed" ? "recorded" : b.status === "scheduled" ? "booked" : "cancelled", b.note ?? ""];
      }),
    ]);
  const sel = "h-8 rounded-md border bg-background px-2 text-xs";
  return (
    <div className="space-y-3" data-sessions-table>
      <div className="flex flex-wrap items-end gap-2" role="toolbar" aria-label="Filter sessions">
        <form className="flex items-end gap-2" action="/sessions">
          <input type="hidden" name="view" value="table" />
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">From</span>
            <Input type="date" name="from" defaultValue={from} className="h-8 w-36 text-xs" aria-label="From" />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">To</span>
            <Input type="date" name="to" defaultValue={until} className="h-8 w-36 text-xs" aria-label="To" />
          </label>
          <Button size="sm" variant="outline" className="h-8" type="submit">
            Show
          </Button>
        </form>
        <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search presenter, part, note…" className="h-8 w-52 text-xs" aria-label="Search sessions" />
        <select aria-label="Status" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Every status</option>
          <option value="scheduled">Booked</option>
          <option value="completed">Recorded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select aria-label="Studio" className={sel} value={f.studio} onChange={(e) => setF({ ...f, studio: e.target.value })}>
          <option value="">Every studio</option>
          {[...new Set([...studios, ...rows.map((b) => b.room ?? "")].filter(Boolean))].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="Operator" className={sel} value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })}>
          <option value="">Every operator</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => exportRows(chosen.length ? chosen : shown)}>
            <DownloadIcon /> Export {chosen.length ? chosen.length : "shown"}
          </Button>
          {canPlan && (
            <>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setImporting(true)}>
                <UploadIcon /> Import
              </Button>
              <Button size="sm" className="h-8" onClick={() => setBooking(true)}>
                <CalendarPlusIcon /> Book a session
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {shown.length} sessions · {shown.reduce((n, b) => n + b.items.length, 0)} parts · {Math.round(minutes / 6) / 10} studio hours
        </span>
        {chosen.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5" data-session-bulk>
            <span className="font-medium text-foreground">{chosen.length} ticked</span>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => run(setSessionsStatusAction(chosen.map((b) => b.batchId), "completed"), "Marked recorded")}>
              <CheckIcon /> Recorded
            </Button>
            {canPlan && (
              <>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => run(setSessionsStatusAction(chosen.map((b) => b.batchId), "cancelled"), "Cancelled")}>
                  <XIcon /> Cancel
                </Button>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => run(setSessionsStatusAction(chosen.map((b) => b.batchId), "scheduled"), "Booked again")}>
                  <RotateCcwIcon /> Book again
                </Button>
                <Button size="xs" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(chosen.map((b) => b.batchId))}>
                  <Trash2Icon /> Delete
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-8 px-2 py-2">
                <Checkbox aria-label="Select every session shown" checked={shown.length > 0 && shown.every((b) => picked.has(b.batchId))} onCheckedChange={(v) => setPicked(v === true ? new Set(shown.map((b) => b.batchId)) : new Set())} />
              </th>
              <th className="px-2 py-2">Day</th>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Studio</th>
              <th className="px-2 py-2">Presenter</th>
              <th className="px-2 py-2">Operator</th>
              <th className="px-2 py-2">Parts</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const t = local(b.start, tz);
              const mine = b.operatorId === me;
              return (
                <tr key={b.batchId} className={cn("border-t align-top", picked.has(b.batchId) && "bg-primary/5", b.status === "cancelled" && "text-muted-foreground")} data-session-row={b.batchId}>
                  <td className="px-2 py-1.5">
                    <Checkbox
                      aria-label={`Select the session on ${t.date} at ${t.time}`}
                      checked={picked.has(b.batchId)}
                      onCheckedChange={(v) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (v === true) n.add(b.batchId);
                          else n.delete(b.batchId);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className={cn("px-2 py-1.5 text-xs whitespace-nowrap", t.date === today && "font-semibold text-primary")}>
                    <Link href={`/sessions?week=${t.date}`} className="hover:underline">
                      {new Date(`${t.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap tabular-nums">
                    {t.time}–{addMin(t.time, b.durationMin)}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{b.room}</td>
                  <td className="px-2 py-1.5 text-xs">{b.presenter ?? ""}</td>
                  <td className="px-2 py-1.5 text-xs">{b.operator ?? ""}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <ul className="space-y-0.5">
                      {b.items.slice(0, 4).map((i) => (
                        <li key={i.id} className="max-w-72 truncate" title={`${i.code} ${i.title} (${i.place})`}>
                          <Link href={`/items/${i.id}`} className="hover:underline">
                            {i.title}
                          </Link>
                        </li>
                      ))}
                      {b.items.length > 4 && <li className="text-muted-foreground">and {b.items.length - 4} more</li>}
                    </ul>
                    {b.note && <p className="mt-0.5 text-muted-foreground">{b.note}</p>}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    <Badge variant={b.status === "completed" ? "secondary" : "outline"}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {b.status === "scheduled" && (canPlan || mine) && (
                      <Button size="icon-xs" variant="ghost" aria-label="Mark recorded" disabled={busy} onClick={() => run(setSessionsStatusAction([b.batchId], "completed"), "Marked recorded")}>
                        <CheckIcon />
                      </Button>
                    )}
                    {canPlan && (
                      <>
                        <Button size="icon-xs" variant="ghost" aria-label={`Change the session on ${t.date} at ${t.time}`} onClick={() => setEditing({ batchId: b.batchId, date: t.date, time: t.time, booking: b })}>
                          <PencilIcon />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Delete the session on ${t.date} at ${t.time}`} onClick={() => setConfirmDelete([b.batchId])}>
                          <Trash2Icon />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  {rows.length ? "No session matches these filters." : "No sessions in these days."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(booking || editing) && <BookDialog onClose={() => (setBooking(false), setEditing(null))} today={today} studios={studios} staff={staff} candidates={candidates} run={run} busy={busy} edit={editing} presenters={presenters} />}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.length === 1 ? "this session" : `${confirmDelete?.length} sessions`}?</DialogTitle>
            <DialogDescription>They are taken off the planner and the parts. To keep a record, cancel instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Keep
            </Button>
            <Button variant="destructive" disabled={busy} onClick={async () => confirmDelete && (await run(deleteSessionsAction(confirmDelete), "Deleted")) && setConfirmDelete(null)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importing && <ImportDialog onClose={() => setImporting(false)} studios={studios} staff={staff} candidates={candidates} />}
    </div>
  );
}

// Importing sessions: download the template (with examples from this workspace), choose a CSV or paste rows, check
// the preview (what each row books or changes, and what is wrong), then import the good rows.
export function ImportDialog({ onClose, studios, staff, candidates }: { onClose: () => void; studios: string[]; staff: { id: string; name: string }[]; candidates: Candidate[] }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [lines, setLines] = React.useState<SessionImportLine[] | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "import" | null>(null);
  const template = () => {
    const d = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const codes = candidates.slice(0, 4).map((c) => c.code);
    download("studio-sessions-template.csv", [
      [...COLUMNS],
      ["", d, "09:00", 120, studios[0] ?? "Studio A", "Ato Kebede", staff[0]?.name ?? "Camera operator", codes.slice(0, 2).join("; ") || "MY-G09-BIO-U01-L01; MY-G09-BIO-U01-L02", "booked", "Bring the slides"],
      ["", d, "13:30", 90, studios[1] ?? studios[0] ?? "Studio B", "W/ro Almaz", staff[1]?.name ?? staff[0]?.name ?? "", codes.slice(2, 4).join("; ") || "MY-G09-BIO-U01-L03", "booked", ""],
    ]);
  };
  const parse = (): SessionImportRow[] => {
    const r = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") });
    return r.data.map((row) => Object.fromEntries(COLUMNS.map((k) => [k, String(row[k] ?? row[k === "start" ? "time" : k === "studio" ? "room" : k === "parts" ? "part_codes" : k] ?? "")])) as SessionImportRow);
  };
  const preview = async () => {
    const rows = parse();
    if (!rows.length) return void toast.error("No rows found. Use the template's headings.");
    setBusy("preview");
    const r = await importSessionsAction(rows, false);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    setLines(r.data?.lines ?? []);
  };
  const commit = async () => {
    setBusy("import");
    const r = await importSessionsAction(parse(), true);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const bad = (r.data?.lines ?? []).filter((l) => l.action === "error");
    if (bad.length) toast.warning(`${r.data?.done ?? 0} imported, ${bad.length} not`, { description: bad.map((l) => `Row ${l.row}: ${l.errors.join("; ")}`).join("\n").slice(0, 600) });
    else toast.success(`${r.data?.done ?? 0} sessions imported`);
    router.refresh();
    onClose();
  };
  const good = lines?.filter((l) => l.action !== "error").length ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl" data-session-import>
        <DialogHeader>
          <DialogTitle>Import studio sessions</DialogTitle>
          <DialogDescription>
            One row per session: date, start, minutes, studio, presenter, operator (name or email), parts (codes separated by ;), status (booked, recorded or cancelled) and a note. A row with a session_id (from Export) changes that session.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={template}>
            <DownloadIcon /> Template
          </Button>
          <Input
            type="file"
            accept=".csv,text/csv"
            className="h-8 w-64 text-xs"
            aria-label="CSV file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setText(await file.text());
              setLines(null);
            }}
          />
          <span className="text-xs text-muted-foreground">or paste the rows (with the heading row) below</span>
        </div>
        <Textarea rows={5} value={text} onChange={(e) => (setText(e.target.value), setLines(null))} placeholder={COLUMNS.join(",")} className="font-mono text-xs" aria-label="Rows to import" />
        {lines && (
          <div className="max-h-72 overflow-auto rounded-lg border" data-session-preview>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Row</th>
                  <th className="px-2 py-1.5">Does</th>
                  <th className="px-2 py-1.5">Day and time</th>
                  <th className="px-2 py-1.5">Studio</th>
                  <th className="px-2 py-1.5">Presenter · operator</th>
                  <th className="px-2 py-1.5">Parts</th>
                  <th className="px-2 py-1.5">Problems</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.row} className={cn("border-t align-top", l.action === "error" && "bg-rose-50 dark:bg-rose-950/30")}>
                    <td className="px-2 py-1">{l.row}</td>
                    <td className="px-2 py-1">
                      <Badge variant={l.action === "error" ? "destructive" : "secondary"}>{l.action === "create" ? "Book" : l.action === "update" ? "Change" : l.action === "error" ? "Skip" : l.action}</Badge>
                      {l.status !== "scheduled" && <span className="ml-1 text-muted-foreground">{STATUS_LABEL[l.status]}</span>}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap tabular-nums">
                      {l.date} {l.time} · {l.minutes} min
                    </td>
                    <td className="px-2 py-1">{l.studio}</td>
                    <td className="px-2 py-1">{[l.presenter, l.operator].filter(Boolean).join(" · ")}</td>
                    <td className="px-2 py-1">
                      {l.parts.map((p) => (
                        <span key={p.code} className={cn("mr-1 inline-block", !p.id && "text-rose-600 line-through")} title={p.title ?? "Not found"}>
                          {p.code}
                        </span>
                      ))}
                    </td>
                    <td className="px-2 py-1 text-rose-600">{l.errors.join("; ")}</td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                      No rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!text.trim() || !!busy} onClick={preview}>
            {busy === "preview" && <Loader2Icon className="animate-spin" />} Preview
          </Button>
          <Button disabled={!lines || !good || !!busy} onClick={commit}>
            {busy === "import" && <Loader2Icon className="animate-spin" />} Import {good || ""} {good === 1 ? "row" : "rows"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
