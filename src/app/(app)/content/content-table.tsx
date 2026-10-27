"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, Columns3Icon, LayoutGridIcon, ListTreeIcon, Rows3Icon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/app/primitives";
import { progressChip, progressOf, renderCell, type CellContext } from "@/components/app/item-cells";
import { ItemActions, ItemContextMenu, type ActionViewer } from "@/components/app/item-actions";
import { BulkBar, ExportMenu } from "@/components/app/bulk-and-export";
import { useFilters } from "@/components/app/filter-bar";
import { savePrefsAction } from "@/app/actions/admin";
import { DEFAULT_CONTENT_COLUMNS, HIERARCHY_COLUMNS, ITEM_COLUMNS } from "@/lib/columns";
import { NEXT_STAGE, STAGE_LABELS, STAGES, type Role } from "@/lib/domain";
import type { ItemListRow } from "@/server/queries";
import { cn } from "@/lib/utils";

const SORTABLE: Record<string, string> = { due: "due", priority: "priority", stage: "stage", status: "stage", age: "age", updated: "updated", published: "published" };

export type Grouping = "grade" | "subject" | "none";

const TOGGLE = "h-8 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary";

const partLabel = (r: ItemListRow) => {
  const t = r.lesson_title ?? r.title;
  if (!r.lesson_number) return r.title;
  return /^part \d+$/i.test(t) ? `Part ${r.lesson_number}` : `Part ${r.lesson_number}: ${t}`;
};
const unitLabel = (r: ItemListRow) => (!r.unit_number ? "No unit" : /^unit \d+$/i.test(r.unit_title ?? "") ? `Unit ${r.unit_number}` : `Unit ${r.unit_number}: ${r.unit_title}`);

// Clicks on links, buttons and checkboxes inside a row keep their own behaviour.
function isInteractive(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("a,button,input,label,[role=checkbox],[role=menuitem],[data-no-row-click]");
}

export function actionItemOf(r: ItemListRow) {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    version: r.version,
    lifecycle: r.lifecycle,
    stage: r.stage,
    status: r.stage_status,
    substate: r.substate,
    ownerId: r.stage ? r.stages[r.stage].ownerId : r.lifecycle === "draft" ? r.owners.recording : null,
    nextOwnerId: r.stage && NEXT_STAGE[r.stage] ? r.owners[NEXT_STAGE[r.stage]!] : null,
  };
}

