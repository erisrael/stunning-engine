"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayCircleIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { savePrefsAction } from "@/app/actions/admin";
import { FirstSteps, REPLAY_TOUR_EVENT, type TourState } from "@/components/app/get-started";
import { AUDIENCE_LABELS, CHAPTERS as BASE_CHAPTERS, CHAPTER_EXPLAINERS, GUIDES, type Audience, type Chapter } from "@/lib/help";
import { Explainer } from "@/components/app/explainers";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PinIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

// What a person chose to see in Help: chapters hidden or pinned first, other roles' chapters added, guides hidden. Kept on
// their account (every device), or on this device only, so a phone can show less than a computer.
export type HelpPrefs = { hidden: string[]; pinned: string[]; added: string[]; hiddenGuides: string[] };
const EMPTY: HelpPrefs = { hidden: [], pinned: [], added: [], hiddenGuides: [] };
const DEVICE_KEY = "myseed.help";
const clean = (p: Partial<HelpPrefs> | null | undefined): HelpPrefs => ({ hidden: p?.hidden ?? [], pinned: p?.pinned ?? [], added: p?.added ?? [], hiddenGuides: p?.hiddenGuides ?? [] });
function readDevice(): HelpPrefs | null {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v ? clean(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

const forAudience = (c: Chapter, a: Audience) => c.audiences === "all" || c.audiences.includes(a);
const text = (c: Chapter) => [c.title, c.summary, ...c.sections.flatMap((s) => [s.title, s.text ?? "", ...(s.steps ?? [])])].join(" ").toLowerCase();

function CustomizeHelp({ chapters, own, guides, prefs, onDevice, onClose, onSaved }: { chapters: Chapter[]; own: (c: Chapter) => boolean; guides: { key: string; title: string }[]; prefs: HelpPrefs; onDevice: boolean; onClose: () => void; onSaved: (p: HelpPrefs, where: "account" | "device") => void }) {
  const [p, setP] = React.useState<HelpPrefs>(prefs);
  const [where, setWhere] = React.useState<"account" | "device">(onDevice ? "device" : "account");
  const flip = (list: keyof HelpPrefs, key: string, on: boolean) => setP({ ...p, [list]: on ? [...new Set([...p[list], key])] : p[list].filter((k) => k !== key) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-help-dialog>
        <DialogHeader>
          <DialogTitle>Customize Help</DialogTitle>
          <DialogDescription>Choose the chapters and guides you see, and pin the ones you use most. A search still finds everything.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <fieldset className="space-y-1.5">
            <legend className="font-medium">Chapters</legend>
            {chapters.map((c) => {
              const mineToo = own(c);
              const shown = mineToo ? !p.hidden.includes(c.key) : p.added.includes(c.key);
              return (
                <div key={c.key} className="flex items-center gap-2" data-help-chapter={c.key}>
                  <Checkbox checked={shown} aria-label={`Show ${c.title}`} onCheckedChange={(v) => (mineToo ? flip("hidden", c.key, v !== true) : flip("added", c.key, v === true))} />
                  <span className="min-w-0 flex-1">
                    {c.title}
                    {!mineToo && <span className="text-xs text-muted-foreground"> (another role)</span>}
                  </span>
                  <Button size="icon-xs" variant={p.pinned.includes(c.key) ? "secondary" : "ghost"} aria-label={`Pin ${c.title}`} aria-pressed={p.pinned.includes(c.key)} disabled={!shown} onClick={() => flip("pinned", c.key, !p.pinned.includes(c.key))}>
                    <PinIcon />
                  </Button>
                </div>
              );
            })}
          </fieldset>
          {guides.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="font-medium">Guides</legend>
              {guides.map((g) => (
                <label key={g.key} className="flex items-center gap-2">
                  <Checkbox checked={!p.hiddenGuides.includes(g.key)} onCheckedChange={(v) => flip("hiddenGuides", g.key, v !== true)} /> {g.title}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="space-y-1.5">
            <legend className="font-medium">Use this on</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="help-where" checked={where === "account"} onChange={() => setWhere("account")} /> All my devices
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="help-where" checked={where === "device"} onChange={() => setWhere("device")} /> Only this device (for example less on the phone)
            </label>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setP(EMPTY)}>
            Show everything
          </Button>
          <Button
            onClick={() => {
              onSaved(p, where);
              toast.success(where === "device" ? "Saved on this device" : "Saved for all your devices");
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChapterCard({ c, open, highlight, pinned }: { c: Chapter; open: boolean; highlight: boolean; pinned?: boolean }) {
  // Clips play only while the chapter is open.
  const [shown, setShown] = React.useState(open);
  React.useEffect(() => setShown(open), [open]);
  return (
    <details id={c.key} open={open} onToggle={(e) => setShown((e.target as HTMLDetailsElement).open)} className={cn("group scroll-mt-20 rounded-lg border bg-card", highlight && "ring-2 ring-primary/40")}>
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="flex items-center gap-1.5 font-medium">
          {pinned && <PinIcon className="size-3.5 text-primary" aria-label="Pinned" />}
          {c.title}
        </div>
        <div className="text-sm text-muted-foreground">{c.summary}</div>
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element -- static screenshots in /public
          <img src={c.image} alt={`${c.title}: screenshot`} loading="lazy" className="w-full max-w-3xl rounded-md border" />
        )}
        {shown && (CHAPTER_EXPLAINERS[c.key] ?? []).length > 0 && (
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            {(CHAPTER_EXPLAINERS[c.key] ?? []).map((k) => (
              <Explainer key={k} id={k} />
            ))}
          </div>
        )}
        {c.sections.map((s) => (
          <section key={s.title} className="space-y-1.5">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            {s.text && <p className="max-w-3xl text-sm text-muted-foreground">{s.text}</p>}
            {s.steps && (
              <ol className="max-w-3xl list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {s.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}

// The training manual, guides, first steps and tour replay. Chapters for the person's role come first.
export function HelpCenter({ audience, tour, canSeeAll = false, extra = [], prefs: accountPrefs }: { audience: Audience; tour: TourState; canSeeAll?: boolean; extra?: Chapter[]; prefs?: Partial<HelpPrefs> }) {
  // Chapters written from each department's configuration come after the fixed ones.
  const CHAPTERS = React.useMemo(() => [...BASE_CHAPTERS, ...extra], [extra]);
  const [device, setDevice] = React.useState<HelpPrefs | null>(null);
  React.useEffect(() => setDevice(readDevice()), []);
  const prefs = device ?? clean(accountPrefs);
  const [customizing, setCustomizing] = React.useState(false);
  const [everyone, setEveryone] = React.useState(false);
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hash, setHash] = React.useState("");
  const [done, setDone] = React.useState(tour.steps ?? []);
  React.useEffect(() => {
    setHash(window.location.hash.slice(1));
    // Following a chapter link clears the search so the chapter is shown.
    const follow = () => {
      setHash(window.location.hash.slice(1));
      setQ("");
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  const needle = q.trim().toLowerCase();
  const match = (c: Chapter) => !needle || needle.split(/\s+/).every((w) => text(c).includes(w));
  // The person's chapters, without the ones they hid, with the ones they added; pinned first. A search still looks
  // through hidden ones.
  const order = (list: Chapter[]) => [...list.filter((c) => prefs.pinned.includes(c.key)), ...list.filter((c) => !prefs.pinned.includes(c.key))];
  const mine = order(CHAPTERS.filter((c) => (forAudience(c, audience) || (canSeeAll && prefs.added.includes(c.key))) && (needle ? true : !prefs.hidden.includes(c.key)) && match(c)));
  // Each person sees their own chapters; managers and Admin can open every role's, to support their people.
  const others = canSeeAll && everyone ? CHAPTERS.filter((c) => !forAudience(c, audience) && !prefs.added.includes(c.key) && match(c)) : [];
  // Guides for the person's own chapters; a search looks through all of them.
  const own = new Set(CHAPTERS.filter((c) => forAudience(c, audience)).map((c) => c.key));
  for (const k of prefs.added) own.add(k);
  const guides = GUIDES.filter((g) => (own.has(g.chapter) || (canSeeAll && everyone)) && (needle ? `${g.title} ${g.steps.join(" ")}`.toLowerCase().includes(needle) : !prefs.hiddenGuides.includes(g.key)));
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...new Set([...done, key])] : done.filter((k) => k !== key);
    setDone(next);
    void savePrefsAction({ tour: { ...tour, steps: next } }).then(() => router.refresh());
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the manual, for example: hand over, assign, password" className="pl-9" aria-label="Search help" />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">For you ({AUDIENCE_LABELS[audience]})</h2>
            <Button size="xs" variant="outline" onClick={() => setCustomizing(true)} data-help-customize>
              <SlidersHorizontalIcon /> Customize{device ? " (this device)" : ""}
            </Button>
            {canSeeAll && (
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={everyone} onCheckedChange={setEveryone} /> Show every role&apos;s chapters
              </label>
            )}
          </div>
          {mine.map((c) => (
            <ChapterCard key={c.key} c={c} open={!!needle || hash === c.key} highlight={hash === c.key} pinned={prefs.pinned.includes(c.key)} />
          ))}
          {!mine.length && <p className="text-sm text-muted-foreground">{needle ? "Nothing here matches." : "You hid every chapter. Press Customize to show them again."}</p>}
        </div>
        {others.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Other roles</h2>
            {others.map((c) => (
              <ChapterCard key={c.key} c={c} open={!!needle || hash === c.key} highlight={hash === c.key} />
            ))}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Your first steps, and the short tour of your role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FirstSteps audience={audience} done={done} onToggle={toggle} />
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(REPLAY_TOUR_EVENT))}>
              <PlayCircleIcon /> Replay tour
            </Button>
          </CardContent>
        </Card>
        {customizing && (
          <CustomizeHelp
            chapters={CHAPTERS.filter((c) => forAudience(c, audience) || canSeeAll)}
            own={(c) => forAudience(c, audience)}
            guides={GUIDES.filter((g) => CHAPTERS.some((c) => c.key === g.chapter && (forAudience(c, audience) || canSeeAll)))}
            prefs={prefs}
            onDevice={!!device}
            onClose={() => setCustomizing(false)}
            onSaved={(p, where) => {
              if (where === "device") {
                try {
                  localStorage.setItem(DEVICE_KEY, JSON.stringify(p));
                } catch {}
                setDevice(p);
              } else {
                try {
                  localStorage.removeItem(DEVICE_KEY);
                } catch {}
                setDevice(null);
                void savePrefsAction({ help: p }).then(() => router.refresh());
              }
            }}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle>Guides</CardTitle>
            <CardDescription>Step by step, for common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {guides.map((g) => (
              <div key={g.key} className="space-y-1">
                <Link href={`#${g.chapter}`} className="text-sm font-medium hover:underline">
                  {g.title}
                </Link>
                <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {g.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
            {!guides.length && <p className="text-sm text-muted-foreground">No guide matches.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
