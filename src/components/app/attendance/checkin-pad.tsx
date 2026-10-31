"use client";

import * as React from "react";
import { CheckCircle2Icon, CoffeeIcon, LogInIcon, LogOutIcon, MapPinIcon, UtensilsIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkinViewAction, selfCheckinAction } from "@/app/actions/attendance-capture";
import { ACTION_LABELS, STATE_LABELS, type EventKind } from "@/lib/attendance";
import type { CheckinView } from "@/server/attendance-capture";

const ICONS: Record<EventKind, React.ElementType> = { in: LogInIcon, out: LogOutIcon, break_start: CoffeeIcon, break_end: CoffeeIcon, lunch_start: UtensilsIcon, lunch_end: UtensilsIcon };

function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const hhmm = (d: Date | string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// The buttons that fit the person's state now: check in; or break, lunch and check out; or back from break.
export function CheckinPad({ initial, code, compact = false }: { initial: CheckinView; code?: string | null; compact?: boolean }) {
  const [view, setView] = React.useState(initial);
  const [busy, setBusy] = React.useState<EventKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ kind: EventKind; at: string; lateMin: number; flagged: string[] } | null>(null);
  const [loc, setLoc] = React.useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const now = useClock();

  const locate = () =>
    new Promise<{ lat: number; lng: number; accuracy: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15_000 },
      );
    });

  const refresh = async (l = loc) => {
    const r = await checkinViewAction({ code, ...(l ?? {}) });
    if (r.ok) setView(r.data!);
  };

  const press = async (kind: EventKind) => {
    setBusy(kind);
    setError(null);
    let l = loc;
    if (view.here.needLocation && !l) {
      l = await locate();
      setLoc(l);
    }
    const r = await selfCheckinAction({ kind, code, ...(l ?? {}) });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone({ kind, at: r.data!.at, lateMin: r.data!.lateMin, flagged: r.data!.flagged });
    await refresh(l);
    // The confirmation stays a few seconds, then the page is ready for the next tap.
    setTimeout(() => setDone(null), 8000);
  };

  if (done)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" data-testid="checkin-done">
        <CheckCircle2Icon className="size-16 text-[var(--st-done-fg)]" />
        <p className="text-2xl font-bold">{ACTION_LABELS[done.kind].done}</p>
        <p className="text-4xl font-bold tabular-nums">{hhmm(done.at)}</p>
        {done.kind === "in" && done.lateMin > 0 && <p className="text-[var(--st-paused-fg)]">{done.lateMin} minutes late</p>}
        {done.flagged.length > 0 && <p className="max-w-xs text-sm text-muted-foreground">Recorded. HR will look at it: {done.flagged.join("; ").toLowerCase()}.</p>}
        <p className="text-sm text-muted-foreground">You can close this page.</p>
      </div>
    );

  return (
    <div className={`space-y-4 ${compact ? "" : "text-center"}`} data-testid="checkin-pad">
      {!compact && (
        <div>
          <p className="text-lg">Hello {view.name}</p>
          <p className="text-5xl font-bold tabular-nums" suppressHydrationWarning>
            {now ? hhmm(now) : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {STATE_LABELS[view.state]}
            {view.since ? ` since ${hhmm(view.since)}` : ""}
            {view.here.site ? ` · ${view.here.site.name}` : ""}
          </p>
        </div>
      )}
      {!view.here.ok && !view.here.needLocation ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--st-paused-fg)]/40 bg-[var(--st-paused-bg)] p-3 text-left text-sm text-[var(--st-paused-fg)]" role="alert">
          <WifiOffIcon className="size-5 shrink-0" /> {view.here.reason}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => refresh()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className={`grid gap-3 ${view.actions.length > 1 ? "sm:grid-cols-3" : ""}`}>
          {view.actions.map((k) => {
            const Icon = ICONS[k];
            return (
              <Button key={k} size="lg" variant={k === "in" || k.endsWith("_end") ? "default" : k === "out" ? "outline" : "secondary"} className="h-16 text-lg" disabled={!!busy} onClick={() => press(k)}>
                <Icon className="size-5" /> {busy === k ? "..." : ACTION_LABELS[k].button}
              </Button>
            );
          })}
        </div>
      )}
      {view.here.needLocation && (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" /> Your location is checked once, when you press, to confirm you are at the site.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
