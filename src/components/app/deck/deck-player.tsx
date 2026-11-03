"use client";

// The presentation studio's player (Phase 12c), for a department, the company or a shared link:
// - slides with a plain sentence of what each says, why, and the next action;
// - arrows, space or the buttons move on; Play cycles (and refreshes the numbers every minute, for an office TV);
// - Deck: choose and order the slides, minutes per slide, look, save for yourself or the team, weekly email;
// - Meeting: the agenda with a timer per slide, actions captured as you go that become tasks at the end;
// - Presenter view in a second window (notes, next slide, timer) that moves the main screen;
// - laser pointer and drawing on the slide; big text for big rooms; transitions that respect "reduce motion";
// - Share a read-only link for a set time; export to PowerPoint (editable charts) or PDF (print).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExpandIcon,
  LinkIcon,
  ListChecksIcon,
  MonitorIcon,
  NotebookTextIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  PointerIcon,
  PrinterIcon,
  TimerIcon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarsChart, LinesChart } from "@/components/app/charts";
import { CAT } from "@/lib/chart-colors";
import { DEFAULT_THEME, type DeckTheme, type MeetingAction, type SavedDeck, type Slide, type SlideBody } from "@/lib/deck";
import { SmartphoneIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; data?: unknown };
export type DeckActions = {
  save: (input: { id?: string | null; name: string; scope: string; slides: string[]; minutes?: Record<string, number>; theme?: Partial<DeckTheme>; shared?: boolean; emailTo?: string[]; emailDay?: number | null }) => Promise<Res>;
  remove: (id: string) => Promise<Res>;
  endMeeting: (input: { scope: string; deckId?: string | null; actions: MeetingAction[] }) => Promise<Res>;
  share: (input: { scope: string; name: string; slideKeys: string[]; days: number; theme?: Partial<DeckTheme> }) => Promise<Res>;
  remote?: () => Promise<Res>;
};

type Props = {
  scope: string;
  title: string;
  slides: Slide[];
  back: string;
  decks?: SavedDeck[];
  ready?: { name: string; slides: string[] }[];
  deckId?: string | null;
  people?: { id: string; name: string }[];
  departments?: { key: string; title: string }[];
  canShare?: boolean;
  readOnly?: boolean;
  theme?: DeckTheme;
  actions?: DeckActions;
};

// ---------------------------------------------------------------------------
// Slide bodies
// ---------------------------------------------------------------------------

function useReduced() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return r;
}

