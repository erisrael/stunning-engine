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
import { type Role } from "@/lib/domain";
import { sidebarHidden } from "@/lib/sidebar-visibility";

// Admin chooses what each role's sidebar shows by default; people can hide more for themselves.
export function SidebarAdmin({ defaults, roles, departments = [] }: { defaults: Partial<Record<Role, string[]>>; roles:{key:Role;label:string}[]; departments:{key:string;title:string}[] }) {
  const router = useRouter();
  const [role, setRole] = React.useState<Role>("editing");
  const [hidden, setHidden] = React.useState<string[]>(defaults[role] ?? []);
  const [saving, setSaving] = React.useState(false);
  const label = roles.find(r=>r.key===role)?.label ?? role;
  React.useEffect(() => setHidden(defaults[role] ?? []), [role, defaults]);
  const entries = [...SIDEBAR_ENTRIES, ...departments.map(d=>({key:`/d/${d.key}`,label:d.title,group:"Custom departments"}))];
  const groups = [...new Set(entries.map((e) => e.group))];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sidebar per role</CardTitle>
        <CardDescription>Untick entries a role should not see in its sidebar. Permissions still decide what each role can open; this only tidies the sidebar. People can hide more for themselves with the gear at the bottom of their sidebar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Select value={role} disabled={saving} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-60" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map(({key:r,label}) => (
              <SelectItem key={r} value={r}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <div key={g} className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
              {entries.filter((e) => e.group === g).map((e) => (
                <label key={e.key} className="flex items-center gap-2">
                  <Checkbox disabled={saving || sidebarHidden(e.key, hidden.filter(key=>key!==e.key))} checked={!sidebarHidden(e.key, hidden)} onCheckedChange={(v) => setHidden(v === true ? hidden.filter((x) => x !== e.key) : [...hidden, e.key])} /> {e.label}
                </label>
              ))}
            </div>
          ))}
        </div>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
            const r = await saveSidebarDefaultsAction(role, hidden);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Sidebar saved for ${label}`);
            router.refresh();
            } finally { setSaving(false); }
          }}
        >
          {saving ? "Saving…" : `Save for ${label}`}
        </Button>
      </CardContent>
    </Card>
  );
}
