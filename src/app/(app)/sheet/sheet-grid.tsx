"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon, CircleAlertIcon, Columns3Icon, LoaderIcon, LockIcon, MessageSquareIcon, MessageSquarePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Combobox } from "@/components/app/multi-select";
import { StatusPill, toneFor, PriorityBadge } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/primitives";
import { CommentThread } from "@/components/app/comment-thread";
import { useActions, type ItemRef } from "@/components/app/action-center";
import { useFilters } from "@/components/app/filter-bar";
import { BulkBar, ExportMenu } from "@/components/app/bulk-and-export";
import { savePrefsAction } from "@/app/actions/admin";
import { SHEET_BASE_COLUMNS, SHEET_COLUMNS, SHEET_PRESETS } from "@/lib/columns";
import { progressChip, progressOf } from "@/components/app/item-cells";
import { ItemContextMenu } from "@/components/app/item-actions";
import { actionItemOf } from "@/app/(app)/content/content-table";

const DATE_COLS: Record<string, Stage> = { recorded_date: "recording", edited_date: "editing", uploaded_date: "uploading", published_date: "publication" };
const MERGED = ["grade", "subject", "unit"];
import {
  BLOCKER_CAUSE_LABELS,
  NEXT_STAGE,
  PRIORITY_LABELS,
  ROLE_LABELS,
  SHEET_STATUS_OPTIONS,
  STAGE_LABELS,
  STAGES,
  sheetStatusLabel,
  sheetStatusValue,
  type Capability,
  type Role,
  type Stage,
} from "@/lib/domain";
import { fmtAge, fmtDate, fmtDateTime, fmtRelative, isoToLocalInput } from "@/lib/format";
import type { ItemListRow } from "@/server/queries";
import type { SheetExtra } from "@/server/sheet";
import { cn } from "@/lib/utils";

type SaveState = "saving" | "saved" | "failed";
type Viewer = { id: string; roles: Role[]; name: string; leads?: Stage[]; perms: Capability[] };

const STATUS_COLS: Record<string, Stage> = {
  recording_status: "recording",
  editing_status: "editing",
  uploading_status: "uploading",
  publication_status: "publication",
};
const OWNER_COLS: Record<string, Stage> = {
  recording_owner: "recording",
  editing_owner: "editing",
  uploading_owner: "uploading",
  publication_owner: "publication",
};

