"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, DatabaseIcon, KeyRoundIcon, LogInIcon, LogOutIcon, PlusIcon, RefreshCwIcon, ShieldCheckIcon, Trash2Icon, UndoIcon, UserXIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageTabs, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "@/lib/legacy-cms";
import { cn } from "@/lib/utils";
import type { CmsAccessPerson } from "@/server/cms-access";
import * as A from "@/app/actions/cms-access";
import { deleteLegacyCmsCategoryDataAction } from "@/app/actions/legacy-cms";

type Overview = Awaited<ReturnType<typeof import("@/server/cms-access").cmsAccessOverview>>;
type Login = { kind: "shared" } | { kind: "account"; accountId: string } | { kind: "own"; username: string; password?: string };
const SHORT: Record<LegacyCmsCategory, string> = { students: "Students", parents: "Parents", "subscription-plans": "Plans", "subscription-histories": "Histories", invoices: "Invoices", subscriptions: "Subscriptions", feedback: "Feedback" };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : "Never");
const SECTIONS = [
  ["people", "People & access"],
  ["logins", "Noor logins"],
  ["roles", "Role defaults"],
  ["data", "Stored data"],
] as const;

// Admin, Noor access: who sees which Noor tables, with which Noor login, and who manages the stored data.
export function LegacyCmsAdmin(_: { users?: unknown }) {
  const [o, setO] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState("");
  const [section, setSection] = React.useState<(typeof SECTIONS)[number][0]>("people");
  const load = React.useCallback(async () => {
    const r = await A.cmsAccessOverviewAction();
    if (r.ok && r.data) (setO(r.data), setError(""));
    else setError(r.ok ? "" : r.error);
  }, []);
  React.useEffect(() => void load(), [load]);
  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!o) return <StatusStrip>Loading Noor access…</StatusStrip>;
  const granted = o.people.filter((p) => p.effectiveTables.length).length;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheckIcon className="size-5 text-emerald-600" /> Noor Legacy CMS: user access &amp; credentials</h2>
        <p className="text-sm text-muted-foreground">The connection, saved Noor logins that several people use at the same time, who sees which tables, and who manages the stored Noor data.</p>
      </div>
      <Connection o={o} onChanged={load} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="People with access" value={`${granted} of ${o.people.length}`} />
        <MetricCard label="Saved Noor logins" value={o.accounts.length} />
        <MetricCard label="Stored Noor rows" value={o.stored.tables.reduce((a, t) => a + t.rows, 0).toLocaleString()} />
        <MetricCard label="Days in the day cache" value={o.stored.cacheDays} />
      </div>
      <ViewSwitcher label="Noor access sections" options={SECTIONS} value={section} onChange={setSection} />
      {section === "people" && <People o={o} onChanged={load} />}
      {section === "logins" && <Logins o={o} onChanged={load} />}
      {section === "roles" && <Roles o={o} onChanged={load} />}
      {section === "data" && <Data o={o} onChanged={load} />}
      <span className="hidden"><PageTabs tabs={[]} active="" href={() => ""} /></span>
    </div>
  );
}

