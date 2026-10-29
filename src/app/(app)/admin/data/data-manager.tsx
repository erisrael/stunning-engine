"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HashIcon,
  InfoIcon,
  ListChecksIcon,
  Loader2Icon,
  MergeIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/primitives";
import {
  fixHealthAction,
  lessonsForUnitAction,
  mergeRecordsAction,
  moveRecordsAction,
  purgeTrashAction,
  recodeItemsAction,
  renameRecordsAction,
  restoreTrashAction,
} from "@/app/actions/data-admin";
import { upsertGradeAction, upsertLessonAction, upsertSubjectAction, upsertUnitAction } from "@/app/actions/admin";
import type { DataRecord, HealthIssue, ImportBatch, RecordFilter } from "@/server/data-admin";
import type { FILL_FIELDS, RecordEntity } from "@/lib/data-fields";
import { ENTITY_LABELS, FillDialog, RenameDialog, ResultList, StatusDialog, TrashDialog, useApply, type Result } from "@/components/app/record-dialogs";
import type { TrashRow } from "@/server/trash";
import { LIFECYCLE_LABELS, STAGE_LABELS, STAGES, STATUS_LABELS, type AttemptStatus, type Lifecycle, type Stage } from "@/lib/domain";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tax = {
  grades: { id: string; code: string; name: string }[];
  subjects: { id: string; code: string; name: string }[];
  units: { id: string; gradeId: string; subjectId: string; number: number; title: string }[];
  offered: string[];
};

const PAGE = 200;