export function SheetGrid({
  rows,
  extras,
  preset: presetKey,
  savedColumns,
  viewer,
  users,
  tz,
  now,
  total,
}: {
  rows: ItemListRow[];
  extras: Record<string, SheetExtra>;
  preset: string;
  savedColumns: Record<string, string[]>;
  viewer: Viewer;
  users: { id: string; name: string; roles: Role[] }[];
  tz: string;
  now: number;
  total: number;
}) {
  const { run, open } = useActions();
  const { update, params } = useFilters();
  const preset = SHEET_PRESETS.find((p) => p.key === presetKey) ?? SHEET_PRESETS[0];
  const presetColumns = [...SHEET_BASE_COLUMNS, ...preset.columns];
  const [columns, setColumns] = React.useState<string[]>(savedColumns[preset.key]?.length ? savedColumns[preset.key] : presetColumns);
  React.useEffect(() => setColumns(savedColumns[preset.key]?.length ? savedColumns[preset.key] : [...SHEET_BASE_COLUMNS, ...preset.columns]), [preset.key, preset.columns, savedColumns]);
  const [save, setSave] = React.useState<Record<string, SaveState>>({});
  const [compact, setCompact] = React.useState(true);
  const [groupBy, setGroupBy] = React.useState<string>(params.get("group") ?? "none");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [thread, setThread] = React.useState<{ row: ItemListRow; field: string | null } | null>(null);
  const names = React.useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  // Rows ticked in the first column, for the same bulk actions as the List view.
  const [selected, setSelected] = React.useState<string[]>([]);
  const toggleRow = (id: string, on: boolean) => setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  // Managers view; stage data changes need the override permission and planning fields need items.plan.
  const override = viewer.perms.includes("work.override");
  const planner = viewer.perms.includes("items.plan");
  // Grade, subject, unit and title come first and stay frozen while shown; any of them can be hidden.
  const allCols = [...SHEET_BASE_COLUMNS.filter((c) => columns.includes(c)), ...columns.filter((c) => !SHEET_BASE_COLUMNS.includes(c))];
  const frozen = allCols.filter((c) => SHEET_BASE_COLUMNS.includes(c)).length;

  const ref = (r: ItemListRow): ItemRef => ({ id: r.id, code: r.code, title: r.title, version: r.version, stage: r.stage, status: r.stage_status });
  const track = async (key: string, fn: () => Promise<boolean>) => {
    setSave((s) => ({ ...s, [key]: "saving" }));
    const ok = await fn();
    setSave((s) => ({ ...s, [key]: ok ? "saved" : "failed" }));
    if (ok) window.setTimeout(() => setSave((s) => (s[key] === "saved" ? { ...s, [key]: undefined as never } : s)), 2500);
  };

  // Why a status cell is locked, or null when the viewer may change it.
  const lockReason = (r: ItemListRow, st: Stage): string | null => {
    if (r.lifecycle === "draft") {
      if (st !== "recording") return "Opens after Recording starts and hands off.";
      const owner = r.owners.recording;
      if (override || viewer.leads?.includes("recording") || (viewer.roles.includes("recording") && (!owner || owner === viewer.id))) return null;
      return `Recording staff start this item${owner ? ` (${names[owner]})` : ""}.`;
    }
    if (r.lifecycle === "published") return "Published. Post-publication changes use a revision workflow.";
    if (r.lifecycle !== "in_production" || !r.stage) return "This item is closed.";
    const next = NEXT_STAGE[r.stage];
    const receiving = r.stage_status === "awaiting_handoff" && next === st;
    if (receiving) {
      const owner = r.owners[st];
      if (override || viewer.leads?.includes(st) || (viewer.roles.includes(st) && (!owner || owner === viewer.id))) return null;
      return `Waiting for ${owner ? names[owner] : `the ${STAGE_LABELS[st]} team`} to accept.`;
    }
    if (r.stage !== st) {
      const idx = STAGES.indexOf(st);
      return idx < STAGES.indexOf(r.stage) ? `${STAGE_LABELS[st]} is complete. Use Request upstream changes on the item to reopen it.` : `Opens after ${STAGE_LABELS[r.stage]} hands off.`;
    }
    if (st === "publication" && (override || viewer.roles.includes("publication"))) return null;
    const owner = r.stages[st].ownerId;
    if (override || viewer.leads?.includes(st)) return null;
    if (!viewer.roles.includes(st)) return `Only ${ROLE_LABELS[st]} staff can change this. Responsible: ${owner ? names[owner] : "unassigned"}.`;
    if (owner && owner !== viewer.id) return `Owned by ${names[owner]}. Ask the team lead to reassign it.`;
    return null;
  };

  const onStatus = async (r: ItemListRow, st: Stage, value: string) => {
    const key = `${r.id}:${st}_status`;
    const item = ref(r);
    if (r.stage === STAGES[STAGES.indexOf(st) - 1] && r.stage_status === "awaiting_handoff") {
      if (value === "completed" || value === "queued" || value === "in_progress") return open("accept", item);
      return toast.info("Accept the handoff first, or open the item to return it.");
    }
    switch (value) {
      case "in_progress":
        return track(key, () => run(item, { action: "start" }, { source: "sheet" }));
      case "paused":
        return track(key, () => run(item, { action: "pause", reason: "Paused from sheet" }, { source: "sheet" }));
      case "blocked":
        return open("block", item);
      case "awaiting_handoff":
        return open(st === "uploading" ? "submit" : "submit", item);
      case "completed":
        if (st === "publication") return open("live", item);
        return r.stage_status === "awaiting_handoff" ? open("accept", item) : open("submit", item);
      case "queued":
        return toast.info(st === "publication" ? "Pending review is the starting state. Use Changes requested or Ready." : "Queued is set by the workflow when the stage opens.");
      case "sub:uploading":
      case "sub:processing":
        return track(key, () => run(item, { action: "uploadSubstate", substate: value.slice(4) as "uploading" | "processing" }, { source: "sheet" }));
      case "sub:failed":
        return st === "uploading" ? open("upload", item, { status: "failed" }) : open("releaseFailed", item);
      case "sub:ready":
        return open("review", item, { decision: "approved" });
      case "sub:changes_requested":
        return open("review", item, { decision: "changes_requested" });
      case "sub:scheduled":
        return open("schedule", item);
    }
  };

  const groups = React.useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows }];
    const m = new Map<string, ItemListRow[]>();
    for (const r of rows) {
      const k =
        groupBy === "grade"
          ? r.grade_name
          : groupBy === "subject"
            ? `${r.grade_name} / ${r.subject_name}`
            : groupBy === "unit"
              ? `${r.grade_name} / ${r.subject_name} / ${r.unit_number ? `Unit ${r.unit_number}: ${r.unit_title}` : "No unit"}`
              : groupBy === "stage"
                ? r.lifecycle === "in_production" && r.stage
                  ? STAGE_LABELS[r.stage]
                  : r.lifecycle
                : r.next_action_owner_id
                  ? names[r.next_action_owner_id]
                  : "Unassigned";
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()].map(([key, list]) => ({ key, label: key, rows: list }));
  }, [rows, groupBy, names]);

  const widths = allCols.map((c) => SHEET_COLUMNS[c]?.width ?? 120);
  const left = (i: number) => widths.slice(0, i).reduce((a, b) => a + b, 0);

  const onGridKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest("[data-cell]") as HTMLElement | null;
    if (!cell) return;
    const [r, c] = cell.dataset.cell!.split(":").map(Number);
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (!move[e.key] || t.getAttribute("aria-expanded") === "true") return;
    const [dr, dc] = move[e.key];
    const next = document.querySelector<HTMLElement>(`[data-cell="${r + dr}:${c + dc}"]`);
    if (next) {
      e.preventDefault();
      (next.querySelector<HTMLElement>("button, a, [tabindex]") ?? next).focus();
    }
  };

  const renderCell = (r: ItemListRow, col: string): React.ReactNode => {
    const x = extras[r.id];
    if (col.endsWith("_progress")) return progressChip(progressOf(r, col.replace("_progress", "") as Stage));
    if (DATE_COLS[col]) {
      const st = DATE_COLS[col];
      const value = st === "recording" ? r.recorded_at : st === "editing" ? r.edited_at : st === "uploading" ? r.uploaded_at : r.published_at;
      const editable = (st !== "publication" || r.lifecycle === "published") && (planner || override || !!viewer.leads?.includes(st) || viewer.roles.includes(st));
      if (!editable) return <span className="text-xs tabular">{value ? fmtDate(value, tz) : "-"}</span>;
      return (
        <input
          type="date"
          aria-label={`${STAGE_LABELS[st]} date`}
          defaultValue={value ? isoToLocalInput(value, tz).slice(0, 10) : ""}
          className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-xs hover:border-input focus:border-input"
          onChange={(e) => {
            const v = e.target.value;
            void track(`${r.id}:${col}`, () => run(ref(r), { action: "stageDate", stage: st, date: v ? new Date(`${v}T09:00:00+03:00`).toISOString() : null }, { source: "sheet", silent: true }));
          }}
        />
      );
    }
    if (STATUS_COLS[col]) {
      const st = STATUS_COLS[col];
      const c = r.stages[st];
      const published = st === "publication" && r.lifecycle === "published";
      const label = published ? "Published" : c.status ? sheetStatusLabel(st, c.status, c.substate) : "Not started";
      const tone = published ? "done" : c.status ? toneFor(c.status, c.substate) : "neutral";
      const lock = lockReason(r, st);
      const current = published ? "completed" : sheetStatusValue(st, c.status, c.substate) ?? "";
      if (lock)
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex max-w-full items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <StatusPill tone={tone} label={label} size="xs" />
                <LockIcon className="size-3 shrink-0 text-muted-foreground/60" aria-label="Locked" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{lock}</TooltipContent>
          </Tooltip>
        );
      return (
        <Select value={current} onValueChange={(v) => onStatus(r, st, v)}>
          <SelectTrigger
            size="sm"
            className="h-6 w-full max-w-[150px] gap-1 rounded-full border-0 px-2.5 text-[11px] font-medium shadow-none [&_svg]:!text-current"
            style={{ background: `var(--st-${tone}-bg)`, color: `var(--st-${tone}-fg)` }}
            aria-label={`${STAGE_LABELS[st]} status for ${r.code}`}
          >
            <SelectValue placeholder="Not started">{label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SHEET_STATUS_OPTIONS[st].map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (OWNER_COLS[col] || col === "owner") {
      const st = OWNER_COLS[col];
      const id = st ? r.owners[st] : r.next_action_owner_id;
      if (st && (planner || viewer.leads?.includes(st)))
        return (
          <Combobox
            size="sm"
            className="h-6 border-transparent px-1.5 text-xs shadow-none hover:border-input"
            options={users.filter((u) => u.roles.includes(st)).map((u) => ({ value: u.id, label: u.name }))}
            value={id}
            onChange={(v) => track(`${r.id}:${col}`, () => run(ref(r), { action: "assign", stage: st, userId: v }, { source: "sheet" }))}
            placeholder="Unassigned"
          />
        );
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <UserAvatar name={id ? names[id] : null} size="xs" />
          <span className={cn("truncate", !id && "text-muted-foreground")}>{id ? names[id] : "Unassigned"}</span>
        </span>
      );
    }
    switch (col) {
      case "grade":
        return <span className="text-xs">{r.grade_name.replace("Grade ", "G")}</span>;
      case "subject":
        return <span className="truncate text-xs">{r.subject_name}</span>;
      case "unit":
        return <span className="line-clamp-1 text-xs" title={r.unit_title ?? ""}>{r.unit_number ? `U${r.unit_number} ${r.unit_title}` : "-"}</span>;
      case "title":
        return (
          <div className="min-w-0" title={`${r.title}${r.title_am ? `\n${r.title_am}` : ""}`}>
            <Link href={`/items/${r.id}/form`} className="line-clamp-1 text-xs font-medium hover:underline">
              {r.lesson_number ? `${r.lesson_number}. ` : ""}
              {r.title}
            </Link>
            <span className="block truncate font-mono text-[10px] text-muted-foreground">
              {r.code}
              {r.title_am ? <span className="ethiopic ml-1.5 font-sans" lang="am">{r.title_am}</span> : null}
            </span>
          </div>
        );
      case "priority":
        return planner ? (
          <Select value={r.priority} onValueChange={(v) => track(`${r.id}:priority`, () => run(ref(r), { action: "fields", fields: { priority: v } }, { source: "sheet" }))}>
            <SelectTrigger size="sm" className="h-6 border-transparent px-1.5 text-xs shadow-none hover:border-input" aria-label={`Priority for ${r.code}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <PriorityBadge priority={r.priority} />
        );
      case "due": {
        const overdue = r.current_due_at && new Date(r.current_due_at).getTime() < now && r.lifecycle !== "published";
        const text = <span className={cn("text-xs tabular", overdue && "font-medium text-[var(--st-blocked-fg)]")}>{fmtDate(r.current_due_at, tz)}</span>;
        return planner ? (
          <button className="rounded px-1 hover:bg-muted" onClick={() => open("deadline", ref(r), { date: isoToLocalInput(r.current_due_at, tz, true) })} aria-label={`Change due date for ${r.code}`}>
            {text}
          </button>
        ) : (
          text
        );
      }
      case "session":
        return <span className="text-xs tabular">{x.session ? fmtDateTime(x.session, tz) : "-"}</span>;
      case "raw_files":
        return <span className={cn("text-xs", !x.rawFiles && "text-muted-foreground")}>{x.rawFiles ? `${x.rawFiles} file${x.rawFiles > 1 ? "s" : ""}` : "None"}</span>;
      case "master":
        return x.master ? (
          <a href={x.master.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
            Master v{x.master.version}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        );
      case "captions":
        return <span className={cn("text-xs", !x.captions && "text-muted-foreground")}>{x.captions ? "Linked" : "Missing"}</span>;
      case "thumbnail":
        return <span className={cn("text-xs", !x.thumbnail && "text-muted-foreground")}>{x.thumbnail ? "Linked" : "Missing"}</span>;
      case "destination":
        return x.destination ? (
          x.destination.url ? (
            <a href={x.destination.url} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
              {x.destination.ref ?? x.destination.platform}
            </a>
          ) : (
            <span className="text-xs">{x.destination.ref}</span>
          )
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      case "playback":
        return x.uploadVerified.total ? (
          <StatusPill tone={x.uploadVerified.done === x.uploadVerified.total ? "done" : "neutral"} size="xs" label={`${x.uploadVerified.done}/${x.uploadVerified.total} verified`} />
        ) : null;
      case "release_date":
        return <span className="text-xs tabular">{r.published_at ? fmtDateTime(r.published_at, tz) : r.scheduled_publish_at ? `Sched. ${fmtDateTime(r.scheduled_publish_at, tz)}` : "-"}</span>;
      case "live_url":
        return r.live_url ? (
          <a href={r.live_url} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
            {r.live_url.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      case "handoff":
        return x.handoff === "waiting" ? (
          <StatusPill tone="handoff" size="xs" label={`Waiting: ${r.stage ? STAGE_LABELS[NEXT_STAGE[r.stage] ?? r.stage] : ""}`} />
        ) : x.handoff === "returned" ? (
          <StatusPill tone="paused" size="xs" label="Last returned" />
        ) : x.handoff === "accepted" ? (
          <span className="text-xs text-muted-foreground">Last accepted</span>
        ) : null;
      case "blocker":
        return r.open_blocker ? <StatusPill tone="blocked" size="xs" label={BLOCKER_CAUSE_LABELS[r.open_blocker] ?? r.open_blocker} /> : null;
      case "age":
        return r.lifecycle === "in_production" ? <span className="text-xs tabular">{fmtAge(r.stage_entered_at, now)}</span> : null;
      case "questions":
        return r.open_questions ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--st-paused-fg)]">
            <CircleAlertIcon className="size-3" /> {r.open_questions} open
          </span>
        ) : null;
      case "comments":
        return (
          <button className="inline-flex items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setThread({ row: r, field: null })}>
            <MessageSquareIcon className="size-3.5" /> {r.comment_count || "Add"}
          </button>
        );
      case "updated":
        return (
          <span className="text-xs text-muted-foreground" title={`${fmtDateTime(r.updated_at, tz)}${x.lastEditor ? ` by ${names[x.lastEditor] ?? ""}` : ""}`}>
            {fmtRelative(r.updated_at, now)}
          </span>
        );
      default:
        return null;
    }
  };

  const optional = Object.keys(SHEET_COLUMNS);
  const saveCols = async (cols: string[]) => {
    if (!cols.length) return toast.info("Keep at least one column.");
    setColumns(cols);
    await savePrefsAction({ sheetPresets: { [preset.key]: { columns: cols, includesBase: true } } } as never);
  };
  let rowIndex = 0;

  return (
    <div className="space-y-3">
      {selected.length > 0 && <BulkBar selected={selected} onClear={() => setSelected([])} users={users} perms={viewer.perms} tz={tz} rows={rows} leads={viewer.leads} />}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={preset.key} onValueChange={(v) => update({ preset: v } as never, { resetPage: false })}>
          <SelectTrigger size="sm" className="h-8 w-56 text-xs" aria-label="Sheet preset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHEET_PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("sort") === "subject" ? "subject" : "grade"} onValueChange={(v) => update({ sort: v === "subject" ? "subject" : "curriculum", dir: "asc" } as never, { resetPage: false })}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Hierarchy order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grade">Grade → Subject</SelectItem>
            <SelectItem value="subject">Subject → Grade</SelectItem>
          </SelectContent>
        </Select>
        <span className="hidden text-xs text-muted-foreground lg:inline">{preset.description}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={groupBy}
            onValueChange={(v) => {
              setGroupBy(v);
              update({ group: v === "none" ? "" : v } as never, { resetPage: false });
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Group rows">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["none", "No grouping"],
                ["grade", "Group by grade"],
                ["subject", "Group by subject"],
                ["unit", "Group by unit"],
                ["owner", "Group by owner"],
                ["stage", "Group by stage"],
              ].map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setCompact((c) => !c)}>
            {compact ? "Compact" : "Comfortable"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3Icon /> Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <p className="mb-2 text-xs text-muted-foreground">Grade, subject, unit and title stay frozen on the left while shown. Saved for this preset only.</p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {optional.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={columns.includes(k)} onCheckedChange={(v) => saveCols(v ? [...columns, k] : columns.filter((c) => c !== k))} />
                    {SHEET_COLUMNS[k].label}
                  </label>
                ))}
              </div>
              <Button variant="link" size="xs" className="mt-2 px-0" onClick={() => saveCols(presetColumns)}>
                Reset preset columns
              </Button>
            </PopoverContent>
          </Popover>
          <ExportMenu
            columns={["grade", "subject", "unit", "lesson", "code", "title", "recording_status", "editing_status", "uploading_status", "publication_status", "owner", "due", "blocker", "comments", "updated"]}
            query={params.toString()}
            selected={[]}
            pageCount={rows.length}
            total={total}
            perms={viewer.perms}
          />
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="max-h-[72vh] overflow-auto scrollbar-thin" role="grid" aria-rowcount={rows.length} onKeyDown={onGridKey}>
          <table className="border-separate border-spacing-0 text-left" style={{ minWidth: widths.reduce((a, b) => a + b, 0) }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {allCols.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={cn("border-b bg-muted px-2 py-2 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase", i < frozen && "sticky z-30", i === frozen - 1 && "border-r")}
                    style={{ width: widths[i], minWidth: widths[i], left: i < frozen ? left(i) : undefined }}
                  >
                    <span className="flex items-center gap-2">
                      {i === 0 && (
                        <Checkbox
                          aria-label="Select all rows"
                          checked={rows.length > 0 && selected.length === rows.length ? true : selected.length ? "indeterminate" : false}
                          onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
                        />
                      )}
                      {SHEET_COLUMNS[c]?.label ?? c}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <React.Fragment key={g.key}>
                    {g.label && (
                      <tr>
                        <td colSpan={allCols.length} className="sticky left-0 border-b bg-secondary/70 px-2 py-1.5">
                          <button
                            className="flex items-center gap-1.5 text-xs font-semibold"
                            onClick={() => setCollapsed((s) => {
                              const n = new Set(s);
                              if (n.has(g.key)) n.delete(g.key);
                              else n.add(g.key);
                              return n;
                            })}
                            aria-expanded={!isCollapsed}
                          >
                            {isCollapsed ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
                            {g.label}
                            <span className="font-normal text-muted-foreground">{g.rows.length}</span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {!isCollapsed &&
                      g.rows.map((r, idx) => {
                        const ri = rowIndex++;
                        // Grade, subject and unit read as merged cells: repeated values are left blank.
                        const prev = g.rows[idx - 1];
                        const repeat = (c: string) =>
                          !!prev &&
                          MERGED.includes(c) &&
                          prev.grade_id === r.grade_id &&
                          (c === "grade" || prev.subject_id === r.subject_id) &&
                          (c !== "unit" || prev.unit_id === r.unit_id);
                        return (
                          <ItemContextMenu key={r.id} item={actionItemOf(r)} viewer={viewer}>
                          <tr className="group">
                            {allCols.map((c, i) => {
                              const key = `${r.id}:${c}`;
                              const state = save[key];
                              const notes = extras[r.id]?.fieldComments[c] ?? 0;
                              return (
                                <td
                                  key={c}
                                  data-cell={`${ri}:${i}`}
                                  className={cn(
                                    "relative border-b bg-card px-2 align-middle group-hover:bg-muted/40",
                                    compact ? "h-9 py-0.5" : "h-12 py-1.5",
                                    i < frozen && "sticky z-10",
                                    i === frozen - 1 && "border-r",
                                    state === "failed" && "bg-[var(--st-failed-bg)]",
                                  )}
                                  style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i], left: i < frozen ? left(i) : undefined }}
                                >
                                  <div className="flex min-w-0 items-center gap-1">
                                    {i === 0 && <Checkbox aria-label={`Select ${r.code}`} checked={selected.includes(r.id)} onCheckedChange={(v) => toggleRow(r.id, v === true)} className="mr-1 shrink-0" />}
                                    <div className="min-w-0 flex-1">{repeat(c) ? null : renderCell(r, c)}</div>
                                    {state === "saving" && <LoaderIcon className="size-3 shrink-0 animate-spin text-muted-foreground" aria-label="Saving" />}
                                    {state === "saved" && <span className="shrink-0 text-[10px] text-[var(--st-done-fg)]">Saved</span>}
                                    {state === "failed" && <span className="shrink-0 text-[10px] font-medium text-[var(--st-failed-fg)]">Not saved</span>}
                                    {c !== "comments" && c !== "title" && (
                                      <button
                                        onClick={() => setThread({ row: r, field: c })}
                                        className={cn(
                                          "shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus:opacity-100",
                                          notes ? "text-[var(--st-paused-fg)] opacity-100" : "opacity-0 group-hover:opacity-100",
                                        )}
                                        aria-label={notes ? `${notes} comments on this cell` : "Comment on this cell"}
                                        title={notes ? `${notes} open comment${notes > 1 ? "s" : ""}` : "Comment on this cell"}
                                      >
                                        {notes ? <MessageSquareIcon className="size-3" /> : <MessageSquarePlusIcon className="size-3" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                          </ItemContextMenu>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards: one card per row with the stage statuses as dropdowns */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border bg-card p-3">
            <div>{renderCell(r, "title")}</div>
            <p className="text-xs text-muted-foreground">
              {r.grade_name} / {r.subject_name} {r.unit_number ? `/ Unit ${r.unit_number}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STAGES.map((st) => (
                <div key={st} className="space-y-0.5">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{STAGE_LABELS[st]}</p>
                  {renderCell(r, `${st}_status`)}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              {renderCell(r, "owner")}
              {renderCell(r, "due")}
              {renderCell(r, "comments")}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Every change runs through the same checks as the lesson page and is timestamped in the history. Choosing Done on unfinished work opens the handoff
        checklist; it never marks acceptance by itself. Use arrow keys to move between cells and Enter to open a dropdown.
      </p>

      <Sheet open={!!thread} onOpenChange={(o) => !o && setThread(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{thread?.field ? `${SHEET_COLUMNS[thread.field]?.label ?? thread.field} comments` : "Item discussion"}</SheetTitle>
            <SheetDescription>
              {thread?.row.code} {thread?.row.title}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {thread && (
              <CommentThread
                key={`${thread.row.id}-${thread.field}`}
                itemId={thread.row.id}
                field={thread.field}
                stage={thread.field && STATUS_COLS[thread.field] ? STATUS_COLS[thread.field] : thread.row.stage}
                viewerId={viewer.id}
                isManager={viewer.roles.includes("manager")}
                tz={tz}
              />
            )}
            {thread && (
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <Link href={`/items/${thread.row.id}?tab=history`}>Open full history for this item</Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
