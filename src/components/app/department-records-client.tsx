"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel } from "@/components/ui/context-menu";
import { DATA_RIGHTS, grantsFor, RECORD_SETS, type DataPolicy, type RecordColumn, type RecordsPageData, type RecordValue, type ManagedRecord } from "@/lib/department-records";
import { bulkDepartmentRecordsAction, saveDepartmentRecordAction, saveDataPolicyAction } from "@/app/actions/department-records";

const text = (v: RecordValue | undefined) => v == null ? "" : String(v);
export function DepartmentRecordsClient({ data }: { data: RecordsPageData }) {
  const router = useRouter();
  const params = useSearchParams();
  const set = RECORD_SETS[data.scope].find(s => s.key === data.dataset)!;
  const sheet = params.get("view") === "sheet";
  const [query, setQuery] = React.useState("");
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<{ key: string; dir: number } | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<ManagedRecord | "new" | null>(null);
  const [draft, setDraft] = React.useState<Record<string, RecordValue>>({});
  const [fill, setFill] = React.useState<string | null>(null);
  const [fillValue, setFillValue] = React.useState<RecordValue>("");
  const [target, setTarget] = React.useState<{ row?: string; column?: string }>({});
  const [permissions, showPermissions] = React.useState(false);
  const [policy, setPolicy] = React.useState<DataPolicy | null>(data.policy);
  React.useEffect(() => { setHidden([]); setSort(null); setPicked([]); setQuery(""); }, [data.dataset]);
  React.useEffect(() => setPolicy(data.policy), [data.policy]);
  const go = (key: string, value: string) => { const q = new URLSearchParams(params.toString()); q.set(key, value); router.push(`/${data.scope}/data?${q}`); };
  const rows = data.rows.filter(r => set.columns.some(c => text(r.values[c.key]).toLowerCase().includes(query.toLowerCase()))).sort((a, b) => sort ? text(a.values[sort.key]).localeCompare(text(b.values[sort.key]), undefined, { numeric: true }) * sort.dir : 0);
  const selected = rows.filter(r => picked.includes(r.id));
  const columns = set.columns.filter(c => !hidden.includes(c.key));
  const row = rows.find(r => r.id === target.row);
  const column = columns.find(c => c.key === target.column);
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("Copied"); } catch { toast.error("Clipboard access is unavailable."); } };
  const exportRows = (list: ManagedRecord[]) => {
    if (!data.rights.export) return;
    // Prefix spreadsheet formula-like values so exports remain text when opened in Excel.
    const cell = (v: string) => `"${(/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
    const csv = [columns.map(c => c.label), ...list.map(r => columns.map(c => text(r.values[c.key])))].map(r => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${data.scope}-${data.dataset}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const open = (r: ManagedRecord | "new") => { setEditing(r); setDraft(r === "new" ? Object.fromEntries(set.columns.filter(c => c.edit).map(c => [c.key, c.edit === "checkbox" ? true : c.options?.[0] ?? ""])) : { ...r.values }); };
  const save = async (id: string | null, patch: Record<string, RecordValue>) => {
    setBusy(true);
    try { const result = await saveDepartmentRecordAction(data.scope, data.dataset, id, patch); if (!result.ok) { toast.error(result.error); router.refresh(); return false; } toast.success("Saved"); router.refresh(); return true; }
    catch { toast.error("Could not save. Try again."); return false; }
    finally { setBusy(false); }
  };
  const bulk = async (list: ManagedRecord[], action: "remove" | "edit", patch?: Record<string, RecordValue>) => {
    if (!list.length || list.length > 100) return toast.error("Select between 1 and 100 records.");
    if (action === "remove" && !confirm(`${set.remove} ${list.length} record(s)?${data.dataset === "employees" ? " Linked app accounts will be kept. Employee history may be removed." : ""}${set.remove?.startsWith("Delete") ? " This cannot be undone." : ""}`)) return;
    setBusy(true);
    try {
      const result = await bulkDepartmentRecordsAction(data.scope, data.dataset, list.map(r => r.id), action, patch);
      if (!result.ok) return toast.error(result.error);
      const failed = result.data?.filter(r => !r.ok) ?? [];
      setPicked(failed.map(r => r.id));
      if (failed.length) toast.warning(`${list.length - failed.length} saved, ${failed.length} failed`, { description: failed.map(r => r.error).join("\n") });
      else toast.success(`${list.length} record(s) saved`);
      setFill(null); router.refresh();
    } catch { toast.error("Could not save. Try again."); } finally { setBusy(false); }
  };
  const editor = (c: RecordColumn, value: RecordValue, change: (v: RecordValue) => void, label: string) => c.edit === "checkbox"
    ? <Checkbox aria-label={label} checked={!!value} disabled={busy} onCheckedChange={v => change(v === true)} />
    : c.options ? <select aria-label={label} disabled={busy} value={text(value)} onChange={e => change(e.target.value)} className="h-9 rounded border bg-background px-2">{c.options.map(o => <option key={o}>{o}</option>)}</select>
    : c.edit === "textarea" ? <Textarea aria-label={label} disabled={busy} value={text(value)} onChange={e => change(e.target.value)} />
    : <Input aria-label={label} disabled={busy} type={c.edit === "date" ? "date" : "text"} value={text(value)} onChange={e => change(e.target.value)} />;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">{RECORD_SETS[data.scope].map(s => <Button key={s.key} variant={s.key === set.key ? "default" : "outline"} onClick={() => go("dataset", s.key)}>{s.label}</Button>)}</div>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-xs" aria-label="Search records" placeholder="Search records" value={query} onChange={e => setQuery(e.target.value)} />
      <Button variant={sheet ? "outline" : "default"} onClick={() => go("view", "table")}>Table</Button>
      <Button variant={sheet ? "default" : "outline"} onClick={() => go("view", "sheet")}>Sheet</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Columns</Button></DropdownMenuTrigger><DropdownMenuContent>{set.columns.map(c => <DropdownMenuItem key={c.key} disabled={!hidden.includes(c.key) && columns.length === 1} onSelect={() => setHidden(h => h.includes(c.key) ? h.filter(k => k !== c.key) : [...h, c.key])}>{hidden.includes(c.key) ? "" : "✓ "}{c.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      {data.rights.create && <Button onClick={() => open("new")}>New record</Button>}
      {data.rights.export && <Button variant="outline" onClick={() => exportRows(selected.length ? selected : rows)}>Export {selected.length ? "selected" : "filtered"}</Button>}
      <Button variant="outline" asChild><Link href={set.href}>Open {set.label.toLowerCase()} workspace</Link></Button>
      {data.configure && <Button variant="outline" onClick={() => showPermissions(v => !v)}>Configure permissions</Button>}
      {set.key === "budgets" && <Input aria-label="Budget year" type="number" className="w-28" defaultValue={data.year} onBlur={e => go("year", e.target.value)} />}
    </div>
    <p className="text-sm text-muted-foreground">{rows.length} loaded records · {selected.length} selected. Right-click a row or column for actions. Sheet edits save on Enter or blur. Approval and posting actions stay in the source workspace.</p>
    {permissions && policy && <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Data Manager permissions</h2><p className="text-sm text-muted-foreground">These checkboxes limit Data Manager access for each role or membership. Existing department and record permissions still apply. For multiple roles, any checked role grants the action. Admin retains access.</p><div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Role / membership</th>{DATA_RIGHTS.map(r => <th className="p-2 capitalize" key={r}>{r}</th>)}</tr></thead><tbody>{data.principals.map(p => <tr key={p.key} className="border-t"><td className="p-2">{p.label}</td>{DATA_RIGHTS.map(r => <td key={r} className="p-2 text-center"><Checkbox aria-label={`${p.label}: ${r}`} disabled={p.key === "observer" && r !== "view" && r !== "export"} checked={grantsFor(policy, p.key)[r]} onCheckedChange={v => setPolicy({ ...policy, grants: { ...policy.grants, [p.key]: { ...grantsFor(policy, p.key), [r]: v === true } } })} /></td>)}</tr>)}</tbody></table></div><Button disabled={busy} onClick={async () => { setBusy(true); try { const normalized = { ...policy, grants: Object.fromEntries(data.principals.map(p => [p.key, grantsFor(policy, p.key)])) }; const result = await saveDataPolicyAction(data.scope, normalized); if (!result.ok) return toast.error(result.error); toast.success("Permissions saved"); router.refresh(); } catch { toast.error("Could not save permissions."); } finally { setBusy(false); } }}>Save permissions</Button></section>}
    {!!selected.length && data.rights.bulk && <div className="flex flex-wrap items-center gap-2 rounded border p-3"><span>{selected.length} selected</span>{data.rights.edit && selected.every(r => r.edit) && <select aria-label="Bulk edit column" className="h-9 rounded border bg-background px-2" value="" onChange={e => { setFill(e.target.value); setFillValue(set.columns.find(c => c.key === e.target.value)?.edit === "checkbox" ? true : ""); }}><option value="">Set a field…</option>{set.columns.filter(c => c.edit).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>}{set.remove && <Button disabled={busy || !selected.every(r => r.remove)} variant="destructive" onClick={() => void bulk(selected, "remove")}>{set.remove} selected</Button>}<Button variant="ghost" onClick={() => setPicked([])}>Clear selection</Button></div>}
    <ContextMenu><ContextMenuTrigger asChild><div className="overflow-auto rounded-lg border" onContextMenuCapture={e => { const t = e.target as HTMLElement; setTarget({ row: t.closest<HTMLElement>("[data-record]")?.dataset.record, column: t.closest<HTMLElement>("[data-column]")?.dataset.column }); }}><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-2"><Checkbox aria-label="Select filtered rows" checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={v => setPicked(v ? rows.map(r => r.id) : [])} /></th>{columns.map(c => <th key={c.key} data-column={c.key} className="p-2 text-left whitespace-nowrap"><button onClick={() => setSort({ key: c.key, dir: sort?.key === c.key ? -sort.dir : 1 })}>{c.label}{sort?.key === c.key ? sort.dir === 1 ? " ↑" : " ↓" : ""}</button></th>)}<th className="p-2">Actions</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} data-record={r.id} className="border-t hover:bg-muted/20"><td className="p-2"><Checkbox aria-label={`Select ${r.id}`} checked={picked.includes(r.id)} onCheckedChange={() => toggle(r.id)} /></td>{columns.map(c => <td key={c.key} className="max-w-80 p-2">{sheet && c.edit && r.edit ? <SheetCell key={`${r.id}:${c.key}:${text(r.values[c.key])}`} column={c} value={r.values[c.key]} busy={busy} onSave={v => save(r.id, { [c.key]: v })} /> : <span className="block max-w-80 truncate" title={text(r.values[c.key])}>{text(r.values[c.key]) || "—"}</span>}</td>)}<td className="p-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label={`Actions for ${r.id}`}>Actions</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem asChild><Link href={r.href}>Open source record</Link></DropdownMenuItem><DropdownMenuItem disabled={!r.edit || busy} onSelect={() => open(r)}>Edit</DropdownMenuItem>{set.remove && <DropdownMenuItem disabled={!r.remove || busy} onSelect={() => void bulk([r], "remove")}>{set.remove}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-muted-foreground">No records match your search.</p>}</div></ContextMenuTrigger><ContextMenuContent>{row ? <><ContextMenuItem onSelect={() => toggle(row.id)}>Select / deselect row</ContextMenuItem><ContextMenuItem disabled={!row.edit || busy} onSelect={() => open(row)}>Edit record</ContextMenuItem><ContextMenuItem disabled={!data.rights.export} onSelect={() => void copy(columns.map(c => text(row.values[c.key])).join("\t"))}>Copy row</ContextMenuItem><ContextMenuItem asChild><Link href={row.href}>Open source record</Link></ContextMenuItem>{set.remove && <ContextMenuItem disabled={!row.remove || busy} onSelect={() => void bulk([row], "remove")}>{set.remove}</ContextMenuItem>}</> : column ? <><ContextMenuLabel>{column.label}</ContextMenuLabel><ContextMenuItem onSelect={() => setSort({ key: column.key, dir: 1 })}>Sort ascending</ContextMenuItem><ContextMenuItem onSelect={() => setSort({ key: column.key, dir: -1 })}>Sort descending</ContextMenuItem><ContextMenuItem disabled={columns.length === 1} onSelect={() => setHidden(h => [...h, column.key])}>Hide column</ContextMenuItem><ContextMenuItem disabled={!data.rights.export} onSelect={() => void copy(rows.map(r => text(r.values[column.key])).join("\n"))}>Copy column</ContextMenuItem><ContextMenuItem disabled={!column.edit || !selected.length || !data.rights.bulk || !selected.every(r => r.edit)} onSelect={() => { setFill(column.key); setFillValue(column.edit === "checkbox" ? true : ""); }}>Set for selected rows</ContextMenuItem></> : <ContextMenuItem disabled>Choose a row or column</ContextMenuItem>}</ContextMenuContent></ContextMenu>
    {editing && <Dialog open onOpenChange={v => !v && !busy && setEditing(null)}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{editing === "new" ? "New record" : "Edit record"}</DialogTitle><DialogDescription>{data.scope === "studio" ? "Changes to approved or published content may require review again. New questions use short-answer format; use the source workspace for other types." : "Changes follow the department's existing permissions and validation."}</DialogDescription></DialogHeader>{set.columns.filter(c => c.edit).map(c => <label key={c.key} className="space-y-1"><span className="text-sm">{c.label}{c.required ? " *" : ""}</span>{editor(c, draft[c.key] ?? "", v => setDraft(d => ({ ...d, [c.key]: v })), c.label)}</label>)}<DialogFooter><Button disabled={busy} onClick={async () => { const patch = Object.fromEntries(set.columns.filter(c => c.edit).map(c => [c.key, draft[c.key] ?? ""])); if (await save(editing === "new" ? null : editing.id, patch)) setEditing(null); }}>Save record</Button></DialogFooter></DialogContent></Dialog>}
    {fill && <Dialog open onOpenChange={v => !v && !busy && setFill(null)}><DialogContent><DialogHeader><DialogTitle>Set {set.columns.find(c => c.key === fill)?.label}</DialogTitle><DialogDescription>Apply to {selected.length} selected records. Each record is checked separately; failures stay selected.</DialogDescription></DialogHeader>{editor(set.columns.find(c => c.key === fill)!, fillValue, setFillValue, "Bulk value")}<DialogFooter><Button disabled={busy} onClick={() => void bulk(selected, "edit", { [fill]: fillValue })}>Apply</Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}

function SheetCell({ column, value, busy, onSave }: { column: RecordColumn; value: RecordValue; busy: boolean; onSave: (v: RecordValue) => Promise<boolean> }) {
  const [draft, setDraft] = React.useState(text(value));
  const commit = async () => { if (draft !== text(value) && !(await onSave(draft))) setDraft(text(value)); };
  if (column.edit === "checkbox") return <Checkbox aria-label={column.label} checked={!!value} disabled={busy} onCheckedChange={v => void onSave(v === true)} />;
  if (column.options) return <select aria-label={column.label} value={text(value)} disabled={busy} onChange={e => void onSave(e.target.value)} className="rounded border bg-background p-1">{column.options.map(o => <option key={o}>{o}</option>)}</select>;
  const props = { "aria-label": column.label, value: draft, disabled: busy, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value), onBlur: () => void commit(), onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") setDraft(text(value)); } };
  return column.edit === "textarea" ? <Textarea {...props} className="min-w-64" /> : <Input {...props} type={column.edit === "date" ? "date" : "text"} className="min-w-40" />;
}
