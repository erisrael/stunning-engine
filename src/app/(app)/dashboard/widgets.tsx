"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlertIcon, InfoIcon, PauseIcon, Settings2Icon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { savePrefsAction } from "@/app/actions/admin";
import { itemAction } from "@/app/actions/items";
import { useActions } from "@/components/app/action-center";
import { fmtDateTime, fmtDuration, isoToLocalInput, localInputToIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DASHBOARD_PANELS } from "@/lib/panels";

const PANELS = DASHBOARD_PANELS;

export function CustomizeDashboard({
  role,
  cards,
  visibleCards,
  visiblePanels,
}: {
  role: string;
  cards: { key: string; label: string }[];
  visibleCards: string[];
  visiblePanels: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [c, setC] = React.useState(visibleCards);
  const [p, setP] = React.useState(visiblePanels);
  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2Icon /> Customize
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize this dashboard</DialogTitle>
            <DialogDescription>Choose the metric cards and panels you see in this role. Saved to your profile only.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Metric cards</Label>
              {cards.map((x) => (
                <label key={x.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={c.includes(x.key)} onCheckedChange={() => toggle(c, setC, x.key)} /> {x.label}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Panels</Label>
              {PANELS.map((x) => (
                <label key={x.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={p.includes(x.key)} onCheckedChange={() => toggle(p, setP, x.key)} /> {x.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={async () => {
                await savePrefsAction({ dashboardCards: { [role]: [] }, dashboardPanels: { [role]: [] } } as never);
                setOpen(false);
                router.refresh();
              }}
            >
              Reset to defaults
            </Button>
            <Button
              onClick={async () => {
                const res = await savePrefsAction({ dashboardCards: { [role]: c }, dashboardPanels: { [role]: p } } as never);
                if (res.ok) {
                  toast.success("Dashboard saved");
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SessionBanner({
  sessions,
  staleHours,
  tz,
  autoReview,
}: {
  sessions: { id: string; item_id: string; code: string; title: string; started_at: string }[];
  staleHours: number;
  tz: string;
  autoReview: boolean;
}) {
  const { run } = useActions();
  const router = useRouter();
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const stale = sessions.filter((s) => Date.now() - new Date(s.started_at).getTime() > staleHours * 3600e3);
  const [review, setReview] = React.useState(autoReview && stale.length > 0);
  const [endAt, setEndAt] = React.useState<Record<string, string>>({});
  if (!sessions.length) return null;
  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--st-active-fg)]/25 bg-[var(--st-active-bg)] p-3 text-[var(--st-active-fg)] sm:flex-row sm:items-center">
        <TimerIcon className="size-5 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          {sessions.map((s) => (
            <div key={s.id} className="truncate">
              Timer running on{" "}
              <Link href={`/items/${s.item_id}`} className="font-medium underline-offset-2 hover:underline">
                {s.code}
              </Link>{" "}
              for <span suppressHydrationWarning>{fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {stale.length > 0 && (
            <Button size="sm" variant="outline" className="bg-background" onClick={() => setReview(true)}>
              <TriangleAlertIcon /> Review long timer
            </Button>
          )}
          {sessions.map((s) => (
            <Button key={s.id} size="sm" variant="outline" className="bg-background" onClick={() => run({ id: s.item_id, code: s.code, title: s.title }, { action: "pause", reason: "Paused from dashboard" })}>
              <PauseIcon /> Pause {sessions.length > 1 ? s.code : ""}
            </Button>
          ))}
        </div>
      </div>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review long-running timers</DialogTitle>
            <DialogDescription>
              Closing the browser does not stop a timer. If you stopped working earlier, enter when you stopped. The original start stays in the history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {stale.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm">
                  <span className="font-medium">{s.code}</span> started {fmtDateTime(s.started_at, tz)}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`end-${s.id}`} className="text-xs">
                      I stopped at
                    </Label>
                    <Input
                      id={`end-${s.id}`}
                      type="datetime-local"
                      value={endAt[s.id] ?? isoToLocalInput(new Date(Math.min(Date.now(), new Date(s.started_at).getTime() + 4 * 3600e3)).toISOString(), tz)}
                      onChange={(e) => setEndAt((x) => ({ ...x, [s.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const v = endAt[s.id] ?? isoToLocalInput(new Date(Math.min(Date.now(), new Date(s.started_at).getTime() + 4 * 3600e3)).toISOString(), tz);
                      const res = await itemAction(s.item_id, { action: "staleClose", sessionId: s.id, endedAt: localInputToIso(v, tz)!, reason: "Stale timer review" });
                      if (res.ok) {
                        toast.success(`Timer on ${s.code} closed at the time you entered`);
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  >
                    Close at this time
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReview(false)}>
                    I am still working
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AttentionList({ items }: { items: { key: string; tone: "danger" | "warning" | "info"; title: string; detail: string; href: string }[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li key={a.key}>
          <Link href={a.href} className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-muted/60">
            {a.tone === "danger" ? (
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--st-blocked-fg)]" />
            ) : a.tone === "warning" ? (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--st-paused-fg)]" />
            ) : (
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-[var(--st-queued-fg)]" />
            )}
            <span className="min-w-0">
              <span className={cn("block text-sm font-medium")}>{a.title}</span>
              <span className="line-clamp-2 block text-xs text-muted-foreground">{a.detail}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
