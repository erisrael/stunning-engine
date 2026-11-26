"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { savePeopleOpsConfigAction } from "@/app/actions/people-ops";
import type { PeopleOpsConfig, OpsDept } from "@/server/people-ops";

export function OperationsAuthorityAdmin({ initial, departments, heads }: { initial: PeopleOpsConfig; departments: { key: OpsDept; label: string }[]; heads: { id: string; name: string; position: string }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const toggle = (d: OpsDept, on: boolean) => setC({ ...c, departments: on ? [...c.departments, d] : c.departments.filter((x) => x !== d) });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Operations authority</CardTitle>
        <CardDescription>
          The Operations head manages the people of the departments ticked here: gives and takes their roles, names leads and production team leads, and (if you
          allow it) names heads. Admin and Owner accounts and roles are never managed from People operations. Name the Operations head in{" "}
          <Link className="underline" href="/admin?tab=departments">
            Departments
          </Link>
          , Operations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} />
          Operations manages people
        </label>
        <fieldset disabled={!c.enabled} className="space-y-5 disabled:opacity-50">
          <div className="space-y-2">
            <p className="text-sm font-medium">Departments Operations manages</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <label key={d.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={c.departments.includes(d.key)} onCheckedChange={(v) => toggle(d.key, !!v)} />
                  {d.label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={c.chiefs} onCheckedChange={(v) => setC({ ...c, chiefs: !!v })} />
                Chief officers (CEO, CFO, CTO, CEDO)
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Who in Operations may do it</p>
            <RadioGroup value={c.who} onValueChange={(v) => setC({ ...c, who: v as PeopleOpsConfig["who"] })}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="head" id="ops-who-head" />
                <Label htmlFor="ops-who-head">The Operations head only</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="head_and_leads" id="ops-who-leads" />
                <Label htmlFor="ops-who-leads">The head and Operations leads</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Anyone whose role has &ldquo;People operations&rdquo; ticked in Roles &amp; permissions may also do it.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={c.assignHeads} onCheckedChange={(v) => setC({ ...c, assignHeads: !!v })} />
            <span>
              The Operations head may also name department heads
              <span className="block text-xs text-muted-foreground">Off: they name leads and members; heads stay Admin&apos;s choice. The Operations head itself is always named by Admin.</span>
            </span>
          </label>
        </fieldset>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Operations heads and leads now</p>
          <p className="text-muted-foreground">{heads.length ? heads.map((h) => `${h.name} (${h.position})`).join(", ") : "Nobody yet. Give someone the Operations role, then make them Head in Departments."}</p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await savePeopleOpsConfigAction(c);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Operations authority saved");
              router.refresh();
            }}
          >
            Save
          </Button>
          <Button variant="outline" asChild>
            <Link href="/operations/people">Open People operations</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