export function ContentTable({
  rows,
  total,
  page,
  size,
  columns: initialColumns,
  density: initialDensity,
  ctx,
  viewer,
  users,
  now,
  grouping,
}: {
  now: number;
  rows: ItemListRow[];
  total: number;
  page: number;
  size: number;
  columns: string[];
  density: "comfortable" | "compact";
  ctx: Omit<CellContext, "now">;
  viewer: ActionViewer;
  users: { id: string; name: string; roles: Role[] }[];
  grouping: Grouping;
}) {
  const router = useRouter();
  const { filters, update, params } = useFilters();
  const [columns, setColumns] = React.useState(initialColumns);
  const [density, setDensity] = React.useState(initialDensity);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<"table" | "cards" | "tree">("table");
  React.useEffect(() => setSelected([]), [rows]);
  const cctx: CellContext = { ...ctx, now };
  const pages = Math.max(1, Math.ceil(total / size));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const grouped = grouping !== "none";
  // In a hierarchy the curriculum columns become merged cells on the left.
  const cols = grouped ? columns.filter((c) => !HIERARCHY_COLUMNS.includes(c)) : columns;
  const open = (r: ItemListRow) => router.push(`/items/${r.id}/form`);

  const saveColumns = async (c: string[]) => {
    setColumns(c);
    await savePrefsAction({ contentColumns: c });
  };
  const sortBy = (key: string) => {
    const s = SORTABLE[key];
    if (!s) return;
    update({ sort: s, dir: filters.sort === s && filters.dir === "asc" ? "desc" : "asc" }, { resetPage: false });
  };
  const toggle = (id: string, sel: boolean) => setSelected((x) => (sel ? x.filter((i) => i !== id) : [...x, id]));

  // Merged cell spans for the current page (rows arrive in curriculum order when grouped).
  const l1 = (r: ItemListRow) => (grouping === "subject" ? r.subject_id : r.grade_id);
  const l2 = (r: ItemListRow) => `${l1(r)}|${grouping === "subject" ? r.grade_id : r.subject_id}`;
  const l3 = (r: ItemListRow) => `${l2(r)}|${r.unit_id ?? "none"}`;
  const span = (i: number, key: (r: ItemListRow) => string) => {
    if (i > 0 && key(rows[i - 1]) === key(rows[i])) return 0;
    let n = 1;
    while (i + n < rows.length && key(rows[i + n]) === key(rows[i])) n++;
    return n;
  };
  const name1 = (r: ItemListRow) => (grouping === "subject" ? r.subject_name : r.grade_name);
  const name2 = (r: ItemListRow) => (grouping === "subject" ? r.grade_name : r.subject_name);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={grouping} onValueChange={(v) => v && update({ group: v, sort: v === "subject" ? "subject" : v === "grade" ? "curriculum" : filters.sort, dir: "asc" } as never)} aria-label="Hierarchy">
          <ToggleGroupItem value="grade" className={TOGGLE}>
            Grade → Subject
          </ToggleGroupItem>
          <ToggleGroupItem value="subject" className={TOGGLE}>
            Subject → Grade
          </ToggleGroupItem>
          <ToggleGroupItem value="none" className={TOGGLE}>
            Flat
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)} aria-label="Layout">
          <ToggleGroupItem value="table" className={TOGGLE}>
            <TableIcon /> Table
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" className={TOGGLE}>
            <LayoutGridIcon /> Cards
          </ToggleGroupItem>
          <ToggleGroupItem value="tree" className={TOGGLE}>
            <ListTreeIcon /> Curriculum
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!grouped && (
            <Select
              value={`${filters.sort}:${filters.dir}`}
              onValueChange={(v) => {
                const [s, d] = v.split(":");
                update({ sort: s, dir: d as "asc" | "desc" }, { resetPage: false });
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["updated:desc", "Recently updated"],
                  ["due:asc", "Due date, soonest"],
                  ["priority:asc", "Priority, highest"],
                  ["age:asc", "Oldest in stage"],
                  ["curriculum:asc", "Curriculum order"],
                  ["code:asc", "Code A to Z"],
                  ["stage:asc", "Stage"],
                  ["published:desc", "Recently published"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={async () => {
              const d = density === "compact" ? "comfortable" : "compact";
              setDensity(d);
              await savePrefsAction({ density: d });
            }}
            aria-label="Toggle density"
          >
            <Rows3Icon /> {density === "compact" ? "Compact" : "Comfortable"}
          </Button>
          <ColumnChooser columns={columns} onChange={saveColumns} grouped={grouped} />
          <ExportMenu columns={columns} query={params.toString()} selected={selected} pageCount={rows.length} total={total} perms={viewer.perms} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Click a row to open its page. Right-click a row for every action: send to the next team, request a redo, ask a question, assign and more.</p>

      {rows.length === 0 ? (
        <EmptyState title="No items match these filters" description="Clear a filter or widen the date range. Archived and cancelled items are hidden unless you choose them under More filters." />
      ) : mode === "table" ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="max-h-[72vh] overflow-auto scrollbar-thin">
              <table className={cn("w-full border-separate border-spacing-0 text-left", density === "compact" ? "density-compact" : "density-comfortable")}>
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="w-9 border-b px-2">
                      <Checkbox aria-label="Select page" checked={allOnPage} onCheckedChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} />
                    </th>
                    {grouped && (
                      <>
                        <th className="w-28 border-b px-3 py-2">{grouping === "subject" ? "Subject" : "Grade"}</th>
                        <th className="w-36 border-b px-3 py-2">{grouping === "subject" ? "Grade" : "Subject"}</th>
                        <th className="w-56 border-b px-3 py-2">Unit</th>
                        <th className="min-w-64 border-b px-3 py-2">Part</th>
                      </>
                    )}
                    {cols.map((c) => {
                      const def = ITEM_COLUMNS.find((x) => x.key === c);
                      const s = SORTABLE[c];
                      const active = s && filters.sort === s;
                      return (
                        <th key={c} scope="col" style={{ minWidth: def?.width }} className={cn("border-b px-2 py-2 whitespace-nowrap", c.endsWith("_progress") && "text-center")}>
                          {s && !grouped ? (
                            <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => sortBy(c)}>
                              {def?.label}
                              {active && (filters.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                            </button>
                          ) : (
                            def?.label
                          )}
                        </th>
                      );
                    })}
                    <th className="border-b px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const sel = selected.includes(r.id);
                    const s1 = grouped ? span(i, l1) : 0;
                    const s2 = grouped ? span(i, l2) : 0;
                    const s3 = grouped ? span(i, l3) : 0;
                    return (
                      <ItemContextMenu key={r.id} item={actionItemOf(r)} viewer={viewer}>
                        <tr
                          className={cn("density-row group cursor-pointer", sel ? "[&>td.c]:bg-accent/40" : "hover:[&>td.c]:bg-muted/50")}
                          onClick={(e) => !isInteractive(e.target) && open(r)}
                        >
                          <td className="c border-b px-2">
                            <Checkbox aria-label={`Select ${r.code}`} checked={sel} onCheckedChange={() => toggle(r.id, sel)} />
                          </td>
                          {s1 > 0 && (
                            <td rowSpan={s1} className="border-r border-b bg-card px-3 py-2 align-top font-semibold">
                              {name1(r)}
                            </td>
                          )}
                          {s2 > 0 && (
                            <td rowSpan={s2} className="border-r border-b bg-card px-3 py-2 align-top font-medium">
                              {name2(r)}
                            </td>
                          )}
                          {s3 > 0 && (
                            <td rowSpan={s3} className="border-r border-b bg-card px-3 py-2 align-top text-sm">
                              {unitLabel(r)}
                            </td>
                          )}
                          {grouped && (
                            <td className="c border-b px-3 py-1.5">
                              <span className="block text-sm font-medium">{partLabel(r)}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span>
                            </td>
                          )}
                          {cols.map((c) => (
                            <td key={c} className={cn("c border-b px-2 py-1.5 align-middle", c.endsWith("_progress") && "text-center")}>
                              {renderCell(r, c, cctx)}
                            </td>
                          ))}
                          <td className="c border-b px-2 text-right">
                            <ItemActions item={actionItemOf(r)} viewer={viewer} size="xs" max={1} className="justify-end" />
                          </td>
                        </tr>
                      </ItemContextMenu>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <CardList rows={rows} ctx={cctx} viewer={viewer} selected={selected} toggle={toggle} open={open} grouping={grouping} className="md:hidden" />
        </>
      ) : mode === "cards" ? (
        <CardList rows={rows} ctx={cctx} viewer={viewer} selected={selected} toggle={toggle} open={open} grouping={grouping} grid />
      ) : (
        <Tree rows={rows} ctx={cctx} viewer={viewer} open={open} grouping={grouping} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">
          Page {page} of {pages}. Rows {(page - 1) * size + (rows.length ? 1 : 0)} to {(page - 1) * size + rows.length} of {total}.
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(size)} onValueChange={(v) => update({ size: Number(v) as never })}>
            <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 } as never, { resetPage: false })} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => update({ page: page + 1 } as never, { resetPage: false })} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <BulkBar selected={selected} onClear={() => setSelected([])} users={users} perms={viewer.perms} tz={ctx.tz} />
    </div>
  );
}

