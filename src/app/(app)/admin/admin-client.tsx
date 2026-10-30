"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  DatabaseIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/app/primitives";
import {
  emptyWorkspaceAction,
  importCurriculumAction,
  resetPasswordAction,
  savePermissionsAction,
  saveUserAction,
  setOwnWorkOnlyAction,
  setTeamLeadAction,
  signOutUserAction,
} from "@/app/actions/admin";
import type { CurriculumImportSummary } from "@/server/workspace-data";
import { CAPABILITIES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, STAGE_LABELS, STAGES, leadKey, type Capability, type PermissionMatrix, type Role, type Stage } from "@/lib/domain";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  handle: string;
  title: string | null;
  phone: string | null;
  bio: string | null;
  roles: Role[];
  scopes: { gradeId: string | null; subjectId: string | null }[];
  capacity: Partial<Record<Stage, number>>;
  active: boolean;
  lastLogin: string | null;
  mustChange: boolean;
  sessions: number;
};

type Opt = { id: string; name: string };

const ROLE_TONE: Record<Role, string> = {
  admin: "bg-[var(--role-admin)] text-white",
  manager: "bg-[var(--role-manager)] text-white",
  recording: "bg-[var(--stage-recording-bg)] text-[var(--stage-recording)]",
  editing: "bg-[var(--stage-editing-bg)] text-[var(--stage-editing)]",
  uploading: "bg-[var(--stage-uploading-bg)] text-[var(--stage-uploading)]",
  publication: "bg-[var(--stage-publication-bg)] text-[var(--stage-publication)]",
  owner: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  developer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  content: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  marketing: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  hr_manager: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  hr_officer: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  finance_manager: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  accountant: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium", ROLE_TONE[role])}>{ROLE_LABELS[role]}</span>;
}

