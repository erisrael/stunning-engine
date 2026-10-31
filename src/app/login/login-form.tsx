"use client";

import { startTransition, useActionState, useState } from "react";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction } from "@/app/actions/auth";
import { rememberLogin } from "@/lib/e2e";
import { OrLine, ProviderButtons } from "@/components/app/signin-ui";
import type { ProviderId, SignupMode } from "@/lib/signin-policy";

export function LoginForm({
  next,
  providers = [],
  signup = "off",
  message = null,
}: {
  next?: string;
  providers?: { id: ProviderId; name: string }[];
  signup?: SignupMode;
  message?: { ok: boolean; text: string } | null;
}) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-5">
      {message && (
        <Alert variant={message.ok ? "default" : "destructive"} className="py-2">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      {providers.length > 0 && (
        <>
          <ProviderButtons providers={providers} next={next} />
          <OrLine />
        </>
      )}
      <form
        action={async (fd: FormData) => {
          // Prepares secure chat on this device from the password (only a derived key is kept, never the password).
          await rememberLogin(String(fd.get("email") ?? ""), String(fd.get("password") ?? "")).catch(() => undefined);
          startTransition(() => action(fd));
        }}
        className="space-y-4"
      >
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-semibold">
              Password
            </Label>
            <a href="/login/forgot" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        {state?.error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="h-11 w-full rounded-lg text-sm font-semibold" disabled={pending}>
          {pending ? (
            <>
              <LoaderIcon className="animate-spin" /> Signing in
            </>
          ) : (
            "Log in"
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Forgot your password?{" "}
          <a href="/login/forgot" className="font-medium text-primary hover:underline">
            Reset it with Gmail or an email link
          </a>
          .
        </p>
      </form>
      {signup === "domain" && (
        <p className="text-center text-xs text-muted-foreground">
          New here?{" "}
          <a href="/signup" className="font-medium text-primary hover:underline">
            Ask for an account
          </a>
        </p>
      )}
    </div>
  );
}
