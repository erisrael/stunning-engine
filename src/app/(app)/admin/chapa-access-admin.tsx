"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheckIcon, UndoIcon, UserXIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusStrip } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import * as A from "@/app/actions/chapa-hub";
import type { ChapaAction } from "@/lib/chapa";

type Overview = Awaited<ReturnType<typeof import("@/server/chapa-access").chapaAccessOverview>>;

// Admin, Chapa access: which people see Chapa, on which businesses, and what they may do there.
export function ChapaAccessAdmin() {
  const [o, setO] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState("");
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "granted" | "role" | "none">("all");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [granting, setGranting] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await A.chapaAccessOverviewAction();
    if (r.ok && r.data) (setO(r.data), setError(""));
    else setError(r.ok ? "" : r.error);
  }, []);
  React.useEffect(() => void load(), [load]);
  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!o) return <StatusStrip>Loading Chapa access…</StatusStrip>;
  const label = (a: string) => o.actions.find((x) => x.key === a)?.label ?? a;
  const effective = (p: Overview["people"][number]): ChapaAction[] =>
    p.admin ? (["view", ...(p.grant?.actions ?? [])] as ChapaAction[]) : p.grant ? (p.grant.revoked ? [] : [...new Set([...p.grant.actions, ...(p.grant.alsoRole ? p.byRole : [])])]) : p.byRole;
  const rows = o.people
    .filter((p) => !q || `${p.name} ${p.email} ${p.roles.join(" ")}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => (only === "granted" ? !!p.grant && !p.grant.revoked : only === "role" ? !p.grant && p.byRole.length > 0 : only === "none" ? effective(p).length === 0 : true));
  const ids = [...picked];
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    const r = await fn();
    if (!r.ok) return void toast.error(r.error);
    toast.success(done);
    setPicked(new Set());
    load();
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheckIcon className="size-5 text-emerald-600" /> Chapa: user access</h2>
        <p className="text-sm text-muted-foreground">
          Give named people Chapa without changing their role: which businesses, and what they may do. Money actions (refunds, withdrawals, swaps) also need the action switched on for the business in Chapa, Settings; limits and the second approver keep applying.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="People with Chapa" value={`${o.people.filter((p) => effective(p).includes("view")).length} of ${o.people.length}`} />
        <MetricCard label="Given by Admin" value={o.people.filter((p) => p.grant && !p.grant.revoked).length} />
        <MetricCard label="Through their role" value={o.people.filter((p) => !p.grant && p.byRole.length).length} />
        <MetricCard label="Businesses" value={o.businesses.length} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search people, emails, roles" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64" />
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Show">
          <option value="all">Everyone</option>
          <option value="granted">Given by Admin</option>
          <option value="role">Through their role</option>
          <option value="none">No Chapa</option>
        </select>
        <span className="ml-auto text-sm text-muted-foreground">{ids.length} chosen</span>
        <Button size="sm" disabled={!ids.length} onClick={() => setGranting(true)}><WalletIcon /> Give access</Button>
        <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => act(() => A.resetChapaAccessAction(ids), "Back to their role")}><UndoIcon /> Back to role</Button>
        <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => act(() => A.revokeChapaAccessAction(ids), "Chapa removed")}><UserXIcon /> Remove</Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2"><Checkbox aria-label="Choose all shown" checked={rows.length > 0 && rows.every((p) => picked.has(p.id))} onCheckedChange={(v) => setPicked(v === true ? new Set([...picked, ...rows.map((p) => p.id)]) : new Set([...picked].filter((id) => !rows.some((p) => p.id === id))))} /></th>
              <th className="p-2">Person</th>
              <th className="p-2">How</th>
              <th className="p-2">Businesses</th>
              <th className="p-2">May do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const eff = effective(p);
              return (
                <tr key={p.id} className="border-t align-top">
                  <td className="p-2"><Checkbox aria-label={`Choose ${p.name}`} checked={picked.has(p.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v === true) n.add(p.id); else n.delete(p.id); return n; })} /></td>
                  <td className="p-2"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.email} · {p.roles.join(", ")}</p></td>
                  <td className="p-2">{p.admin ? <Badge>Admin</Badge> : p.grant ? (p.grant.revoked ? <Badge variant="destructive">Removed</Badge> : <Badge variant="secondary">Given{p.grant.alsoRole ? " + role" : ""}</Badge>) : p.byRole.length ? <Badge variant="outline">Role</Badge> : <span className="text-muted-foreground">None</span>}</td>
                  <td className="p-2 text-xs">{p.grant && !p.grant.revoked && p.grant.businesses !== "*" ? p.grant.businesses.map((b) => o.businesses.find((x) => x.id === b)?.name ?? b).join(", ") : eff.length ? "All" : "—"}</td>
                  <td className="p-2"><div className="flex flex-wrap gap-1">{eff.length ? eff.map((a) => <Badge key={a} variant="outline" className="font-normal">{label(a)}</Badge>) : <span className="text-muted-foreground">—</span>}</div></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {granting && <GrantDialog o={o} ids={ids} onClose={() => setGranting(false)} onDone={() => { setGranting(false); setPicked(new Set()); load(); }} />}
    </div>
  );
}

function GrantDialog({ o, ids, onClose, onDone }: { o: Overview; ids: string[]; onClose: () => void; onDone: () => void }) {
  const [actions, setActions] = React.useState<Set<ChapaAction>>(new Set(["view"]));
  const [allBiz, setAllBiz] = React.useState(true);
  const [biz, setBiz] = React.useState<Set<string>>(new Set());
  const [alsoRole, setAlsoRole] = React.useState(false);
  const save = async () => {
    const r = await A.grantChapaAccessAction({ userIds: ids, actions: [...actions], businesses: allBiz ? "*" : [...biz], alsoRole });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Chapa access given to ${ids.length}`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give Chapa access to {ids.length} {ids.length === 1 ? "person" : "people"}</DialogTitle>
          <DialogDescription>Replaces what was given before. Viewing is always included.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">May do</p>
            {o.actions.map((a) => (
              <label key={a.key} className="flex items-center gap-2">
                <Checkbox checked={actions.has(a.key) || a.key === "view"} disabled={a.key === "view"} onCheckedChange={(v) => setActions((s) => { const n = new Set(s); if (v === true) n.add(a.key); else n.delete(a.key); return n; })} />
                {a.label}
                {a.money && <Badge variant="outline" className="font-normal">money</Badge>}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Businesses</p>
            <label className="flex items-center gap-2"><Checkbox checked={allBiz} onCheckedChange={(v) => setAllBiz(v === true)} /> All businesses, including ones added later</label>
            {!allBiz && o.businesses.map((b) => (
              <label key={b.id} className="ml-6 flex items-center gap-2">
                <Checkbox checked={biz.has(b.id)} onCheckedChange={(v) => setBiz((s) => { const n = new Set(s); if (v === true) n.add(b.id); else n.delete(b.id); return n; })} /> {b.name}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2"><Checkbox checked={alsoRole} onCheckedChange={(v) => setAlsoRole(v === true)} /> Also keep what their role allows</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!allBiz && !biz.size}>Give access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
