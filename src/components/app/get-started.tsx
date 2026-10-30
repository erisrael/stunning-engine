"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { savePrefsAction } from "@/app/actions/admin";
import { FIRST_STEPS, TOURS, type Audience } from "@/lib/help";
import { cn } from "@/lib/utils";

export type TourState = { seen?: Audience[]; steps?: string[] };

export const REPLAY_TOUR_EVENT = "myseed:replay-tour";

// A card moving through the steps of a flow, looping, so a new person sees how work travels.
export function FlowAnimation({ steps }: { steps: string[] }) {
  const [at, setAt] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setAt((i) => (i + 1) % steps.length), 1100);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="rounded-lg border bg-muted/40 p-3" aria-hidden>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <div key={s} className={cn("flex min-h-20 flex-col items-center gap-2 rounded-md border bg-background p-2 text-center text-[11px] font-medium transition-colors", i === at && "border-primary")}>
            <span className={cn("leading-tight", i === at ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            <span className={cn("mt-auto h-5 w-full rounded bg-primary/80 transition-all duration-500", i === at ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FirstSteps({ audience, done, onToggle }: { audience: Audience; done: string[]; onToggle: (key: string, on: boolean) => void }) {
  return (
    <ul className="space-y-1.5">
      {FIRST_STEPS[audience].map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-sm">
          <Checkbox checked={done.includes(s.key)} onCheckedChange={(v) => onToggle(s.key, v === true)} aria-label={s.label} />
          <Link href={s.href} className={cn("hover:underline", done.includes(s.key) && "text-muted-foreground line-through")}>
            {s.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Shows the role's tour on first sign-in (once per role audience) and whenever Help asks to replay it.
export function GetStarted({ audience, tour }: { audience: Audience; tour: TourState }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(!(tour.seen ?? []).includes(audience));
  const [at, setAt] = React.useState(0);
  const [done, setDone] = React.useState(tour.steps ?? []);
  const steps = TOURS[audience];
  const last = at === steps.length;

  React.useEffect(() => {
    const replay = () => {
      setAt(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_TOUR_EVENT, replay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, replay);
  }, []);

  const save = (patch: TourState) => void savePrefsAction({ tour: { seen: tour.seen ?? [], steps: done, ...patch } }).then(() => router.refresh());
  const close = () => {
    setOpen(false);
    if (!(tour.seen ?? []).includes(audience)) save({ seen: [...(tour.seen ?? []), audience] });
  };
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...new Set([...done, key])] : done.filter((k) => k !== key);
    setDone(next);
    save({ steps: next });
  };

  const step = steps[at];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{last ? "Your first steps" : step!.title}</DialogTitle>
          <DialogDescription>{last ? "Tick them off as you go. This list stays in Help under your profile." : step!.text}</DialogDescription>
        </DialogHeader>
        {last ? <FirstSteps audience={audience} done={done} onToggle={toggle} /> : step!.flow && <FlowAnimation key={at} steps={step!.flow} />}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex gap-1" aria-hidden>
            {[...steps, null].map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === at ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
            ))}
          </div>
          <div className="flex gap-2">
            {at === 0 ? (
              <Button variant="ghost" onClick={close}>
                Skip
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setAt(at - 1)}>
                <ChevronLeftIcon /> Back
              </Button>
            )}
            {last ? (
              <Button onClick={close}>
                <CheckIcon /> Got it
              </Button>
            ) : (
              <Button onClick={() => setAt(at + 1)}>
                Next <ChevronRightIcon />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
