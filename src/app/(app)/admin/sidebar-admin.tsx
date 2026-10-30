"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveSidebarDefaultsAction } from "@/app/actions/integrations";
import { SIDEBAR_ENTRIES } from "@/lib/nav";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain";

// Admin chooses what each role's sidebar shows by default; people can hide more for themselves.
export function SidebarAdmin({ defaults }: { defaults: Partial<Record<Role, string[]>> }) {
  const router = useRouter();
  const [role, setRole] = React.useState<Role>("editing");
  const [hidden, setHidden] = React.useState<string[]>(defaults[role] ?? []);
  React.useEffect(() => setHidden(defaults[role] ?? []), [role, defaults]);
  const groups = [...new Set(SIDEBAR_ENTRIES.map((e) => e.group))];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sidebar per role</CardTitle>
        <CardDescription>Untick entries a role should not see in its sidebar. Permissions still decide what each role can open; this only tidies the sidebar. People can hide more for themselves with the gear at the bottom of their sidebar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-60" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <div key={g} className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
              {SIDEBAR_ENTRIES.filter((e) => e.group === g).map((e) => (
                <label key={e.key} className="flex items-center gap-2">
                  <Checkbox checked={!hidden.includes(e.key)} onCheckedChange={(v) => setHidden(v === true ? hidden.filter((x) => x !== e.key) : [...hidden, e.key])} /> {e.label}
                </label>
              ))}
            </div>
          ))}
        </div>
        <Button
          onClick={async () => {
            const r = await saveSidebarDefaultsAction(role, hidden);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Sidebar saved for ${ROLE_LABELS[role]}`);
            router.refresh();
          }}
        >
          Save for {ROLE_LABELS[role]}
        </Button>
      </CardContent>
    </Card>
  );
}
