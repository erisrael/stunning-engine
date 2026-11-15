"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { bulkTasksAction, saveTaskAction } from "@/app/actions/departments";
import type { Task, TaskFilter, Project } from "@/server/work";
import type { DeptConfig } from "@/lib/dept-config";
import type { WorkDept } from "@/lib/work";
import { BulkPick, taskInput, canEditTask, type Access, type Person } from "./work-shared";
import { columnsFor, defaultColumns, SheetView } from "./work-views";

export function DepartmentDataManager({ dept, config, tasks, people, projects, access, viewerId, go, onOpen, onExport }: {
  dept: WorkDept; config: DeptConfig; tasks: Task[]; filter: TaskFilter; people: Person[]; projects: Project[]; access: Access; viewerId: string;
  go: (patch: Record<string, string | null>) => void; onOpen: (task: Task) => void; onExport: (tasks: Task[]) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const sheet = params.get("mode") === "sheet";
  const all = columnsFor(config, people, projects);
  const keys = (params.get("cols") || defaultColumns(config).join(",")).split(",");
  if (!keys.includes("title")) keys.splice(1, 0, "title");
  const cols = [...new Set(keys)].flatMap(key => all.filter(c => c.key === key));
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [target, setTarget] = React.useState<{ row?: string; column?: string }>({});
  const selected = tasks.filter(t => picked.has(t.id));
  const ids = new Set(selected.map(t => t.id));
  const toggle = (id: string) => setPicked(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const writable = !access.readOnly;
  const row = tasks.find(t => t.id === target.row);
  const col = all.find(c => c.key === target.column);
  const canDelete = (t: Task) => writable && access.rights.deleteTasks && (access.rights.deleteAll || t.reporter_id === viewerId);
  const mutate = async (rows: Task[], patch: Parameters<typeof bulkTasksAction>[2]) => {
    if (busy || !rows.length) return;
    if (rows.length > 500) return toast.error("Select at most 500 records per action.");
    if (patch.delete && !window.confirm(`Permanently delete ${rows.length} record(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const result = await bulkTasksAction(dept, rows.map(t => t.id), patch);
      if (!result.ok) return toast.error(result.error);
      if (!result.data) return toast.error("No result was returned.");
      const failed = result.data.filter(r => !r.ok);
      setPicked(new Set(failed.map(r => r.id)));
      if (failed.length) toast.warning(`${result.data.length - failed.length} saved; ${failed.length} failed`, { description: failed[0].error });
      else toast.success(`${result.data.length} record(s) saved`);
      router.refresh();
    } finally { setBusy(false); }
  };
  const duplicate = async (t: Task) => {
    setBusy(true);
    try {
      const result = await saveTaskAction(dept, { ...taskInput(t), id: undefined, title: `${t.title} (copy)`, assigneeId: access.rights.assign ? t.assignee_id : viewerId });
      if (!result.ok) toast.error(result.error);
      else { toast.success("Record duplicated"); router.refresh(); }
    } finally { setBusy(false); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Clipboard access is unavailable."); } };
  const hideColumn = () => col && go({ cols: cols.filter(c => c.key !== col.key).map(c => c.key).join(",") });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Data Manager view" className="flex gap-1">
        <Button variant={sheet ? "outline" : "default"} onClick={() => go({ mode: "table" })}>Table</Button>
        <Button variant={sheet ? "default" : "outline"} onClick={() => go({ mode: "sheet" })}>Sheet</Button>
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Columns</Button></DropdownMenuTrigger><DropdownMenuContent>
        {all.map(c => <DropdownMenuItem key={c.key} disabled={c.key === "title"} onSelect={() => go({ cols: (cols.some(x => x.key === c.key) ? cols.filter(x => x.key !== c.key) : [...cols, c]).map(x => x.key).join(",") })}>{cols.some(x => x.key === c.key) ? "✓ " : ""}{c.label}</DropdownMenuItem>)}
      </DropdownMenuContent></DropdownMenu>
      <span className="text-sm text-muted-foreground">{tasks.length} loaded · {selected.length} selected</span>
      <Button variant="outline" disabled={!tasks.length} onClick={() => setPicked(ids.size === tasks.length ? new Set() : new Set(tasks.map(t => t.id)))}>Select / clear loaded rows</Button>
      <Button variant="outline" disabled={!selected.length} onClick={() => onExport(selected)}>Export selected</Button>
    </div>
    <p className="text-xs text-muted-foreground">Right-click a row for actions or a column heading to sort, copy or hide it. Sheet cells save on Enter or blur. Selection applies only to loaded records.</p>
    {!!selected.length && writable && access.rights.bulkActions && <div className="flex flex-wrap gap-2 rounded-lg border p-3" aria-label="Bulk actions">
      {access.rights.updateTasks && <>
        <BulkPick label="Set status" disabled={busy} options={config.statuses.filter(x => x.active).map(x => ({ value: x.key, label: x.label }))} onPick={status => void mutate(selected, { status })} />
        <BulkPick label="Set priority" disabled={busy} options={config.priorities.filter(x => x.active).map(x => ({ value: x.key, label: x.label }))} onPick={priority => void mutate(selected, { priority })} />
        {access.rights.assign && <BulkPick label="Assign" disabled={busy} options={[{ value: "none", label: "Unassigned" }, ...people.map(p => ({ value: p.id, label: p.name }))]} onPick={v => void mutate(selected, { assigneeId: v === "none" ? null : v })} />}
        <BulkPick label="Move to project" disabled={busy} options={[{ value: "none", label: "No project" }, ...projects.map(p => ({ value: p.id, label: p.name }))]} onPick={v => void mutate(selected, { projectId: v === "none" ? null : v })} />
      </>}
      {access.rights.deleteTasks && <Button variant="destructive" disabled={busy || !selected.every(canDelete)} onClick={() => void mutate(selected, { delete: true })}>Delete selected</Button>}
    </div>}
    <ContextMenu><ContextMenuTrigger asChild><div onContextMenuCapture={e => {
      const element = e.target as HTMLElement;
      setTarget({ row: element.closest<HTMLElement>("[data-record]")?.dataset.record, column: element.closest<HTMLElement>("th[data-column]")?.dataset.column });
    }}>
      {sheet ? <SheetView dept={dept} config={config} tasks={tasks} people={people} projects={projects} access={access} viewerId={viewerId} onOpen={onOpen} selection={{ ids, toggle }} /> : <div className="overflow-auto rounded-lg border"><table className="w-full text-sm">
        <thead className="bg-muted/50"><tr><th className="p-2">Select</th>{cols.map(c => <th key={c.key} data-column={c.key} className="p-2 text-left"><button onClick={() => c.sort && go({ sort: c.sort, dir: params.get("dir") === "asc" ? "desc" : "asc" })}>{c.label}</button></th>)}<th>Actions</th></tr></thead>
        <tbody>{tasks.map(t => <tr key={t.id} data-record={t.id} className="border-t hover:bg-muted/30"><td className="p-2"><Checkbox aria-label={`Select ${t.code}`} checked={ids.has(t.id)} onCheckedChange={() => toggle(t.id)} /></td>
          {cols.map(c => <td key={c.key} className="p-2">{c.key === "title" ? <button className="text-left hover:underline" onClick={() => onOpen(t)}>{t.title}</button> : c.cell?.(t) ?? c.text(t)}</td>)}
          <td className="p-2"><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline" aria-label={`Actions for ${t.code}`}>Actions</Button></DropdownMenuTrigger><DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onOpen(t)}>{canEditTask(access, t, viewerId) ? "Edit record" : "View record"}</DropdownMenuItem>
            <DropdownMenuItem disabled={busy || !writable || !access.rights.createTasks} onSelect={() => void duplicate(t)}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled={busy || !canDelete(t)} onSelect={() => void mutate([t], { delete: true })}>Delete</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu></td>
        </tr>)}</tbody>
      </table></div>}
      {!tasks.length && <p className="p-6 text-center text-muted-foreground">No records match your filters. Create a task or clear the filters.</p>}
    </div></ContextMenuTrigger><ContextMenuContent>
      {row ? <><ContextMenuLabel>{row.code}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => onOpen(row)}>{canEditTask(access, row, viewerId) ? "Edit record" : "View record"}</ContextMenuItem>
        <ContextMenuItem onSelect={() => toggle(row.id)}>{ids.has(row.id) ? "Deselect" : "Select"} row</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copy(cols.map(c => c.text(row)).join("\t"))}>Copy row</ContextMenuItem>
        <ContextMenuItem disabled={busy || !writable || !access.rights.createTasks} onSelect={() => void duplicate(row)}>Duplicate row</ContextMenuItem>
        <ContextMenuItem disabled={busy || !canDelete(row)} variant="destructive" onSelect={() => void mutate([row], { delete: true })}>Delete row</ContextMenuItem>
      </> : col ? <><ContextMenuLabel>{col.label}</ContextMenuLabel>
        <ContextMenuItem disabled={!col.sort} onSelect={() => go({ sort: col.sort!, dir: "asc" })}>Sort ascending</ContextMenuItem>
        <ContextMenuItem disabled={!col.sort} onSelect={() => go({ sort: col.sort!, dir: "desc" })}>Sort descending</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copy(tasks.map(t => col.text(t)).join("\n"))}>Copy column</ContextMenuItem>
        <ContextMenuItem disabled={col.key === "title"} onSelect={hideColumn}>Hide column</ContextMenuItem>
      </> : <ContextMenuItem disabled>Right-click a row or column heading</ContextMenuItem>}
    </ContextMenuContent></ContextMenu>
  </div>;
}