function ColumnChooser({ columns, onChange, grouped }: { columns: string[]; onChange: (c: string[]) => void; grouped: boolean }) {
  const groups = [...new Set(ITEM_COLUMNS.map((c) => c.group))];
  const move = (key: string, dir: -1 | 1) => {
    const i = columns.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Columns3Icon /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{grouped ? "Grade, subject, unit and part are shown by the hierarchy." : "Choose and order columns."}</p>
          <Button variant="link" size="xs" className="px-0" onClick={() => onChange(DEFAULT_CONTENT_COLUMNS)}>
            Reset
          </Button>
        </div>
        <div className="mb-2 max-h-32 space-y-1 overflow-y-auto rounded-md border p-1.5">
          {columns.map((c, i) => (
            <div key={c} className="flex items-center gap-1 text-xs">
              <span className="flex-1 truncate">{ITEM_COLUMNS.find((x) => x.key === c)?.label ?? c}</span>
              <Button variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => move(c, -1)} aria-label="Move up">
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon-xs" disabled={i === columns.length - 1} onClick={() => move(c, 1)} aria-label="Move down">
                <ArrowDownIcon />
              </Button>
            </div>
          ))}
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
              {ITEM_COLUMNS.filter((c) => c.group === g).map((c) => (
                <label key={c.key} className="flex items-center gap-2 py-0.5 text-xs">
                  <Checkbox checked={columns.includes(c.key)} onCheckedChange={(v) => onChange(v ? [...columns, c.key] : columns.filter((x) => x !== c.key))} disabled={columns.length <= 1 && columns.includes(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function groupRows(rows: ItemListRow[], grouping: Grouping) {
  const out = new Map<string, { title: string; rows: ItemListRow[] }>();
  for (const r of rows) {
    const key = grouping === "none" ? "all" : grouping === "subject" ? `${r.subject_id}|${r.grade_id}` : `${r.grade_id}|${r.subject_id}`;
    const title = grouping === "none" ? "" : grouping === "subject" ? `${r.subject_name} › ${r.grade_name}` : `${r.grade_name} › ${r.subject_name}`;
    (out.get(key) ?? out.set(key, { title, rows: [] }).get(key)!).rows.push(r);
  }
  return [...out.values()];
}

function CardList({
  rows,
  ctx,
  viewer,
  selected,
  toggle,
  open,
  grouping,
  className,
  grid,
}: {
  rows: ItemListRow[];
  ctx: CellContext;
  viewer: ActionViewer;
  selected: string[];
  toggle: (id: string, sel: boolean) => void;
  open: (r: ItemListRow) => void;
  grouping: Grouping;
  className?: string;
  grid?: boolean;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {groupRows(rows, grouping).map((g) => (
        <section key={g.title || "all"} className="space-y-2">
          {g.title && (
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {g.title} <span className="text-xs font-normal text-muted-foreground">{g.rows.length}</span>
            </h3>
          )}
          <ul className={cn("grid gap-2", grid && "sm:grid-cols-2 xl:grid-cols-3")}>
            {g.rows.map((r) => {
              const sel = selected.includes(r.id);
              return (
                <ItemContextMenu key={r.id} item={actionItemOf(r)} viewer={viewer}>
                  <li
                    className={cn("flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3 hover:border-primary/40", sel && "border-primary/50 bg-accent/30")}
                    onClick={(e) => !isInteractive(e.target) && open(r)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox className="mt-1" aria-label={`Select ${r.code}`} checked={sel} onCheckedChange={() => toggle(r.id, sel)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{unitLabel(r)}</p>
                        <p className="line-clamp-2 text-sm font-medium">{partLabel(r)}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{r.code}</p>
                      </div>
                      {renderCell(r, "priority", ctx)}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {STAGES.map((st) => (
                        <div key={st} className="flex flex-col items-center gap-0.5 text-center">
                          <span className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_LABELS[st].slice(0, 4)}</span>
                          {progressChip(progressOf(r, st))}
                          <span className="text-[10px] text-muted-foreground tabular">
                            {renderCell(r, st === "recording" ? "recorded_date" : st === "editing" ? "edited_date" : st === "uploading" ? "uploaded_date" : "published", ctx)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      {renderCell(r, "owner", ctx)}
                      <span data-no-row-click>
                        <ItemActions item={actionItemOf(r)} viewer={viewer} size="xs" max={1} />
                      </span>
                    </div>
                  </li>
                </ItemContextMenu>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Curriculum outline: every part with the stage it is in and its four stage statuses.
function Tree({ rows, ctx, viewer, open, grouping }: { rows: ItemListRow[]; ctx: CellContext; viewer: ActionViewer; open: (r: ItemListRow) => void; grouping: Grouping }) {
  return (
    <div className="space-y-3">
      {groupRows(rows, grouping === "none" ? "grade" : grouping).map((g) => {
        const units = new Map<string, ItemListRow[]>();
        for (const r of g.rows) (units.get(unitLabel(r)) ?? units.set(unitLabel(r), []).get(unitLabel(r))!).push(r);
        return (
          <section key={g.title} className="overflow-hidden rounded-xl border bg-card">
            <h3 className="border-b bg-muted/50 px-3 py-2 text-sm font-semibold">{g.title}</h3>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-1.5">Part</th>
                  <th className="px-2 py-1.5">Stage now</th>
                  {STAGES.map((s) => (
                    <th key={s} className="px-2 py-1.5 text-center">
                      {STAGE_LABELS[s]}
                    </th>
                  ))}
                  <th className="px-2 py-1.5">Owner</th>
                </tr>
              </thead>
              {[...units.entries()].map(([u, list]) => (
                <tbody key={u} className="border-t">
                  <tr>
                    <td colSpan={7} className="bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {u}
                    </td>
                  </tr>
                  {list.map((r) => (
                    <ItemContextMenu key={r.id} item={actionItemOf(r)} viewer={viewer}>
                      <tr className="cursor-pointer border-t hover:bg-muted/40" onClick={(e) => !isInteractive(e.target) && open(r)}>
                        <td className="px-3 py-1.5">{partLabel(r)}</td>
                        <td className="px-2 py-1.5">{renderCell(r, "status", ctx)}</td>
                        {STAGES.map((s) => (
                          <td key={s} className="px-2 py-1.5 text-center">
                            {progressChip(progressOf(r, s))}
                          </td>
                        ))}
                        <td className="px-2 py-1.5">{renderCell(r, "owner", ctx)}</td>
                      </tr>
                    </ItemContextMenu>
                  ))}
                </tbody>
              ))}
            </table>
          </section>
        );
      })}
    </div>
  );
}
