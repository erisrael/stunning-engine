"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTurnAction, testTurnAction } from "@/app/actions/calls";
import type { TurnSettings } from "@/server/calls";

export function CallSettings({ turn, secretSource }: { turn: TurnSettings; secretSource: string }) {
  const router = useRouter();
  const fromEnv = turn.source === "env";
  const [keyId, setKeyId] = React.useState(turn.keyId);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Call relay (Cloudflare TURN)</CardTitle>
          <CardDescription>
            Calls connect directly between the two devices when the network allows it. Some networks, often mobile data and office firewalls, block that; those calls go through a relay.
            Cloudflare&apos;s relay is free for the first 1,000 GB a month. Calls stay encrypted end to end through the relay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="list-decimal space-y-1 rounded-lg border bg-muted/40 py-2 pr-3 pl-8 text-xs text-muted-foreground">
            <li>Sign in to dash.cloudflare.com (a free account is enough).</li>
            <li>Open Realtime, then TURN Server, and create a TURN key.</li>
            <li>Copy the key ID and the API token (the token is shown once), paste them here and save.</li>
            <li>Run Test relay.</li>
          </ol>
          {fromEnv ? (
            <p className="text-sm text-muted-foreground">Set in the hosting environment variables (CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN). Change it there.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>TURN key ID</Label>
                <Input value={keyId} onChange={(e) => setKeyId(e.target.value.trim())} placeholder="e.g. 6f1c0d…" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>API token</Label>
                <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={turn.hasToken ? "Saved; type to replace" : ""} autoComplete="new-password" />
              </div>
              <p className="text-xs text-muted-foreground">
                The token is stored encrypted{secretSource === "APP_SECRET" ? " with the key in APP_SECRET" : ""}. It never reaches the browser; each call gets short-lived relay credentials.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!fromEnv && (
              <Button
                disabled={!!busy}
                onClick={async () => {
                  setBusy("save");
                  const r = await saveTurnAction({ keyId, token: token || null });
                  setBusy(null);
                  if (!r.ok) return toast.error(r.error);
                  setToken("");
                  toast.success("Call relay saved");
                  router.refresh();
                }}
              >
                {busy === "save" && <Loader2Icon className="animate-spin" />} Save
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!!busy || turn.source === "none"}
              onClick={async () => {
                setBusy("test");
                const r = await testTurnAction();
                setBusy(null);
                if (!r.ok) return toast.error(r.error, { duration: 10000 });
                toast.success(`Relay working (${r.data} relay server${r.data === 1 ? "" : "s"})`);
              }}
            >
              {busy === "test" ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />} Test relay
            </Button>
            {!fromEnv && turn.source === "app" && (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={!!busy}
                onClick={async () => {
                  if (!window.confirm("Remove the call relay? Calls on networks that block direct connections will fail.")) return;
                  const r = await saveTurnAction({ keyId: "", clear: true });
                  if (!r.ok) return toast.error(r.error);
                  setKeyId("");
                  router.refresh();
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How calls work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Voice and video calls start from the phone and camera buttons in a direct chat.</p>
          <p>
            <span className="font-medium text-foreground">Ringing:</span> the other person&apos;s open app shows the incoming call with a ringtone. A closed app or phone gets a notification with Answer and
            Decline, if they turned on notifications. No answer after 45 seconds is a missed call.
          </p>
          <p>
            <span className="font-medium text-foreground">Ending:</span> hanging up ends the call for both. A closed tab or lost connection ends it within about 15 seconds. Each call is recorded in the chat
            with its length.
          </p>
          <p>
            <span className="font-medium text-foreground">Groups:</span> use the Jitsi or Google Meet link from the call button in a group.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
