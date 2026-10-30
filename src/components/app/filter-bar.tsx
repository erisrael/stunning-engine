"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BookmarkIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  FileSpreadsheetIcon,
  KanbanIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TableIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type Option } from "@/components/app/multi-select";
import { deleteViewAction, saveViewAction } from "@/app/actions/admin";
import type { FilterOptions } from "@/server/view-data";
import {
  COMPLEXITY_LABELS,
  LIFECYCLE_LABELS,
  PRIORITY_LABELS,
  STAGE_LABELS,
  STAGES,
  STATUS_LABELS,
  SUBSTATE_LABELS,
} from "@/lib/domain";
import { DATE_FIELD_LABELS, FILTER_FLAG_LABELS, FILTER_KEYS, MULTI_KEYS, parseFilters, scopeQueryString, type Filters } from "@/lib/filters";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/content", label: "Table", icon: TableIcon },
  { href: "/sheet", label: "Sheet", icon: FileSpreadsheetIcon },
  { href: "/pipeline", label: "Board", icon: KanbanIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon },
];

export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = React.useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const update = React.useCallback(
    (patch: Partial<Filters> & Record<string, unknown>, opts: { resetPage?: boolean } = {}) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (Array.isArray(v)) (v.length ? p.set(k, v.join(",")) : p.delete(k));
        else if (v === "" || v === null || v === undefined) p.delete(k);
        else p.set(k, String(v));
      }
      if (opts.resetPage !== false && !("page" in patch)) p.delete("page");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return { filters, update, params, pathname, router };
}

