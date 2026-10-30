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
import { AUDIENCE_LABELS, CHAPTERS, CHAPTER_EXPLAINERS, GUIDES, type Audience, type Chapter } from "@/lib/help";
import { Explainer } from "@/components/app/explainers";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const forAudience = (c: Chapter, a: Audience) => c.audiences === "all" || c.audiences.includes(a);
const text = (c: Chapter) => [c.title, c.summary, ...c.sections.flatMap((s) => [s.title, s.text ?? "", ...(s.steps ?? [])])].join(" ").toLowerCase();

function ChapterCard({ c, open, highlight }: { c: Chapter; open: boolean; highlight: boolean }) {
  // Clips play only while the chapter is open.
  const [shown, setShown] = React.useState(open);
  React.useEffect(() => setShown(open), [open]);
  return (
    <details id={c.key} open={open} onToggle={(e) => setShown((e.target as HTMLDetailsElement).open)} className={cn("group scroll-mt-20 rounded-lg border bg-card", highlight && "ring-2 ring-primary/40")}>
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="font-medium">{c.title}</div>
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
export function HelpCenter({ audience, tour, canSeeAll = false }: { audience: Audience; tour: TourState; canSeeAll?: boolean }) {
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
  const mine = CHAPTERS.filter((c) => forAudience(c, audience) && match(c));
  // Each person sees their own chapters; managers and Admin can open every role's, to support their people.
  const others = canSeeAll && everyone ? CHAPTERS.filter((c) => !forAudience(c, audience) && match(c)) : [];
  // Guides for the person's own chapters; a search looks through all of them.
  const own = new Set(CHAPTERS.filter((c) => forAudience(c, audience)).map((c) => c.key));
  const guides = GUIDES.filter((g) => (own.has(g.chapter) || (canSeeAll && everyone)) && (!needle || `${g.title} ${g.steps.join(" ")}`.toLowerCase().includes(needle)));
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
            {canSeeAll && (
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={everyone} onCheckedChange={setEveryone} /> Show every role&apos;s chapters
              </label>
            )}
          </div>
          {mine.map((c) => (
            <ChapterCard key={c.key} c={c} open={!!needle || hash === c.key} highlight={hash === c.key} />
          ))}
          {!mine.length && <p className="text-sm text-muted-foreground">Nothing here matches.</p>}
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
