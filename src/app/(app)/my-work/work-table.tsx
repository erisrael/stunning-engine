"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, BookmarkIcon, Columns3Icon, Trash2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { deleteViewAction, saveViewAction } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

// One table for My work (Update 1.0, phase 6), for every department, role and team: choose columns, sort by any of
// them, group by one, filter, and save the arrangement as a view (your own, or shared by a manager).

export type WtCol<T> = { key: string; label: string; sort: (r: T) => string | number; cell: (r: T) => React.ReactNode; group?: (r: T) => string; hidden?: boolean };
export type WtFilter<T> = { key: string; label: string; get: (r: T) => string; label_?: (v: string) => string };
export type WtView = { id: string; name: string; shared: boolean; mine: boolean; config: Record<string, unknown> };
type Cfg = { q: string; filters: Record<string, string>; sort: { key: string; dir: 1 | -1 }; group: string; hidden: string[] };

const cmp = (x: string | number, y: string | number) => (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));

export function WorkTable<T>({
  rows,
  cols,
  filters,
  search,
  rowKey,
  page,
  views,
  canShare,
  defaultSort,
  label,
  empty = "Nothing matches.",
}: {
  rows: T[];
  cols: WtCol<T>[];
  filters: WtFilter<T>[];
  search: (r: T) => string;
  rowKey: (r: T) => string;
  page: string;
  views: WtView[];
  canShare: boolean;
  defaultSort: { key: string; dir: 1 | -1 };
  label: string;
  empty?: string;
}) {
  const router = useRouter();
  const initial: Cfg = { q: "", filters: {}, sort: defaultSort, group: "", hidden: cols.filter((c) => c.hidden).map((c) => c.key) };
  const storeKey = `myseed.wt.${page}`;
  const [cfg, setCfg] = React.useState<Cfg>(initial);
  const [viewId, setViewId] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (s && typeof s === "object") setCfg((c) => ({ ...c, ...s }));
    } catch {
      // No saved arrangement in this browser.
    }
    setLoaded(true);
  }, [storeKey]);
  React.useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify(cfg));
    } catch {
      // Storage blocked.
    }
  }, [cfg, loaded, storeKey]);
  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }));
  const shownCols = cols.filter((c) => !cfg.hidden.includes(c.key));
  const sortCol = cols.find((c) => c.key === cfg.sort.key) ?? cols[0];
  const q = cfg.q.trim().toLowerCase();
  const list = rows
    .filter((r) => filters.every((f) => !cfg.filters[f.key] || cfg.filters[f.key] === "all" || f.get(r) === cfg.filters[f.key]) && (!q || search(r).toLowerCase().includes(q)))
    .sort((a, b) => cmp(sortCol.sort(a), sortCol.sort(b)) * cfg.sort.dir);
  const groupCol = cols.find((c) => c.key === cfg.group);
  const gkey = (r: T) => (groupCol ? (groupCol.group ? groupCol.group(r) : String(groupCol.sort(r))) || "—" : "");
  const groups: [string, T[]][] = groupCol
    ? [...list.reduce((m, r) => m.set(gkey(r), [...(m.get(gkey(r)) ?? []), r]), new Map<string, T[]>())]
    : [["", list]];

  const apply = (id: string) => {
    setViewId(id);
    const v = views.find((x) => x.id === id);
    if (!v) return setCfg(initial);
    const c = v.config as Partial<Cfg>;
    setCfg({ ...initial, ...c, filters: { ...(c.filters ?? {}) }, hidden: Array.isArray(c.hidden) ? c.hidden : initial.hidden });
  };
  const save = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const shared = canShare && window.confirm("Share it with everyone? (Cancel keeps it to you.)");
    const r = await saveViewAction({ name, page, query: "", shared, config: cfg as unknown as Record<string, unknown> });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Saved “${name.trim()}”`);
    if (r.data) setViewId(r.data);
    router.refresh();
  };
  const remove = async () => {
    const r = await deleteViewAction(viewId);
    if (!r.ok) return void toast.error(r.error);
    setViewId("");
    toast.success("View deleted");
    router.refresh();
  };
  const filterOptions = (f: WtFilter<T>) => [...new Set(rows.map(f.get).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <div className="space-y-2" data-work-table={page} data-ready={loaded ? "" : undefined}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={`Filter ${label}`}>
        <Input value={cfg.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search…" className="h-8 w-48 text-xs" aria-label={`Search ${label}`} />
        {filters.map((f) => {
          const opts = filterOptions(f);
          if (!opts.length && !cfg.filters[f.key]) return null;
          return (
            <select key={f.key} aria-label={f.label} value={cfg.filters[f.key] ?? "all"} onChange={(e) => set({ filters: { ...cfg.filters, [f.key]: e.target.value } })} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="all">Every {f.label.toLowerCase()}</option>
              {opts.map((o) => <option key={o} value={o}>{f.label_ ? f.label_(o) : o}</option>)}
            </select>
          );
        })}
        <select aria-label="Group by" value={cfg.group} onChange={(e) => set({ group: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs" data-group-by>
          <option value="">No grouping</option>
          {cols.filter((c) => c.group).map((c) => <option key={c.key} value={c.key}>Group by {c.label.toLowerCase()}</option>)}
        </select>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs" data-columns><Columns3Icon /> Columns</Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 space-y-1 p-2" align="start">
            {cols.map((c, i) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
                <Checkbox disabled={i === 0} checked={!cfg.hidden.includes(c.key)} onCheckedChange={(v) => set({ hidden: v === true ? cfg.hidden.filter((k) => k !== c.key) : [...cfg.hidden, c.key] })} aria-label={`Show ${c.label}`} />
                {c.label}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">{list.length} of {rows.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <select aria-label="Saved views" value={viewId} onChange={(e) => apply(e.target.value)} className="h-8 max-w-40 rounded-md border bg-background px-2 text-xs" data-saved-views>
            <option value="">Default view</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.shared ? " (shared)" : ""}</option>)}
          </select>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={save} data-save-view><BookmarkIcon /> Save view</Button>
          {viewId && views.find((v) => v.id === viewId)?.mine && (
            <Button size="icon" variant="ghost" className="size-8" onClick={remove} aria-label="Delete this view"><Trash2Icon /></Button>
          )}
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr>
              {shownCols.map((c) => (
                <th key={c.key} className="px-2 py-2 whitespace-nowrap">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => set({ sort: { key: c.key, dir: cfg.sort.key === c.key ? (cfg.sort.dir === 1 ? -1 : 1) : 1 } })}>
                    {c.label}
                    {cfg.sort.key === c.key && (cfg.sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(([g, rs]) => (
            <tbody key={g || "all"} data-group={g || undefined}>
              {groupCol && (
                <tr className="border-t bg-muted/40">
                  <td colSpan={shownCols.length} className="px-2 py-1 text-xs font-medium">{g} <span className="text-muted-foreground">({rs.length})</span></td>
                </tr>
              )}
              {rs.map((r) => (
                <tr key={rowKey(r)} className="border-t hover:bg-muted/40">
                  {shownCols.map((c, i) => <td key={c.key} className={cn("px-2 py-1.5", i > 0 && "text-xs")}>{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
          {!list.length && (
            <tbody><tr><td colSpan={shownCols.length} className="px-3 py-8 text-center text-muted-foreground">{empty}</td></tr></tbody>
          )}
        </table>
      </div>
    </div>
  );
}