export function FilterBar({
  options,
  total,
  totalLabel = "items",
  showViews = true,
  extra,
  hideKeys = [],
  note,
}: {
  options: FilterOptions;
  total?: number;
  totalLabel?: string;
  showViews?: boolean;
  extra?: React.ReactNode;
  hideKeys?: string[];
  note?: React.ReactNode;
}) {
  const { filters, update, params, pathname, router } = useFilters();
  const [q, setQ] = React.useState(filters.q);
  const [moreOpen, setMoreOpen] = React.useState(false);
  React.useEffect(() => setQ(filters.q), [filters.q]);
  React.useEffect(() => {
    if (q === filters.q) return;
    const t = window.setTimeout(() => update({ q }), 300);
    return () => window.clearTimeout(t);
  }, [q, filters.q, update]);

  const gradeOpts: Option[] = options.grades.map((g) => ({ value: g.id, label: g.name }));
  const subjectOpts: Option[] = options.subjects
    .filter((s) => !filters.g.length || options.gradeSubjects.some((gs) => gs.subject_id === s.id && filters.g.includes(gs.grade_id)))
    .map((s) => ({ value: s.id, label: s.name }));
  const unitOpts: Option[] = options.units
    .filter((u) => (filters.g.length ? filters.g.includes(u.gradeId) : true) && (filters.s.length ? filters.s.includes(u.subjectId) : true))
    .filter(() => filters.g.length > 0 || filters.s.length > 0)
    .map((u) => ({
      value: u.id,
      label: `Unit ${u.number}: ${u.title}`,
      group: `${options.grades.find((g) => g.id === u.gradeId)?.code ?? ""} ${options.subjects.find((s) => s.id === u.subjectId)?.code ?? ""}`,
    }));
  const stageOpts: Option[] = [
    { value: "draft", label: "Draft" },
    ...STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    { value: "published", label: "Published" },
  ];
  const statusOpts: Option[] = [
    ...(["queued", "in_progress", "paused", "blocked", "awaiting_handoff"] as const).map((s) => ({ value: s, label: STATUS_LABELS[s], group: "Stage status" })),
    ...["uploading", "processing", "failed", "ready", "scheduled", "changes_requested"].map((s) => ({ value: `sub:${s}`, label: SUBSTATE_LABELS[s], group: "Upload and publication" })),
  ];
  const ownerOpts: Option[] = [
    { value: "me", label: "Me", group: "Quick" },
    { value: "unassigned", label: "Unassigned", group: "Quick" },
    ...options.users.map((u) => ({ value: u.id, label: u.name, hint: u.roles.filter((r) => r !== "manager").map((r) => r.slice(0, 3)).join(" "), group: "People" })),
  ];
  const priOpts: Option[] = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  const nameOf = (list: Option[], v: string) => list.find((o) => o.value === v)?.label ?? v;
  const multiChip = (key: keyof Filters, label: string, list: Option[]) => {
    const vals = filters[key] as string[];
    if (vals.length) chips.push({ key, label: `${label}: ${vals.map((v) => nameOf(list, v)).join(", ")}`, clear: () => update({ [key]: [] }) });
  };
  multiChip("g", "Grade", gradeOpts);
  multiChip("s", "Subject", options.subjects.map((s) => ({ value: s.id, label: s.name })));
  multiChip("u", "Unit", options.units.map((u) => ({ value: u.id, label: `Unit ${u.number}` })));
  multiChip("stage", "Stage", stageOpts);
  multiChip("status", "Status", statusOpts);
  multiChip("owner", "Owner", ownerOpts);
  multiChip("pri", "Priority", priOpts);
  multiChip("lang", "Language", options.lists.languages.map((l) => ({ value: l.code, label: l.label })));
  multiChip("ctype", "Content", options.lists.contentTypes.map((c) => ({ value: c.key, label: c.label })));
  multiChip("dtype", "Deliverable", options.lists.deliverableTypes.map((c) => ({ value: c.key, label: c.label })));
  multiChip("cx", "Complexity", Object.entries(COMPLEXITY_LABELS).map(([value, label]) => ({ value, label })));
  multiChip("prov", "Provenance", ["live", "imported", "historical"].map((v) => ({ value: v, label: v })));
  multiChip("platform", "Destination", options.destinations.map((d) => ({ value: d.key, label: d.label })));
  multiChip("life", "Lifecycle", Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({ value, label })));
  for (const f of filters.flags) chips.push({ key: `flag-${f}`, label: FILTER_FLAG_LABELS[f] ?? f, clear: () => update({ flags: filters.flags.filter((x) => x !== f) }) });
  if (filters.tag) chips.push({ key: "tag", label: `Tag: ${filters.tag}`, clear: () => update({ tag: "" }) });
  if (filters.teacher) chips.push({ key: "teacher", label: `Teacher: ${filters.teacher}`, clear: () => update({ teacher: "" }) });
  if (filters.from || filters.to)
    chips.push({
      key: "dates",
      label: `${DATE_FIELD_LABELS[filters.dateField] ?? filters.dateField}: ${filters.from || "any"} to ${filters.to || "any"}`,
      clear: () => update({ from: "", to: "" }),
    });

  const resetAll = () => {
    const p = new URLSearchParams(params.toString());
    for (const k of FILTER_KEYS) p.delete(k);
    p.delete("page");
    const next = p.toString();
    setQ("");
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const show = (k: string) => !hideKeys.includes(k);
  const qs = scopeQueryString(params.toString());

  return (
    <div className="space-y-2 rounded-xl border bg-card p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, code or ID" className="h-8 pl-8" aria-label="Search items" />
        </div>
        {show("g") && <MultiSelect label="Grade" options={gradeOpts} value={filters.g} onChange={(v) => update({ g: v, u: [] })} />}
        {show("s") && <MultiSelect label="Subject" options={subjectOpts} value={filters.s} onChange={(v) => update({ s: v, u: [] })} />}
        {show("u") && unitOpts.length > 0 && <MultiSelect label="Unit" options={unitOpts} value={filters.u} onChange={(v) => update({ u: v })} />}
        {show("stage") && <MultiSelect label="Stage" options={stageOpts} value={filters.stage} onChange={(v) => update({ stage: v })} searchable={false} />}
        {show("status") && <MultiSelect label="Status" options={statusOpts} value={filters.status} onChange={(v) => update({ status: v })} searchable={false} />}
        {show("owner") && <MultiSelect label="Owner" options={ownerOpts} value={filters.owner} onChange={(v) => update({ owner: v })} />}
        <Button variant="outline" size="sm" className="h-8" onClick={() => setMoreOpen(true)}>
          <SlidersHorizontalIcon /> More filters
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {extra}
          <SavedViews options={options} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(FILTER_FLAG_LABELS).map(([k, label]) => {
          const on = filters.flags.includes(k);
          return (
            <button
              key={k}
              onClick={() => update({ flags: on ? filters.flags.filter((x) => x !== k) : [...filters.flags, k] })}
              className={cn(
                "h-6 rounded-full border px-2.5 text-xs transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
              aria-pressed={on}
            >
              {label}
            </button>
          );
        })}
      </div>
      {(chips.length > 0 || total !== undefined || showViews) && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          {total !== undefined && (
            <span className="text-xs text-muted-foreground tabular" aria-live="polite">
              <span className="font-semibold text-foreground">{total.toLocaleString("en-US")}</span> {totalLabel}
            </span>
          )}
          {chips.map((c) => (
            <Badge key={c.key} variant="secondary" className="h-6 max-w-full gap-1 pr-1 font-normal">
              <span className="truncate">{c.label}</span>
              <button onClick={c.clear} className="rounded-full p-0.5 hover:bg-background" aria-label={`Remove ${c.label}`}>
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          {chips.length > 0 && (
            <Button variant="link" size="xs" className="h-6 px-1" onClick={resetAll}>
              Reset filters
            </Button>
          )}
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
          {showViews && (
            <nav className="ml-auto flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" aria-label="Views of the same records">
              {VIEWS.filter((v) => options.allowedViews.includes(v.href) || pathname === v.href).map((v) => {
                const active = pathname === v.href;
                return (
                  <Link
                    key={v.href}
                    href={v.href + qs}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                      active && "bg-background text-foreground shadow-sm",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <v.icon className="size-3.5" />
                    <span className="hidden sm:inline">{v.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}
      <MoreFilters open={moreOpen} onOpenChange={setMoreOpen} options={options} filters={filters} onApply={(patch) => update(patch)} />
    </div>
  );
}

function MoreFilters({
  open,
  onOpenChange,
  options,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: FilterOptions;
  filters: Filters;
  onApply: (patch: Partial<Filters>) => void;
}) {
  const [draft, setDraft] = React.useState<Filters>(filters);
  React.useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const checks = (key: keyof Filters, opts: Option[]) => (
    <div className="grid grid-cols-2 gap-1.5">
      {opts.map((o) => {
        const vals = draft[key] as string[];
        const on = vals.includes(o.value);
        return (
          <label key={o.value} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <Checkbox checked={on} onCheckedChange={() => set(key, (on ? vals.filter((x) => x !== o.value) : [...vals, o.value]) as never)} />
            <span className="truncate">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>More filters</SheetTitle>
          <SheetDescription>Multiple values in one field match any of them. Different fields must all match.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          <section className="space-y-2">
            <Label>Priority</Label>
            {checks("pri", Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })))}
          </section>
          <section className="space-y-2">
            <Label>Language</Label>
            {checks("lang", options.lists.languages.map((l) => ({ value: l.code, label: l.label })))}
          </section>
          <section className="space-y-2">
            <Label>Content type</Label>
            {checks("ctype", options.lists.contentTypes.map((c) => ({ value: c.key, label: c.label })))}
          </section>
          <section className="space-y-2">
            <Label>Deliverable</Label>
            {checks("dtype", options.lists.deliverableTypes.map((c) => ({ value: c.key, label: c.label })))}
          </section>
          <section className="space-y-2">
            <Label>Complexity</Label>
            {checks("cx", Object.entries(COMPLEXITY_LABELS).map(([value, label]) => ({ value, label })))}
          </section>
          <section className="space-y-2">
            <Label>Destination platform</Label>
            {checks("platform", options.destinations.map((d) => ({ value: d.key, label: d.label })))}
          </section>
          <section className="space-y-2">
            <Label>Lifecycle (archived and cancelled are hidden unless chosen)</Label>
            {checks("life", Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({ value, label })))}
          </section>
          <section className="space-y-2">
            <Label>Provenance</Label>
            {checks("prov", [
              { value: "live", label: "Live workflow" },
              { value: "imported", label: "Imported plan" },
              { value: "historical", label: "Historical migration" },
            ])}
          </section>
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-tag">Tag</Label>
              <Input id="f-tag" value={draft.tag} onChange={(e) => set("tag", e.target.value)} placeholder="pilot" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-teacher">Teacher</Label>
              <Input id="f-teacher" value={draft.teacher} onChange={(e) => set("teacher", e.target.value)} placeholder="Name" />
            </div>
          </section>
          <section className="space-y-2">
            <Label>Date range</Label>
            <Select value={draft.dateField} onValueChange={(v) => set("dateField", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DATE_FIELD_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={draft.from} onChange={(e) => set("from", e.target.value)} aria-label="From date" />
              <Input type="date" value={draft.to} onChange={(e) => set("to", e.target.value)} aria-label="To date" />
            </div>
            <p className="text-xs text-muted-foreground">Dates use the workspace timezone ({options.timezone}).</p>
          </section>
        </div>
        <SheetFooter className="flex-row gap-2 border-t">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              const cleared: Partial<Filters> = {};
              for (const k of MULTI_KEYS) if (!["g", "s", "u", "stage", "status", "owner", "flags"].includes(k)) (cleared as Record<string, unknown>)[k] = [];
              setDraft((d) => ({ ...d, ...cleared, tag: "", teacher: "", from: "", to: "" }));
            }}
          >
            Clear these
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply({
                pri: draft.pri,
                lang: draft.lang,
                ctype: draft.ctype,
                dtype: draft.dtype,
                cx: draft.cx,
                platform: draft.platform,
                life: draft.life,
                prov: draft.prov,
                tag: draft.tag,
                teacher: draft.teacher,
                dateField: draft.dateField,
                from: draft.from,
                to: draft.to,
              });
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SavedViews({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const pageViews = options.views.filter((v) => v.page === pathname);
  const otherViews = options.views.filter((v) => v.page !== pathname);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <BookmarkIcon /> <span className="hidden sm:inline">Views</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => setOpen(true)}>Save current filters as a view</DropdownMenuItem>
          {pageViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>On this page</DropdownMenuLabel>
              {pageViews.map((v) => (
                <ViewRow key={v.id} view={v} canDelete={v.owner_id === options.viewerId || options.isManager} onOpen={() => router.push(`${v.page}?${v.query}`)} />
              ))}
            </>
          )}
          {otherViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Other pages</DropdownMenuLabel>
              {otherViews.map((v) => (
                <ViewRow key={v.id} view={v} canDelete={v.owner_id === options.viewerId || options.isManager} onOpen={() => router.push(`${v.page}?${v.query}`)} />
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Saves the current filters, sort and layout for this page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grade 8 Mathematics - overdue editing" />
            </div>
            {options.isManager && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={shared} onCheckedChange={(v) => setShared(!!v)} /> Share with everyone (they can still use their own views)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await saveViewAction({ name, page: pathname, query: params.toString(), shared });
                if (res.ok) {
                  toast.success("View saved");
                  setOpen(false);
                  setName("");
                } else toast.error(res.error);
              }}
            >
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewRow({ view, canDelete, onOpen }: { view: FilterOptions["views"][number]; canDelete: boolean; onOpen: () => void }) {
  return (
    <DropdownMenuItem onSelect={onOpen} className="group justify-between gap-2">
      <span className="truncate">{view.name}</span>
      <span className="flex items-center gap-1">
        {!!view.shared && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">Shared</span>}
        {canDelete && (
          <button
            className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
            aria-label={`Delete view ${view.name}`}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const res = await deleteViewAction(view.id);
              if (res.ok) toast.success("View deleted");
              else toast.error(res.error);
            }}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </span>
    </DropdownMenuItem>
  );
}
