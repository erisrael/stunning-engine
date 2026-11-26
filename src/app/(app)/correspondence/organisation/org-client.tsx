"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiSelect } from "@/components/app/multi-select";
import {
  assignAction, createDelegationAction, endAssignmentAction, grantAuthorityAction, loadDefaultHierarchyAction, revokeAuthorityAction, revokeDelegationAction, savePositionAction, saveUnitAction,
} from "@/app/actions/correspondence";
import type { governanceSummary, DEFAULT_POSITIONS } from "@/server/corr/org";
import { cn } from "@/lib/utils";

type G = Awaited<ReturnType<typeof governanceSummary>>;
type Pos = G["chart"]["positions"][number];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

export function OrgClient({ g, categories, people, canEdit, actions, levels, unitKinds, defaults }: { g: G; categories: { id: string; name: string }[]; people: { id: string; name: string }[]; canEdit: boolean; actions: { key: string; label: string }[]; levels: { key: string; label: string }[]; unitKinds: string[]; defaults: typeof DEFAULT_POSITIONS }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [closed, setClosed] = React.useState<Set<string>>(new Set());
  const [pos, setPos] = React.useState<Partial<Pos> | null>(null);
  const [unit, setUnit] = React.useState<Partial<G["chart"]["units"][number]> | null>(null);
  const [assignTo, setAssignTo] = React.useState<Pos | null>(null);
  const { positions, assignments, units } = g.chart;
  const holders = (id: string) => assignments.filter((a) => a.positionId === id && a.current);
  const title = (id: string | null) => positions.find((p) => p.id === id)?.title ?? "";
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    const r = await fn();
    if (!r.ok) return toast.error(r.error);
    toast.success(ok);
    router.refresh();
  };
  const match = (p: Pos) => !q || `${p.title} ${holders(p.id).map((h) => h.userName).join(" ")}`.toLowerCase().includes(q.toLowerCase());
  const children = (id: string | null) => positions.filter((p) => p.current && (p.reportsTo ?? null) === id);
  const visible = (p: Pos): boolean => match(p) || children(p.id).some(visible);

  const Node = ({ p, depth }: { p: Pos; depth: number }) => {
    if (!visible(p)) return null;
    const kids = children(p.id);
    const open = !closed.has(p.id) || !!q;
    const hs = holders(p.id);
    return (
      <li>
        <div className={cn("flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm", !hs.length && "border-dashed")} style={{ marginLeft: depth * 18 }}>
          {kids.length ? (
            <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="rounded p-0.5 hover:bg-muted">
              {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className="font-medium">{p.title}</span>
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{levels.find((l) => l.key === p.level)?.label}</span>
          <span className="text-xs text-muted-foreground">{units.find((u) => u.id === p.unitId)?.name}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1 text-xs">
            {hs.map((h) => (
              <span key={h.id} className={cn("rounded px-1.5 py-0.5", h.kind === "acting" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-primary/10")}>
                {h.kind === "acting" ? "Acting: " : ""}
                {h.userName}
                {h.endAt ? ` (to ${day(h.endAt)})` : ""}
                {canEdit && (
                  <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" aria-label={`End ${h.userName}'s assignment`} onClick={() => confirm(`End ${h.userName} in ${p.title} today? The history keeps it.`) && run(() => endAssignmentAction(h.id), "Ended")}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {!hs.length && <span className="text-destructive">Vacant</span>}
            {canEdit && (
              <>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setAssignTo(p)}>
                  <UserPlusIcon className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPos(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPos({ title: "", level: "operational", reportsTo: p.id, unitId: p.unitId, dottedTo: [] })}>
                  + Under
                </Button>
              </>
            )}
          </span>
        </div>
        {open && kids.length > 0 && (
          <ul className="mt-1 space-y-1">
            {kids.map((k) => (
              <Node key={k.id} p={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <Tabs defaultValue="chart">
      <TabsList className="flex-wrap">
        <TabsTrigger value="chart">Organisation chart</TabsTrigger>
        <TabsTrigger value="authority">Authority matrix ({g.authorities.length})</TabsTrigger>
        <TabsTrigger value="delegations">Delegations ({g.activeDelegations.length} in force)</TabsTrigger>
        <TabsTrigger value="governance">Governance</TabsTrigger>
      </TabsList>

      <TabsContent value="chart" className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person or position" className="h-8 w-64 pl-7" aria-label="Search the chart" />
          </div>
          <span className="text-xs text-muted-foreground">
            {positions.filter((p) => p.current).length} positions · {g.vacant.length} vacant · {g.acting.length} acting
          </span>
          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              {!positions.length && (
                <Button size="sm" onClick={() => run(() => loadDefaultHierarchyAction(), "Default hierarchy loaded")}>
                  Load the default hierarchy
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setUnit({ name: "", kind: "department", parentId: null })}>
                <PlusIcon /> Unit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPos({ title: "", level: "operational", reportsTo: null, unitId: null, dottedTo: [] })}>
                <PlusIcon /> Position
              </Button>
            </div>
          )}
        </div>
        {positions.length ? (
          <ul className="space-y-1">
            {children(null).map((p) => (
              <Node key={p.id} p={p} depth={0} />
            ))}
          </ul>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No positions yet. Load the default hierarchy (a board, the executive team and governance roles) and change it as you need, or add your own.</CardContent>
          </Card>
        )}
        {units.length > 0 && (
          <div className="flex flex-wrap gap-1 text-xs">
            <span className="text-muted-foreground">Units:</span>
            {units.map((u) => (
              <button key={u.id} type="button" disabled={!canEdit} onClick={() => setUnit(u)} className={cn("rounded border px-1.5 py-0.5 hover:bg-muted", !u.current && "line-through opacity-60")}>
                {u.name} <span className="text-muted-foreground">({u.kind})</span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="authority" className="mt-3">
        <AuthorityTab g={g} categories={categories} people={people} positions={positions} canEdit={canEdit} actions={actions} levels={levels} run={run} />
      </TabsContent>

      <TabsContent value="delegations" className="mt-3">
        <DelegationsTab g={g} categories={categories} people={people} positions={positions} canEdit={canEdit} actions={actions} run={run} />
      </TabsContent>

      <TabsContent value="governance" className="mt-3 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Acting appointments in force</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {g.acting.map((a) => <p key={a.id}><b>{a.userName}</b> acting as {title(a.positionId)} until {day(a.endAt)} · {a.authorizationRef}</p>)}
            {!g.acting.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Vacant positions</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {g.vacant.map((p) => <p key={p.id}>{p.title}</p>)}
            {!g.vacant.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ended or revoked delegations</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {g.endedDelegations.map((d) => <p key={d.id}>{d.fromName} → {d.toName}: {d.actions.join(", ")} · {day(d.startAt)}–{day(d.endAt)}{d.revokedAt ? ` · revoked ${day(d.revokedAt)}` : " · expired"}</p>)}
            {!g.endedDelegations.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
      </TabsContent>

      {pos && (
        <Dialog open onOpenChange={(o) => !o && setPos(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{pos.id ? pos.title : "New position"}</DialogTitle>
              <DialogDescription>Changes keep the date they were made; letters already signed keep the titles they had.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-medium">Title</span>
                <Input list="default-positions" value={pos.title ?? ""} onChange={(e) => setPos({ ...pos, title: e.target.value })} />
                <datalist id="default-positions">{Object.values(defaults).flat().map((t) => <option key={t} value={t} />)}</datalist>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Level</span>
                <select className={sel} value={pos.level} onChange={(e) => setPos({ ...pos, level: e.target.value as Pos["level"] })}>{levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Unit</span>
                <select className={sel} value={pos.unitId ?? ""} onChange={(e) => setPos({ ...pos, unitId: e.target.value || null })}><option value="">None</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Reports to</span>
                <select className={sel} value={pos.reportsTo ?? ""} onChange={(e) => setPos({ ...pos, reportsTo: e.target.value || null })}><option value="">Nobody (top)</option>{positions.filter((p) => p.id !== pos.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
              </label>
              <MultiSelect label="Also reports to (dotted line)" options={positions.filter((p) => p.id !== pos.id).map((p) => ({ value: p.id, label: p.title }))} value={pos.dottedTo ?? []} onChange={(v) => setPos({ ...pos, dottedTo: v })} placeholder="Dotted-line reports" />
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs"><span className="font-medium">From</span><Input type="date" value={pos.effectiveFrom?.slice(0, 10) ?? ""} onChange={(e) => setPos({ ...pos, effectiveFrom: e.target.value || null })} /></label>
                <label className="space-y-1 text-xs"><span className="font-medium">Until (temporary)</span><Input type="date" value={pos.effectiveTo?.slice(0, 10) ?? ""} onChange={(e) => setPos({ ...pos, effectiveTo: e.target.value || null })} /></label>
              </div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={pos.active !== false} onChange={(e) => setPos({ ...pos, active: e.target.checked })} /> In use</label>
            </div>
            <DialogFooter>
              <Button onClick={() => run(() => savePositionAction(pos as Pos), "Position saved").then(() => setPos(null))}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {unit && (
        <Dialog open onOpenChange={(o) => !o && setUnit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{unit.id ? unit.name : "New unit"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <label className="space-y-1 text-xs"><span className="font-medium">Name</span><Input value={unit.name ?? ""} onChange={(e) => setUnit({ ...unit, name: e.target.value })} /></label>
              <label className="space-y-1 text-xs"><span className="font-medium">Kind</span><select className={sel} value={unit.kind} onChange={(e) => setUnit({ ...unit, kind: e.target.value as never })}>{unitKinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
              <label className="space-y-1 text-xs"><span className="font-medium">Part of</span><select className={sel} value={unit.parentId ?? ""} onChange={(e) => setUnit({ ...unit, parentId: e.target.value || null })}><option value="">Top level</option>{units.filter((u) => u.id !== unit.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
              <label className="space-y-1 text-xs"><span className="font-medium">Code</span><Input value={unit.code ?? ""} onChange={(e) => setUnit({ ...unit, code: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs"><span className="font-medium">From</span><Input type="date" value={unit.effectiveFrom?.slice(0, 10) ?? ""} onChange={(e) => setUnit({ ...unit, effectiveFrom: e.target.value || null })} /></label>
                <label className="space-y-1 text-xs"><span className="font-medium">Until</span><Input type="date" value={unit.effectiveTo?.slice(0, 10) ?? ""} onChange={(e) => setUnit({ ...unit, effectiveTo: e.target.value || null })} /></label>
              </div>
            </div>
            <DialogFooter><Button onClick={() => run(() => saveUnitAction(unit as never), "Unit saved").then(() => setUnit(null))}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {assignTo && <AssignDialog p={assignTo} people={people} onClose={() => setAssignTo(null)} run={run} />}
    </Tabs>
  );
}

function AssignDialog({ p, people, onClose, run }: { p: Pos; people: { id: string; name: string }[]; onClose: () => void; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => Promise<unknown> }) {
  const [f, setF] = React.useState({ userId: "", kind: "substantive" as "substantive" | "acting", startAt: new Date().toISOString().slice(0, 10), endAt: "", authorizationRef: "", approvedBy: "" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put someone in {p.title}</DialogTitle>
          <DialogDescription>A person may hold several positions. An acting appointment needs an end date and the document that authorises it; it stops giving authority when it ends.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-1 text-xs"><span className="font-medium">Person</span><select className={sel} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="space-y-1 text-xs"><span className="font-medium">As</span><select className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}><option value="substantive">Holder</option><option value="acting">Acting (temporary)</option></select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs"><span className="font-medium">From</span><Input type="date" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></label>
            <label className="space-y-1 text-xs"><span className="font-medium">Until</span><Input type="date" value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} /></label>
          </div>
          {f.kind === "acting" && (
            <>
              <label className="space-y-1 text-xs"><span className="font-medium">Authorising document</span><Input value={f.authorizationRef} onChange={(e) => setF({ ...f, authorizationRef: e.target.value })} placeholder="e.g. Board resolution 12/2026" /></label>
              <label className="space-y-1 text-xs"><span className="font-medium">Approved by</span><Input value={f.approvedBy} onChange={(e) => setF({ ...f, approvedBy: e.target.value })} /></label>
            </>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!f.userId} onClick={() => run(() => assignAction({ positionId: p.id, userId: f.userId, kind: f.kind, startAt: f.startAt ? new Date(`${f.startAt}T00:00:00`).toISOString() : null, endAt: f.endAt ? new Date(`${f.endAt}T23:59:59`).toISOString() : null, authorizationRef: f.authorizationRef, approvedBy: f.approvedBy }), "Assigned").then(onClose)}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthorityTab({ g, categories, people, positions, canEdit, actions, levels, run }: { g: G; categories: { id: string; name: string }[]; people: { id: string; name: string }[]; positions: Pos[]; canEdit: boolean; actions: { key: string; label: string }[]; levels: { key: string; label: string }[]; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => Promise<unknown> }) {
  const [f, setF] = React.useState({ subjectKind: "position", subjectId: "", action: "sign", categoryId: "", department: "", maxClassification: "restricted", maxValue: "", note: "" });
  const who = (k: string, id: string) => (k === "position" ? positions.find((p) => p.id === id)?.title : k === "level" ? levels.find((l) => l.key === id)?.label : people.find((p) => p.id === id)?.name) ?? id;
  const subjects = f.subjectKind === "position" ? positions.map((p) => ({ v: p.id, l: p.title })) : f.subjectKind === "level" ? levels.map((l) => ({ v: l.key, l: l.label })) : people.map((p) => ({ v: p.id, l: p.name }));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
              <tr><th className="px-3 py-2">Who</th><th className="px-3 py-2">May</th><th className="px-3 py-2">For</th><th className="px-3 py-2">Up to</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {g.authorities.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-1.5">{who(a.subjectKind, a.subjectId)} <span className="text-muted-foreground">({a.subjectKind})</span></td>
                  <td className="px-3 py-1.5">{actions.find((x) => x.key === a.action)?.label}</td>
                  <td className="px-3 py-1.5">{[a.categoryId ? categories.find((c) => c.id === a.categoryId)?.name : "Every category", a.department].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-1.5">{[a.maxClassification !== "restricted" ? `${a.maxClassification} letters` : null, a.maxValue != null ? `${a.maxValue.toLocaleString()} ETB` : null].filter(Boolean).join(", ") || "No limit"}</td>
                  <td className="px-3 py-1.5 text-right">{canEdit && <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => run(() => revokeAuthorityAction(a.id), "Removed")}>Remove</Button>}</td>
                </tr>
              ))}
              {!g.authorities.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No authorities set. Until some are, workflows decide who acts (by position, person or role).</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {canEdit && (
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Give an authority</CardTitle><CardDescription className="text-xs">Once an action has authorities, only people holding one may do it, in that capacity.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <select className={sel} value={f.subjectKind} onChange={(e) => setF({ ...f, subjectKind: e.target.value, subjectId: "" })} aria-label="Who kind"><option value="position">A position</option><option value="level">A whole level</option><option value="user">A person</option></select>
            <select className={sel} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })} aria-label="Who"><option value="">Choose</option>{subjects.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
            <select className={sel} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} aria-label="May">{actions.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
            <select className={sel} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} aria-label="Category"><option value="">Every category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Only this department (optional)" />
            <select className={sel} value={f.maxClassification} onChange={(e) => setF({ ...f, maxClassification: e.target.value })} aria-label="Up to classification">{["public", "internal", "confidential", "restricted"].map((x) => <option key={x} value={x}>Up to {x}</option>)}</select>
            <Input type="number" min={0} value={f.maxValue} onChange={(e) => setF({ ...f, maxValue: e.target.value })} placeholder="Up to this amount, ETB (optional)" />
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (e.g. Board resolution)" />
            <Button className="w-full" disabled={!f.subjectId} onClick={() => run(() => grantAuthorityAction({ subjectKind: f.subjectKind as never, subjectId: f.subjectId, action: f.action as never, categoryId: f.categoryId || null, department: f.department || null, maxClassification: f.maxClassification, maxValue: f.maxValue === "" ? null : Number(f.maxValue), note: f.note || null }), "Authority given")}>
              Give
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DelegationsTab({ g, categories, people, positions, canEdit, actions, run }: { g: G; categories: { id: string; name: string }[]; people: { id: string; name: string }[]; positions: Pos[]; canEdit: boolean; actions: { key: string; label: string }[]; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => Promise<unknown> }) {
  const [f, setF] = React.useState({ fromUser: "", fromPosition: "", toUser: "", actions: [] as string[], categories: [] as string[], maxValue: "", includesSigning: false, canSubdelegate: false, conditions: "", startAt: new Date().toISOString().slice(0, 10), endAt: "", authorizationRef: "" });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-2">
        {g.activeDelegations.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-start gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p><b>{d.fromName}</b>{d.fromPositionTitle ? ` (${d.fromPositionTitle})` : ""} → <b>{d.toName}</b></p>
                <p className="text-xs text-muted-foreground">
                  {d.actions.map((a) => actions.find((x) => x.key === a)?.label ?? a).join(", ")}
                  {d.includesSigning ? " · includes signing" : ""}
                  {d.canSubdelegate ? " · may pass on" : ""}
                  {d.categories.length ? ` · only ${d.categories.map((c) => categories.find((x) => x.id === c)?.name ?? c).join(", ")}` : ""}
                  {d.maxValue != null ? ` · up to ${d.maxValue.toLocaleString()} ETB` : ""} · {day(d.startAt)} to {day(d.endAt)}
                  {d.authorizationRef ? ` · ${d.authorizationRef}` : ""}
                </p>
                {d.conditions && <p className="text-xs">Conditions: {d.conditions}</p>}
              </div>
              {canEdit && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("Revoke this delegation now? Anything passed on from it ends too.") && run(() => revokeDelegationAction(d.id), "Revoked")}>Revoke</Button>}
            </CardContent>
          </Card>
        ))}
        {!g.activeDelegations.length && <p className="py-8 text-center text-sm text-muted-foreground">No delegations in force.</p>}
      </div>
      {canEdit && (
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">New delegation</CardTitle><CardDescription className="text-xs">The delegator must hold each authority themselves. A letter signed under it says so.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <select className={sel} value={f.fromUser} onChange={(e) => setF({ ...f, fromUser: e.target.value })} aria-label="From"><option value="">Delegating person</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select className={sel} value={f.fromPosition} onChange={(e) => setF({ ...f, fromPosition: e.target.value })} aria-label="In the capacity of"><option value="">In the capacity of (position)</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <select className={sel} value={f.toUser} onChange={(e) => setF({ ...f, toUser: e.target.value })} aria-label="To"><option value="">Delegate</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <MultiSelect label="What" options={actions.map((a) => ({ value: a.key, label: a.label }))} value={f.actions} onChange={(v) => setF({ ...f, actions: v })} placeholder="Authorities delegated" />
            <MultiSelect label="Only these categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={f.categories} onChange={(v) => setF({ ...f, categories: v })} placeholder="Every category" />
            <Input type="number" min={0} value={f.maxValue} onChange={(e) => setF({ ...f, maxValue: e.target.value })} placeholder="Up to this amount, ETB (optional)" />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs"><span className="font-medium">From</span><Input type="date" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></label>
              <label className="space-y-1 text-xs"><span className="font-medium">Until</span><Input type="date" value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} /></label>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.includesSigning} onChange={(e) => setF({ ...f, includesSigning: e.target.checked })} /> Includes signing</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.canSubdelegate} onChange={(e) => setF({ ...f, canSubdelegate: e.target.checked })} /> May be passed on</label>
            <Input value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="Conditions (optional)" />
            <Input value={f.authorizationRef} onChange={(e) => setF({ ...f, authorizationRef: e.target.value })} placeholder="Authorising document" />
            <Button className="w-full" disabled={!f.fromUser || !f.toUser || !f.actions.length || !f.endAt} onClick={() => run(() => createDelegationAction({ fromUser: f.fromUser, fromPosition: f.fromPosition || null, toUser: f.toUser, actions: f.actions as never, categories: f.categories, maxValue: f.maxValue === "" ? null : Number(f.maxValue), includesSigning: f.includesSigning, canSubdelegate: f.canSubdelegate, conditions: f.conditions, startAt: new Date(`${f.startAt}T00:00:00`).toISOString(), endAt: new Date(`${f.endAt}T23:59:59`).toISOString(), authorizationRef: f.authorizationRef }), "Delegation created")}>
              Create
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
