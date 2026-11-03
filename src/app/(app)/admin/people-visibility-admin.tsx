"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { savePeopleVisibilityAction } from "@/app/actions/profile";
import type { PeopleVisibility } from "@/server/profiles";
import { cn } from "@/lib/utils";

// Admin, People: who regular members see in People and on profiles.
export function PeopleVisibilityAdmin({ config, roles }: { config: PeopleVisibility; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const [busy, setBusy] = React.useState(false);
  const flip = (k: "hiddenRoles" | "seeAllRoles", r: string) => setC({ ...c, [k]: c[k].includes(r) ? c[k].filter((x) => x !== r) : [...c[k], r] });
  const chips = (k: "hiddenRoles" | "seeAllRoles", tone: string) => (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <button key={r.key} type="button" aria-pressed={c[k].includes(r.key)} onClick={() => flip(k, r.key)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", c[k].includes(r.key) ? tone : "hover:bg-muted")} data-role-chip={`${k}:${r.key}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
  return (
    <Card data-people-visibility>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <EyeOffIcon className="size-4" /> Who regular members see in People
        </CardTitle>
        <CardDescription>A regular member has none of the roles that see everyone and leads nobody. With this on, they see other regular members only, in People and on profiles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="pv-on" checked={c.enabled} onCheckedChange={(enabled) => setC({ ...c, enabled })} />
          <Label htmlFor="pv-on">Regular members see other regular members only</Label>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Hidden from regular members</p>
          {chips("hiddenRoles", "border-destructive/50 bg-destructive/10 text-destructive")}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Switch id="pv-leads" checked={c.hideLeads} onCheckedChange={(hideLeads) => setC({ ...c, hideLeads })} />
            <Label htmlFor="pv-leads">Also hide team leads and department heads</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pv-own" checked={c.showOwnLeads} onCheckedChange={(showOwnLeads) => setC({ ...c, showOwnLeads })} />
            <Label htmlFor="pv-own">But members still see their own lead and line manager</Label>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">These roles see everyone</p>
          {chips("seeAllRoles", "border-primary bg-primary text-primary-foreground")}
          <p className="text-xs text-muted-foreground">Leads and Admin always see everyone.</p>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await savePeopleVisibilityAction(c);
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Saved");
            router.refresh();
          }}
        >
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}
