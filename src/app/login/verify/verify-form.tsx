"use client";

import * as React from "react";
import { toast } from "sonner";
import { CopyIcon, LoaderIcon, MailIcon, ShieldCheckIcon, SmartphoneIcon, TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RecoveryCodes } from "@/components/app/signin-ui";
import { cancelTwoStepAction, finishTwoStepSetupAction, sendTwoStepEmailAction, verifyTwoStepAction } from "@/app/actions/signin";
import type { ChallengeInfo } from "@/server/signin";

type Kind = "totp" | "email" | "recovery";

export function VerifyForm({ info }: { info: ChallengeInfo }) {
  const [kind, setKind] = React.useState<Kind>(info.totp ? "totp" : info.emailCode ? "email" : "recovery");
  const [code, setCode] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(info.emailSent);
  const [done, setDone] = React.useState<{ codes: string[] } | null>(null);

  const finish = async () => {
    setBusy(true);
    const r = await finishTwoStepSetupAction();
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error);
      if (/Sign in again/.test(r.error)) setTimeout(() => (window.location.href = "/login"), 1500);
      return;
    }
    window.location.href = r.data?.next ?? "/dashboard";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await verifyTwoStepAction({ kind: info.mode === "setup" ? "totp" : kind, code, remember });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (/Sign in again/.test(r.error)) setTimeout(() => (window.location.href = "/login"), 1500);
      return;
    }
    if (r.data?.recoveryCodes) return setDone({ codes: r.data.recoveryCodes });
    window.location.href = r.data?.next ?? "/dashboard";
  };

  const sendEmail = async () => {
    setBusy(true);
    const r = await sendTwoStepEmailAction();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setSent(true);
    toast.success("Code sent. Check your email (and spam).");
  };

  // Reloaded after the setup: the codes cannot be shown again (only their scrambled form is kept).
  if (info.mode === "done" && !done)
    return (
      <div className="space-y-4">
        <Alert>
          <ShieldCheckIcon className="size-4" />
          <AlertDescription>Two-step sign-in is on. If you did not save your recovery codes, make new ones on Profile, Account.</AlertDescription>
        </Alert>
        <Button className="h-11 w-full rounded-lg" onClick={finish} disabled={busy}>
          Continue
        </Button>
      </div>
    );

  if (done)
    return (
      <div className="space-y-4">
        <Alert>
          <ShieldCheckIcon className="size-4" />
          <AlertDescription>Two-step sign-in is on. Next time, after your password, type the code from your authenticator app.</AlertDescription>
        </Alert>
        <RecoveryCodes codes={done.codes} />
        <Button className="h-11 w-full rounded-lg" onClick={finish} disabled={busy}>
          I saved them, continue
        </Button>
      </div>
    );

  const codeField = (label: string, placeholder: string, recovery = false) => (
    <div className="space-y-1.5">
      <Label htmlFor="code" className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id="code"
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode={recovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={recovery ? 12 : 7}
        placeholder={placeholder}
        className="h-11 rounded-lg text-center font-mono text-lg tracking-[0.3em]"
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {info.mode === "setup" && info.setup ? (
        <ol className="space-y-4 text-sm">
          <li>
            <b>1.</b> Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or Authy (free).
          </li>
          <li className="space-y-2">
            <p>
              <b>2.</b> In the app, add an account and scan this code.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.setup.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg border bg-white p-1" />
            <p className="text-xs text-muted-foreground">Cannot scan? Choose &quot;Enter a setup key&quot; in the app and type:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted/40 px-2 py-1 text-center text-xs break-all" data-testid="setup-key">
                {info.setup.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
              <Button type="button" size="icon" variant="outline" aria-label="Copy key" onClick={() => navigator.clipboard.writeText(info.setup!.secret).then(() => toast.success("Copied"))}>
                <CopyIcon />
              </Button>
            </div>
          </li>
          <li className="space-y-2">
            <p>
              <b>3.</b> Type the six-digit code the app shows.
            </p>
            {codeField("Code from the app", "123 456")}
          </li>
        </ol>
      ) : (
        <>
          {(info.totp ? 1 : 0) + (info.emailCode ? 1 : 0) + (info.recovery ? 1 : 0) > 1 && (
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs" role="tablist">
              {(
                [
                  ["totp", info.totp, "App", SmartphoneIcon],
                  ["email", info.emailCode, "Email", MailIcon],
                  ["recovery", info.recovery, "Recovery code", TicketIcon],
                ] as const
              )
                .filter(([, on]) => on)
                .map(([k, , label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    onClick={() => (setKind(k), setCode(""), setError(null))}
                    className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium ${kind === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
            </div>
          )}
          {kind === "totp" && codeField("Code from your authenticator app", "123 456")}
          {kind === "email" &&
            (sent ? (
              <>
                {codeField(`Code we emailed to ${info.email}`, "123 456")}
                <button type="button" className="text-xs text-primary hover:underline" onClick={sendEmail} disabled={busy}>
                  Send a new code
                </button>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">We will email a six-digit code to {info.email}.</p>
                <Button type="button" variant="outline" className="h-11 w-full rounded-lg" onClick={sendEmail} disabled={busy}>
                  {busy ? <LoaderIcon className="animate-spin" /> : <MailIcon />} Email me a code
                </Button>
              </div>
            ))}
          {kind === "recovery" && codeField("One of your recovery codes", "abcde-12345", true)}
        </>
      )}
      {info.rememberDays > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          Do not ask again on this device for {info.rememberDays} days
        </label>
      )}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(kind !== "email" || sent || info.mode === "setup") && (
        <Button type="submit" className="h-11 w-full rounded-lg text-sm font-semibold" disabled={busy || code.replace(/\s/g, "").length < 6}>
          {busy && <LoaderIcon className="animate-spin" />} {info.mode === "setup" ? "Turn on and continue" : "Verify"}
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {info.mode === "verify" && !info.totp && !info.emailCode && !info.recovery ? "No way to verify is available. Ask your administrator. " : ""}
        Lost your phone and codes? Ask your administrator to reset two-step sign-in.{" "}
        <button type="button" className="font-medium text-primary hover:underline" onClick={async () => (await cancelTwoStepAction(), (window.location.href = "/login"))}>
          Use another account
        </button>
      </p>
    </form>
  );
}
