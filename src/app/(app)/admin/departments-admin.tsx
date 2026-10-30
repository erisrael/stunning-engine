"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/app/primitives";
import { archiveDepartmentAction, createDepartmentAction, setPositionAction } from "@/app/actions/departments";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, POSITION_LABELS, POSITIONS, ROLE_LABELS, type Department, type Position, type Role } from "@/lib/domain";
import { DEPT_TEMPLATES } from "@/lib/dept-config";
import { deptPath } from "@/lib/work";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; roles: Role[]; position: Position };
export type DeptRow = { dept: Department; people: Person[] };
export type CustomRow = { key: string; title: string; template: string; archived: boolean; people: Person[] };

const SECTION: Partial<Record<Department, string>> = { dev: "/dev", studio: "/studio", marketing: "/marketing" };

export function DepartmentsAdmin({ departments, custom = [], everyone = [] }: { departments: DeptRow[]; custom?: CustomRow[]; everyone?: { id: string; name: string }[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A built-in department&apos;s people are those holding its roles (set in People). Departments you create here have no role: add their people below. Heads and leads see and assign all
        of the department&apos;s work and write its reports for the owners; members see their own work. What each position may do, and each department&apos;s statuses, types and fields, are
        set in its Configure tab. Production keeps its stage team leads in Teams.
      </p>
      <NewDepartment />
      <div className="grid gap-4 lg:grid-cols-2">
        {departments.map((d) => (
          <DeptCard
            key={d.dept}
            dept={d.dept}
            title={DEPARTMENT_LABELS[d.dept]}
            subtitle={`Roles: ${DEPARTMENT_ROLES[d.dept].map((r) => ROLE_LABELS[r]).join(", ")}`}
            href={SECTION[d.dept]}
            configure={d.dept === "dev" || d.dept === "marketing"}
            people={d.people}
            empty={`Nobody yet. Give people the ${DEPARTMENT_ROLES[d.dept].map((r) => ROLE_LABELS[r]).join(" or ")} role in People.`}
          />
        ))}
        {custom.map((d) => (
          <DeptCard
            key={d.key}
            dept={d.key}
            title={d.title}
            subtitle={`${DEPT_TEMPLATES.find((t) => t.key === d.template)?.label ?? d.template} template · ${deptPath(d.key)}${d.archived ? " · archived" : ""}`}
            href={d.archived ? undefined : deptPath(d.key)}
            configure={!d.archived}
            people={d.people}
            custom
            archived={d.archived}
            everyone={everyone}
            empty="Nobody yet. Add people below."
          />
        ))}
      </div>
    </div>
  );
}

function NewDepartment() {
  const router = useRouter();
  const [f, setF] = React.useState({ title: "", key: "", template: "support" });
  const [keyEdited, setKeyEdited] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const slug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New department</CardTitle>
        <CardDescription>Starts from a template with its statuses, types, fields and rules; everything can be changed afterwards in its Configure tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="dept-title">Name</Label>
            <Input id="dept-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value, key: keyEdited ? f.key : slug(e.target.value) })} placeholder="Customer support" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-key">Short name (in the address)</Label>
            <Input id="dept-key" value={f.key} onChange={(e) => (setKeyEdited(true), setF({ ...f, key: slug(e.target.value) }))} placeholder="support" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={f.template === t.key}
              onClick={() => setF({ ...f, template: t.key })}
              className={cn("rounded-lg border p-3 text-left text-sm transition-colors", f.template === t.key ? "border-primary bg-primary/5" : "hover:bg-muted")}
            >
              <span className="block font-medium">{t.label}</span>
              <span className="block text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
        <Button
          disabled={busy || !f.title.trim() || !f.key}
          onClick={async () => {
            setBusy(true);
            const r = await createDepartmentAction(f);
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(`${f.title} created. Add its people below.`);
            setF({ title: "", key: "", template: "support" });
            setKeyEdited(false);
            router.refresh();
          }}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Create department
        </Button>
      </CardContent>
    </Card>
  );
}

function DeptCard({
  dept,
  title,
  subtitle,
  href,
  configure,
  people,
  empty,
  custom,
  archived,
  everyone = [],
}: {
  dept: string;
  title: string;
  subtitle: string;
  href?: string;
  configure: boolean;
  people: Person[];
  empty: string;
  custom?: boolean;
  archived?: boolean;
  everyone?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState<{ id: string; position: Position }>({ id: "", position: "member" });
  const set = async (userId: string, name: string, v: Position | "remove") => {
    setBusy(`${dept}:${userId}`);
    const r = await setPositionAction(dept, userId, v);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(v === "remove" ? `${name} removed from ${title}` : `${name} is now ${POSITION_LABELS[v].toLowerCase()} of ${title}`);
    router.refresh();
  };
  const outside = everyone.filter((p) => !people.some((x) => x.id === p.id));
  return (
    <Card className={cn(archived && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {title}
          <span className="flex gap-3 text-xs font-normal">
            {configure && href && (
              <Link href={`${href}?tab=configure`} className="text-primary hover:underline">
                Configure
              </Link>
            )}
            {href && (
              <Link href={href} className="text-primary hover:underline">
                Open section
              </Link>
            )}
            {custom && (
              <button
                type="button"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  if (!archived && !window.confirm(`Archive ${title}? Its section is hidden; its work and reports are kept and it can be restored.`)) return;
                  const r = await archiveDepartmentAction(dept, !archived);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                {archived ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />} {archived ? "Restore" : "Archive"}
              </button>
            )}
          </span>
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {people.length ? (
          <ul className="divide-y rounded-lg border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                <UserAvatar name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{custom ? POSITION_LABELS[p.position] : p.roles.map((r) => ROLE_LABELS[r]).join(", ") || "No role in this department"}</span>
                </span>
                <Select value={p.position} disabled={busy === `${dept}:${p.id}`} onValueChange={(v) => set(p.id, p.name, v as Position)}>
                  <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label={`Position of ${p.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {POSITION_LABELS[pos]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {custom && (
                  <Button size="icon-xs" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => set(p.id, p.name, "remove")}>
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
        {custom && !archived && (
          <div className="flex flex-wrap gap-2">
            <Select value={adding.id || "none"} onValueChange={(v) => setAdding({ ...adding, id: v === "none" ? "" : v })}>
              <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label={`Add a person to ${title}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Add a person…</SelectItem>
                {outside.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={adding.position} onValueChange={(v) => setAdding({ ...adding, position: v as Position })}>
              <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="As">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {POSITION_LABELS[pos]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!adding.id}
              onClick={async () => {
                const p = everyone.find((x) => x.id === adding.id);
                await set(adding.id, p?.name ?? "Person", adding.position);
                setAdding({ id: "", position: "member" });
              }}
            >
              <PlusIcon /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