function SecretDialog({ secret, onClose }: { secret: { email: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>Shown once. Share it privately; the person sets their own password at first sign-in.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted p-3 font-mono text-sm">
          {secret?.email}
          <br />
          {secret?.password}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(secret?.password ?? "");
              toast.success("Copied");
            }}
          >
            Copy password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const blankUser: AdminUser = {
  id: "",
  name: "",
  email: "",
  handle: "",
  title: "",
  phone: "",
  bio: "",
  roles: [],
  scopes: [],
  capacity: {},
  active: true,
  lastLogin: null,
  mustChange: true,
  sessions: 0,
};

export function PeopleAdmin({ users, grades, subjects, viewerId }: { users: AdminUser[]; grades: Opt[]; subjects: Opt[]; viewerId: string }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState<AdminUser | null>(null);
  const [secret, setSecret] = React.useState<{ email: string; password: string } | null>(null);
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState<Role | "all">("all");
  const [showInactive, setShowInactive] = React.useState(true);
  const shown = users.filter(
    (u) =>
      (!q || `${u.name} ${u.email} ${u.handle} ${u.title ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
      (role === "all" || u.roles.includes(role)) &&
      (showInactive || u.active),
  );
  const scopeLabel = (s: AdminUser["scopes"][number]) => [grades.find((g) => g.id === s.gradeId)?.name, subjects.find((x) => x.id === s.subjectId)?.name].filter(Boolean).join(" ");
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or handle" className="h-8 pl-8" />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as Role | "all")}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show deactivated
        </label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/import-export?template=users">Import many</a>
          </Button>
          <Button size="sm" onClick={() => setEdit(blankUser)}>
            <UserPlusIcon /> Add person
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Access</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((u) => (
              <tr key={u.id} className={cn("hover:bg-muted/30", !u.active && "opacity-60")}>
                <td className="px-3 py-2">
                  <button className="flex items-center gap-2.5 text-left" onClick={() => setEdit(u)}>
                    <UserAvatar name={u.name} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:underline">{u.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {u.email} · @{u.handle}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <RoleBadge key={r} role={r} />
                    ))}
                  </div>
                </td>
                <td className="max-w-56 px-3 py-2 text-xs text-muted-foreground">{u.scopes.length ? u.scopes.map(scopeLabel).join(", ") : "All grades and subjects"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{u.lastLogin ? fmtRelative(u.lastLogin) : "Never"}</td>
                <td className="px-3 py-2 text-xs">
                  {!u.active ? (
                    <Badge variant="outline">Deactivated</Badge>
                  ) : u.mustChange ? (
                    <Badge variant="outline">Temporary password</Badge>
                  ) : (
                    <span className="text-muted-foreground">{u.sessions ? `${u.sessions} active session${u.sessions > 1 ? "s" : ""}` : "Active"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="outline" onClick={() => setEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      title="Reset password"
                      onClick={async () => {
                        const r = await resetPasswordAction(u.id);
                        if (!r.ok) return toast.error(r.error);
                        setSecret({ email: u.email, password: (r.data as { tempPassword: string }).tempPassword });
                      }}
                    >
                      <KeyRoundIcon />
                    </Button>
                    {u.sessions > 0 && u.id !== viewerId && (
                      <Button
                        size="xs"
                        variant="ghost"
                        title="Sign out everywhere"
                        onClick={async () => {
                          const r = await signOutUserAction(u.id);
                          if (!r.ok) return toast.error(r.error);
                          toast.success(`${u.name} was signed out`);
                          router.refresh();
                        }}
                      >
                        <LogOutIcon />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No people match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && (
        <UserDialog
          user={edit}
          grades={grades}
          subjects={subjects}
          isSelf={edit.id === viewerId}
          onClose={() => setEdit(null)}
          onSaved={(pw) => {
            setEdit(null);
            if (pw) setSecret(pw);
            router.refresh();
          }}
        />
      )}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </Card>
  );
}

function UserDialog({
  user,
  grades,
  subjects,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  grades: Opt[];
  subjects: Opt[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (pw: { email: string; password: string } | null) => void;
}) {
  const [u, setU] = React.useState(user);
  const [password, setPassword] = React.useState("");
  const [mustChange, setMustChange] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const field = (k: keyof AdminUser) => ({
    value: (u[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setU({ ...u, [k]: e.target.value }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {user.id && <UserAvatar name={user.name} size="md" />}
            {user.id ? user.name : "Add a person"}
          </DialogTitle>
          <DialogDescription>Profile, roles, access and capacity. Changes apply at the person&apos;s next page load and are kept in the audit log.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input {...field("name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...field("email")} />
            </div>
            <div className="space-y-1.5">
              <Label>Handle (for @mentions)</Label>
              <Input placeholder="first.last" {...field("handle")} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" {...field("phone")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Job title</Label>
              <Input {...field("title")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>About</Label>
              <Textarea rows={2} {...field("bio")} />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Roles</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", u.roles.includes(r) && "border-primary/50 bg-primary/5")}>
                <Checkbox
                  className="mt-0.5"
                  checked={u.roles.includes(r)}
                  onCheckedChange={(v) => setU({ ...u, roles: v ? [...u.roles, r] : u.roles.filter((x) => x !== r) })}
                />
                <span>
                  <span className="font-medium">{ROLE_LABELS[r]}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                </span>
              </label>
            ))}
          </div>
          {isSelf && <p className="text-xs text-muted-foreground">You must keep Admin or Manager on your own account.</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Access</h3>
          <p className="text-xs text-muted-foreground">No rows means all grades and subjects. Each row allows one grade, one subject, or one grade and subject pair.</p>
          {u.scopes.map((s, i) => (
            <div key={i} className="flex gap-2">
              <Select value={s.gradeId ?? "any"} onValueChange={(v) => setU({ ...u, scopes: u.scopes.map((x, j) => (j === i ? { ...x, gradeId: v === "any" ? null : v } : x)) })}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any grade</SelectItem>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={s.subjectId ?? "any"} onValueChange={(v) => setU({ ...u, scopes: u.scopes.map((x, j) => (j === i ? { ...x, subjectId: v === "any" ? null : v } : x)) })}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any subject</SelectItem>
                  {subjects.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" aria-label="Remove access row" onClick={() => setU({ ...u, scopes: u.scopes.filter((_, j) => j !== i) })}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setU({ ...u, scopes: [...u.scopes, { gradeId: grades[0]?.id ?? null, subjectId: null }] })}>
            <PlusIcon /> Limit access
          </Button>
        </section>

        {STAGES.some((st) => u.roles.includes(st)) && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Production hours per week</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAGES.filter((st) => u.roles.includes(st)).map((st) => (
                <label key={st} className="space-y-1 text-xs">
                  {STAGE_LABELS[st]}
                  <Input type="number" min={0} max={60} value={u.capacity[st] ?? ""} onChange={(e) => setU({ ...u, capacity: { ...u.capacity, [st]: Number(e.target.value) } })} className="h-8" />
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sign-in</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{user.id ? "Set a new password" : "Password"}</Label>
              <Input type="text" autoComplete="new-password" placeholder={user.id ? "Leave empty to keep" : "Leave empty to generate one"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={mustChange} onCheckedChange={(v) => setMustChange(!!v)} disabled={!password} /> Ask them to change it at sign-in
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={u.active} disabled={isSelf} onCheckedChange={(v) => setU({ ...u, active: v })} /> Active (deactivating keeps all history and signs them out)
          </label>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await saveUserAction({
                id: u.id || undefined,
                name: u.name,
                email: u.email,
                handle: u.handle || undefined,
                title: u.title ?? undefined,
                phone: u.phone ?? undefined,
                bio: u.bio ?? undefined,
                roles: u.roles,
                scopes: u.scopes,
                capacity: u.capacity,
                active: u.active,
                password: password || undefined,
                mustChangePassword: mustChange,
              });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              const d = r.data as { tempPassword: string | null };
              toast.success(user.id ? "Saved" : "Person added");
              onSaved(d.tempPassword ? { email: u.email, password: d.tempPassword } : null);
            }}
          >
            {user.id ? "Save changes" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

export function PermissionsAdmin({ matrix, counts, leadCounts }: { matrix: PermissionMatrix; counts: Record<Role, number>; leadCounts: Record<Stage, number> }) {
  const router = useRouter();
  const [m, setM] = React.useState(matrix);
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(m) !== JSON.stringify(matrix);
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))];
  // Roles first, then one column per team lead (Admin, Teams).
  const columns: { key: keyof PermissionMatrix; label: React.ReactNode; name: string; count: number }[] = [
    ...ROLES.map((r) => ({ key: r, label: <RoleBadge role={r} />, name: ROLE_LABELS[r], count: counts[r] ?? 0 })),
    ...STAGES.map((st) => ({
      key: leadKey(st),
      label: <Badge variant="outline" className="font-medium">{STAGE_LABELS[st]} lead</Badge>,
      name: `${STAGE_LABELS[st]} lead`,
      count: leadCounts[st] ?? 0,
    })),
  ];
  const toggle = (k: keyof PermissionMatrix, c: Capability) => setM({ ...m, [k]: m[k].includes(c) ? m[k].filter((x) => x !== c) : [...m[k], c] });
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Role permissions</p>
          <p className="text-xs text-muted-foreground">
            Stage roles always work their own stage. These switches add extra abilities and choose which sidebar pages and import or export options each role sees. A person gets everything granted to any of their roles and to the teams they lead.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!dirty || busy} onClick={() => setM(matrix)}>
          Discard
        </Button>
        <Button
          size="sm"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            const r = await savePermissionsAction(m);
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success("Permissions saved");
            router.refresh();
          }}
        >
          Save permissions
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Permission</th>
              {columns.map((col) => (
                <th key={col.key} className="w-28 px-2 py-2 text-center font-medium">
                  {col.label}
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {col.count} {col.count === 1 ? "person" : "people"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g} className="divide-y border-t">
              <tr className="bg-muted/25">
                <td colSpan={columns.length + 1} className="px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g}
                </td>
              </tr>
              {CAPABILITIES.filter((c) => c.group === g).map((c) => (
                <tr key={c.key} className="hover:bg-muted/20">
                  <td className="px-3 py-2">{c.label}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-2 py-2 text-center">
                      <Checkbox checked={m[col.key].includes(c.key)} onCheckedChange={() => toggle(col.key, c.key)} aria-label={`${col.name}: ${c.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Access overview: who can see which grade
// ---------------------------------------------------------------------------

export function AccessAdmin({ users, grades, subjects }: { users: AdminUser[]; grades: Opt[]; subjects: Opt[] }) {
  const active = users.filter((u) => u.active);
  const sees = (u: AdminUser, gradeId: string): "all" | "some" | "none" => {
    if (!u.scopes.length) return "all";
    if (u.scopes.some((s) => s.gradeId === gradeId && !s.subjectId) || u.scopes.some((s) => !s.gradeId && !s.subjectId)) return "all";
    if (u.scopes.some((s) => s.gradeId === gradeId || !s.gradeId)) return "some";
    return "none";
  };
  const subjectNames = (u: AdminUser, gradeId: string) =>
    u.scopes
      .filter((s) => s.subjectId && (s.gradeId === gradeId || !s.gradeId))
      .map((s) => subjects.find((x) => x.id === s.subjectId)?.name)
      .filter(Boolean)
      .join(", ");
  return (
    <Card className="gap-0 py-0">
      <div className="border-b p-3">
        <p className="text-sm font-medium">Access by grade</p>
        <p className="text-xs text-muted-foreground">
          <CheckIcon className="inline size-3.5 text-[var(--st-done-fg)]" /> all subjects, <span className="font-medium">partial</span> some subjects (hover for which), blank no access. Edit access from People.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">Person</th>
              {grades.map((g) => (
                <th key={g.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                  {g.name.replace("Grade ", "G")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {active.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20">
                <td className="sticky left-0 bg-card px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={u.name} />
                    <span className="truncate">{u.name}</span>
                    <span className="hidden gap-1 lg:flex">
                      {u.roles.map((r) => (
                        <RoleBadge key={r} role={r} />
                      ))}
                    </span>
                  </div>
                </td>
                {grades.map((g) => {
                  const s = sees(u, g.id);
                  return (
                    <td key={g.id} className="px-2 py-1.5 text-center" title={s === "some" ? subjectNames(u, g.id) : undefined}>
                      {s === "all" ? (
                        <CheckIcon className="mx-auto size-4 text-[var(--st-done-fg)]" />
                      ) : s === "some" ? (
                        <span className="rounded bg-[var(--st-paused-bg)] px-1.5 py-0.5 text-[11px] text-[var(--st-paused-fg)]">partial</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data: import the curriculum backup, back up, empty
// ---------------------------------------------------------------------------

export function DataAdmin({ counts, database, canManageUsers }: { counts: Record<string, number>; database: string; canManageUsers: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CurriculumImportSummary | null>(null);
  const [createItems, setCreateItems] = React.useState(true);
  const [markRecorded, setMarkRecorded] = React.useState(true);
  const [confirm, setConfirm] = React.useState("");
  const [keepAccounts, setKeepAccounts] = React.useState(true);
  const [emptyOpen, setEmptyOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseIcon className="size-4" /> Workspace data
          </CardTitle>
          <CardDescription>{database}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} className="rounded-lg border p-2.5">
                <dt className="text-[11px] text-muted-foreground capitalize">{k}</dt>
                <dd className="text-lg font-semibold tabular">{v.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UploadIcon className="size-4" /> Import curriculum backup
          </CardTitle>
          <CardDescription>
            The JSON exported from the curriculum tracker (grade, subjects, units, parts and videos). Safe to run again: existing units, parts and recordings are matched by
            their IDs and updated, never duplicated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input ref={fileRef} type="file" accept=".json,application/json" />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={createItems} onCheckedChange={(v) => setCreateItems(!!v)} />
            <span>
              Create a production item for every part
              <span className="block text-xs text-muted-foreground">Turn off to load only the curriculum structure.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={markRecorded} disabled={!createItems} onCheckedChange={(v) => setMarkRecorded(!!v)} />
            <span>
              Parts with videos are recorded
              <span className="block text-xs text-muted-foreground">Each video is logged by camera code and the part moves to Editing.</span>
            </span>
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              const file = fileRef.current?.files?.[0];
              if (!file) return toast.error("Choose the backup JSON first.");
              const fd = new FormData();
              fd.set("file", file);
              fd.set("createItems", createItems ? "1" : "0");
              fd.set("markRecorded", markRecorded ? "1" : "0");
              setBusy(true);
              const r = await importCurriculumAction(fd);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              setResult(r.data as CurriculumImportSummary);
              toast.success("Curriculum imported");
              router.refresh();
            }}
          >
            <UploadIcon /> {busy ? "Importing..." : "Import"}
          </Button>
          {result && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="mb-1 font-medium">Import finished</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>
                  {result.grades} grades, {result.subjects} subjects
                </li>
                <li>
                  Units: {result.units.created} new, {result.units.updated} updated
                </li>
                <li>
                  Parts: {result.parts.created} new, {result.parts.updated} updated
                </li>
                <li>
                  Items: {result.items.created} new, {result.items.existing} already existed
                </li>
                <li>
                  Recordings: {result.recordings.created} camera codes logged, {result.recordedParts} parts moved to Editing
                </li>
              </ul>
              {result.warnings.length > 0 && <p className="mt-2 text-[var(--st-paused-fg)]">{result.warnings.length} warning(s): {result.warnings.slice(0, 3).join(" ")}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DownloadIcon className="size-4" /> Back up
            </CardTitle>
            <CardDescription>Download every table as one JSON file. Restore it with npm run db:restore.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href="/api/admin/backup">
                <DownloadIcon /> Download full backup
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2Icon className="size-4" /> Empty the workspace
            </CardTitle>
            <CardDescription>
              Deletes the curriculum, every item, recording, comment and chat message. Download a backup first. Afterwards import the curriculum backup to rebuild with real data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setEmptyOpen(true)}>
              Empty workspace...
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empty the workspace?</DialogTitle>
            <DialogDescription>This cannot be undone. Your own account always stays so you can rebuild.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={keepAccounts} disabled={!canManageUsers} onCheckedChange={(v) => setKeepAccounts(!!v)} /> Keep all accounts and settings
          </label>
          <div className="space-y-1.5">
            <Label>
              Type <span className="font-mono font-semibold">EMPTY</span> to confirm
            </Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirm.trim().toUpperCase() !== "EMPTY"}
              onClick={async () => {
                setBusy(true);
                const r = await emptyWorkspaceAction({ confirm, keepAccounts });
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                setEmptyOpen(false);
                setConfirm("");
                toast.success("Workspace emptied");
                router.refresh();
              }}
            >
              <ShieldIcon /> Empty now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teams: leads and members per stage
// ---------------------------------------------------------------------------

export type TeamPerson = { id: string; name: string; roles: Role[]; leads: Stage[]; ownWorkOnly: boolean; open: number };

export function TeamsAdmin({ people }: { people: TeamPerson[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {STAGES.map((st) => {
        const team = people.filter((p) => p.roles.includes(st));
        const leads = team.filter((p) => p.leads.includes(st));
        return (
          <Card key={st} className="gap-0 py-0">
            <div className="flex items-center justify-between border-b p-3">
              <div>
                <p className="text-sm font-semibold">{STAGE_LABELS[st]} team</p>
                <p className="text-xs text-muted-foreground">
                  {leads.length ? `Led by ${leads.map((l) => l.name).join(", ")}` : "No team lead yet"} · {team.length} {team.length === 1 ? "person" : "people"}
                </p>
              </div>
              <RoleBadge role={st} />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-1.5">Person</th>
                  <th className="px-3 py-1.5 text-center">Team lead</th>
                  <th className="px-3 py-1.5 text-center" title="The member sees only items assigned to them">Own work only</th>
                  <th className="px-3 py-1.5 text-right">Open items</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {team.map((p) => {
                  const isLead = p.leads.includes(st);
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <UserAvatar name={p.name} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {p.leads.length ? `Leads ${p.leads.map((l) => STAGE_LABELS[l]).join(", ")}` : "Member"}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch checked={isLead} disabled={busy === `${st}:${p.id}`} onCheckedChange={(v) => act(`${st}:${p.id}`, () => setTeamLeadAction(st, p.id, v))} aria-label={`${p.name} leads ${STAGE_LABELS[st]}`} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch
                          checked={p.ownWorkOnly}
                          disabled={p.leads.length > 0 || busy === `own:${p.id}`}
                          onCheckedChange={(v) => act(`own:${p.id}`, () => setOwnWorkOnlyAction(p.id, v))}
                          aria-label={`${p.name} sees only own work`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular">{p.open}</td>
                    </tr>
                  );
                })}
                {!team.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Nobody holds the {STAGE_LABELS[st]} role. Add it in People.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground lg:col-span-2">
        Team leads get every handoff and redo request for their team, assign work to members, and see their team&apos;s reports. A team can have several leads and one person can lead several teams.
        Members marked <span className="font-medium">Own work only</span> see just the items assigned to them, on every page.
      </p>
    </div>
  );
}
