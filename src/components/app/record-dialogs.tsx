"use client";

// Bulk dialogs shared by the admin data manager and the List view: rename, fill a field, set status and move to trash.

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, CircleXIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fillRecordsAction, overrideStatusAction, previewTrashAction, renameRecordsAction, trashRecordsAction } from "@/app/actions/data-admin";
import type { FillField, RecordEntity } from "@/lib/data-fields";
import { SHEET_STATUS_OPTIONS, STAGE_LABELS, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

// The fields the dialogs read; DataRecord rows and List view rows both fit.
export type RecordLike = {
  id: string;
  code?: string | null;
  number?: number | null;
  title: string;
  title_am: string | null;
  grade?: string | null;
  subject?: string | null;
  unit_number?: number | null;
  unit_title?: string | null;
  lesson_number?: number | null;
  lesson_title?: string | null;
  extra?: Record<string, string | number | null>;
};
export type Result = { id: string; ok: boolean; error?: string };

export const ENTITY_LABELS: Record<RecordEntity, { one: string; many: string }> = {
  items: { one: "item", many: "Items" },
  lessons: { one: "part", many: "Parts" },
  units: { one: "unit", many: "Units" },
  subjects: { one: "subject", many: "Subjects" },
  grades: { one: "grade", many: "Grades" },
};


export function ResultList({ results, rows }: { results: Result[]; rows: RecordLike[] }) {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return null;
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 p-2 text-xs">
      {failed.map((f) => (
        <p key={f.id}>
          <span className="font-medium">{rows.find((r) => r.id === f.id)?.title ?? f.id}:</span> <span className="text-muted-foreground">{f.error}</span>
        </p>
      ))}
    </div>
  );
}

