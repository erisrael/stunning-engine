"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanIcon, EyeIcon, LaptopIcon, LogOutIcon, SearchIcon, SmartphoneIcon, TabletIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { blockDeviceAction, endOtherSessionsAction, endSessionAction, exitPreviewAction, startPreviewAction, unblockDeviceAction } from "@/app/actions/security";
import type { BlockedDevice, SessionRow } from "@/server/devices";
import { ROLE_LABELS, STAGE_LABELS, type Role, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");
const KindIcon = ({ kind }: { kind: SessionRow["device"]["kind"] }) => (kind === "phone" ? <SmartphoneIcon className="size-4" /> : kind === "tablet" ? <TabletIcon className="size-4" /> : <LaptopIcon className="size-4" />);

// ---------------------------------------------------------------------------
// Sessions and devices (own on Profile; everyone's for Admin)
// ---------------------------------------------------------------------------

export function SessionsTable({ rows, everyone, blocked = [] }: { rows: SessionRow[]; everyone?: boolean; blocked?: BlockedDevice[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const done = async (r: { ok: boolean; error?: string }, msg: string) => {
    if (!r.ok) return void toast.error(r.error);
    toast.success(msg);
    router.refresh();
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.userName} ${r.ip ?? ""} ${r.device.browser} ${r.device.os}`.toLowerCase().includes(needle));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{everyone ? "Signed-in sessions" : "Where you are signed in"}</CardTitle>
          <CardDescription>
            {everyone ? "Every active session: who, which device and browser, the IP address, and when it was last used." : "If you do not recognise a device, end its session and change your password."}
          </CardDescription>
          <CardAction>
            {!everyone && rows.filter((r) => !r.current).length > 0 && (
              <Button size="sm" variant="outline" onClick={async () => done(await endOtherSessionsAction(), "Signed out everywhere else")}>
                <LogOutIcon /> Sign out all other sessions
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {everyone && (
            <div className="relative max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Person, IP or browser" className="pl-8" aria-label="Search sessions" />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {everyone && <TableHead>Person</TableHead>}
                  <TableHead>Device</TableHead>
                  <TableHead>IP address</TableHead>
                  <TableHead>Signed in</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id}>
                    {everyone && <TableCell className="font-medium">{r.userName}</TableCell>}
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <KindIcon kind={r.device.kind} /> {r.device.browser} on {r.device.os}
                        {r.current && <span className="rounded-full bg-primary/15 px-2 text-xs text-primary">This device</span>}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.ip ?? "-"}</TableCell>
                    <TableCell className="text-xs">{when(r.createdAt)}</TableCell>
                    <TableCell className="text-xs">{when(r.lastSeenAt)}</TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      {!r.current && (
                        <Button size="xs" variant="ghost" onClick={async () => done(await endSessionAction(r.id), "Session ended")} title="Sign this session out now">
                          <XIcon /> End
                        </Button>
                      )}
                      {everyone && !r.current && (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-[var(--st-blocked-fg)]"
                          title="End every session on this device and stop it signing in again"
                          onClick={async () => {
                            const reason = window.prompt(`Block ${r.device.browser} on ${r.device.os} (${r.userName})? Say why (optional):`);
                            if (reason === null) return;
                            await done(await blockDeviceAction(r.id, reason), "Device blocked");
                          }}
                        >
                          <BanIcon /> Block device
                        </Button>
                      )}
                      {everyone && !r.current && (
                        <Button size="xs" variant="ghost" onClick={async () => done(await endOtherSessionsAction(r.userId), `Signed ${r.userName} out everywhere`)} title="End every session of this person">
                          <LogOutIcon /> All of theirs
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!shown.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No sessions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {everyone && (
        <Card>
          <CardHeader>
            <CardTitle>Blocked devices ({blocked.length})</CardTitle>
            <CardDescription>A blocked browser cannot sign in to any account until it is unblocked.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {blocked.map((b) => (
              <div key={b.deviceId} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <span className="font-medium">{b.label ?? "Device"}</span>
                <span className="text-muted-foreground">
                  last used by {b.userName ?? "?"} · blocked by {b.blockedBy ?? "?"} on {when(b.blockedAt)}
                  {b.reason ? ` · ${b.reason}` : ""}
                </span>
                <Button size="xs" variant="outline" className="ml-auto" onClick={async () => done(await unblockDeviceAction(b.deviceId), "Unblocked")}>
                  Unblock
                </Button>
              </div>
            ))}
            {!blocked.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View as
// ---------------------------------------------------------------------------

export type PreviewPerson = { id: string; name: string; roles: Role[]; leads: Stage[]; positions: { dept: string; position: string }[] };

export function ViewAsPicker({ people, departments }: { people: PreviewPerson[]; departments: { key: string; label: string }[] }) {
  const router = useRouter();
  const [role, setRole] = React.useState<string>("all");
  const [dept, setDept] = React.useState<string>("all");
  const [pos, setPos] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const match = people.filter((p) => {
    if (role !== "all" && !p.roles.includes(role as Role)) return false;
    if (dept !== "all" && !p.positions.some((x) => x.dept === dept)) return false;
    if (pos === "lead" && !p.leads.length && !p.positions.some((x) => x.position === "lead" && (dept === "all" || x.dept === dept))) return false;
    if (pos === "head" && !p.positions.some((x) => x.position === "head" && (dept === "all" || x.dept === dept))) return false;
    if (pos === "member" && (p.leads.length || p.positions.some((x) => x.position !== "member" && (dept === "all" || x.dept === dept)) || p.roles.includes("manager"))) return false;
    if (pos === "manager" && !p.roles.includes("manager")) return false;
    return !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase());
  });
  const go = async (p: PreviewPerson) => {
    const r = await startPreviewAction(p.id, role !== "all" ? (role as Role) : null);
    if (!r.ok) return void toast.error(r.error);
    router.push("/dashboard");
    router.refresh();
  };
  const pick = (value: string, set: (v: string) => void, label: string, options: { value: string; label: string }[]) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger className="w-48" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>See the app as someone else</CardTitle>
        <CardDescription>
          Choose a role, department or position, then a person. You see exactly their sidebar, Home and pages, read only: nothing can be changed, and their chat, email and private documents stay closed. Every use is in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {pick(role, setRole, "Role", [{ value: "all", label: "Any role" }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))])}
          {pick(dept, setDept, "Department", [{ value: "all", label: "Any department" }, ...departments.map((d) => ({ value: d.key, label: d.label }))])}
          {pick(pos, setPos, "Position", [
            { value: "all", label: "Any position" },
            { value: "member", label: "Member" },
            { value: "lead", label: "Team lead" },
            { value: "head", label: "Department head" },
            { value: "manager", label: "Manager" },
          ])}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" className="w-48" aria-label="Search people" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {match.slice(0, 60).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[...p.roles.map((r) => ROLE_LABELS[r]), ...p.leads.map((s) => `${STAGE_LABELS[s]} lead`), ...p.positions.map((x) => `${x.position} in ${departments.find((d) => d.key === x.dept)?.label ?? x.dept}`)].join(" · ")}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => go(p)}>
                <EyeIcon /> View as
              </Button>
            </div>
          ))}
          {!match.length && <p className="text-sm text-muted-foreground">Nobody matches.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// The strip across the top while previewing.
export function PreviewBanner({ name, role }: { name: string; role: string }) {
  return (
    <div className={cn("sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b bg-[var(--st-paused-bg)] px-4 py-2 text-sm text-[var(--st-paused-fg)] no-print")} role="status">
      <EyeIcon className="size-4" />
      <span>
        Viewing as <b>{name}</b> ({role}). Read only: nothing you do here is saved.
      </span>
      <form action={exitPreviewAction} className="ml-auto">
        <Button size="sm" variant="outline" type="submit">
          Exit View as
        </Button>
      </form>
    </div>
  );
}
