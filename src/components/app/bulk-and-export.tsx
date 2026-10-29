"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleXIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/app/multi-select";
import { bulkAction, type BulkInput } from "@/app/actions/items";
import { PRIORITY_LABELS, STAGE_LABELS, STAGES, type Capability, type Role, type Stage } from "@/lib/domain";
import { endOfLocalDayIso } from "@/lib/format";
import { ITEM_COLUMNS } from "@/lib/columns";
import { FILL_FIELDS } from "@/lib/data-fields";
import { FillDialog, RenameDialog, StatusDialog, TrashDialog, type RecordLike } from "@/components/app/record-dialogs";
import { HandoverDialog } from "@/components/app/handover-dialog";
import type { ItemListRow } from "@/server/queries";

const ALL_EXPORT_COLUMNS = ITEM_COLUMNS.map((c) => c.key);

export async function downloadExport(input: { format: "csv" | "xlsx" | "json" | "audit"; scope: "page" | "selected" | "all"; ids?: string[]; columns: string[]; query: string; grouping?: "grade" | "subject" | "none" }) {
  const t = toast.loading("Preparing export");
  try {
    const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `export.${input.format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${res.headers.get("X-Row-Count") ?? ""} rows`, { id: t, description: name });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Export failed", { id: t });
  }
}

type ExportFormat = "csv" | "xlsx" | "json" | "tracker" | "pdf" | "audit";
type ExportPrefs = { format: ExportFormat; scope: "page" | "selected" | "all"; grouping: "grade" | "subject" | "none"; includeDates: boolean; columnSet: "view" | "overview" | "all"; orientation: "landscape" | "portrait"; pageBreaks: boolean };

// Each format needs its own permission (Admin, Roles and permissions, Import and export).
const FORMATS: { key: ExportFormat; label: string; hint: string; cap: Capability }[] = [
  { key: "xlsx", label: "Excel", hint: "A workbook with your rows (grade, subject and unit cells merged), progress by stage, and an About sheet.", cap: "export.run" },
  { key: "csv", label: "CSV", hint: "Plain rows for any spreadsheet or tool.", cap: "export.run" },
  { key: "pdf", label: "PDF report (A4)", hint: "A print-ready A4 status report, landscape or portrait, with a summary per stage and per grade. Opens a preview; choose Save as PDF.", cap: "export.report" },
  { key: "json", label: "JSON (data)", hint: "The same rows as records, for other systems.", cap: "export.run" },
  { key: "tracker", label: "Curriculum tracker JSON", hint: "Grade, subjects, units, parts and videos in the tracker's own format, with each stage's progress added. Import it back any time.", cap: "export.tracker" },
  { key: "audit", label: "Metadata and audit JSON", hint: "Items with their full history and file manifest.", cap: "export.audit" },
];

const OVERVIEW_COLUMNS = ["stage", "recording_progress", "editing_progress", "uploading_progress", "publication_progress", "recorded_date", "edited_date", "uploaded_date", "published", "owner"];
const DATE_COLUMNS = ["recorded_date", "edited_date", "uploaded_date", "published"];