export function DataManager(props: {
  tab: "records" | "health" | "batches" | "trash";
  filter: RecordFilter;
  records: { rows: DataRecord[]; capped: boolean } | null;
  health: HealthIssue[] | null;
  batches: ImportBatch[] | null;
  trash: TrashRow[] | null;
  retentionDays: number;
  fillFields: typeof FILL_FIELDS;
  taxonomy: Tax;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="space-y-4">
      <Tabs value={props.tab} onValueChange={(v) => go({ tab: v === "records" ? null : v })}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="health">Data health</TabsTrigger>
          <TabsTrigger value="batches">Import batches</TabsTrigger>
          <TabsTrigger value="trash">Trash</TabsTrigger>
        </TabsList>
      </Tabs>
      {props.tab === "records" && props.records && <Records {...props} records={props.records} go={go} />}
      {props.tab === "health" && props.health && <Health issues={props.health} />}
      {props.tab === "batches" && props.batches && <Batches batches={props.batches} />}
      {props.tab === "trash" && props.trash && <Trash rows={props.trash} retentionDays={props.retentionDays} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function statusLabel(r: DataRecord) {
  if (!r.status) return null;
  const [stage, status] = r.status.split(":");
  if (status !== undefined) return `${STAGE_LABELS[stage as Stage] ?? stage} · ${STATUS_LABELS[status as AttemptStatus] ?? (status || "-")}`;
  return LIFECYCLE_LABELS[stage as Lifecycle] ?? stage;
}

function placement(r: DataRecord, entity: RecordEntity) {
  const parts: string[] = [];
  if (r.grade) parts.push(r.grade);
  if (r.subject) parts.push(r.subject);
  if (entity !== "units" && r.unit_number != null) parts.push(`U${r.unit_number}`);
  if (entity === "items" && r.lesson_number != null) parts.push(`P${r.lesson_number}`);
  return parts.join(" / ");
}

function Records({
  filter,
  records,
  taxonomy,
  fillFields,
  go,
}: {
  filter: RecordFilter;
  records: { rows: DataRecord[]; capped: boolean };
  taxonomy: Tax;
  fillFields: typeof FILL_FIELDS;
  go: (patch: Record<string, string | null>) => void;
}) {
  const router = useRouter();
  const entity = filter.entity;
  const rows = records.rows;
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(0);
  const [q, setQ] = React.useState(filter.q ?? "");
  const [dialog, setDialog] = React.useState<null | "rename" | "fill" | "move" | "merge" | "trash" | "create" | "status">(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  React.useEffect(() => {
    setSelected(new Set());
    setPage(0);
  }, [entity, filter.gradeId, filter.subjectId, filter.unitId, filter.q, filter.unplaced]);

  const sel = rows.filter((r) => selected.has(r.id));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(rows.length / PAGE);
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const done = () => {
    setDialog(null);
    router.refresh();
  };
  const units = taxonomy.units.filter((u) => (!filter.gradeId || u.gradeId === filter.gradeId) && (!filter.subjectId || u.subjectId === filter.subjectId));
  const hasPlacement = entity === "items" || entity === "lessons" || entity === "units";

  const saveTitle = async (r: DataRecord, value: string) => {
    setEditing(null);
    if (value.trim() === r.title) return;
    const res = await renameRecordsAction(entity, "title", [{ id: r.id, value }]);
    const failed = res.ok ? (res.data as Result[]).find((x) => !x.ok) : null;
    if (!res.ok || failed) return toast.error(res.ok ? failed?.error : res.error);
    toast.success("Renamed");
    router.refresh();
  };

  const exportCsv = () => {
    const list = sel.length ? sel : rows;
    const head = ["id", "code", "number", "title", "title_am", "grade", "subject", "unit_number", "unit_title", "lesson_number", "lesson_title", "status", "children", ...Object.keys(list[0]?.extra ?? {})];
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(","), ...list.map((r) => head.map((h) => cell(h in r ? (r as Record<string, unknown>)[h] : r.extra[h])).join(","))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}-${new Date().toISOString().slice(0, 10)}${sel.length ? "-selected" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const recode = async () => {
    const t = toast.loading("Rebuilding codes");
    const res = await recodeItemsAction(sel.map((r) => r.id));
    if (!res.ok) return toast.error(res.error, { id: t });
    toast.success(`${(res.data as { changed: number }).changed} codes changed`, { id: t, description: "Codes already matching their placement were left alone." });
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          {(Object.keys(ENTITY_LABELS) as RecordEntity[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => go({ entity: e === "items" ? null : e, unplaced: null })}
              className={cn("rounded-md px-2.5 py-1 text-sm font-medium", entity === e ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {ENTITY_LABELS[e].many}
            </button>
          ))}
        </div>
        {entity !== "grades" && entity !== "subjects" && (
          <>
            <Combobox
              size="sm"
              className="w-40"
              options={taxonomy.grades.map((g) => ({ value: g.id, label: g.name }))}
              value={filter.gradeId ?? null}
              onChange={(v) => go({ g: v, u: null })}
              placeholder="All grades"
            />
            <Combobox
              size="sm"
              className="w-44"
              options={taxonomy.subjects.map((s) => ({ value: s.id, label: s.name }))}
              value={filter.subjectId ?? null}
              onChange={(v) => go({ s: v, u: null })}
              placeholder="All subjects"
            />
          </>
        )}
        {(entity === "items" || entity === "lessons") && (
          <Combobox
            size="sm"
            className="w-52"
            options={units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}`, hint: `${taxonomy.grades.find((g) => g.id === u.gradeId)?.name} / ${taxonomy.subjects.find((s) => s.id === u.subjectId)?.name}` }))}
            value={filter.unitId ?? null}
            onChange={(v) => go({ u: v })}
            placeholder="All units"
          />
        )}
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className="h-7 w-52 pl-7 text-sm" />
        </form>
        {entity === "items" && (
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={!!filter.unplaced} onCheckedChange={(v) => go({ unplaced: v ? "1" : null })} />
            Unplaced only
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <DownloadIcon /> {sel.length ? `Export ${sel.length}` : "Export CSV"}
          </Button>
          {entity === "items" ? (
            <Button size="sm" asChild>
              <Link href="/items/new">
                <PlusIcon /> New item
              </Link>
            </Button>
          ) : (
            <Button size="sm" onClick={() => setDialog("create")}>
              <PlusIcon /> New {ENTITY_LABELS[entity].one}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length.toLocaleString("en-US")} {ENTITY_LABELS[entity].many.toLowerCase()}
        {records.capped && " (first 2,000; narrow the filters to see the rest)"}. Double-click a name to rename it.
      </p>

      {!rows.length ? (
        <EmptyState title="Nothing matches" description="Change the filters or the record type." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2">
                  <Checkbox aria-label="Select all" checked={allSelected ? true : selected.size ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                <th className="p-2 font-medium">{entity === "items" || entity === "grades" || entity === "subjects" ? "Code" : "No."}</th>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Amharic</th>
                {hasPlacement && <th className="p-2 font-medium">Placement</th>}
                {entity === "items" && <th className="p-2 font-medium">Part</th>}
                {entity === "items" ? <th className="p-2 font-medium">Status</th> : <th className="p-2 text-right font-medium">{entity === "lessons" ? "Items" : entity === "units" ? "Parts" : "Units"}</th>}
                {(entity === "grades" || entity === "subjects") && <th className="p-2 font-medium">State</th>}
                <th className="w-8 p-2" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className={cn("border-t", selected.has(r.id) && "bg-primary/5")}>
                  <td className="p-2">
                    <Checkbox aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{r.code ?? r.number}</td>
                  <td className="max-w-[360px] p-2" onDoubleClick={() => setEditing(r.id)}>
                    {editing === r.id ? (
                      <Input
                        autoFocus
                        defaultValue={r.title}
                        className="h-7 text-sm"
                        onBlur={(e) => saveTitle(r, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span className="group flex items-center gap-1">
                        <span className="truncate">{r.title || <em className="text-muted-foreground">empty</em>}</span>
                        <button type="button" className="opacity-0 group-hover:opacity-100" aria-label="Rename" onClick={() => setEditing(r.id)}>
                          <PencilIcon className="size-3 text-muted-foreground" />
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate p-2 text-muted-foreground">{r.title_am}</td>
                  {hasPlacement && (
                    <td className="p-2 text-xs whitespace-nowrap">{placement(r, entity) || <Badge variant="destructive">Unplaced</Badge>}</td>
                  )}
                  {entity === "items" && <td className="max-w-[220px] truncate p-2 text-xs text-muted-foreground">{r.lesson_title ?? "-"}</td>}
                  {entity === "items" ? (
                    <td className="p-2 text-xs whitespace-nowrap">{statusLabel(r)}</td>
                  ) : (
                    <td className="p-2 text-right tabular">{r.children}</td>
                  )}
                  {(entity === "grades" || entity === "subjects") && (
                    <td className="p-2">
                      <Badge variant={r.status === "active" ? "secondary" : "outline"}>{r.status}</Badge>
                    </td>
                  )}
                  <td className="p-2">
                    {entity === "items" && (
                      <Link href={`/items/${r.id}`} className="text-muted-foreground hover:text-foreground" aria-label="Open item">
                        <ExternalLinkIcon className="size-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="xs" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="tabular text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button size="xs" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {sel.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{sel.length} selected</span>
          <Button size="xs" variant="outline" onClick={() => setDialog("rename")}>
            <PencilLineIcon /> Rename
          </Button>
          <Button size="xs" variant="outline" onClick={() => setDialog("fill")}>
            <WandSparklesIcon /> Fill field
          </Button>
          {hasPlacement && (
            <Button size="xs" variant="outline" onClick={() => setDialog("move")}>
              <ArrowRightLeftIcon /> Move
            </Button>
          )}
          {(entity === "grades" || entity === "subjects") && (
            <Button size="xs" variant="outline" onClick={() => setDialog("merge")}>
              <MergeIcon /> Merge
            </Button>
          )}
          {entity === "items" && (
            <Button size="xs" variant="outline" onClick={() => setDialog("status")}>
              <ListChecksIcon /> Set status
            </Button>
          )}
          {entity === "items" && (
            <Button size="xs" variant="outline" onClick={recode}>
              <HashIcon /> Rebuild codes
            </Button>
          )}
          <Button size="xs" variant="outline" onClick={exportCsv}>
            <DownloadIcon /> Export
          </Button>
          <Button size="xs" variant="outline" className="text-destructive" onClick={() => setDialog("trash")}>
            <Trash2Icon /> Move to trash
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
            <XIcon /> Clear
          </Button>
        </div>
      )}

      {dialog === "rename" && <RenameDialog entity={entity} rows={sel} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "fill" && <FillDialog entity={entity} rows={sel} fields={fillFields[entity]} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "move" && <MoveDialog entity={entity} rows={sel} taxonomy={taxonomy} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "merge" && <MergeDialog entity={entity as "grades" | "subjects"} rows={sel} all={rows} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "status" && <StatusDialog ids={sel.map((r) => r.id)} stages={[...STAGES]} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "trash" && <TrashDialog entity={entity} rows={sel} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "create" && <CreateDialog entity={entity} filter={filter} taxonomy={taxonomy} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fill, move, merge, trash, create
// ---------------------------------------------------------------------------

function MoveDialog({ entity, rows, taxonomy, onClose, onDone }: { entity: RecordEntity; rows: DataRecord[]; taxonomy: Tax; onClose: () => void; onDone: () => void }) {
  const first = rows[0];
  const [gradeId, setGradeId] = React.useState<string | null>(first?.grade_id ?? null);
  const [subjectId, setSubjectId] = React.useState<string | null>(first?.subject_id ?? null);
  const [unitId, setUnitId] = React.useState<string | null>(null);
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  const [lessons, setLessons] = React.useState<{ id: string; number: number; title: string }[]>([]);
  const [recode, setRecode] = React.useState(false);
  const { busy, results, apply } = useApply(onDone);
  const units = taxonomy.units.filter((u) => u.gradeId === gradeId && u.subjectId === subjectId);
  React.useEffect(() => {
    setLessonId(null);
    setLessons([]);
    if (entity === "items" && unitId) void lessonsForUnitAction(unitId).then((r) => r.ok && setLessons(r.data as typeof lessons));
  }, [unitId, entity]);
  const needsUnit = entity === "lessons";
  const offered = gradeId && subjectId ? taxonomy.offered.includes(`${gradeId}|${subjectId}`) : true;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {rows.length} {rows.length === 1 ? ENTITY_LABELS[entity].one : ENTITY_LABELS[entity].many.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {entity === "items" && "Sets the grade, subject and unit (and optionally the part). Other placements are kept. Use this to fix items imported under the wrong subject."}
            {entity === "lessons" && "Moves the parts into another unit. Their items follow. A clashing part number is moved to the end."}
            {entity === "units" && "Moves whole units, with their parts and items, to another grade or subject. A clashing unit number is moved to the end."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Grade</Label>
              <Combobox options={taxonomy.grades.map((g) => ({ value: g.id, label: g.name }))} value={gradeId} onChange={(v) => (setGradeId(v), setUnitId(null))} allowClear={false} />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Combobox options={taxonomy.subjects.map((s) => ({ value: s.id, label: s.name }))} value={subjectId} onChange={(v) => (setSubjectId(v), setUnitId(null))} allowClear={false} />
            </div>
          </div>
          {!offered && <p className="text-xs text-muted-foreground">This subject is not yet offered in this grade; it will be switched on.</p>}
          {entity !== "units" && (
            <div className="space-y-1.5">
              <Label>Unit{needsUnit ? "" : " (optional)"}</Label>
              <Combobox options={units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}` }))} value={unitId} onChange={setUnitId} placeholder={units.length ? "No unit" : "No units in this grade and subject"} />
            </div>
          )}
          {entity === "items" && unitId && (
            <div className="space-y-1.5">
              <Label>Part (optional)</Label>
              <Combobox options={lessons.map((l) => ({ value: l.id, label: `Part ${l.number}: ${l.title}` }))} value={lessonId} onChange={setLessonId} placeholder="Keep the current part if it is in this unit" />
            </div>
          )}
          {entity !== "subjects" && entity !== "grades" && (
            <label className="flex items-start gap-1.5 text-sm">
              <Checkbox className="mt-0.5" checked={recode} onCheckedChange={(v) => setRecode(!!v)} />
              <span>
                Rebuild item codes from the new placement
                <span className="block text-xs text-muted-foreground">Leave off if codes are used outside this app, such as in file names.</span>
              </span>
            </label>
          )}
        </div>
        {results && <ResultList results={results} rows={rows} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !gradeId || !subjectId || (needsUnit && !unitId)}
            onClick={() => apply(() => moveRecordsAction(entity, rows.map((r) => r.id), { gradeId: gradeId!, subjectId: subjectId!, unitId, lessonId, recode }), "moved")}
          >
            {busy && <Loader2Icon className="animate-spin" />} Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ entity, rows, all, onClose, onDone }: { entity: "grades" | "subjects"; rows: DataRecord[]; all: DataRecord[]; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = React.useState<string | null>(rows.length > 1 ? rows[0].id : null);
  const [busy, setBusy] = React.useState(false);
  const sources = rows.filter((r) => r.id !== target);
  const go = async () => {
    setBusy(true);
    const res = await mergeRecordsAction(entity, sources.map((r) => r.id), target!);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Merged ${sources.length} into ${all.find((r) => r.id === target)?.title}`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {entity}</DialogTitle>
          <DialogDescription>
            Everything in the merged {entity} (units, parts, items, access and chat groups) moves into the one you keep. Units with the same number are combined. The emptied records go to the trash.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Keep</Label>
          <Combobox options={all.map((r) => ({ value: r.id, label: `${r.title} (${r.code})` }))} value={target} onChange={setTarget} allowClear={false} placeholder="Choose the record to keep" />
        </div>
        {target && (
          <p className="text-sm">
            Merging <span className="font-medium">{sources.map((s) => s.title).join(", ") || "nothing"}</span> into <span className="font-medium">{all.find((r) => r.id === target)?.title}</span>.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !target || !sources.length} onClick={go}>
            {busy && <Loader2Icon className="animate-spin" />} Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ entity, filter, taxonomy, onClose, onDone }: { entity: RecordEntity; filter: RecordFilter; taxonomy: Tax; onClose: () => void; onDone: () => void }) {
  const [f, setF] = React.useState<Record<string, string>>({ gradeId: filter.gradeId ?? "", subjectId: filter.subjectId ?? "", unitId: filter.unitId ?? "", number: "1", sort: "0" });
  const [busy, setBusy] = React.useState(false);
  const set = (k: string, v: string | null) => setF((x) => ({ ...x, [k]: v ?? "" }));
  const units = taxonomy.units.filter((u) => u.gradeId === f.gradeId && u.subjectId === f.subjectId);
  const save = async () => {
    setBusy(true);
    const res =
      entity === "grades"
        ? await upsertGradeAction({ code: f.code ?? "", name: f.name ?? "", sort: Number(f.sort) || 0, active: true })
        : entity === "subjects"
          ? await upsertSubjectAction({ code: f.code ?? "", name: f.name ?? "", nameAm: f.nameAm, sort: Number(f.sort) || 0, active: true })
          : entity === "units"
            ? await upsertUnitAction({ gradeId: f.gradeId, subjectId: f.subjectId, number: Number(f.number), title: f.name ?? "", titleAm: f.nameAm, term: f.term })
            : await upsertLessonAction({ unitId: f.unitId, number: Number(f.number), title: f.name ?? "", titleAm: f.nameAm });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Created");
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {ENTITY_LABELS[entity].one}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {(entity === "units" || entity === "lessons") && (
            <>
              <div className="space-y-1.5">
                <Label>Grade</Label>
                <Combobox options={taxonomy.grades.map((g) => ({ value: g.id, label: g.name }))} value={f.gradeId || null} onChange={(v) => (set("gradeId", v), set("unitId", ""))} />
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Combobox options={taxonomy.subjects.map((s) => ({ value: s.id, label: s.name }))} value={f.subjectId || null} onChange={(v) => (set("subjectId", v), set("unitId", ""))} />
              </div>
            </>
          )}
          {entity === "lessons" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Unit</Label>
              <Combobox options={units.map((u) => ({ value: u.id, label: `Unit ${u.number}: ${u.title}` }))} value={f.unitId || null} onChange={(v) => set("unitId", v)} />
            </div>
          )}
          {(entity === "grades" || entity === "subjects") && (
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={f.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder={entity === "grades" ? "G08" : "MATH"} />
            </div>
          )}
          {(entity === "units" || entity === "lessons") && (
            <div className="space-y-1.5">
              <Label>Number</Label>
              <Input type="number" min={1} value={f.number} onChange={(e) => set("number", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          {entity !== "grades" && (
            <div className="space-y-1.5">
              <Label>Amharic name</Label>
              <Input value={f.nameAm ?? ""} onChange={(e) => set("nameAm", e.target.value)} />
            </div>
          )}
          {entity === "units" && (
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Input value={f.term ?? ""} onChange={(e) => set("term", e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !f.name?.trim() || (entity === "lessons" && !f.unitId) || (entity === "units" && (!f.gradeId || !f.subjectId))} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Data health
// ---------------------------------------------------------------------------

const SEVERITY = {
  error: { icon: CircleAlertIcon, className: "text-destructive", label: "Broken" },
  warning: { icon: AlertTriangleIcon, className: "text-amber-600 dark:text-amber-400", label: "Check" },
  info: { icon: InfoIcon, className: "text-muted-foreground", label: "Tidy up" },
};

function Health({ issues }: { issues: HealthIssue[] }) {
  if (!issues.length)
    return <EmptyState icon={<CheckIcon className="size-5" />} title="No problems found" description="Placements, names, offerings and duplicates all look consistent." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {issues.length} kinds of problems found. Fixes that delete anything move it to the trash, so they can be undone.
      </p>
      {issues.map((i) => (
        <HealthCard key={i.key} issue={i} />
      ))}
    </div>
  );
}

function HealthCard({ issue }: { issue: HealthIssue }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(issue.severity === "error");
  // Only clear breakage starts selected; warnings and tidy-ups are picked by hand.
  const [picked, setPicked] = React.useState<Set<string>>(new Set(issue.severity === "error" ? issue.rows.map((r) => r.id) : []));
  const [busy, setBusy] = React.useState<"fix" | "trash" | null>(null);
  const [confirmTrash, setConfirmTrash] = React.useState(false);
  const S = SEVERITY[issue.severity];
  const selectable = !!(issue.fix || issue.trash);
  const fix = async (mode: "fix" | "trash") => {
    setBusy(mode);
    const res = await fixHealthAction(issue.key, [...picked], mode);
    setBusy(null);
    setConfirmTrash(false);
    if (!res.ok) return toast.error(res.error);
    const { fixed, errors } = res.data as { fixed: number; errors: string[] };
    const verb = mode === "trash" ? "moved to trash" : "fixed";
    if (errors.length) toast.warning(`${fixed} ${verb}, ${errors.length} failed`, { description: errors.slice(0, 3).join("\n") });
    else toast.success(`${fixed} ${verb}`);
    router.refresh();
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <S.icon className={cn("size-4", S.className)} /> {issue.title}
              <Badge variant="secondary" className="tabular">
                {issue.total}
              </Badge>
            </CardTitle>
            <CardDescription>{issue.description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Show"}
            </Button>
            {issue.fix && (
              <Button size="sm" disabled={!!busy || !picked.size} onClick={() => fix("fix")}>
                {busy === "fix" ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />} {issue.fix} ({picked.size})
              </Button>
            )}
            {issue.trash && (
              <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy || !picked.size} onClick={() => (setOpen(true), setConfirmTrash(true))}>
                <Trash2Icon /> {issue.trash} ({picked.size})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 text-left text-muted-foreground backdrop-blur">
                <tr>
                  {selectable && (
                    <th className="w-8 p-1.5">
                      <Checkbox
                        checked={picked.size === issue.rows.length ? true : picked.size ? "indeterminate" : false}
                        onCheckedChange={(v) => setPicked(v ? new Set(issue.rows.map((r) => r.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th className="p-1.5 font-medium">Record</th>
                  <th className="p-1.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {issue.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    {selectable && (
                      <td className="p-1.5">
                        <Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(r.id)) : (s.delete(r.id), new Set(s))))} />
                      </td>
                    )}
                    <td className="p-1.5">
                      {r.link ? (
                        <Link href={r.link} className="hover:underline">
                          {r.label}
                        </Link>
                      ) : (
                        r.label
                      )}
                    </td>
                    <td className="p-1.5 text-muted-foreground">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {issue.total > issue.rows.length && <p className="mt-1.5 text-xs text-muted-foreground">Showing the first {issue.rows.length}. Fix these and refresh to see more.</p>}
        </CardContent>
      )}
      <Dialog open={confirmTrash} onOpenChange={setConfirmTrash}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {issue.trash} ({picked.size})?
            </DialogTitle>
            <DialogDescription>
              {issue.key === "offering"
                ? "Every unit of each selected grade and subject goes to the trash, with its parts and items."
                : "Items go with their parts when no other item uses them."}{" "}
              Everything can be restored from Trash.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTrash(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => fix("trash")}>
              {busy === "trash" && <Loader2Icon className="animate-spin" />} Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

function Batches({ batches }: { batches: ImportBatch[] }) {
  const router = useRouter();
  const [undo, setUndo] = React.useState<ImportBatch | null>(null);
  if (!batches.length) return <EmptyState title="No imports yet" description="Imports run from Import and export appear here." />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Undoing an import moves every item it created to the trash as one entry, so the whole import can be restored together. Updates an import made to existing items are not undone.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">When</th>
              <th className="p-2 font-medium">Import</th>
              <th className="p-2 font-medium">By</th>
              <th className="p-2 text-right font-medium">Created</th>
              <th className="p-2 text-right font-medium">Updated</th>
              <th className="p-2 text-right font-medium">Items still present</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-2 text-xs whitespace-nowrap">{fmtRelative(b.created_at)}</td>
                <td className="p-2">
                  <span className="font-medium">{b.file_name ?? b.kind}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.kind}
                    {b.template ? ` · ${b.template}` : ""} · {b.status}
                  </span>
                </td>
                <td className="p-2 text-xs">{b.actor ?? "-"}</td>
                <td className="p-2 text-right tabular">{b.created_count}</td>
                <td className="p-2 text-right tabular">{b.updated_count}</td>
                <td className="p-2 text-right tabular">{b.live_items}</td>
                <td className="p-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="outline" asChild>
                      <Link href={`/import-export?job=${b.id}`}>Report</Link>
                    </Button>
                    <Button size="xs" variant="outline" className="text-destructive" disabled={!b.live_items} onClick={() => setUndo(b)}>
                      <RotateCcwIcon /> Undo import
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {undo && (
        <TrashDialog
          entity="batch"
          rows={[{ id: undo.id, title: `${undo.live_items} items from ${undo.file_name ?? undo.kind}` }]}
          onClose={() => setUndo(null)}
          onDone={() => {
            setUndo(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

function Trash({ rows, retentionDays }: { rows: TrashRow[]; retentionDays: number }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<"restore" | "purge" | null>(null);
  const [confirmPurge, setConfirmPurge] = React.useState(false);
  const ids = [...picked];
  const restore = async (list: string[]) => {
    setBusy("restore");
    const res = await restoreTrashAction(list);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    const results = res.data as Result[];
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast.error(`${results.length - failed.length} restored, ${failed.length} failed`, { description: failed[0].error, duration: 10000 });
    else toast.success(`${results.length} restored`);
    setPicked(new Set());
    router.refresh();
  };
  const purge = async () => {
    setBusy("purge");
    const res = await purgeTrashAction(ids);
    setBusy(null);
    setConfirmPurge(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.data} permanently deleted`);
    setPicked(new Set());
    router.refresh();
  };
  if (!rows.length) return <EmptyState icon={<Trash2Icon className="size-5" />} title="Trash is empty" description={`Deleted records stay here for ${retentionDays} days.`} />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Deleted records stay here for {retentionDays} days, then they are removed for good. Restore puts back the record and everything deleted with it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={!ids.length || !!busy} onClick={() => restore(ids)}>
            {busy === "restore" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Restore {ids.length || ""}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" disabled={!ids.length || !!busy} onClick={() => setConfirmPurge(true)}>
            <Trash2Icon /> Delete permanently
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <Checkbox checked={picked.size === rows.length ? true : picked.size ? "indeterminate" : false} onCheckedChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} />
              </th>
              <th className="p-2 font-medium">Record</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 text-right font-medium">Rows</th>
              <th className="p-2 font-medium">Deleted</th>
              <th className="p-2 font-medium">Reason</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(r.id)) : (s.delete(r.id), new Set(s))))} />
                </td>
                <td className="p-2">
                  <span className="font-medium">{r.label}</span>
                  {r.detail && <span className="block text-xs text-muted-foreground">{r.detail}</span>}
                </td>
                <td className="p-2 text-xs capitalize">{r.entity === "lesson" ? "part" : r.entity === "batch" ? "import" : r.entity}</td>
                <td className="p-2 text-right tabular">{r.row_count}</td>
                <td className="p-2 text-xs whitespace-nowrap">
                  {fmtRelative(r.deleted_at)}
                  <span className="block text-muted-foreground">{r.deleted_by_name ?? "System"}</span>
                </td>
                <td className="max-w-[240px] truncate p-2 text-xs text-muted-foreground">{r.reason ?? "-"}</td>
                <td className="p-2 text-right">
                  <Button size="xs" variant="outline" disabled={!!busy} onClick={() => restore([r.id])}>
                    <RotateCcwIcon /> Restore
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {ids.length} permanently?</DialogTitle>
            <DialogDescription>This cannot be undone. The records and everything deleted with them are gone for good.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPurge(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy === "purge"} onClick={purge}>
              {busy === "purge" && <Loader2Icon className="animate-spin" />} Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
