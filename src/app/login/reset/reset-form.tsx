"use client";

import { useActionState } from "react";
import { LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/app/actions/auth";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold">
          New password
        </Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="h-11 rounded-lg" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-xs font-semibold">
          The same again
        </Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-11 rounded-lg" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <p className="text-xs text-muted-foreground">You are signed out everywhere else. Encrypted chat messages from before stay readable on devices where you were already signed in.</p>
      <Button type="submit" className="h-11 w-full rounded-lg" disabled={pending}>
        {pending && <LoaderIcon className="animate-spin" />} Save and sign in
      </Button>
    </form>
  );
}
