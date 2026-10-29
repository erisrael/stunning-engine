"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  ListPlusIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import {
  deleteTemplatesAction,
  duplicateTemplateAction,
  exportTemplatesAction,
  importTemplatesAction,
  saveTemplateAction,
  setTemplatesActiveAction,
  standardLinesAction,
} from "@/app/actions/editorial";
import type { ChecklistTemplate, TemplateFilter } from "@/server/editorial";
import type { WorkChecklistItem } from "@/server/workflow";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

function download(name: string, data: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ChecklistTemplates({ templates, stages, filter }: { templates: ChecklistTemplate[]; stages: Stage[]; filter: TemplateFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(filter.q ?? "");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<ChecklistTemplate | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const ids = [...picked].filter((id) => templates.some((t) => t.id === id));
  const sortBy = (key: NonNullable<TemplateFilter["sort"]>) => go({ sort: key, dir: filter.sort === key && filter.dir === "asc" ? "desc" : "asc" });
  const SortHead = ({ k, children, className }: { k: NonNullable<TemplateFilter["sort"]>; children: React.ReactNode; className?: string }) => (
    <th className={cn("p-2 font-medium", className)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
        {children}
        {filter.sort === k ? filter.dir === "desc" ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
      </button>
    </th>
  );

  const refresh = () => {
    setPicked(new Set());
    router.refresh();
  };
  const exportJson = async (only?: string[]) => {
    const r = await exportTemplatesAction(filter);
    if (!r.ok) return toast.error(r.error);
    const data = r.data as { templates: { name: string; stage: string }[] };
    const chosen = only ? { ...data, templates: data.templates.filter((t) => templates.some((x) => only.includes(x.id) && x.name === t.name && x.stage === t.stage)) } : data;
    download(`checklists-${new Date().toISOString().slice(0, 10)}.json`, chosen);
  };
  const importJson = async (file: File) => {
    const r = await importTemplatesAction(await file.text());
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return toast.error(r.error);
    const res = r.data as { created: number; updated: number; errors: string[] };
    if (res.errors.length) toast.warning(`${res.created} created, ${res.updated} updated, ${res.errors.length} skipped`, { description: res.errors.slice(0, 4).join("\n"), duration: 10000 });
    else toast.success(`${res.created} created, ${res.updated} updated`);
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter.stage ?? "all"} onValueChange={(v) => go({ stage: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.active ?? "all"} onValueChange={(v) => go({ active: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="State">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Active and off</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Switched off</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and lines" className="h-8 w-56 pl-7 text-sm" />
        </form>
        <div className="ml-auto flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <UploadIcon /> Import
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportJson()} disabled={!templates.length}>
            <DownloadIcon /> Export
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <PlusIcon /> New checklist
          </Button>
        </div>
      </div>

      {!templates.length ? (
        <EmptyState
          icon={<ListPlusIcon className="size-5" />}
          title="No checklists yet"
          description="Create one per kind of work, for example 'Editing: standard lesson' and 'Editing: lab demo'. Start from the workspace's standard checklist or import a JSON file."
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              <PlusIcon /> New checklist
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2">
                  <Checkbox
                    aria-label="Select all"
                    checked={ids.length === templates.length ? true : ids.length ? "indeterminate" : false}
                    onCheckedChange={(v) => setPicked(v ? new Set(templates.map((t) => t.id)) : new Set())}
                  />
                </th>
                <SortHead k="name">Checklist</SortHead>
                <SortHead k="stage">Stage</SortHead>
                <SortHead k="items" className="text-right">
                  Lines
                </SortHead>
                <SortHead k="used" className="text-right">
                  In use
                </SortHead>
                <SortHead k="updated">Updated</SortHead>
                <th className="p-2 font-medium">State</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className={cn("border-t", picked.has(t.id) && "bg-primary/5")}>
                  <td className="p-2">
                    <Checkbox checked={picked.has(t.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(t.id)) : (s.delete(t.id), new Set(s))))} />
                  </td>
                  <td className="max-w-[380px] p-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setEditing(t)}>
                      {t.name}
                    </button>
                    {t.description && <span className="block truncate text-xs text-muted-foreground">{t.description}</span>}
                  </td>
                  <td className="p-2 text-xs">{STAGE_LABELS[t.stage]}</td>
                  <td className="p-2 text-right text-xs tabular whitespace-nowrap">
                    {t.items.length}
                    <span className="block text-muted-foreground">
                      {t.items.filter((i) => i.required).length} required, {t.items.filter((i) => i.verify).length} verified
                    </span>
                  </td>
                  <td className="p-2 text-right tabular">{t.used}</td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {fmtRelative(t.updated_at)}
                    {t.created_by_name && <span className="block text-muted-foreground">{t.created_by_name}</span>}
                  </td>
                  <td className="p-2">
                    <Badge variant={t.active ? "secondary" : "outline"}>{t.active ? "Active" : "Off"}</Badge>
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEditing(t)}>
                        <PencilIcon />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Duplicate"
                        onClick={async () => {
                          const r = await duplicateTemplateAction(t.id);
                          if (!r.ok) return toast.error(r.error);
                          toast.success("Duplicated");
                          refresh();
                        }}
                      >
                        <CopyIcon />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Delete" className="text-destructive" onClick={() => setConfirmDelete([t.id])}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ids.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-medium tabular">{ids.length} selected</span>
          {[true, false].map((on) => (
            <Button
              key={String(on)}
              size="xs"
              variant="outline"
              onClick={async () => {
                const r = await setTemplatesActiveAction(ids, on);
                if (!r.ok) return toast.error(r.error);
                toast.success(on ? "Switched on" : "Switched off");
                refresh();
              }}
            >
              {on ? "Switch on" : "Switch off"}
            </Button>
          ))}
          <Button size="xs" variant="outline" onClick={() => exportJson(ids)}>
            <DownloadIcon /> Export
          </Button>
          <Button size="xs" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(ids)}>
            <Trash2Icon /> Delete
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>
            <XIcon /> Clear
          </Button>
        </div>
      )}

      {editing && <TemplateEditor template={editing === "new" ? null : editing} stages={stages} defaultStage={filter.stage ?? stages[0]} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), refresh())} />}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.length === 1 ? "this checklist" : `${confirmDelete?.length} checklists`}?</DialogTitle>
            <DialogDescription>Work already assigned keeps its copy of the lines. Switch a checklist off instead if you may need it again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const r = await deleteTemplatesAction(confirmDelete ?? []);
                setConfirmDelete(null);
                if (!r.ok) return toast.error(r.error);
                toast.success(`${r.data} deleted`);
                refresh();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Line = WorkChecklistItem & { _id: string };
let lineSeq = 0;
const toLine = (i: Partial<WorkChecklistItem>): Line => ({ key: i.key ?? "", label: i.label ?? "", required: i.required !== false, verify: !!i.verify, hint: i.hint ?? null, _id: `l${++lineSeq}` });

function TemplateEditor({ template, stages, defaultStage, onClose, onSaved }: { template: ChecklistTemplate | null; stages: Stage[]; defaultStage: Stage; onClose: () => void; onSaved: () => void }) {
  const [stage, setStage] = React.useState<Stage>(template?.stage ?? defaultStage);
  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [active, setActive] = React.useState(template?.active ?? true);
  const [lines, setLines] = React.useState<Line[]>(template?.items.map(toLine) ?? [toLine({})]);
  const [bulk, setBulk] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l._id === id ? { ...l, ...p } : l)));
  const move = (i: number, d: number) =>
    setLines((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const filled = lines.filter((l) => l.label.trim());

  const save = async () => {
    setBusy(true);
    const r = await saveTemplateAction({ id: template?.id, stage, name, description, active, items: filled.map(({ _id, ...l }) => (void _id, l)) });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(template ? "Saved" : "Created");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit checklist" : "New checklist"}</DialogTitle>
          <DialogDescription>Required lines must be ticked before the handoff. Lines marked Verify also need the team lead's verification.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard lesson edit" />
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use this checklist" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} /> Active (offered when assigning)
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Lines ({filled.length})</Label>
            <div className="flex gap-1">
              <Button size="xs" variant="outline" onClick={() => setBulk("")}>
                Add several
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={async () => {
                  const r = await standardLinesAction(stage);
                  if (!r.ok) return toast.error(r.error);
                  const add = (r.data as WorkChecklistItem[]).filter((x) => !filled.some((l) => l.label.toLowerCase() === x.label.toLowerCase()));
                  setLines((ls) => [...ls.filter((l) => l.label.trim()), ...add.map(toLine)]);
                  toast.success(`${add.length} standard lines added`);
                }}
              >
                Add the standard {STAGE_LABELS[stage]} lines
              </Button>
            </div>
          </div>
          <div className="space-y-1.5 rounded-lg border p-2">
            {lines.map((l, i) => (
              <div key={l._id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="w-5 text-right text-xs text-muted-foreground tabular">{i + 1}</span>
                <Input value={l.label} onChange={(e) => patch(l._id, { label: e.target.value })} placeholder="What must be done" className="h-8 min-w-0 flex-1 text-sm" />
                <label className="flex items-center gap-1 text-xs" title="Must be ticked before the handoff">
                  <Checkbox checked={l.required} onCheckedChange={(v) => patch(l._id, { required: !!v })} /> Required
                </label>
                <label className="flex items-center gap-1 text-xs" title="The team lead must verify it">
                  <Checkbox checked={l.verify} onCheckedChange={(v) => patch(l._id, { verify: !!v })} />
                  <ShieldCheckIcon className="size-3" /> Verify
                </label>
                <div className="flex">
                  <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x._id !== l._id) : [toLine({})]))}>
                    <XIcon />
                  </Button>
                </div>
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => setLines((ls) => [...ls, toLine({})])}>
              <PlusIcon /> Add line
            </Button>
          </div>
          {bulk !== null && (
            <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
              <Label className="text-xs">One line per row</Label>
              <Textarea rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Audio levels checked\nIntro and outro added\nCaptions synced"} />
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setBulk(null)}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={() => {
                    const add = bulk
                      .split(/\r?\n/)
                      .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
                      .filter(Boolean);
                    setLines((ls) => [...ls.filter((l) => l.label.trim()), ...add.map((label) => toLine({ label }))]);
                    setBulk(null);
                  }}
                >
                  Add {bulk.split(/\r?\n/).filter((s) => s.trim()).length} lines
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || !filled.length} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
