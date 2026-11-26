"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SearchIcon, ShieldIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { setOpsPositionAction, setOpsRolesAction, setOpsStageLeadAction } from "@/app/actions/people-ops";
import { roleLabel, STAGE_LABELS, type Position, type Role, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; email: string; title: string | null; roles: Role[]; positions: Record<string, Position>; leads: Stage[]; protected: boolean };
type RoleOpt = { key: Role; label: string; dept: string };

const GROUP_LABEL: Record<string, string> = { production: "Production", finance: "Finance", sales: "Sales", marketing: "Marketing", support: "Customer Support", dev: "Dev", studio: "Studio", hr: "HR", operations: "Operations", chief: "Chief officers" };

export function PeopleOpsClient({
  people,
  roles,
  positionDepts,
  stages,
  canAssignHeads,
  admin,
  viewerId,
}: {
  people: Person[];
  roles: RoleOpt[];
  positionDepts: { key: string; label: string }[];
  stages: Stage[];
  canAssignHeads: boolean;
  admin: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const managed = new Set(roles.map((r) => r.key as string));
  const groups = [...new Set(roles.map((r) => r.dept))];

  const shown = people.filter((p) => {
    if (q && !`${p.name} ${p.email} ${p.title ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (dept === "all") return true;
    if (dept === "none") return !p.roles.some((r) => managed.has(r));
    return p.roles.some((r) => roles.find((x) => x.key === r)?.dept === dept) || !!p.positions[dept];
  });

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Could not save.");
    toast.success(ok);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-8" aria-label="Search people" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-52" aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g} value={g}>
                {GROUP_LABEL[g] ?? g}
              </SelectItem>
            ))}
            <SelectItem value="none">Not in a managed department</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{shown.length} people</span>
      </div>

      {shown.map((p) => {
        const own = p.id === viewerId && !admin;
        const locked = p.protected && !admin;
        const mine = p.roles.filter((r) => managed.has(r));
        const other = p.roles.filter((r) => !managed.has(r));
        return (
          <Card key={p.id} className={cn(locked && "opacity-60")}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.title || p.email}</span>
                {other.map((r) => (
                  <Badge key={r} variant="outline" className="gap-1">
                    {(r === "admin" || r === "owner") && <ShieldIcon className="size-3" />}
                    {roleLabel(r)}
                  </Badge>
                ))}
                {busy?.startsWith(p.id) && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
                {own && <span className="text-xs text-muted-foreground">Your own roles are changed by Admin.</span>}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => (
                  <fieldset key={g} className="rounded-md border p-2.5" disabled={own || locked || !!busy}>
                    <legend className="px-1 text-[11px] font-medium text-muted-foreground uppercase">{GROUP_LABEL[g] ?? g}</legend>
                    <div className="space-y-1.5">
                      {roles
                        .filter((r) => r.dept === g)
                        .map((r) => (
                          <label key={r.key} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={mine.includes(r.key)}
                              onCheckedChange={(v) => {
                                const next = v ? [...mine, r.key] : mine.filter((x) => x !== r.key);
                                void act(`${p.id}:role`, () => setOpsRolesAction(p.id, next), `${p.name}: ${v ? "given" : "removed"} ${r.label}`);
                              }}
                            />
                            {r.label}
                          </label>
                        ))}
                      {g === "production" &&
                        stages
                          .filter((s) => p.roles.includes(s))
                          .map((s) => (
                            <label key={s} className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                              <Checkbox
                                checked={p.leads.includes(s)}
                                onCheckedChange={(v) => void act(`${p.id}:lead`, () => setOpsStageLeadAction(s, p.id, !!v), `${p.name} ${v ? "now leads" : "no longer leads"} ${STAGE_LABELS[s]}`)}
                              />
                              {STAGE_LABELS[s]} team lead
                            </label>
                          ))}
                      {positionDepts.some((d) => d.key === g) && (
                        <div className="flex items-center gap-2 pt-1 text-xs">
                          <span className="text-muted-foreground">Position</span>
                          <Select
                            value={p.positions[g] ?? "member"}
                            onValueChange={(v) => void act(`${p.id}:pos`, () => setOpsPositionAction(g, p.id, v as Position), `${p.name} is now ${v} in ${GROUP_LABEL[g] ?? g}`)}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs" aria-label={`Position in ${GROUP_LABEL[g] ?? g}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="lead">Lead</SelectItem>
                              <SelectItem value="head" disabled={!canAssignHeads || (g === "operations" && !admin)}>
                                Head
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </fieldset>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!shown.length && <p className="py-8 text-center text-sm text-muted-foreground">Nobody matches.</p>}
    </div>
  );
}
