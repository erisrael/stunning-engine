"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, LinkIcon, ShieldCheckIcon, ShieldIcon, UnlinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProviderMark, RecoveryCodes } from "@/components/app/signin-ui";
import {
  beginTotpSetupAction,
  confirmTotpSetupAction,
  forgetTrustedDevicesAction,
  newRecoveryCodesAction,
  turnOffTwoStepAction,
  unlinkIdentityAction,
} from "@/app/actions/signin";
import { SIGNIN_EVENTS, SIGNIN_WARNINGS, type ProviderId } from "@/lib/signin-policy";
import type { MyTwoStep, SignInLogRow } from "@/server/signin";
import { fmtDateTime as formatDateTime } from "@/lib/format";

const LEVEL_TEXT = { off: "Not used for your role.", optional: "Optional for your role. Recommended.", required: "Required for your role." } as const;

export function TwoStepCard({ state }: { state: MyTwoStep }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<{ secret: string; qr: string } | null>(null);
  const [ask, setAsk] = React.useState<null | "off" | "codes">(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const begin = async () => {
    const r = await beginTotpSetupAction();
    if (!r.ok) return void toast.error(r.error);
    setCode("");
    setSetup(r.data!);
  };
  const confirm = async () => {
    setBusy(true);
    const r = await confirmTotpSetupAction(code);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setSetup(null);
    setCodes(r.data!.recoveryCodes);
    router.refresh();
  };
  const withCode = async () => {
    setBusy(true);
    const r = ask === "off" ? await turnOffTwoStepAction(code) : await newRecoveryCodesAction(code);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (ask === "codes" && r.data && "recoveryCodes" in r.data) setCodes(r.data.recoveryCodes);
    else toast.success("Two-step sign-in is off");
    setAsk(null);
    setCode("");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {state.totpOn ? <ShieldCheckIcon className="size-4 text-[var(--st-done-fg)]" /> : <ShieldIcon className="size-4" />} Two-step sign-in
        </CardTitle>
        <CardDescription>
          After your password, a code from an authenticator app on your phone. {LEVEL_TEXT[state.level]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.totpOn ? (
          <>
            <p>
              <Badge variant="secondary" className="mr-2">
                On
              </Badge>
              Since {formatDateTime(state.since!)}. {state.recoveryLeft} recovery {state.recoveryLeft === 1 ? "code" : "codes"} left.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={begin}>
                Move to a new phone
              </Button>
              <Button size="sm" variant="outline" onClick={() => (setCode(""), setAsk("codes"))}>
                New recovery codes
              </Button>
              {state.level !== "required" && (
                <Button size="sm" variant="ghost" onClick={() => (setCode(""), setAsk("off"))}>
                  Turn off
                </Button>
              )}
            </div>
          </>
        ) : state.totpAllowed ? (
          <>
            <p className="text-muted-foreground">
              {state.level === "required"
                ? state.emailAllowed
                  ? "You get a code by email until you set up an app. An app is faster and works without email."
                  : "You will be asked to set it up at your next sign-in, or do it now."
                : "Protects your account even if someone learns your password."}
            </p>
            <Button size="sm" onClick={begin}>
              Set up an authenticator app
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">{state.emailAllowed && state.level !== "off" ? "Codes come by email when needed." : "Admin has not switched on authenticator apps."}</p>
        )}
        {state.trustedDevices > 0 && (
          <p className="text-xs text-muted-foreground">
            {state.trustedDevices} {state.trustedDevices === 1 ? "device does" : "devices do"} not ask for a code for {state.rememberDays} days.{" "}
            <button
              className="text-primary hover:underline"
              onClick={async () => {
                const r = await forgetTrustedDevicesAction();
                if (!r.ok) return void toast.error(r.error);
                toast.success("Every device will ask again");
                router.refresh();
              }}
            >
              Ask on every device again
            </button>
          </p>
        )}
      </CardContent>

      <Dialog open={!!setup} onOpenChange={(o) => !o && setSetup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up your authenticator app</DialogTitle>
            <DialogDescription>Google Authenticator, Microsoft Authenticator or Authy. Add an account in the app and scan this code.</DialogDescription>
          </DialogHeader>
          {setup && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg border bg-white p-1" />
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded border bg-muted/40 px-2 py-1 text-center text-xs break-all" data-testid="setup-key">
                  {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </code>
                <Button size="icon" variant="outline" aria-label="Copy key" onClick={() => navigator.clipboard.writeText(setup.secret).then(() => toast.success("Copied"))}>
                  <CopyIcon />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ts-code">Code the app shows</Label>
                <Input id="ts-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="text-center font-mono tracking-[0.3em]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={confirm} disabled={busy || code.replace(/\s/g, "").length < 6}>
              Turn on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ask === "off" ? "Turn off two-step sign-in" : "Make new recovery codes"}</DialogTitle>
            <DialogDescription>Type the code from your authenticator app (or a recovery code) to confirm it is you.</DialogDescription>
          </DialogHeader>
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={12} className="text-center font-mono tracking-[0.2em]" aria-label="Code" />
          <DialogFooter>
            <Button variant={ask === "off" ? "destructive" : "default"} onClick={withCode} disabled={busy || code.replace(/[\s-]/g, "").length < 6}>
              {ask === "off" ? "Turn off" : "Make new codes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!codes} onOpenChange={(o) => !o && setCodes(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your recovery codes</DialogTitle>
          </DialogHeader>
          {codes && <RecoveryCodes codes={codes} />}
          <DialogFooter>
            <Button onClick={() => setCodes(null)}>I saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function LinkedAccounts({ providers, linked }: { providers: { id: ProviderId; name: string }[]; linked: { provider: ProviderId; email: string | null; created_at: string; last_used_at: string | null }[] }) {
  const router = useRouter();
  if (!providers.length && !linked.length) return null;
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name])) as Record<ProviderId, string>;
  const ids = [...new Set([...providers.map((p) => p.id), ...linked.map((l) => l.provider)])];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in with another account</CardTitle>
        <CardDescription>Link your company Google or Microsoft account to sign in with one click.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {ids.map((id) => {
          const l = linked.find((x) => x.provider === id);
          return (
            <div key={id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <ProviderMark id={id} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{names[id] ?? id}</p>
                <p className="truncate text-xs text-muted-foreground">{l ? `${l.email ?? "Linked"}${l.last_used_at ? `, last used ${formatDateTime(l.last_used_at)}` : ""}` : "Not linked"}</p>
              </div>
              {l ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await unlinkIdentityAction(id);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success("Unlinked");
                    router.refresh();
                  }}
                >
                  <UnlinkIcon /> Unlink
                </Button>
              ) : names[id] ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/auth/oauth/${id}?mode=link`}>
                    <LinkIcon /> Link
                  </a>
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function SignInHistory({ rows, everyone = false }: { rows: SignInLogRow[]; everyone?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            {everyone && <TableHead>Who</TableHead>}
            <TableHead>What</TableHead>
            <TableHead>How</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(r.at)}</TableCell>
              {everyone && <TableCell>{r.userName ?? r.email ?? "Unknown"}</TableCell>}
              <TableCell className={SIGNIN_WARNINGS.includes(r.event) ? "text-destructive" : ""}>
                {SIGNIN_EVENTS[r.event] ?? r.event}
                {r.detail ? <span className="text-xs text-muted-foreground"> ({r.detail})</span> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.method ?? ""}</TableCell>
              <TableCell className="text-muted-foreground">{r.device}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.ip ?? ""}</TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={everyone ? 6 : 5} className="py-6 text-center text-muted-foreground">
                Nothing yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