export function ExportMenu({ columns, query, selected, pageCount, total, perms }: { columns: string[]; query: string; selected: string[]; pageCount: number; total: number; perms: Capability[] }) {
  const formats = FORMATS.filter((f) => perms.includes(f.cap));
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [p, setP] = React.useState<ExportPrefs>({ format: "xlsx", scope: "all", grouping: "grade", includeDates: true, columnSet: "view", orientation: "landscape", pageBreaks: false });
  // Remembered per browser so the dialog opens with your usual choices.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("myseed.exportPrefs");
      if (saved) setP((x) => ({ ...x, ...(JSON.parse(saved) as Partial<ExportPrefs>) }));
    } catch {
      /* no saved settings */
    }
  }, []);
  const set = <K extends keyof ExportPrefs>(k: K, v: ExportPrefs[K]) => setP((x) => ({ ...x, [k]: v }));
  const fmt = formats.find((f) => f.key === p.format) ?? formats[0];
  const format = fmt?.key;
  const tabular = format === "csv" || format === "xlsx" || format === "json";
  const cols = (() => {
    const base = p.columnSet === "overview" ? OVERVIEW_COLUMNS : p.columnSet === "all" ? ALL_EXPORT_COLUMNS : columns;
    return p.includeDates ? [...new Set([...base, ...DATE_COLUMNS])] : base.filter((c) => !DATE_COLUMNS.includes(c));
  })();
  const params = new URLSearchParams(query);
  const rowsFor = p.scope === "page" ? pageCount : p.scope === "selected" ? selected.length : total;

  const go = async () => {
    try {
      localStorage.setItem("myseed.exportPrefs", JSON.stringify(p));
    } catch {
      /* storage blocked */
    }
    if (format === "pdf") {
      const r = new URLSearchParams({ mode: p.grouping === "subject" ? "subject" : "grade", dates: p.includeDates ? "1" : "0", orientation: p.orientation, breaks: p.pageBreaks ? "1" : "0" });
      const g = params.get("g");
      const s = params.get("s");
      if (g && !g.includes(",")) r.set("grade", g);
      if (s && !s.includes(",")) r.set("subject", s);
      window.open(`/export/report?${r}`, "_blank");
      setOpen(false);
      return;
    }
    if (format === "tracker") {
      window.location.href = "/api/export/tracker";
      setOpen(false);
      return;
    }
    setBusy(true);
    await downloadExport({ format: format as "csv" | "xlsx" | "json" | "audit", scope: p.scope, ids: p.scope === "selected" ? selected : undefined, columns: cols, query, grouping: p.grouping });
    setBusy(false);
    setOpen(false);
  };

  if (!formats.length) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(true)}>
        <DownloadIcon /> Export
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>Choose a format and what to include. Exports follow your current filters and only contain what you are allowed to see.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {formats.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => set("format", f.key)}
                    className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${format === f.key ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <span className="block font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">{f.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            {(tabular || format === "audit") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Rows</Label>
                  <Select value={p.scope} onValueChange={(v) => set("scope", v as ExportPrefs["scope"])}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All filtered rows ({total})</SelectItem>
                      <SelectItem value="page">This page ({pageCount})</SelectItem>
                      <SelectItem value="selected" disabled={!selected.length}>
                        Selected rows ({selected.length})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tabular && (
                  <div className="space-y-1.5">
                    <Label>Columns</Label>
                    <Select value={p.columnSet} onValueChange={(v) => set("columnSet", v as ExportPrefs["columnSet"])}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">As shown in this view ({columns.length})</SelectItem>
                        <SelectItem value="overview">Overview (stages and dates)</SelectItem>
                        <SelectItem value="all">Every column</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            {(tabular || format === "pdf") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Grouping</Label>
                  <Select value={p.grouping} onValueChange={(v) => set("grouping", v as ExportPrefs["grouping"])}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grade">Grade → Subject → Unit → Part</SelectItem>
                      <SelectItem value="subject">Subject → Grade → Unit → Part</SelectItem>
                      {tabular && <SelectItem value="none">Flat list</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                {format === "pdf" && (
                  <div className="space-y-1.5">
                    <Label>Page</Label>
                    <Select value={p.orientation} onValueChange={(v) => set("orientation", v as ExportPrefs["orientation"])}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="landscape">A4 landscape</SelectItem>
                        <SelectItem value="portrait">A4 portrait</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            {(tabular || format === "pdf") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={p.includeDates} onChange={(e) => set("includeDates", e.target.checked)} />
                Include recorded, edited, uploaded and publication dates
              </label>
            )}
            {format === "pdf" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={p.pageBreaks} onChange={(e) => set("pageBreaks", e.target.checked)} />
                Start each {p.grouping === "subject" ? "subject" : "grade"} on a new page
              </label>
            )}
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{fmt.label}:</span> {fmt.hint}
              {tabular && ` ${rowsFor} rows, ${cols.length + (p.grouping === "none" ? 0 : 4)} columns.`} Your choices are remembered for next time.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || (p.scope === "selected" && !selected.length && tabular)} onClick={go}>
              {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} {format === "pdf" ? "Open report" : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type BulkKind = "assign" | "priority" | "deadline" | "release" | "accept" | "submit" | "tags";
type BulkResult = { id: string; code: string; ok: boolean; error?: string; missing?: string[] };

function toRecord(r: ItemListRow): RecordLike {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    title_am: r.title_am,
    grade: r.grade_name,
    subject: r.subject_name,
    unit_number: r.unit_number,
    unit_title: r.unit_title,
    lesson_number: r.lesson_number,
    lesson_title: r.lesson_title,
    extra: { teacher: r.teacher, language: r.language, content_type: r.content_type, deliverable_type: r.deliverable_type, priority: r.priority, complexity: r.complexity, target_duration_min: r.target_duration_min },
  };
}

export function BulkBar({
  selected,
  onClear,
  users,
  perms,
  tz,
  rows = [],
  leads = [],
}: {
  selected: string[];
  onClear: () => void;
  users: { id: string; name: string; roles: Role[] }[];
  perms: Capability[];
  tz: string;
  rows?: ItemListRow[];
  leads?: Stage[];
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<BulkKind | null>(null);
  const [edit, setEdit] = React.useState<"rename" | "fill" | "trash" | "status" | "handover" | null>(null);
  // Stages whose status this person may set in bulk: all for managers and admins, their own for team leads.
  const statusStages: Stage[] = perms.includes("work.override") || perms.includes("data.manage") ? [...STAGES] : STAGES.filter((s) => leads.includes(s));
  const picked = rows.filter((r) => selected.includes(r.id)).map(toRecord);
  const editDone = () => {
    setEdit(null);
    onClear();
    router.refresh();
  };
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<BulkResult[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<BulkResult[] | null>(null);
  if (!selected.length) return null;

  const build = (): BulkInput | null => {
    switch (kind) {
      case "assign":
        return { action: "assign", stage: (form.stage || "editing") as Stage, userId: form.userId || null, reason: form.reason };
      case "priority":
        return form.priority ? { action: "priority", priority: form.priority } : null;
      case "deadline":
        return form.reason ? { action: "deadline", dueAt: form.date ? endOfLocalDayIso(form.date, tz) : null, reason: form.reason } : null;
      case "tags":
        return { action: "tags", tags: (form.tags ?? "").split(/[;,]/).map((t) => t.trim()).filter(Boolean) };
      case "release":
      case "accept":
      case "submit":
        return { action: kind };
      default:
        return null;
    }
  };

  const openKind = async (k: BulkKind) => {
    setKind(k);
    setForm({});
    setDone(null);
    setPreview(null);
    if (k === "release" || k === "accept" || k === "submit") {
      const res = await bulkAction(selected, { action: k }, true);
      if (res.ok) setPreview(res.data as BulkResult[]);
    }
  };

  const confirm = async () => {
    const input = build();
    if (!input) return;
    setBusy(true);
    const res = await bulkAction(selected, input, false);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const results = res.data as BulkResult[];
    setDone(results);
    const ok = results.filter((r) => r.ok).length;
    toast.success(`${ok} of ${results.length} updated`);
    router.refresh();
  };

  const results = done ?? preview;
  const eligible = preview?.filter((r) => r.ok).length;

  return (
    <>
      <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
        <span className="text-sm font-medium tabular">{selected.length} selected</span>
        {perms.includes("items.plan") && (
          <>
            <Button size="xs" variant="outline" onClick={() => openKind("assign")}>Assign</Button>
            <Button size="xs" variant="outline" onClick={() => openKind("priority")}>Priority</Button>
            <Button size="xs" variant="outline" onClick={() => openKind("deadline")}>Deadline</Button>
            <Button size="xs" variant="outline" onClick={() => openKind("tags")}>Tags</Button>
          </>
        )}
        {perms.includes("items.create") && <Button size="xs" variant="outline" onClick={() => openKind("release")}>Queue for Recording</Button>}
        <Button size="xs" variant="outline" onClick={() => openKind("accept")}>Accept handoffs</Button>
        <Button size="xs" variant="outline" onClick={() => openKind("submit")}>Submit handoffs</Button>
        {perms.includes("nav.handovers") && <Button size="xs" variant="outline" onClick={() => setEdit("handover")}>Hand over</Button>}
        {(perms.includes("items.plan") || perms.includes("data.manage")) && picked.length > 0 && (
          <>
            <Button size="xs" variant="outline" onClick={() => setEdit("rename")}>Rename</Button>
            <Button size="xs" variant="outline" onClick={() => setEdit("fill")}>Fill field</Button>
          </>
        )}
        {statusStages.length > 0 && (
          <Button size="xs" variant="outline" onClick={() => setEdit("status")}>Set status</Button>
        )}
        {perms.includes("export.run") && (
          <Button size="xs" variant="outline" onClick={() => downloadExport({ format: "xlsx", scope: "selected", ids: selected, columns: ALL_EXPORT_COLUMNS, query: "", grouping: "grade" })}>
            <DownloadIcon /> Export
          </Button>
        )}
        {perms.includes("data.manage") && picked.length > 0 && (
          <Button size="xs" variant="outline" className="text-destructive" onClick={() => setEdit("trash")}>Move to trash</Button>
        )}
        <Button size="xs" variant="ghost" onClick={onClear}>Clear</Button>
      </div>
      {edit === "rename" && <RenameDialog entity="items" rows={picked} onClose={() => setEdit(null)} onDone={editDone} />}
      {edit === "fill" && <FillDialog entity="items" rows={picked} fields={FILL_FIELDS.items} onClose={() => setEdit(null)} onDone={editDone} />}
      {edit === "handover" && <HandoverDialog preselected={selected} onClose={() => setEdit(null)} />}
      {edit === "status" && <StatusDialog ids={selected} stages={statusStages} onClose={() => setEdit(null)} onDone={editDone} />}
      {edit === "trash" && <TrashDialog entity="items" rows={picked} onClose={() => setEdit(null)} onDone={editDone} />}
      <Dialog open={!!kind} onOpenChange={(o) => !o && setKind(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk {kind} for {selected.length} items</DialogTitle>
            <DialogDescription>Each row goes through the same rules as a single change. Ineligible rows are reported and left unchanged.</DialogDescription>
          </DialogHeader>
          {kind === "assign" && (
            <div className="space-y-3">
              <Select value={form.stage || "editing"} onValueChange={(v) => setForm((f) => ({ ...f, stage: v, userId: "" }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
              <Combobox
                options={users.filter((u) => u.roles.includes((form.stage || "editing") as Role)).map((u) => ({ value: u.id, label: u.name }))}
                value={form.userId || null}
                onChange={(v) => setForm((f) => ({ ...f, userId: v ?? "" }))}
                placeholder="Unassigned"
              />
              <Input placeholder="Reason (optional)" value={form.reason ?? ""} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          )}
          {kind === "priority" && (
            <Select value={form.priority ?? ""} onValueChange={(v) => setForm({ priority: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose priority" /></SelectTrigger>
              <SelectContent>{Object.entries(PRIORITY_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {kind === "deadline" && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>New due date</Label><Input type="date" value={form.date ?? ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Reason (required)</Label><Textarea value={form.reason ?? ""} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
            </div>
          )}
          {kind === "tags" && <Input placeholder="pilot; term-1" value={form.tags ?? ""} onChange={(e) => setForm({ tags: e.target.value })} />}
          {results && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {preview && !done && <p className="px-1 pb-1 text-xs text-muted-foreground">{eligible} eligible, {preview.length - (eligible ?? 0)} ineligible</p>}
              {results.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs">
                  {r.ok ? <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--st-done-fg)]" /> : <CircleXIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--st-blocked-fg)]" />}
                  <span className="font-mono">{r.code}</span>
                  <span className="text-muted-foreground">{r.ok ? (done ? "Updated" : "Eligible") : r.missing?.length ? `Missing: ${r.missing.join("; ")}` : r.error}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setKind(null)}>{done ? "Close" : "Cancel"}</Button>
            {!done && (
              <Button disabled={busy || !build() || (preview !== null && !eligible)} onClick={confirm}>
                {busy && <Loader2Icon className="animate-spin" />}
                {preview ? `Apply to ${eligible} eligible` : "Apply"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
