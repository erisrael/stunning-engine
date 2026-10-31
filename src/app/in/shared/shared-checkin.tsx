"use client";

import * as React from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sharedCheckinAction, sharedLookupAction } from "@/app/actions/attendance-capture";
import { ACTION_LABELS, STATE_LABELS, type CheckinState, type EventKind } from "@/lib/attendance";

export function SharedCheckin() {
  const [code, setCode] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [who, setWho] = React.useState<{ name: string; state: CheckinState; actions: EventKind[] } | null>(null);
  const [done, setDone] = React.useState<{ name: string; kind: EventKind; at: string; lateMin: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const reset = () => (setWho(null), setCode(""), setPin(""), setError(null));

  // Nobody else's details stay on screen: the form clears itself after a short while.
  React.useEffect(() => {
    if (!who && !done) return;
    const t = setTimeout(() => (setDone(null), reset()), done ? 6000 : 45_000);
    return () => clearTimeout(t);
  }, [who, done]);

  if (done)
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center" role="status" data-testid="shared-done">
        <CheckCircle2Icon className="size-14 text-[var(--st-done-fg)]" />
        <p className="text-xl font-bold">
          {done.name}: {ACTION_LABELS[done.kind].done}
        </p>
        <p className="text-3xl font-bold tabular-nums">{new Date(done.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        {done.kind === "in" && done.lateMin > 0 && <p className="text-[var(--st-paused-fg)]">{done.lateMin} minutes late</p>}
      </div>
    );

  if (who)
    return (
      <div className="space-y-3 text-center">
        <p className="text-lg">
          {who.name}, {STATE_LABELS[who.state].toLowerCase()}
        </p>
        <div className="grid gap-2">
          {who.actions.map((k) => (
            <Button
              key={k}
              size="lg"
              className="h-14 text-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await sharedCheckinAction({ code, pin, kind: k });
                setBusy(false);
                if (!r.ok) return setError(r.error);
                setDone({ name: r.data!.name, kind: k, at: r.data!.at, lateMin: r.data!.lateMin });
              }}
            >
              {ACTION_LABELS[k].button}
            </Button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button className="text-sm text-muted-foreground hover:underline" onClick={reset}>
          Not you? Start again
        </button>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await sharedLookupAction({ code, pin });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setWho(r.data!);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="sh-code">Your employee number</Label>
        <Input id="sh-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="off" required className="h-12 text-center text-lg" placeholder="12" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sh-pin">PIN</Label>
        <Input id="sh-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="off" required className="h-12 text-center text-lg tracking-widest" />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
        Continue
      </Button>
      <p className="text-center text-xs text-muted-foreground">No PIN yet? Set one in the app under Attendance, or ask HR.</p>
    </form>
  );
}
