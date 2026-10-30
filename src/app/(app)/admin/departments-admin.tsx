"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/app/primitives";
import { setPositionAction } from "@/app/actions/departments";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, POSITION_LABELS, POSITIONS, ROLE_LABELS, type Department, type Position, type Role } from "@/lib/domain";

export type DeptRow = { dept: Department; people: { id: string; name: string; roles: Role[]; position: Position }[] };

const SECTION: Partial<Record<Department, string>> = { dev: "/dev", studio: "/studio", marketing: "/marketing" };

export function DepartmentsAdmin({ departments }: { departments: DeptRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A department&apos;s people are those holding its roles (set in People). Heads and leads see and assign all of the department&apos;s work and write its reports for the owners; members see their
        own work. What each position may do, and the statuses, types and fields of Dev and Marketing, are set in each section's Configure tab. Production keeps its stage team leads in Teams; its heads and leads here write the production report.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {departments.map((d) => (
          <Card key={d.dept}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {DEPARTMENT_LABELS[d.dept]}
                {SECTION[d.dept] && (
                  <span className="flex gap-3 text-xs font-normal">
                    {(d.dept === "dev" || d.dept === "marketing") && (
                      <Link href={`${SECTION[d.dept]}?tab=configure`} className="text-primary hover:underline">
                        Configure
                      </Link>
                    )}
                    <Link href={SECTION[d.dept]!} className="text-primary hover:underline">
                      Open section
                    </Link>
                  </span>
                )}
              </CardTitle>
              <CardDescription>Roles: {DEPARTMENT_ROLES[d.dept].map((r) => ROLE_LABELS[r]).join(", ")}</CardDescription>
            </CardHeader>
            <CardContent>
              {d.people.length ? (
                <ul className="divide-y rounded-lg border">
                  {d.people.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                      <UserAvatar name={p.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.roles.map((r) => ROLE_LABELS[r]).join(", ") || "No role in this department"}</span>
                      </span>
                      <Select
                        value={p.position}
                        disabled={busy === `${d.dept}:${p.id}`}
                        onValueChange={async (v) => {
                          setBusy(`${d.dept}:${p.id}`);
                          const r = await setPositionAction(d.dept, p.id, v as Position);
                          setBusy(null);
                          if (!r.ok) return toast.error(r.error);
                          toast.success(`${p.name} is now ${POSITION_LABELS[v as Position].toLowerCase()} of ${DEPARTMENT_LABELS[d.dept]}`);
                          router.refresh();
                        }}
                      >
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
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nobody yet. Give people the {DEPARTMENT_ROLES[d.dept].map((r) => ROLE_LABELS[r]).join(" or ")} role in People.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
