"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveGeofenceConfigAction } from "@/app/actions/geofence";
import type { GeofenceConfig, GeofenceMode } from "@/server/geofence";

const MODES: { value: GeofenceMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "notify", label: "Only tell the person they left" },
  { value: "break", label: "Tell them, then start a break" },
  { value: "checkout", label: "Tell them, then check them out" },
  { value: "break_then_checkout", label: "Tell them, start a break, and check them out later" },
];

// Admin: what happens when someone who is checked in leaves the site.
export function GeofenceAdmin({ config, sites }: { config: GeofenceConfig; sites: { id: string; name: string; located: boolean }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const [busy, setBusy] = React.useState(false);
  const num = (k: keyof GeofenceConfig, label: string, hint: string) => (
    <div className="space-y-1">
      <Label htmlFor={`gf-${k}`}>{label}</Label>
      <Input id={`gf-${k}`} type="number" className="w-28" value={String(c[k])} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  const located = sites.filter((s) => s.located);
  return (
    <Card data-geofence-admin>
      <CardHeader>
        <CardTitle>Leaving the site</CardTitle>
        <CardDescription>
          While someone is checked in, their phone reports where it is. When it is outside the site&apos;s area twice in a row they are told at once; if they stay away past the grace time the app acts.
          Each person agrees once on their phone. It works while the app is open (phones stop web apps in the background), and someone whose last reading was outside is dealt with by the regular checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!located.length && <p className="text-[var(--st-paused-fg)]">Give a site its latitude and longitude above first.</p>}
        <div className="space-y-1">
          <Label htmlFor="gf-mode">When someone leaves</Label>
          <select id="gf-mode" className="h-9 w-full rounded-md border bg-background px-2 sm:w-96" value={c.mode} onChange={(e) => setC({ ...c, mode: e.target.value as GeofenceMode })}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {c.mode !== "off" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {c.mode !== "notify" && num("graceMin", "Grace minutes", "Away this long before the app acts.")}
              {c.mode === "break_then_checkout" && num("checkoutAfterMin", "Check out after (minutes)", "A break this long becomes a check-out.")}
              {num("marginM", "Margin (metres)", "Beyond the site's area, for GPS drift.")}
              {num("maxAccuracyM", "Ignore readings worse than (m)", "Weak readings are not used.")}
              {num("intervalSec", "Report every (seconds)", "More often uses more battery.")}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="gf-return" checked={c.returnEndsBreak} onCheckedChange={(v) => setC({ ...c, returnEndsBreak: v })} />
              <Label htmlFor="gf-return">Coming back ends a break the app started</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="gf-flag" checked={c.flagForHr} onCheckedChange={(v) => setC({ ...c, flagForHr: v })} />
              <Label htmlFor="gf-flag">HR reviews automatic check-outs and breaks</Label>
            </div>
            {located.length > 1 && (
              <fieldset className="space-y-1">
                <legend className="font-medium">Sites (none ticked: all)</legend>
                {located.map((s) => (
                  <label key={s.id} className="mr-3 inline-flex items-center gap-1.5">
                    <Checkbox checked={c.siteIds.includes(s.id)} onCheckedChange={(v) => setC({ ...c, siteIds: v ? [...c.siteIds, s.id] : c.siteIds.filter((x) => x !== s.id) })} /> {s.name}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveGeofenceConfigAction(c);
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
