"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveHandoverConfigAction } from "@/app/actions/editorial";
import type { HandoverConfig } from "@/server/handover-config";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-96";

export function HandoverSettings({ config }: { config: HandoverConfig }) {
  const router = useRouter();
  const [c, setC] = React.useState(config);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const r = await saveHandoverConfigAction(c);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Handover settings saved");
    router.refresh();
  };
  return (
    <div className="space-y-4" data-handover-settings>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rejections</CardTitle>
          <CardDescription>What happens when a team rejects work it received.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="hc-check" checked={c.crossCheck} onCheckedChange={(v) => setC({ ...c, crossCheck: v })} />
            <Label htmlFor="hc-check">Cross-check a rejection before the work goes back</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hc-checker">Who cross-checks (managers always can)</Label>
            <select id="hc-checker" className={SELECT} disabled={!c.crossCheck} value={c.checker} onChange={(e) => setC({ ...c, checker: e.target.value as HandoverConfig["checker"] })}>
              <option value="sender_lead">The lead of the team whose work was rejected</option>
              <option value="receiver_lead">The lead of the team that rejected it</option>
              <option value="manager">Managers only</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="hc-self" disabled={!c.crossCheck} checked={c.allowSelfCheck} onCheckedChange={(v) => setC({ ...c, allowSelfCheck: v })} />
            <Label htmlFor="hc-self">The person who rejected it may also check it (for very small teams)</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hc-priority">Priority when it goes back to To do</Label>
            <select id="hc-priority" className={SELECT} value={c.rejectedPriority} onChange={(e) => setC({ ...c, rejectedPriority: e.target.value as HandoverConfig["rejectedPriority"] })}>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="keep">Keep its priority</option>
            </select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking a studio</CardTitle>
          <CardDescription>Whether Recording books a studio session for a part.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Label htmlFor="hc-studio">Studio booking</Label>
          <select id="hc-studio" className={SELECT} value={c.studioBooking} onChange={(e) => setC({ ...c, studioBooking: e.target.value as HandoverConfig["studioBooking"] })}>
            <option value="optional">Optional: a part can be recorded with or without a session</option>
            <option value="required">Required: a part needs a session before recording starts</option>
            <option value="off">Off: hide Studio sessions</option>
          </select>
        </CardContent>
      </Card>
      <Button size="sm" disabled={busy} onClick={save}>
        {busy && <Loader2Icon className="animate-spin" />} Save settings
      </Button>
    </div>
  );
}
