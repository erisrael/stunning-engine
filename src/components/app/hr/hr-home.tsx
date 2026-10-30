"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon, HistoryIcon, PencilIcon, PlusIcon, SearchIcon, UndoIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/primitives";
import { equipmentHistoryAction, issueEquipmentAction, returnEquipmentAction, saveEmployeeAction, saveEquipmentAction, syncEmployeesAction } from "@/app/actions/hr";
import type { EmployeeListRow, EquipmentRow, HrDue, OrgNode } from "@/server/hr";
import {
  CONDITIONS,
  CONDITION_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  type EmployeeStatus,
} from "@/lib/hr";
import { DueBadge, EmployeeStatusPill, EquipmentStatusPill, Field, daysUntil, fmtDay } from "./hr-shared";

import type { HrTab } from "@/lib/hr";
export type { HrTab };
type Dept = { key: string; label: string };
type Person = { id: string; name: string };

const ALL = "__all";

function useTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
    const q = next.toString();
    router.push(`${pathname}${q ? `?${q}` : ""}`);
  };
}

export function HrHome(props: {
  tab: HrTab;
  includeLeft: boolean;
  people: EmployeeListRow[];
  departments: Dept[];
  due: HrDue[] | null;
  org: OrgNode[] | null;
  equipment: EquipmentRow[] | null;
  // Tabs built by the page from server data (Leave, Hiring, Performance...) come in as one panel.
  panel?: React.ReactNode;
  badges: Partial<Record<HrTab, number>>;
  showCases: boolean;
}) {
  const go = useTab();
  const deptLabel = (k: string | null) => (k ? (props.departments.find((d) => d.key === k)?.label ?? k) : "-");
  return (
    <div className="space-y-4">
      <Tabs value={props.tab} onValueChange={(v) => go({ tab: v === "people" ? null : v })}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="people">People</TabsTrigger>
          {(
            [
              ["leave", "Leave"],
              ["hiring", "Hiring"],
              ["lifecycle", "Joiners and leavers"],
              ["performance", "Performance"],
              ["training", "Training"],
              ...(props.showCases ? [["cases", "Cases"]] : []),
              ["reports", "Reports"],
            ] as [HrTab, string][]
          ).map(([k, label]) => (
            <TabsTrigger key={k} value={k}>
              {label}
              {props.badges[k] ? ` (${props.badges[k]})` : ""}
            </TabsTrigger>
          ))}
          <TabsTrigger value="due">Due soon{props.due?.length ? ` (${props.due.length})` : ""}</TabsTrigger>
          <TabsTrigger value="org">Org chart</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>
      </Tabs>
      {props.tab === "people" && <People people={props.people} departments={props.departments} deptLabel={deptLabel} includeLeft={props.includeLeft} />}
      {props.panel}
      {props.tab === "due" && <DueList due={props.due ?? []} />}
      {props.tab === "org" && <OrgChart nodes={props.org ?? []} deptLabel={deptLabel} />}
      {props.tab === "equipment" && <Equipment rows={props.equipment ?? []} people={props.people.filter((p) => p.status !== "left").map((p) => ({ id: p.id, name: p.name }))} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function People({ people, departments, deptLabel, includeLeft }: { people: EmployeeListRow[]; departments: Dept[]; deptLabel: (k: string | null) => string; includeLeft: boolean }) {
  const router = useRouter();
  const go = useTab();
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);
  const [adding, setAdding] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const needle = q.trim().toLowerCase();
  const rows = people.filter(
    (p) =>
      (dept === ALL || p.department === dept) &&
      (status === ALL || p.status === status) &&
      (!needle || `${p.name} ${p.code} ${p.jobTitle ?? ""} ${p.email ?? ""} ${p.managerName ?? ""}`.toLowerCase().includes(needle)),
  );
  const sync = async () => {
    setSyncing(true);
    const r = await syncEmployeesAction();
    setSyncing(false);
    if (!r.ok) return toast.error(r.error);
    const added = (r.data as { added: number }).added;
    toast.success(added ? `Added ${added} ${added === 1 ? "record" : "records"}` : "Everyone with an account already has a record");
    router.refresh();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code, job or email" className="pl-8" aria-label="Search people" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-44" aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {EMPLOYEE_STATUSES.filter((s) => s !== "left" || includeLeft).map((s) => (
              <SelectItem key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeLeft} onCheckedChange={(v) => go({ left: v === true ? "1" : null })} /> Show people who left
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={syncing} onClick={sync} title="Create a record for every active account that has none">
            <UsersIcon /> Add everyone with an account
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlusIcon /> Add employee
          </Button>
        </div>
      </div>
      {!people.length ? (
        <EmptyState title="No employee records yet" description="Press Add everyone with an account to start from the people who already use the app, or add someone by hand." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Line manager</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Needs attention</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const flags = [
                  p.docsDue ? `${p.docsDue} ${p.docsDue === 1 ? "document" : "documents"} expiring` : null,
                  p.contractEnd && daysUntil(p.contractEnd) <= 30 ? `Contract ends ${fmtDay(p.contractEnd)}` : null,
                  p.probationEnd && p.status === "probation" && daysUntil(p.probationEnd) <= 14 ? `Probation ends ${fmtDay(p.probationEnd)}` : null,
                  !p.userId ? "No app account" : null,
                ].filter(Boolean);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/hr/people/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">{p.code}</div>
                    </TableCell>
                    <TableCell>{p.jobTitle ?? "-"}</TableCell>
                    <TableCell>{deptLabel(p.department)}</TableCell>
                    <TableCell>{p.managerName ?? "-"}</TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABELS[p.employmentType]}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDay(p.startDate)}</TableCell>
                    <TableCell>
                      <EmployeeStatusPill status={p.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{flags.join(" · ") || "-"}</TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    Nobody matches these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <AddEmployee open={adding} onOpenChange={setAdding} departments={departments} people={people.filter((p) => p.status !== "left")} />
    </div>
  );
}

function AddEmployee({ open, onOpenChange, departments, people }: { open: boolean; onOpenChange: (o: boolean) => void; departments: Dept[]; people: EmployeeListRow[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ fullName: "", email: "", jobTitle: "", department: "", managerId: "", employmentType: "full_time", status: "probation", startDate: "", probationEnd: "" });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const r = await saveEmployeeAction({ ...f, department: f.department || null, managerId: f.managerId || null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    onOpenChange(false);
    toast.success(`${f.fullName} added`);
    router.push(`/hr/people/${r.data}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>The essentials now; fill in the rest on their record.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2">
            <Input value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>
          <Field label="Job title">
            <Input value={f.jobTitle} onChange={(e) => set("jobTitle")(e.target.value)} />
          </Field>
          <Field label="Department">
            <SimpleSelect value={f.department} onChange={set("department")} options={departments.map((d) => ({ value: d.key, label: d.label }))} placeholder="Choose" />
          </Field>
          <Field label="Line manager">
            <SimpleSelect value={f.managerId} onChange={set("managerId")} options={people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Nobody" />
          </Field>
          <Field label="Employment type">
            <SimpleSelect value={f.employmentType} onChange={set("employmentType")} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Status">
            <SimpleSelect value={f.status} onChange={set("status")} options={(["probation", "active"] as EmployeeStatus[]).map((s) => ({ value: s, label: EMPLOYEE_STATUS_LABELS[s] }))} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} />
          </Field>
          <Field label="Probation ends">
            <Input type="date" value={f.probationEnd} onChange={(e) => set("probationEnd")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !f.fullName.trim()} onClick={save}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A select where an empty value means "none".
export function SimpleSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  const NONE = "__none";
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {placeholder !== undefined && <SelectItem value={NONE}>{placeholder}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Due soon
// ---------------------------------------------------------------------------

const DUE_KIND: Record<HrDue["kind"], string> = { document: "Document", contract: "Contract", probation: "Probation" };

function DueList({ due }: { due: HrDue[] }) {
  if (!due.length) return <EmptyState title="Nothing due in the next 60 days" description="Documents expiring, contracts ending and probation ending will show here. HR is also reminded by notification." />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Person</TableHead>
            <TableHead>What</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {due.map((d, i) => (
            <TableRow key={`${d.kind}-${d.employeeId}-${i}`}>
              <TableCell>
                <DueBadge date={d.date} />
              </TableCell>
              <TableCell>
                <Link href={`/hr/people/${d.employeeId}`} className="font-medium hover:underline">
                  {d.employeeName}
                </Link>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground">{DUE_KIND[d.kind]}:</span> {d.label}
              </TableCell>
              <TableCell className="whitespace-nowrap">{fmtDay(d.date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

function OrgChart({ nodes, deptLabel }: { nodes: OrgNode[]; deptLabel: (k: string | null) => string }) {
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string, OrgNode[]>();
  for (const n of nodes) if (n.managerId && ids.has(n.managerId)) children.set(n.managerId, [...(children.get(n.managerId) ?? []), n]);
  // People without a (current) line manager are the top of the chart; those without reports or a manager are listed apart.
  const roots = nodes.filter((n) => !n.managerId || !ids.has(n.managerId));
  const tops = roots.filter((n) => children.has(n.id));
  const loose = roots.filter((n) => !children.has(n.id));
  if (!nodes.length) return <EmptyState title="No one to show yet" description="Add employee records and set each person's line manager." />;
  return (
    <div className="space-y-4">
      {tops.length > 0 ? (
        <div className="space-y-2">
          {tops.map((n) => (
            <OrgBranch key={n.id} node={n} childMap={children} deptLabel={deptLabel} depth={0} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No reporting lines yet. Set line managers on people&apos;s records to build the chart.</p>
      )}
      {loose.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">No line manager set ({loose.length})</h3>
          <div className="flex flex-wrap gap-2">
            {loose.map((n) => (
              <OrgCard key={n.id} node={n} deptLabel={deptLabel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrgCard({ node, deptLabel, count }: { node: OrgNode; deptLabel: (k: string | null) => string; count?: number }) {
  return (
    <Link href={`/hr/people/${node.id}`} className="inline-flex min-w-48 flex-col rounded-lg border bg-card px-3 py-2 hover:border-primary">
      <span className="text-sm font-medium">{node.name}</span>
      <span className="text-xs text-muted-foreground">
        {node.jobTitle ?? "No job title"} · {deptLabel(node.department)}
        {count ? ` · ${count} ${count === 1 ? "report" : "reports"}` : ""}
      </span>
    </Link>
  );
}

function OrgBranch({ node, childMap, deptLabel, depth }: { node: OrgNode; childMap: Map<string, OrgNode[]>; deptLabel: (k: string | null) => string; depth: number }) {
  const kids = childMap.get(node.id) ?? [];
  const [open, setOpen] = React.useState(depth < 2);
  return (
    <div>
      <div className="flex items-center gap-1">
        {kids.length ? (
          <Button size="icon-xs" variant="ghost" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)}>
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Button>
        ) : (
          <span className="w-6" />
        )}
        <OrgCard node={node} deptLabel={deptLabel} count={kids.length} />
      </div>
      {open && kids.length > 0 && (
        <div className="mt-2 ml-3 space-y-2 border-l pl-5">
          {kids.map((k) => (
            <OrgBranch key={k.id} node={k} childMap={childMap} deptLabel={deptLabel} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

type EqDialog = { kind: "edit"; row: EquipmentRow | null } | { kind: "issue"; row: EquipmentRow } | { kind: "return"; row: EquipmentRow } | { kind: "history"; row: EquipmentRow } | null;

function Equipment({ rows, people }: { rows: EquipmentRow[]; people: Person[] }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [dialog, setDialog] = React.useState<EqDialog>(null);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (status === ALL || r.status === status) && (!needle || `${r.tag} ${r.name} ${r.serial ?? ""} ${r.holderName ?? ""}`.toLowerCase().includes(needle)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tag, name, serial or holder" className="pl-8" aria-label="Search equipment" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {EQUIPMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {EQUIPMENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto" onClick={() => setDialog({ kind: "edit", row: null })}>
          <PlusIcon /> Add equipment
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState title="No equipment registered" description="Add cameras, microphones, laptops and anything else people take home or sign out." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Held by</TableHead>
                <TableHead>Due back</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.tag}</TableCell>
                  <TableCell>
                    {r.name}
                    {r.serial && <div className="text-[11px] text-muted-foreground">S/N {r.serial}</div>}
                  </TableCell>
                  <TableCell>{EQUIPMENT_CATEGORY_LABELS[r.category]}</TableCell>
                  <TableCell>{CONDITION_LABELS[r.condition]}</TableCell>
                  <TableCell>
                    <EquipmentStatusPill status={r.status} />
                  </TableCell>
                  <TableCell>
                    {r.holderId ? (
                      <Link href={`/hr/people/${r.holderId}`} className="hover:underline">
                        {r.holderName}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{r.dueBack ? <DueBadge date={r.dueBack} /> : "-"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {r.status === "available" && (
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "issue", row: r })}>
                        Issue
                      </Button>
                    )}
                    {r.status === "issued" && (
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "return", row: r })}>
                        <UndoIcon /> Take back
                      </Button>
                    )}
                    <Button size="icon-xs" variant="ghost" aria-label={`Edit ${r.tag}`} onClick={() => setDialog({ kind: "edit", row: r })}>
                      <PencilIcon />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`History of ${r.tag}`} onClick={() => setDialog({ kind: "history", row: r })}>
                      <HistoryIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    Nothing matches these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {dialog?.kind === "edit" && <EquipmentForm row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "issue" && <IssueForm row={dialog.row} people={people} onClose={() => setDialog(null)} />}
      {dialog?.kind === "return" && <ReturnForm row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "history" && <History row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

function useSave(onClose: () => void) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return {
    busy,
    run: async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
      setBusy(true);
      const r = await fn();
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success(done);
      onClose();
      router.refresh();
    },
  };
}

function EquipmentForm({ row, onClose }: { row: EquipmentRow | null; onClose: () => void }) {
  const [f, setF] = React.useState({
    tag: row?.tag ?? "",
    name: row?.name ?? "",
    category: row?.category ?? "camera",
    serial: row?.serial ?? "",
    condition: row?.condition ?? "good",
    status: row?.status ?? "available",
    purchasedAt: row?.purchasedAt ?? "",
    notes: row?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const s = useSave(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.tag}` : "Add equipment"}</DialogTitle>
          <DialogDescription>Use the tag written on the item, so anyone can find it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Asset tag">
            <Input value={f.tag} onChange={(e) => set("tag")(e.target.value)} placeholder="CAM-01" />
          </Field>
          <Field label="Name">
            <Input value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder="Sony FX3" />
          </Field>
          <Field label="Category">
            <SimpleSelect value={f.category} onChange={set("category")} options={EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: EQUIPMENT_CATEGORY_LABELS[c] }))} />
          </Field>
          <Field label="Serial number">
            <Input value={f.serial} onChange={(e) => set("serial")(e.target.value)} />
          </Field>
          <Field label="Condition">
            <SimpleSelect value={f.condition} onChange={set("condition")} options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))} />
          </Field>
          <Field label="Status" hint={row?.status === "issued" ? "Take it back before changing its status." : undefined}>
            <SimpleSelect
              value={f.status}
              onChange={set("status")}
              options={EQUIPMENT_STATUSES.filter((x) => x !== "issued" || row?.status === "issued").map((x) => ({ value: x, label: EQUIPMENT_STATUS_LABELS[x] }))}
            />
          </Field>
          <Field label="Bought on">
            <Input type="date" value={f.purchasedAt} onChange={(e) => set("purchasedAt")(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={s.busy || !f.tag.trim() || !f.name.trim()} onClick={() => s.run(() => saveEquipmentAction({ ...f, id: row?.id }), row ? "Saved" : "Added")}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueForm({ row, people, onClose }: { row: EquipmentRow; people: Person[]; onClose: () => void }) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [dueBack, setDueBack] = React.useState("");
  const [note, setNote] = React.useState("");
  const s = useSave(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Issue {row.name} ({row.tag})
          </DialogTitle>
          <DialogDescription>The person is told, and it shows on their record until it is taken back.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Issue to">
            <SimpleSelect value={employeeId} onChange={setEmployeeId} options={people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Choose a person" />
          </Field>
          <Field label="Return by" hint="Leave empty if they keep it.">
            <Input type="date" value={dueBack} onChange={(e) => setDueBack(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="With charger and bag" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={s.busy || !employeeId} onClick={() => s.run(() => issueEquipmentAction(row.id, { employeeId, dueBack: dueBack || null, note }), "Issued")}>
            Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnForm({ row, onClose }: { row: EquipmentRow; onClose: () => void }) {
  const [condition, setCondition] = React.useState<string>(row.condition);
  const [note, setNote] = React.useState("");
  const s = useSave(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Take back {row.tag} from {row.holderName}
          </DialogTitle>
          <DialogDescription>Damaged items go to In repair.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Condition now">
            <SimpleSelect value={condition} onChange={setCondition} options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={s.busy} onClick={() => s.run(() => returnEquipmentAction(row.id, { condition, note }), "Taken back")}>
            Take back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_LABEL: Record<string, string> = { added: "Added", updated: "Updated", issued: "Issued", returned: "Taken back" };

function History({ row, onClose }: { row: EquipmentRow; onClose: () => void }) {
  const [items, setItems] = React.useState<{ id: string; action: string; employee: string | null; condition: string | null; note: string | null; actor: string | null; at: string }[] | null>(null);
  React.useEffect(() => {
    void equipmentHistoryAction(row.id).then((r) => (r.ok ? setItems(r.data as never) : toast.error(r.error)));
  }, [row.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row.tag}: {row.name}
          </DialogTitle>
          <DialogDescription>Everything that happened to it, newest first.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 space-y-2 overflow-auto text-sm">
          {items === null && <li className="text-muted-foreground">Loading…</li>}
          {items?.map((h) => (
            <li key={h.id} className="rounded-md border px-3 py-2">
              <div className="font-medium">
                {ACTION_LABEL[h.action] ?? h.action}
                {h.employee ? ` ${h.action === "returned" ? "from" : "to"} ${h.employee}` : ""}
                {h.condition ? ` · ${CONDITION_LABELS[h.condition as keyof typeof CONDITION_LABELS] ?? h.condition}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(h.at).toLocaleString()} {h.actor ? `by ${h.actor}` : ""}
                {h.note ? ` · ${h.note}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