function Connection({ o, onChanged }: { o: Overview; onChanged: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [edit, setEdit] = React.useState(false);
  const [f, setF] = React.useState({ baseUrl: o.connection.baseUrl, username: o.connection.username, password: "", autoSync: o.connection.autoSync, syncIntervalMinutes: o.connection.syncIntervalMinutes });
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const d = r.data as { ok?: boolean; message?: string } | undefined;
    if (d?.message) {
      setStatus({ ok: d.ok !== false, message: d.message });
      (d.ok === false ? toast.error : toast.success)(d.message);
    }
    onChanged();
  };
  React.useEffect(() => void run("check", A.cmsCheckAction), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Shared connection</p>
          <p className="text-xs text-muted-foreground">
            {o.connection.baseUrl} · signed in as <strong>{o.connection.username || "nobody"}</strong> · last sync {when(o.connection.lastSyncedAt)} ({o.connection.lastSyncStatus})
          </p>
          {status && (
            <p className={cn("flex items-center gap-1 text-xs", status.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600")}>
              {status.ok ? <CheckCircle2Icon className="size-3.5" /> : <XCircleIcon className="size-3.5" />} {status.message}
            </p>
          )}
          {o.connection.lastSyncError && <p className="text-xs text-rose-600">Last sync error: {o.connection.lastSyncError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("check", A.cmsCheckAction)}><RefreshCwIcon className={cn(busy === "check" && "animate-spin")} /> Check</Button>
          <Button size="sm" disabled={!!busy} onClick={() => run("in", A.cmsSignInAction)}><LogInIcon /> Sign in</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("out", A.cmsSignOutAction)}><LogOutIcon /> Sign out</Button>
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}><KeyRoundIcon /> Change</Button>
        </div>
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Shared Noor connection</DialogTitle><DialogDescription>Used by everyone without their own or a saved login. The password is stored sealed.</DialogDescription></DialogHeader>
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1">Noor address<Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} /></label>
            <label className="grid gap-1">Noor email<Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label className="grid gap-1">New password<Input type="password" autoComplete="new-password" placeholder="Leave empty to keep the saved one" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
            <label className="flex items-center gap-2"><Checkbox checked={f.autoSync} onCheckedChange={(v) => setF({ ...f, autoSync: v === true })} /> Refresh the stored data automatically every <Input type="number" min={5} className="h-7 w-20" value={f.syncIntervalMinutes} onChange={(e) => setF({ ...f, syncIntervalMinutes: Number(e.target.value) })} /> minutes</label>
          </div>
          <DialogFooter>
            <Button onClick={async () => { const r = await A.saveCmsConnectionAction({ ...f, password: f.password || undefined }); if (!r.ok) return toast.error(r.error); toast.success("Connection saved"); setEdit(false); onChanged(); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function People({ o, onChanged }: { o: Overview; onChanged: () => void }) {
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("all");
  const [role, setRole] = React.useState("all");
  const [only, setOnly] = React.useState<"all" | "with" | "without">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [own, setOwn] = React.useState<{ ids: string[] } | null>(null);
  const depts = [...new Map(o.people.flatMap((p) => p.departments).map((d) => [d.key, d.title])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const roles = [...new Set(o.people.flatMap((p) => p.roles))].sort();
  const rows = o.people.filter(
    (p) =>
      (!q.trim() || `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())) &&
      (dept === "all" || p.departments.some((d) => d.key === dept)) &&
      (role === "all" || p.roles.includes(role)) &&
      (only === "all" || (only === "with" ? p.effectiveTables.length > 0 : p.effectiveTables.length === 0)),
  );
  const ids = [...selected];
  const grant = async (input: Omit<Parameters<typeof A.grantCmsAccessAction>[0], "userIds">, who = ids, done = "Access saved") => {
    const r = await A.grantCmsAccessAction({ userIds: who, ...input });
    if (!r.ok) return toast.error(r.error);
    toast.success(`${done} for ${r.data} ${r.data === 1 ? "person" : "people"}`);
    onChanged();
  };
  const loginValue = (p: CmsAccessPerson) => (p.login.kind === "account" ? `account:${p.override?.accountId}` : p.login.kind);
  const setLogin = (who: string[], v: string) => {
    if (v === "own") return setOwn({ ids: who });
    const login: Login = v === "shared" ? { kind: "shared" } : { kind: "account", accountId: v.slice(8) };
    void grant({ login }, who, "Login changed");
  };
  return (
    <div className="space-y-3">
      <Toolbar label="Find people">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="h-8 w-56 text-xs" aria-label="Search people" />
        <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Every department</option>
          {depts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">Every role</option>
          {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
        <ViewSwitcher label="Access" size="xs" value={only} onChange={setOnly} options={[["all", "Everyone"], ["with", "With access"], ["without", "Without"]]} />
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set(rows.map((p) => p.id)))}>Select all {rows.length}</Button>
      </Toolbar>

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs" role="region" aria-label="Change access for the selected people">
          <span className="font-medium">{ids.length} selected:</span>
          <span>Give</span>
          {LEGACY_CMS_CATEGORIES.map((c) => (
            <Button key={c.key} size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => grant({ addTables: [c.key] })}>+ {SHORT[c.key]}</Button>
          ))}
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => grant({ tables: LEGACY_CMS_CATEGORIES.map((c) => c.key) })}>All tables</Button>
          <select aria-label="Login for the selected people" defaultValue="" onChange={(e) => { if (e.target.value) setLogin(ids, e.target.value); e.target.value = ""; }} className="h-6 rounded border bg-background px-1">
            <option value="">Noor login…</option>
            <option value="shared">Shared login</option>
            {o.accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>Saved: {a.label}</option>)}
            <option value="own">Their own email and password…</option>
          </select>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={async () => { const r = await A.resetCmsAccessAction(ids); if (!r.ok) return toast.error(r.error); toast.success("Back to their role's tables"); onChanged(); }}><UndoIcon /> Role defaults</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-rose-600" onClick={async () => { if (!confirm(`Remove Noor access for ${ids.length}?`)) return; const r = await A.revokeCmsAccessAction(ids); if (!r.ok) return toast.error(r.error); toast.success("Access removed"); onChanged(); }}><UserXIcon /> No access</Button>
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[11px]" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 text-left text-[11px] text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-8 px-2 py-2"><Checkbox aria-label="Select everyone shown" checked={rows.length > 0 && rows.every((p) => selected.has(p.id))} onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((p) => p.id)) : new Set())} /></th>
              <th className="px-2 py-2">Person</th>
              <th className="px-2 py-2">Department · role</th>
              {LEGACY_CMS_CATEGORIES.map((c) => <th key={c.key} className="px-1 py-2 text-center">{SHORT[c.key]}</th>)}
              <th className="px-2 py-2">Noor login</th>
              <th className="px-1 py-2 text-center" title="Resolve feedback in Noor">Feedback</th>
              <th className="px-1 py-2 text-center" title="Sync, clear and snapshot the stored Noor data">Manage data</th>
              <th className="px-2 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={cn("border-t", selected.has(p.id) && "bg-primary/5")}>
                <td className="px-2 py-1.5"><Checkbox aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onCheckedChange={(v) => { const n = new Set(selected); if (v === true) n.add(p.id); else n.delete(p.id); setSelected(n); }} /></td>
                <td className="px-2 py-1.5"><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.email}</div></td>
                <td className="px-2 py-1.5 text-[11px]">{p.departments.map((d) => d.title).join(", ") || "-"}<div className="text-muted-foreground">{p.roles.map((r) => r.replace(/_/g, " ")).join(", ")}</div></td>
                {LEGACY_CMS_CATEGORIES.map((c) => {
                  const on = p.effectiveTables.includes(c.key);
                  return (
                    <td key={c.key} className="px-1 py-1.5 text-center">
                      <Checkbox aria-label={`${p.name}: ${c.label}`} checked={on} onCheckedChange={(v) => grant(v === true ? { addTables: [c.key] } : { removeTables: [c.key] }, [p.id], `${c.label} ${v === true ? "given" : "removed"}`)} />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <select aria-label={`${p.name}: Noor login`} value={loginValue(p)} onChange={(e) => setLogin([p.id], e.target.value)} className="h-7 max-w-[11rem] rounded border bg-background px-1">
                    <option value="shared">Shared ({o.connection.username || "not set"})</option>
                    {o.accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>Saved: {a.label}</option>)}
                    <option value="own">{p.login.kind === "own" ? `Own: ${p.login.label}` : "Own email and password…"}</option>
                  </select>
                </td>
                <td className="px-1 py-1.5 text-center"><Checkbox aria-label={`${p.name}: resolve feedback`} checked={!!p.override?.canResolveFeedback} onCheckedChange={(v) => grant({ canResolveFeedback: v === true }, [p.id])} /></td>
                <td className="px-1 py-1.5 text-center"><Checkbox aria-label={`${p.name}: manage data`} disabled={o.dataPolicy === "admin"} title={o.dataPolicy === "admin" ? "Data policy is Admin only (Stored data)" : undefined} checked={!!p.override?.canManageData} onCheckedChange={(v) => grant({ canManageData: v === true }, [p.id])} /></td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{p.override ? "Set for this person" : "From their role"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={13} className="px-3 py-10 text-center text-muted-foreground">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <OwnLoginDialog open={own} onClose={() => setOwn(null)} onSave={async (username, password) => { await grant({ login: { kind: "own", username, password } }, own!.ids, "Own Noor login saved"); setOwn(null); }} />
    </div>
  );
}

function OwnLoginDialog({ open, onClose, onSave }: { open: { ids: string[] } | null; onClose: () => void; onSave: (u: string, p: string) => void }) {
  const [u, setU] = React.useState("");
  const [p, setP] = React.useState("");
  return (
    <Dialog open={!!open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Their own Noor login</DialogTitle><DialogDescription>For {open?.ids.length} {open?.ids.length === 1 ? "person" : "people"}. Stored sealed; they never see it. To let several people share one login, use a saved login instead.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-sm">Noor email<Input value={u} onChange={(e) => setU(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Noor password<Input type="password" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} placeholder="Leave empty to keep the saved one" /></label>
        <DialogFooter><Button disabled={!u.trim()} onClick={() => onSave(u, p)}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Logins({ o, onChanged }: { o: Overview; onChanged: () => void }) {
  const [edit, setEdit] = React.useState<{ id?: string; label: string; username: string; password: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const test = async (id: string) => {
    setBusy(id);
    const r = await A.testCmsLoginAction(id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    (r.data?.ok ? toast.success : toast.error)(r.data?.message ?? "");
    onChanged();
  };
  return (
    <div className="space-y-3">
      <Toolbar label="Saved logins" end={<Button size="sm" onClick={() => setEdit({ label: "", username: "", password: "" })}><PlusIcon /> Save a Noor login</Button>}>
        <p className="text-xs text-muted-foreground">A saved login is stored once (sealed) and given to any number of people in People &amp; access. They share one Noor session at the same time, so Noor sees a single sign-in.</p>
      </Toolbar>
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Name</th><th className="px-2 py-2">Noor email</th><th className="px-2 py-2">People using it</th><th className="px-2 py-2">Last check</th><th className="px-2 py-2" /></tr></thead>
          <tbody>
            <tr className="border-t bg-muted/20">
              <td className="px-2 py-1.5 font-medium">Shared connection</td><td className="px-2 py-1.5">{o.connection.username}</td>
              <td className="px-2 py-1.5">{o.people.filter((p) => p.login.kind === "shared" && p.effectiveTables.length).length}</td><td className="px-2 py-1.5">-</td>
              <td className="px-2 py-1.5"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === "shared"} onClick={() => test("shared")}><LogInIcon /> Test sign-in</Button></td>
            </tr>
            {o.accounts.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-2 py-1.5 font-medium">{a.label}</td>
                <td className="px-2 py-1.5">{a.username}</td>
                <td className="px-2 py-1.5">{a.users}</td>
                <td className="px-2 py-1.5">{a.lastCheck ? <span className={a.lastCheck.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}>{a.lastCheck.ok ? "Works" : "Failed"} · {when(a.lastCheck.at)}</span> : "Not checked"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === a.id} onClick={() => test(a.id)}><LogInIcon /> Test sign-in</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEdit({ id: a.id, label: a.label, username: a.username, password: "" })}>Edit</Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${a.label}`} onClick={async () => { if (!confirm(`Remove "${a.label}"? Its ${a.users} people go back to the shared login.`)) return; const r = await A.deleteCmsAccountAction(a.id); if (!r.ok) return toast.error(r.error); onChanged(); }}><Trash2Icon /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit saved login" : "Save a Noor login"}</DialogTitle><DialogDescription>The email and password of a Noor account. Stored sealed.</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">Name<Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Finance team" /></label>
              <label className="grid gap-1">Noor email<Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></label>
              <label className="grid gap-1">Noor password<Input type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder={edit.id ? "Leave empty to keep the saved one" : ""} /></label>
            </div>
          )}
          <DialogFooter>
            <Button onClick={async () => { if (!edit) return; const r = await A.saveCmsAccountAction({ id: edit.id, label: edit.label, username: edit.username, password: edit.password || undefined }); if (!r.ok) return toast.error(r.error); toast.success("Login saved"); setEdit(null); onChanged(); if (r.data) void test(r.data); }}>Save and test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Roles({ o, onChanged }: { o: Overview; onChanged: () => void }) {
  const [v, setV] = React.useState(o.visibility);
  const roles = [...new Set([...o.roles, ...o.people.flatMap((p) => p.roles)])].sort();
  return (
    <div className="space-y-3">
      <StatusStrip>Tables each role sees when a person has nothing set for themselves in People &amp; access.</StatusStrip>
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Role</th>{LEGACY_CMS_CATEGORIES.map((c) => <th key={c.key} className="px-1 py-2 text-center">{SHORT[c.key]}</th>)}</tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r} className="border-t">
                <td className="px-2 py-1.5 font-medium">{r.replace(/_/g, " ")}</td>
                {LEGACY_CMS_CATEGORIES.map((c) => (
                  <td key={c.key} className="px-1 py-1.5 text-center">
                    <Checkbox aria-label={`${r}: ${c.label}`} checked={(v[r] ?? []).includes(c.key)} onCheckedChange={(on) => setV({ ...v, [r]: on === true ? [...(v[r] ?? []), c.key] : (v[r] ?? []).filter((x) => x !== c.key) })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={async () => { const r = await A.saveCmsRolesAction(v); if (!r.ok) return toast.error(r.error); toast.success("Role defaults saved"); onChanged(); }}>Save role defaults</Button>
    </div>
  );
}

function Data({ o, onChanged }: { o: Overview; onChanged: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">Who manages the stored Noor data</p>
        <p className="mb-2 text-xs text-muted-foreground">Syncing tables into Myseed, clearing them and taking snapshots. Viewing live data is set per person in People &amp; access.</p>
        <ViewSwitcher
          label="Data policy"
          value={o.dataPolicy}
          onChange={async (p) => { const r = await A.setCmsDataPolicyAction(p); if (!r.ok) return toast.error(r.error); toast.success("Data policy saved"); onChanged(); }}
          options={[["admin", "Admin and Data Managers only"], ["granted", "Also the people Admin allows"]]}
        />
        {o.dataPolicy === "granted" && <p className="mt-2 text-xs text-muted-foreground">Tick "Manage data" for each person in People &amp; access.</p>}
      </div>
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground"><tr><th className="px-2 py-2">Table</th><th className="px-2 py-2 text-right">Stored rows</th><th className="px-2 py-2">Last refreshed</th><th className="px-2 py-2" /></tr></thead>
          <tbody>
            {o.stored.tables.map((t) => (
              <tr key={t.key} className="border-t">
                <td className="px-2 py-1.5 font-medium">{t.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.rows.toLocaleString()}</td>
                <td className="px-2 py-1.5">{when(t.last)}</td>
                <td className="px-2 py-1.5">{t.rows > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={async () => { if (!confirm(`Delete the ${t.rows} stored ${t.label} rows? Noor itself is not changed.`)) return; const r = await deleteLegacyCmsCategoryDataAction(t.key as LegacyCmsCategory); if (!r.ok) return toast.error((r as { message?: string }).message ?? "Failed"); onChanged(); }}><Trash2Icon /> Clear</Button>}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/20">
              <td className="px-2 py-1.5 font-medium">Day cache (live loads)</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{o.stored.cacheRows.toLocaleString()} days</td>
              <td className="px-2 py-1.5">Past days are kept so loading them again is instant</td>
              <td className="px-2 py-1.5"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { const r = await A.clearCmsRangeCacheAction(); if (!r.ok) return toast.error(r.error); toast.success("Day cache cleared"); onChanged(); }}><DatabaseIcon /> Clear</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Invoice verifications ({o.stored.invoiceReviews}) are kept separately and are never cleared here.</p>
      <Badge variant="outline" className="hidden" />
    </div>
  );
}
