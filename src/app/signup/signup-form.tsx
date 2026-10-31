"use client";

import * as React from "react";
import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OrLine, ProviderButtons } from "@/components/app/signin-ui";
import { requestSignUpAction, signUpWithInviteAction } from "@/app/actions/signin";
import type { ProviderId } from "@/lib/signin-policy";

export function SignupForm({ mode, token, email: fixed = null, providers = [] }: { mode: "invite" | "request"; token?: string; email?: string | null; providers?: { id: ProviderId; name: string }[] }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState(fixed ?? "");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords are different.");
    setBusy(true);
    setError(null);
    if (mode === "invite") {
      const r = await signUpWithInviteAction({ token: token!, name, email, password });
      if (!r.ok) return (setBusy(false), setError(r.error));
      window.location.href = r.data?.next ?? "/dashboard";
      return;
    }
    const r = await requestSignUpAction({ name, email, password });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRequested(true);
  };

  if (requested)
    return (
      <Alert>
        <CheckCircle2Icon className="size-4" />
        <AlertDescription>Thanks. Your request went to the administrator. You will get an email at {email} when your account is ready.</AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-5">
      {providers.length > 0 && (
        <>
          <ProviderButtons providers={providers} />
          <OrLine />
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-semibold">
            Full name
          </Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus className="h-11 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold">
            Email
          </Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!fixed} autoComplete="email" required className="h-11 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-semibold">
            Password
          </Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required className="h-11 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-xs font-semibold">
            Password again
          </Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required className="h-11 rounded-lg" />
        </div>
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="h-11 w-full rounded-lg text-sm font-semibold" disabled={busy}>
          {busy && <LoaderIcon className="animate-spin" />} {mode === "invite" ? "Create my account" : "Ask for an account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </a>
        </p>
      </form>
    </div>
  );
}