export function useApply(onDone: () => void) {
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<Result[] | null>(null);
  const apply = async (fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, noun: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const list = (res.data as Result[]) ?? [];
    const ok = list.filter((r) => r.ok).length;
    if (ok === list.length) {
      toast.success(`${ok} ${noun}`);
      onDone();
    } else {
      toast.warning(`${ok} of ${list.length} ${noun}`);
      setResults(list);
    }
  };
  return { busy, results, apply };
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

type RenameOp = "replace" | "prefix" | "suffix" | "pattern" | "case" | "clean" | "remove";

const OP_LABELS: Record<RenameOp, string> = {
  replace: "Find and replace",
  prefix: "Add text before",
  suffix: "Add text after",
  pattern: "Rename with a pattern",
  case: "Change capitals",
  clean: "Clean up spaces and punctuation",
  remove: "Remove text",
};

function toCase(s: string, mode: string) {
  if (mode === "upper") return s.toUpperCase();
  if (mode === "lower") return s.toLowerCase();
  if (mode === "sentence") return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return s.toLowerCase().replace(/(^|[\s\-(/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export function RenameDialog({ entity, rows, onClose, onDone }: { entity: RecordEntity; rows: RecordLike[]; onClose: () => void; onDone: () => void }) {
  const [field, setField] = React.useState<"title" | "title_am">("title");
  const [op, setOp] = React.useState<RenameOp>("replace");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [regex, setRegex] = React.useState(false);
  const [matchCase, setMatchCase] = React.useState(false);
  const [start, setStart] = React.useState(1);
  const [pad, setPad] = React.useState(2);
  const [caseMode, setCaseMode] = React.useState("title");
  const { busy, results, apply } = useApply(onDone);

  const compute = React.useCallback(
    (r: RecordLike, i: number): string | Error => {
      const cur = (field === "title" ? r.title : r.title_am) ?? "";
      try {
        switch (op) {
          case "replace":
          case "remove": {
            if (!a) return cur;
            const flags = matchCase ? "g" : "gi";
            const re = regex ? new RegExp(a, flags) : new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
            return cur.replace(re, op === "remove" ? "" : b);
          }
          case "prefix":
            return a + cur;
          case "suffix":
            return cur + a;
          case "case":
            return toCase(cur, caseMode);
          case "clean":
            return cur
              .replace(/[​-‍﻿]/g, "")
              .replace(/\s+/g, " ")
              .replace(/\s+([,.;:!?])/g, "$1")
              .replace(/^[\s\-_.,;:]+|[\s\-_,;:]+$/g, "")
              .trim();
          case "pattern": {
            const n = String(start + i).padStart(pad, "0");
            return a
              .replace(/\{title\}/g, cur)
              .replace(/\{n\}/g, n)
              .replace(/\{code\}/g, r.code ?? "")
              .replace(/\{number\}/g, r.number != null ? String(r.number) : "")
              .replace(/\{grade\}/g, r.grade ?? "")
              .replace(/\{subject\}/g, r.subject ?? "")
              .replace(/\{unit\}/g, r.unit_number != null ? String(r.unit_number) : "")
              .replace(/\{unit_title\}/g, r.unit_title ?? "")
              .replace(/\{part\}/g, r.lesson_number != null ? String(r.lesson_number) : "")
              .replace(/\{part_title\}/g, r.lesson_title ?? "");
          }
        }
      } catch (err) {
        return err instanceof Error ? err : new Error("Invalid pattern");
      }
    },
    [field, op, a, b, regex, matchCase, start, pad, caseMode],
  );

  const preview = rows.map((r, i) => {
    const before = (field === "title" ? r.title : r.title_am) ?? "";
    const after = compute(r, i);
    return { r, before, after };
  });
  const error = preview.find((p) => p.after instanceof Error)?.after as Error | undefined;
  const changes = preview.filter((p) => typeof p.after === "string" && p.after.replace(/\s+/g, " ").trim() !== p.before);
  const emptied = changes.some((p) => field === "title" && !(p.after as string).trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Rename {rows.length} {rows.length === 1 ? ENTITY_LABELS[entity].one : ENTITY_LABELS[entity].many.toLowerCase()}
          </DialogTitle>
          <DialogDescription>Check the preview, then apply. Only rows that change are saved, and each rename is kept in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name to change</Label>
            <Select value={field} onValueChange={(v) => setField(v as "title" | "title_am")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Name</SelectItem>
                {entity !== "grades" && <SelectItem value="title_am">Amharic name</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Change</Label>
            <Select value={op} onValueChange={(v) => setOp(v as RenameOp)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(OP_LABELS) as RenameOp[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {OP_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(op === "replace" || op === "remove") && (
            <>
              <div className="space-y-1.5">
                <Label>Find</Label>
                <Input value={a} onChange={(e) => setA(e.target.value)} placeholder={regex ? "Regular expression" : "Text"} />
              </div>
              {op === "replace" && (
                <div className="space-y-1.5">
                  <Label>Replace with</Label>
                  <Input value={b} onChange={(e) => setB(e.target.value)} placeholder={regex ? "Use $1 for groups" : "Text"} />
                </div>
              )}
              <div className="flex gap-4 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={matchCase} onCheckedChange={(v) => setMatchCase(!!v)} /> Match capitals
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={regex} onCheckedChange={(v) => setRegex(!!v)} /> Regular expression
                </label>
              </div>
            </>
          )}
          {(op === "prefix" || op === "suffix") && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Text</Label>
              <Input value={a} onChange={(e) => setA(e.target.value)} />
            </div>
          )}
          {op === "case" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Capitals</Label>
              <Select value={caseMode} onValueChange={setCaseMode}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Title Case</SelectItem>
                  <SelectItem value="sentence">Sentence case</SelectItem>
                  <SelectItem value="upper">UPPERCASE</SelectItem>
                  <SelectItem value="lower">lowercase</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {op === "pattern" && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Pattern</Label>
                <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Part {n}: {title}" />
                <p className="text-xs text-muted-foreground">
                  Placeholders: {"{title} {n} {code} {number} {grade} {subject} {unit} {unit_title} {part} {part_title}"}. {"{n}"} counts in the order shown.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{"{n}"} starts at</Label>
                <Input type="number" value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>{"{n}"} digits</Label>
                <Input type="number" min={1} max={5} value={pad} onChange={(e) => setPad(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
            </>
          )}
        </div>
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span>Preview</span>
            <span>
              {changes.length} of {rows.length} will change
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {error ? (
              <p className="p-3 text-sm text-destructive">{error.message}</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {preview.slice(0, 300).map(({ r, before, after }) => (
                    <tr key={r.id} className="border-t first:border-t-0">
                      <td className="w-1/2 p-1.5 text-muted-foreground">{before || <em>empty</em>}</td>
                      <td className={cn("w-1/2 p-1.5", after !== before && "font-medium text-primary")}>{String(after) || <em className="text-destructive">empty</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {emptied && <p className="text-xs text-destructive">Some names would become empty. Names cannot be empty; those rows will be skipped.</p>}
        {results && <ResultList results={results} rows={rows} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !!error || !changes.length}
            onClick={() => apply(() => renameRecordsAction(entity, field, changes.map((c) => ({ id: c.r.id, value: c.after as string }))), "renamed")}
          >
            {busy && <Loader2Icon className="animate-spin" />} Rename {changes.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FillDialog({ entity, rows, fields, onClose, onDone }: { entity: RecordEntity; rows: RecordLike[]; fields: FillField[]; onClose: () => void; onDone: () => void }) {
  const [field, setField] = React.useState(fields[0]?.key ?? "");
  const [value, setValue] = React.useState("");
  const [onlyEmpty, setOnlyEmpty] = React.useState(false);
  const spec = fields.find((f) => f.key === field);
  const { busy, results, apply } = useApply(onDone);
  const targets = onlyEmpty ? rows.filter((r) => r.extra?.[field] == null || r.extra?.[field] === "" || (field === "title_am" && !r.title_am)) : rows;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fill a field on {rows.length} rows</DialogTitle>
          <DialogDescription>Sets the same value on every selected row. Leave the value empty to clear the field.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Field</Label>
            <Select value={field} onValueChange={(v) => (setField(v), setValue(""))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Value</Label>
            {spec?.kind === "bool" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input type={spec?.kind === "number" ? "number" : "text"} value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={onlyEmpty} onCheckedChange={(v) => setOnlyEmpty(!!v)} /> Only rows where it is empty ({targets.length})
          </label>
        </div>
        {results && <ResultList results={results} rows={rows} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !targets.length || (spec?.kind === "bool" && !value)} onClick={() => apply(() => fillRecordsAction(entity, targets.map((r) => r.id), field, value), "updated")}>
            {busy && <Loader2Icon className="animate-spin" />} Apply to {targets.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TABLE_NAMES: Record<string, string> = {
  items: "items",
  lessons: "parts",
  units: "units",
  grades: "grades",
  subjects: "subjects",
  grade_subjects: "subject offerings",
  item_memberships: "placements",
  stage_attempts: "stage attempts",
  assets: "files and recordings",
  work_sessions: "timer sessions",
  publication_targets: "destinations",
};

export function TrashDialog({ entity, rows, onClose, onDone }: { entity: RecordEntity | "batch"; rows: { id: string; title: string }[]; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [counts, setCounts] = React.useState<Record<string, number> | null>(null);
  const { busy, results, apply } = useApply(onDone);
  const deep = entity !== "items" && entity !== "batch";
  // Overview and Coverage list parts, so a part left without any item would still show there as missing.
  const [withParts, setWithParts] = React.useState(true);
  React.useEffect(() => {
    if (rows.length === 1)
      void previewTrashAction(entity, rows[0].id, { withParts: !deep && withParts }).then((r) => r.ok && setCounts((r.data as { counts: Record<string, number> }).counts));
  }, [entity, rows, deep, withParts]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {rows.length === 1 ? `"${rows[0].title}"` : `${rows.length} records`} to trash
          </DialogTitle>
          <DialogDescription>
            {deep
              ? "Everything inside goes with it (units, parts and their items with all their history). "
              : ""}
            You can restore from Trash at any time until it is emptied.
          </DialogDescription>
        </DialogHeader>
        {counts && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(counts)
              .filter(([t]) => TABLE_NAMES[t])
              .map(([t, n]) => (
                <Badge key={t} variant="secondary">
                  {n} {TABLE_NAMES[t]}
                </Badge>
              ))}
          </div>
        )}
        {deep && rows.length > 1 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" /> Each selected record is deleted with everything under it.
          </p>
        )}
        {!deep && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={withParts} onCheckedChange={(v) => setWithParts(!!v)} />
            <span>
              Also delete the part when no other item uses it
              <span className="block text-xs text-muted-foreground">Otherwise the part stays in Overview and Coverage, shown as missing.</span>
            </span>
          </label>
        )}
        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong subject in import" />
        </div>
        {results && <ResultList results={results} rows={rows as RecordLike[]} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => apply(() => trashRecordsAction(entity, rows.map((r) => r.id), reason, { withParts: !deep && withParts }), "moved to trash")}>
            {busy && <Loader2Icon className="animate-spin" />} Move to trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ---------------------------------------------------------------------------
// Set status (bulk, with a required reason)
// ---------------------------------------------------------------------------

type OverrideRow = { id: string; code: string; ok: boolean; error?: string; plan?: string };

export function StatusDialog({ ids, stages, onClose, onDone }: { ids: string[]; stages: Stage[]; onClose: () => void; onDone: () => void }) {
  const [stage, setStage] = React.useState<Stage>(stages[0] ?? "recording");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [preview, setPreview] = React.useState<OverrideRow[] | null>(null);
  const [done, setDone] = React.useState<OverrideRow[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ready = !!value && !!reason.trim();
  const input = { stage, value, reason };

  // The preview follows the chosen stage and status.
  const key = ids.join(",");
  React.useEffect(() => {
    setPreview(null);
    setDone(null);
    if (!value) return;
    let live = true;
    void overrideStatusAction(ids, { stage, value, reason: "preview" }, true).then((r) => live && r.ok && setPreview(r.data as OverrideRow[]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for ids
  }, [key, stage, value]);

  const apply = async () => {
    setBusy(true);
    const r = await overrideStatusAction(ids, input, false);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const rows = r.data as OverrideRow[];
    const ok = rows.filter((x) => x.ok).length;
    if (ok === rows.length) {
      toast.success(`${ok} updated`);
      onDone();
    } else {
      toast.warning(`${ok} of ${rows.length} updated`);
      setDone(rows);
    }
  };

  const rows = done ?? preview;
  const eligible = preview?.filter((x) => x.ok).length ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Set status on {ids.length} items</DialogTitle>
          <DialogDescription>
            Earlier stages are marked done and later ones set aside as needed. Missing handoff evidence does not block the change; it is listed in the stage notes with your reason, and
            the change is kept in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={(v) => (setStage(v as Stage), setValue(""))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {SHEET_STATUS_OPTIONS[stage].map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reason (required, saved in the notes)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded offline last week; files are on the shared drive" />
          </div>
        </div>
        {rows && (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {preview && !done && (
              <p className="px-1 pb-1 text-xs text-muted-foreground">
                {eligible} can change, {preview.length - eligible} cannot
              </p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs">
                {r.ok ? <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--st-done-fg)]" /> : <CircleXIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--st-blocked-fg)]" />}
                <span className="font-mono">{r.code}</span>
                <span className="text-muted-foreground">{r.ok ? r.plan : r.error}</span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button disabled={busy || !ready || !eligible} onClick={apply}>
              {busy && <Loader2Icon className="animate-spin" />} Apply to {eligible}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
