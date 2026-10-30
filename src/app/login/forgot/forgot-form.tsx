"use client";

import { useActionState } from "react";
import { LoaderIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { forgotPasswordAction } from "@/app/actions/auth";

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
  </svg>
);

export function ForgotForm({ google, error }: { google: boolean; error: string | null }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {google && (
        <>
          <Button asChild variant="outline" className="h-11 w-full gap-2 rounded-lg">
            <a href="/api/auth/google">
              <GoogleMark /> Reset with Google (Gmail)
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">Choose the Google account with the same email you sign in with.</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      {state?.sent ? (
        <Alert>
          <MailIcon className="size-4" />
          <AlertDescription>If that email has an account, a link to choose a new password is on its way. It works for 30 minutes. Check spam too.</AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email
            </Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 rounded-lg" placeholder="you@myseed.com.et" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="h-11 w-full rounded-lg" disabled={pending}>
            {pending && <LoaderIcon className="animate-spin" />} Email me a link
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <a href="/login" className="text-primary hover:underline">
          Back to sign in
        </a>
      </p>
    </div>
  );
}