// Numbers count up from zero when the slide opens.
function CountUp({ value }: { value: number }) {
  const reduced = useReduced();
  const [v, setV] = React.useState(reduced ? value : 0);
  React.useEffect(() => {
    if (reduced) return void setV(value);
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  const dec = Math.abs(value % 1) > 0 ? 1 : 0;
  return <>{v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}</>;
}

const TONE = { good: "text-emerald-600 dark:text-emerald-400", bad: "text-destructive", neutral: "text-amber-700 dark:text-amber-300" };

export function SlideView({ body, big }: { body: SlideBody; big?: boolean }) {
  const h = big ? 460 : 360;
  switch (body.kind) {
    case "numbers":
      return (
        <div className={cn("grid gap-4", body.items.length > 4 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
          {body.items.map((x) => (
            <div key={x.label} className="rounded-2xl border bg-card p-6" data-big-number>
              <p className={cn("text-muted-foreground", big ? "text-2xl" : "text-lg")}>{x.label}</p>
              <p className={cn("font-semibold tabular-nums", big ? "text-8xl" : "text-6xl", x.tone && (x.tone !== "bad" || x.value > 0) && TONE[x.tone])}>
                <CountUp value={x.value} />
                {x.unit && <span className="text-3xl">{x.unit}</span>}
              </p>
              {x.hint && <p className="text-sm text-muted-foreground">{x.hint}</p>}
            </div>
          ))}
        </div>
      );
    case "bars":
      return <BarsChart data={body.data} xKey={body.x} series={body.series.map((s, i) => ({ ...s, color: CAT[i % CAT.length]! }))} stacked={body.stacked} unit={body.unit} height={h} />;
    case "lines":
      return <LinesChart data={body.data} xKey={body.x} series={body.series.map((s, i) => ({ ...s, color: CAT[(i * 3) % CAT.length]! }))} height={h} />;
    case "stages":
      return (
        <div className="flex flex-wrap gap-3">
          {body.items.map((g, i) => (
            <div key={g.label} className="min-w-36 flex-1 rounded-2xl border bg-card p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2" style={{ borderTop: `6px solid ${g.color ?? CAT[i % CAT.length]}`, animationDelay: `${i * 80}ms`, animationFillMode: "both" }}>
              <p className={cn("text-muted-foreground", big && "text-xl")}>{g.label}</p>
              <p className={cn("font-semibold tabular-nums", big ? "text-7xl" : "text-5xl")}>
                <CountUp value={g.value} />
              </p>
              {!!g.late && <p className="font-medium text-destructive">{g.late} past the target</p>}
            </div>
          ))}
        </div>
      );
    case "progress":
      return <Progress items={body.items} big={big} />;
    case "list":
      return body.items.length ? (
        <ul className={cn("space-y-2", big ? "text-3xl" : "text-xl")}>
          {body.items.map((r, i) => (
            <li key={i} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2" style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}>
              {r.text}
              {r.meta && <span className="text-muted-foreground"> · {r.meta}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xl text-muted-foreground">{body.empty ?? "Nothing here."}</p>
      );
    case "table":
      return (
        <table className={cn("w-full", big ? "text-3xl" : "text-xl")}>
          <thead>
            <tr className="text-left text-muted-foreground">
              {body.columns.map((c) => (
                <th key={c} className="py-2 pr-4 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className={cn("py-2 pr-4", typeof c === "number" && "tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return <p className={big ? "text-4xl" : "text-2xl"}>{body.text}</p>;
  }
}

function Progress({ items, big }: { items: { label: string; value: number; tag?: string; tone?: "good" | "bad" | "neutral" }[]; big?: boolean }) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li key={p.label} className="space-y-1">
          <div className={cn("flex items-center gap-3", big ? "text-3xl" : "text-xl")}>
            <span className="flex-1">{p.label}</span>
            {p.tag && <span className={cn("rounded px-2 text-base", p.tone === "bad" ? "bg-red-500/15 text-red-700 dark:text-red-300" : p.tone === "neutral" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>{p.tag}</span>}
            <span className="w-16 text-right tabular-nums">{p.value}%</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded bg-primary transition-[width] duration-1000 motion-reduce:transition-none" style={{ width: `${on ? Math.min(100, p.value) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

async function toPowerPoint(title: string, slides: Slide[]) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  const cover = pres.addSlide();
  // The company's logo and colour on the cover (the logo of the app's branding, the theme's primary colour).
  try {
    const svg = await (await fetch("/brand/myseed-logo.svg")).text();
    cover.addImage({ data: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`, x: 0.6, y: 1.2, w: 1, h: 1 });
  } catch {}
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  cover.addShape(pres.ShapeType.rect, { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: /^#?[0-9a-f]{6}$/i.test(primary) ? primary.replace("#", "") : "0B7A3B" } });
  cover.addText(title, { x: 0.6, y: 2.4, w: 12, h: 1.2, fontSize: 40, bold: true });
  cover.addText(new Date().toLocaleDateString(), { x: 0.6, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: "666666" });
  const colors = CAT.map((c) => c.replace("#", ""));
  for (const s of slides) {
    const p = pres.addSlide();
    p.addText(s.title, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true });
    const b = s.body;
    const box = { x: 0.5, y: 1.2, w: 12.3, h: 4.6 };
    if (b.kind === "bars" || b.kind === "lines")
      p.addChart(b.kind === "bars" ? pres.ChartType.bar : pres.ChartType.line, b.series.map((se) => ({ name: se.label, labels: b.data.map((d) => String(d[b.x] ?? "")), values: b.data.map((d) => Number(d[se.key] ?? 0)) })), { ...box, chartColors: colors, showLegend: true, legendPos: "b", barGrouping: b.kind === "bars" && b.stacked ? "stacked" : "clustered" });
    else if (b.kind === "stages") p.addChart(pres.ChartType.bar, [{ name: "Now", labels: b.items.map((i) => i.label), values: b.items.map((i) => i.value) }], { ...box, chartColors: colors });
    else if (b.kind === "progress") p.addChart(pres.ChartType.bar, [{ name: "% done", labels: b.items.map((i) => i.label), values: b.items.map((i) => i.value) }], { ...box, barDir: "bar", chartColors: colors, valAxisMaxVal: 100 });
    else if (b.kind === "numbers")
      b.items.forEach((x, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        p.addText([{ text: `${x.value}${x.unit ?? ""}\n`, options: { fontSize: 44, bold: true } }, { text: x.label, options: { fontSize: 16, color: "666666" } }], { x: 0.5 + col * 4.1, y: 1.3 + row * 2.2, w: 3.9, h: 2, align: "center", fill: { color: "F3F4F6" } });
      });
    else if (b.kind === "table") p.addTable([b.columns.map((c) => ({ text: c, options: { bold: true } })), ...b.rows.map((r) => r.map((c) => ({ text: String(c) })))], { ...box, fontSize: 16 });
    else if (b.kind === "list") p.addText(b.items.length ? b.items.map((i) => ({ text: `${i.text}${i.meta ? ` · ${i.meta}` : ""}`, options: { bullet: true } })) : (b.empty ?? ""), { ...box, fontSize: 18, valign: "top" });
    else p.addText(b.text, { ...box, fontSize: 24 });
    p.addText([s.say, s.why, s.next].filter(Boolean).join("\n"), { x: 0.5, y: 6.0, w: 12.3, h: 1.2, fontSize: 16, fill: { color: "F3F4F6" } });
    if (s.note) p.addNotes(s.note);
  }
  await pres.writeFile({ fileName: `${title.replace(/[^\w -]/g, "")}.pptx` });
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

export function DeckPlayer(props: Props) {
  const router = useRouter();
  const all = props.slides;
  const storeKey = `myseed.deck.${props.scope}`;
  const saved = props.decks?.find((d) => d.id === props.deckId) ?? null;
  const [order, setOrder] = React.useState<string[]>(() => saved?.slides.filter((k) => all.some((s) => s.key === k)) ?? all.map((s) => s.key));
  const [minutes, setMinutes] = React.useState<Record<string, number>>(saved?.minutes ?? {});
  const [theme, setTheme] = React.useState<DeckTheme>(saved?.theme ?? props.theme ?? DEFAULT_THEME);
  // Without a saved deck, the choice stays on this computer.
  React.useEffect(() => {
    if (saved || props.readOnly) return;
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { order?: string[]; theme?: DeckTheme } | null;
      if (v?.order?.length) setOrder(v.order.filter((k) => all.some((s) => s.key === k)));
      if (v?.theme) setTheme({ ...DEFAULT_THEME, ...v.theme });
    } catch {}
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const remember = (o: string[], t: DeckTheme) => {
    if (saved || props.readOnly) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify({ order: o, theme: t }));
    } catch {}
  };
  const slides = order.map((k) => all.find((s) => s.key === k)).filter((s): s is Slide => !!s);
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [panel, setPanel] = React.useState<null | "deck" | "meeting" | "share">(null);
  const [notes, setNotes] = React.useState(false);
  const [tool, setTool] = React.useState<null | "laser" | "draw">(null);
  const go = React.useCallback((d: number) => setI((x) => (x + d + slides.length) % Math.max(1, slides.length)), [slides.length]);
  const s = slides[Math.min(i, slides.length - 1)];

  // A phone as the remote: its Next and Previous arrive as steps; the phone is told which slide shows.
  const [remote, setRemote] = React.useState<{ token: string; qr: string } | null>(null);
  const seen = React.useRef(0);
  React.useEffect(() => {
    if (!remote) return;
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/present/remote/${remote.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: s?.title ?? "", position: `${Math.min(i, slides.length - 1) + 1} of ${slides.length}` }) }).catch(() => null);
      const j = r && r.ok ? ((await r.json()) as { steps: number }) : null;
      if (j && j.steps !== seen.current) {
        go(j.steps - seen.current);
        seen.current = j.steps;
      }
    }, 800);
    return () => window.clearInterval(t);
  }, [remote, go, s?.title, i, slides.length]);

  // Presenter view in another window, kept in step through the browser.
  const chan = React.useRef<BroadcastChannel | null>(null);
  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(`deck:${props.scope}`);
    chan.current = c;
    c.onmessage = (e) => {
      const m = e.data as { type: string; i?: number; d?: number };
      if (m.type === "goto" && typeof m.i === "number") setI(m.i);
      if (m.type === "move" && m.d) go(m.d);
      if (m.type === "hello") c.postMessage({ type: "state", i, order });
    };
    return () => c.close();
  }, [props.scope, go, i, order]);
  React.useEffect(() => {
    chan.current?.postMessage({ type: "state", i, order });
  }, [i, order]);

  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") (e.preventDefault(), go(1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), go(-1));
      if (e.key.toLowerCase() === "n") setNotes((x) => !x);
      if (e.key.toLowerCase() === "l") setTool((x) => (x === "laser" ? null : "laser"));
      if (e.key.toLowerCase() === "d") setTool((x) => (x === "draw" ? null : "draw"));
      if (e.key === "Escape") (setTool(null), setPanel(null));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);
  // Play: next slide every few seconds; the numbers refresh every minute (an office TV stays current).
  React.useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => go(1), theme.seconds * 1000);
    const r = props.readOnly ? 0 : window.setInterval(() => router.refresh(), 60000);
    return () => {
      window.clearInterval(t);
      if (r) window.clearInterval(r);
    };
  }, [playing, go, theme.seconds, router, props.readOnly]);

  // Meeting.
  const [meeting, setMeeting] = React.useState<{ started: number; slideStarted: number; actions: MeetingAction[] } | null>(null);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!meeting) return;
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [meeting]);
  React.useEffect(() => setMeeting((m) => (m ? { ...m, slideStarted: Date.now() } : m)), [i]);
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const slideBudget = s ? (minutes[s.key] ?? 0) * 60000 : 0;
  const slideSpent = meeting ? Date.now() - meeting.slideStarted : 0;

  const big = theme.bigText;
  const anim = theme.transition === "none" ? "" : theme.transition === "slide" ? "motion-safe:animate-in motion-safe:slide-in-from-right-8 motion-safe:fade-in" : theme.transition === "zoom" ? "motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in" : "motion-safe:animate-in motion-safe:fade-in";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col bg-background", big && "text-[1.15rem]")} data-deck={props.scope}>
      <div className="h-1 bg-muted" aria-hidden>
        <div className="h-1 bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${((Math.min(i, slides.length - 1) + 1) / Math.max(1, slides.length)) * 100}%` }} />
      </div>
      <header className="flex flex-wrap items-center gap-1 px-6 py-2 text-sm print:hidden">
        <Button asChild size="sm" variant="ghost">
          <Link href={props.back}>
            <ArrowLeftIcon /> Back
          </Link>
        </Button>
        <span className="text-muted-foreground">
          {saved?.name ?? props.title} · slide {Math.min(i, slides.length - 1) + 1} of {slides.length}
        </span>
        {!props.readOnly && props.decks && (
          <select aria-label="Deck" className="ml-2 h-8 rounded-md border bg-background px-2 text-sm" value={props.deckId ?? ""} onChange={(e) => router.push(`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), deck: e.target.value }).toString()}`)}>
            <option value="">All slides</option>
            {props.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.shared ? " (team)" : ""}
              </option>
            ))}
          </select>
        )}
        {meeting && (
          <span className={cn("ml-2 flex items-center gap-1 rounded px-2 py-0.5 tabular-nums", slideBudget && slideSpent > slideBudget ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-muted")} data-meeting-timer>
            <TimerIcon className="size-3.5" /> {mmss(slideSpent)}
            {slideBudget ? ` / ${mmss(slideBudget)}` : ""} · total {mmss(Date.now() - meeting.started)}
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-1">
          {!props.readOnly && (
            <Button size="sm" variant="ghost" aria-pressed={panel === "deck"} onClick={() => setPanel(panel === "deck" ? null : "deck")}>
              <ListChecksIcon /> Deck
            </Button>
          )}
          {!props.readOnly && props.actions && (
            <Button size="sm" variant={meeting ? "default" : "ghost"} aria-pressed={panel === "meeting"} onClick={() => (meeting ? setPanel(panel === "meeting" ? null : "meeting") : (setMeeting({ started: Date.now(), slideStarted: Date.now(), actions: [] }), setPanel("meeting"), setI(0)))}>
              <TimerIcon /> {meeting ? "Meeting" : "Start meeting"}
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-pressed={notes} onClick={() => setNotes(!notes)}>
            <NotebookTextIcon /> Notes
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={tool === "laser"} aria-label="Laser pointer" title="Laser pointer (L)" onClick={() => setTool(tool === "laser" ? null : "laser")}>
            <PointerIcon />
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={tool === "draw"} aria-label="Draw on the slide" title="Draw (D)" onClick={() => setTool(tool === "draw" ? null : "draw")}>
            <PencilIcon />
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={big} aria-label="Big text" title="Big text for big rooms" onClick={() => (setTheme({ ...theme, bigText: !big }), remember(order, { ...theme, bigText: !big }))}>
            <TypeIcon />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon /> : <PlayIcon />} {playing ? "Pause" : "Play"}
          </Button>
          {!props.readOnly && (
            <Button size="sm" variant="ghost" aria-label="Presenter view" title="Presenter view in another window" onClick={() => window.open(`${window.location.pathname}${window.location.search}${window.location.search ? "&" : "?"}presenter=1`, "presenter", "width=900,height=700")}>
              <MonitorIcon />
            </Button>
          )}
          {!props.readOnly && props.canShare && props.actions && (
            <Button size="sm" variant="ghost" aria-pressed={panel === "share"} onClick={() => setPanel(panel === "share" ? null : "share")}>
              <LinkIcon /> Share
            </Button>
          )}
          {!props.readOnly && props.actions?.remote && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Phone remote"
              title="Use your phone as the remote"
              onClick={async () => {
                if (remote) return setRemote(null);
                const r = await props.actions!.remote!();
                if (!r.ok) return void toast.error(r.error);
                const token = r.data as string;
                const QR = (await import("qrcode")).default;
                seen.current = 0;
                setRemote({ token, qr: await QR.toDataURL(`${window.location.origin}/remote/${token}`, { margin: 1, width: 180 }) });
              }}
              data-remote-button
            >
              <SmartphoneIcon />
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label="PowerPoint" title="Download as PowerPoint" onClick={() => toPowerPoint(saved?.name ?? props.title, slides).catch(() => toast.error("Could not make the file."))}>
            <DownloadIcon />
          </Button>
          <Button size="sm" variant="ghost" aria-label="PDF" title="Print or save as PDF" onClick={() => window.print()}>
            <PrinterIcon />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => null)}>
            <ExpandIcon />
          </Button>
        </span>
      </header>

      {remote && (
        <div className="mx-6 flex items-center gap-3 rounded-lg border p-2 text-sm print:hidden" data-remote-qr>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={remote.qr} alt="QR code for the phone remote" className="size-28" data-remote-link={`/remote/${remote.token}`} />
          <p>Scan with your phone to move the slides from it (Next, Previous). It works for four hours.</p>
          <Button size="xs" variant="ghost" onClick={() => setRemote(null)}>
            Close
          </Button>
        </div>
      )}
      {panel === "deck" && props.actions && <DeckPanel {...props} order={order} setOrder={(o) => (setOrder(o), setI(0), remember(o, theme))} minutes={minutes} setMinutes={setMinutes} theme={theme} setTheme={(t) => (setTheme(t), remember(order, t))} saved={saved} onClose={() => setPanel(null)} />}
      {panel === "meeting" && meeting && props.actions && (
        <MeetingPanel
          {...props}
          slides={slides}
          current={i}
          minutes={minutes}
          meeting={meeting}
          setMeeting={setMeeting}
          goto={setI}
          deckId={saved?.id ?? null}
          onEnd={() => (setMeeting(null), setPanel(null))}
        />
      )}
      {panel === "share" && props.actions && <SharePanel {...props} order={order} theme={theme} name={saved?.name ?? props.title} />}

      {s && (
        <main key={s.key} className={cn("relative flex flex-1 flex-col gap-6 overflow-y-auto px-10 py-6 print:hidden motion-safe:duration-500", anim)} data-slide={s.key}>
          <h1 className={cn("font-semibold", big ? "text-6xl" : "text-4xl")}>{s.title}</h1>
          <div className="flex-1">
            <SlideView body={s.body} big={big} />
          </div>
          <div className={cn("rounded-2xl bg-muted/50 p-4", big ? "text-3xl" : "text-xl")} data-explainer>
            <p>{s.say}</p>
            {s.why && <p className="text-muted-foreground">{s.why}</p>}
            {s.next && <p className="font-medium">{s.next}</p>}
          </div>
          {notes && s.note && <p className="rounded-lg border border-dashed p-3 text-base text-muted-foreground">Notes: {s.note}</p>}
          <p className="flex items-center gap-2 text-xs text-muted-foreground" data-slide-brand>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/myseed-logo.svg" alt="" className="size-4" /> {props.title} · {new Date().toLocaleDateString()}
          </p>
          {tool && <Overlay tool={tool} />}
        </main>
      )}
      {/* Printing (PDF): every slide on its own page. */}
      <div className="hidden print:block">
        {slides.map((x) => (
          <section key={x.key} className="break-after-page p-8">
            <h1 className="mb-4 text-3xl font-semibold">{x.title}</h1>
            <SlideView body={x.body} />
            <div className="mt-4 rounded-xl bg-muted/50 p-3 text-lg">
              <p>{x.say}</p>
              {x.why && <p>{x.why}</p>}
              {x.next && <p className="font-medium">{x.next}</p>}
            </div>
          </section>
        ))}
      </div>
      <footer className="flex justify-between px-6 pb-4 print:hidden">
        <Button variant="outline" aria-label="Previous slide" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" aria-label="Next slide" onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
      </footer>
    </div>
  );
}

// The laser pointer (a red dot that follows the pointer) and the pen (cleared when the slide changes).
function Overlay({ tool }: { tool: "laser" | "draw" }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [dot, setDot] = React.useState<{ x: number; y: number } | null>(null);
  const drawing = React.useRef(false);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }, [tool]);
  const pos = (e: React.PointerEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <div className={cn("absolute inset-0", tool === "laser" ? "cursor-none" : "cursor-crosshair")} data-overlay={tool}>
      <canvas
        ref={ref}
        className="h-full w-full"
        onPointerMove={(e) => {
          const p = pos(e);
          if (tool === "laser") return setDot(p);
          if (!drawing.current) return;
          const g = ref.current!.getContext("2d")!;
          g.lineTo(p.x, p.y);
          g.stroke();
        }}
        onPointerDown={(e) => {
          if (tool !== "draw") return;
          drawing.current = true;
          const g = ref.current!.getContext("2d")!;
          g.strokeStyle = "#D93025";
          g.lineWidth = 4;
          g.lineCap = "round";
          const p = pos(e);
          g.beginPath();
          g.moveTo(p.x, p.y);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false, setDot(null))}
      />
      {tool === "laser" && dot && <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 shadow-[0_0_12px_4px_rgba(220,38,38,0.6)]" style={{ left: dot.x, top: dot.y }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck: choose, order, minutes, look; save for yourself or the team; weekly email
// ---------------------------------------------------------------------------

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function DeckPanel(p: Props & { order: string[]; setOrder: (o: string[]) => void; minutes: Record<string, number>; setMinutes: (m: Record<string, number>) => void; theme: DeckTheme; setTheme: (t: DeckTheme) => void; saved: SavedDeck | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState(p.saved?.name ?? "");
  const [shared, setShared] = React.useState(p.saved?.shared ?? false);
  const [emailTo, setEmailTo] = React.useState<string[]>(p.saved?.emailTo ?? []);
  const [emailDay, setEmailDay] = React.useState<number | null>(p.saved?.emailDay ?? null);
  const [busy, setBusy] = React.useState(false);
  const move = (k: string, d: number) => {
    const o = [...p.order];
    const i = o.indexOf(k);
    const j = i + d;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    p.setOrder(o);
  };
  const save = async (asNew: boolean) => {
    setBusy(true);
    const r = await p.actions!.save({ id: asNew ? null : (p.saved?.id ?? null), name, scope: p.scope, slides: p.order, minutes: p.minutes, theme: p.theme, shared, emailTo, emailDay });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Could not save.");
    toast.success("Deck saved");
    router.push(`?deck=${r.data as string}`);
    router.refresh();
  };
  const groups = [...new Set(p.slides.map((s) => s.group))];
  return (
    <div className="mx-6 grid max-h-[50vh] gap-4 overflow-y-auto rounded-lg border p-3 text-sm lg:grid-cols-[1fr_20rem] print:hidden" data-deck-panel>
      <div className="space-y-2">
        {p.ready && p.ready.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Ready decks:</span>
            {p.ready.map((d) => (
              <Button key={d.name} size="xs" variant="outline" onClick={() => (p.setOrder(d.slides), setName(d.name))}>
                {d.name}
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">In the deck, in order (minutes in a meeting):</p>
        <ol className="space-y-1">
          {p.order.map((k, n) => {
            const s = p.slides.find((x) => x.key === k);
            if (!s) return null;
            return (
              <li key={k} className="flex items-center gap-1 rounded border px-2 py-1" data-deck-item={k}>
                <span className="w-5 text-xs text-muted-foreground">{n + 1}</span>
                <span className="flex-1 truncate">
                  {s.title} <span className="text-xs text-muted-foreground">{s.group}</span>
                </span>
                <Input aria-label={`Minutes for ${s.title}`} type="number" min={0} className="h-7 w-16" value={p.minutes[k] ?? ""} placeholder="min" onChange={(e) => p.setMinutes({ ...p.minutes, [k]: Number(e.target.value) })} />
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${s.title} up`} onClick={() => move(k, -1)}>
                  <ArrowUpIcon />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${s.title} down`} onClick={() => move(k, 1)}>
                  <ArrowDownIcon />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${s.title}`} disabled={p.order.length === 1} onClick={() => p.setOrder(p.order.filter((x) => x !== k))}>
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ol>
        {p.slides.some((s) => !p.order.includes(s.key)) && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Add:</p>
            {groups.map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-1">
                <span className="text-xs font-medium">{g}</span>
                {p.slides
                  .filter((s) => s.group === g && !p.order.includes(s.key))
                  .map((s) => (
                    <Button key={s.key} size="xs" variant="outline" onClick={() => p.setOrder([...p.order, s.key])}>
                      <PlusIcon /> {s.title}
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs">
            Transition
            <select className="h-8 w-full rounded-md border bg-background px-2" value={p.theme.transition} onChange={(e) => p.setTheme({ ...p.theme, transition: e.target.value as DeckTheme["transition"] })}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="zoom">Zoom</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            Play: seconds a slide
            <Input type="number" min={5} className="h-8" value={p.theme.seconds} onChange={(e) => p.setTheme({ ...p.theme, seconds: Number(e.target.value) })} />
          </label>
        </div>
        <Input aria-label="Deck name" placeholder="Name, e.g. Weekly team meeting" value={name} onChange={(e) => setName(e.target.value)} />
        {p.canShare && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> For the whole team
          </label>
        )}
        {p.people && (
          <details className="text-xs">
            <summary className="cursor-pointer">Email a summary every week {emailTo.length ? `(${emailTo.length})` : ""}</summary>
            <select aria-label="Weekday" className="my-1 h-8 w-full rounded-md border bg-background px-2" value={emailDay ?? ""} onChange={(e) => setEmailDay(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">Not by email</option>
              {DAYS.map((d, n) => (
                <option key={d} value={n}>
                  Every {d}
                </option>
              ))}
            </select>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {p.people.map((u) => (
                <label key={u.id} className={cn("cursor-pointer rounded-full border px-2 py-0.5", emailTo.includes(u.id) && "border-primary bg-primary/10")}>
                  <input type="checkbox" className="sr-only" checked={emailTo.includes(u.id)} onChange={(e) => setEmailTo(e.target.checked ? [...emailTo, u.id] : emailTo.filter((x) => x !== u.id))} />
                  {u.name}
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => save(false)}>
            {p.saved ? "Save the deck" : "Save as a deck"}
          </Button>
          {p.saved && (
            <Button size="sm" variant="outline" disabled={busy || !name.trim()} onClick={() => save(true)}>
              Save as new
            </Button>
          )}
          {p.saved && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Remove the deck "${p.saved!.name}"?`)) return;
                const r = await p.actions!.remove(p.saved!.id);
                if (!r.ok) return void toast.error(r.error);
                router.push("?");
                router.refresh();
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meeting: the agenda with timers; actions that become tasks
// ---------------------------------------------------------------------------

function MeetingPanel(p: Props & { slides: Slide[]; current: number; minutes: Record<string, number>; meeting: { started: number; slideStarted: number; actions: MeetingAction[] }; setMeeting: React.Dispatch<React.SetStateAction<{ started: number; slideStarted: number; actions: MeetingAction[] } | null>>; goto: (i: number) => void; deckId: string | null; onEnd: () => void }) {
  const router = useRouter();
  const [a, setA] = React.useState<MeetingAction>({ text: "", assigneeId: null, due: null, dept: p.departments?.[0]?.key ?? null });
  const [busy, setBusy] = React.useState(false);
  const total = p.slides.reduce((x, s) => x + (p.minutes[s.key] ?? 0), 0);
  return (
    <div className="mx-6 grid gap-4 rounded-lg border p-3 text-sm lg:grid-cols-2 print:hidden" data-meeting-panel>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Agenda{total ? ` (${total} minutes planned)` : ""}</p>
        <ol className="space-y-0.5">
          {p.slides.map((s, n) => (
            <li key={s.key}>
              <button type="button" className={cn("w-full rounded px-2 py-0.5 text-left hover:bg-muted", n === p.current && "bg-primary/10 font-medium")} onClick={() => p.goto(n)}>
                {n + 1}. {s.title}
                {p.minutes[s.key] ? <span className="text-xs text-muted-foreground"> · {p.minutes[s.key]} min</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Actions agreed (they become tasks when the meeting ends)</p>
        <ul className="space-y-1" data-meeting-actions>
          {p.meeting.actions.map((x, n) => (
            <li key={n} className="flex items-center gap-2 rounded border px-2 py-1">
              <span className="flex-1">{x.text}</span>
              <span className="text-xs text-muted-foreground">
                {p.people?.find((u) => u.id === x.assigneeId)?.name ?? "Nobody yet"}
                {x.due ? ` · ${x.due}` : ""}
                {x.dept && p.departments ? ` · ${p.departments.find((d) => d.key === x.dept)?.title}` : ""}
              </span>
              <Button size="icon" variant="ghost" className="size-6" aria-label="Remove the action" onClick={() => p.setMeeting((m) => (m ? { ...m, actions: m.actions.filter((_, k) => k !== n) } : m))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1">
          <Input aria-label="Action" placeholder="What will be done" className="h-8 min-w-48 flex-1" value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} />
          <select aria-label="Who" className="h-8 rounded-md border bg-background px-2" value={a.assigneeId ?? ""} onChange={(e) => setA({ ...a, assigneeId: e.target.value || null })}>
            <option value="">Who</option>
            {p.people?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {p.departments && (
            <select aria-label="Department" className="h-8 rounded-md border bg-background px-2" value={a.dept ?? ""} onChange={(e) => setA({ ...a, dept: e.target.value || null })}>
              {p.departments.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.title}
                </option>
              ))}
            </select>
          )}
          <Input aria-label="Due" type="date" className="h-8 w-40" value={a.due ?? ""} onChange={(e) => setA({ ...a, due: e.target.value || null })} />
          <Button size="sm" variant="outline" disabled={!a.text.trim()} onClick={() => (p.setMeeting((m) => (m ? { ...m, actions: [...m.actions, a] } : m)), setA({ ...a, text: "" }))}>
            <PlusIcon /> Add
          </Button>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await p.actions!.endMeeting({ scope: p.scope, deckId: p.deckId, actions: p.meeting.actions });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error ?? "Could not end the meeting.");
            toast.success(r.data ? `Meeting ended: ${r.data} ${r.data === 1 ? "task" : "tasks"} made` : "Meeting ended");
            p.onEnd();
            router.refresh();
          }}
        >
          End the meeting
        </Button>
      </div>
    </div>
  );
}

function SharePanel(p: Props & { order: string[]; theme: DeckTheme; name: string }) {
  const [days, setDays] = React.useState(7);
  const [link, setLink] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mx-6 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm print:hidden" data-share-panel>
      <span>A read-only copy of these slides as they are now, open for</span>
      <Input aria-label="Days" type="number" min={1} max={90} className="h-8 w-20" value={days} onChange={(e) => setDays(Number(e.target.value))} />
      <span>days.</span>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await p.actions!.share({ scope: p.scope, name: p.name, slideKeys: p.order, days, theme: p.theme });
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          const url = `${window.location.origin}/p/${(r.data as { token: string }).token}`;
          setLink(url);
          void navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link made and copied");
        }}
      >
        <LinkIcon /> Make the link
      </Button>
      {link && (
        <code className="break-all rounded bg-muted px-2 py-1 text-xs" data-share-link>
          {link}
        </code>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presenter view: notes, the next slide and the timer; moves the main screen
// ---------------------------------------------------------------------------

export function PresenterView({ scope, slides }: { scope: string; slides: Slide[] }) {
  const [state, setState] = React.useState<{ i: number; order: string[] }>({ i: 0, order: slides.map((s) => s.key) });
  const [start] = React.useState(() => Date.now());
  const [, tick] = React.useState(0);
  const chan = React.useRef<BroadcastChannel | null>(null);
  React.useEffect(() => {
    const c = new BroadcastChannel(`deck:${scope}`);
    chan.current = c;
    c.onmessage = (e) => {
      const m = e.data as { type: string; i: number; order: string[] };
      if (m.type === "state") setState({ i: m.i, order: m.order });
    };
    c.postMessage({ type: "hello" });
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => (c.close(), window.clearInterval(t));
  }, [scope]);
  const list = state.order.map((k) => slides.find((s) => s.key === k)).filter((s): s is Slide => !!s);
  const cur = list[state.i];
  const next = list[state.i + 1];
  const el = Date.now() - start;
  return (
    <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] gap-3 bg-background p-4" data-presenter>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold tabular-nums">
          {Math.floor(el / 60000)}:{String(Math.floor((el % 60000) / 1000)).padStart(2, "0")}
        </span>
        <span className="text-muted-foreground">
          Slide {state.i + 1} of {list.length}
        </span>
      </div>
      <div className="grid gap-3 overflow-y-auto md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Now</p>
          <p className="text-xl font-semibold">{cur?.title}</p>
          <p>{cur?.say}</p>
          {cur?.why && <p className="text-muted-foreground">{cur.why}</p>}
          {cur?.next && <p className="font-medium">{cur.next}</p>}
          <p className="rounded bg-muted p-2 text-lg">{cur?.note ?? "No notes."}</p>
        </div>
        <div className="space-y-2 rounded-lg border p-3 opacity-80">
          <p className="text-xs text-muted-foreground">Next</p>
          <p className="text-xl font-semibold">{next?.title ?? "End of the deck"}</p>
          {next && <p>{next.say}</p>}
        </div>
      </div>
      <div className="flex justify-between">
        <Button size="lg" variant="outline" onClick={() => chan.current?.postMessage({ type: "move", d: -1 })}>
          <ChevronLeftIcon /> Previous
        </Button>
        <Button size="lg" onClick={() => chan.current?.postMessage({ type: "move", d: 1 })}>
          Next <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
