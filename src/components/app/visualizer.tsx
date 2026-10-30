"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Loader2Icon,
  MaximizeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PresentationIcon,
  SlidersHorizontalIcon,
  VideoIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STAGE_LABELS, STAGES, type SimpleStatus, type Stage } from "@/lib/domain";
import type { StructureRow } from "@/server/structure";
import { cn } from "@/lib/utils";

type Mode = "grade" | "subject";
type Range = "today" | "week" | "month" | "all";
type Detail = "summary" | "detailed";
type Compare = "previous" | "groups" | "stages";
type SlideKind = "overall" | "groups" | "analyzer" | "compare" | "stages" | "recent" | "next";
type Slide = { key: string; kind: SlideKind; title: string; subtitle: string; body: React.ReactNode; say: string; ppt: (p: Ppt) => void };

// Everything the viewer can change, remembered on this device.
type Settings = { range: Range; detail: Detail; compare: Compare; slides: SlideKind[]; speed: number; voice: boolean; voiceName: string; rate: number; large: boolean };
const DEFAULTS: Settings = { range: "week", detail: "summary", compare: "previous", slides: ["overall", "analyzer", "compare", "groups", "recent", "next"], speed: 15, voice: false, voiceName: "", rate: 1, large: false };
const KIND_LABELS: Record<SlideKind, string> = {
  overall: "Where everything stands",
  analyzer: "Analyzer: what the numbers say",
  compare: "Comparison",
  groups: "Each grade or subject",
  stages: "Each stage in detail",
  recent: "Recently finished",
  next: "In process now",
};
const RANGE_LABELS: Record<Range, string> = { today: "Today", week: "This week (7 days)", month: "This month (30 days)", all: "All time" };
const RANGE_DAYS: Record<Range, number> = { today: 1, week: 7, month: 30, all: 30 };
const COMPARE_LABELS: Record<Compare, string> = { previous: "This period against the one before", groups: "Grades or subjects against each other", stages: "Stage against stage (the funnel)" };
const DONE_WORD: Record<Stage, string> = { recording: "Recorded", editing: "Edited", uploading: "Uploaded", publication: "Published" };
const STAGE_HEX: Record<Stage, string> = { recording: "B45309", editing: "1D4ED8", uploading: "0E7490", publication: "15803D" };
const SPEEDS = [8, 15, 30, 60];
const REFRESH_MS = 60_000;
const DAY = 864e5;

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function tally(rows: StructureRow[]) {
  const out = Object.fromEntries(STAGES.map((s) => [s, { done: 0, in_process: 0, missing: 0, none: 0 }])) as Record<Stage, Record<SimpleStatus, number>>;
  for (const r of rows) for (const s of STAGES) out[s][r.stages[s]]++;
  return out;
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const partName = (r: StructureRow) => `${r.gradeName} · ${r.subjectName} · Unit ${r.unitNumber}${r.partNumber ? ` · Part ${r.partNumber}` : ""}`;
const ago = (iso: string, now: number) => {
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
function windowOf(range: Range, now: number) {
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: now, prevFrom: start.getTime() - DAY, prevTo: start.getTime() };
  }
  const days = RANGE_DAYS[range];
  return { from: now - days * DAY, to: now, prevFrom: now - 2 * days * DAY, prevTo: now - days * DAY };
}
const doneBetween = (rows: StructureRow[], s: Stage, from: number, to: number) =>
  rows.filter((r) => r.stages[s] === "done" && r.dates[s] && Date.parse(r.dates[s]!) >= from && Date.parse(r.dates[s]!) < to).length;

function groupsOf(rows: StructureRow[], mode: Mode) {
  const groups = new Map<string, { id: string; name: string; sort: number; rows: StructureRow[] }>();
  for (const r of rows) {
    const [id, name, sort] = mode === "grade" ? [r.gradeId, r.gradeName, r.gradeSort] : [r.subjectId, r.subjectName, r.subjectSort];
    const g = groups.get(id) ?? { id, name, sort, rows: [] };
    g.rows.push(r);
    groups.set(id, g);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort);
}

export type Insight = { tone: "good" | "watch" | "info"; text: string };

// The analyzer: bottlenecks, pace and forecast, leaders and laggards, in plain sentences.
function analyze(parts: StructureRow[], mode: Mode, range: Range, now: number, users: Record<string, string>): Insight[] {
  const out: Insight[] = [];
  if (!parts.length) return [{ tone: "info", text: "There is nothing to analyse with these filters." }];
  const t = tally(parts);
  const total = parts.length;
  out.push({ tone: "info", text: `${pct(t.publication.done, total)}% of ${total} parts are published; ${pct(t.recording.done, total)}% are recorded.` });
  // Bottleneck: the biggest drop between one stage and the next.
  let worst: { from: Stage; to: Stage; gap: number } | null = null;
  for (let i = 0; i < STAGES.length - 1; i++) {
    const gap = t[STAGES[i]!].done - t[STAGES[i + 1]!].done;
    if (!worst || gap > worst.gap) worst = { from: STAGES[i]!, to: STAGES[i + 1]!, gap };
  }
  if (worst && worst.gap > 0)
    out.push({ tone: "watch", text: `The bottleneck is ${STAGE_LABELS[worst.to]}: ${worst.gap} parts are ${DONE_WORD[worst.from].toLowerCase()} but not yet ${DONE_WORD[worst.to].toLowerCase()} (${t[worst.to].in_process} being worked on).` });
  // Pace over the last four weeks, and when the rest would be published at that pace.
  const perWeek = doneBetween(parts, "publication", now - 28 * DAY, now) / 4;
  const left = total - t.publication.done;
  if (left === 0) out.push({ tone: "good", text: "Everything here is published." });
  else if (perWeek > 0) {
    const weeks = Math.ceil(left / perWeek);
    const eta = new Date(now + weeks * 7 * DAY).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    out.push({ tone: weeks > 26 ? "watch" : "info", text: `At the last four weeks' pace of ${Math.round(perWeek * 10) / 10} publications a week, the remaining ${left} parts would be published in about ${weeks} weeks, around ${eta}.` });
  } else out.push({ tone: "watch", text: `Nothing was published in the last four weeks; ${left} parts are still to publish.` });
  // This period against the one before.
  const w = windowOf(range, now);
  const cur = STAGES.reduce((a, s) => a + doneBetween(parts, s, w.from, w.to), 0);
  const prev = STAGES.reduce((a, s) => a + doneBetween(parts, s, w.prevFrom, w.prevTo), 0);
  const label = range === "today" ? "Today" : range === "all" ? "The last 30 days" : RANGE_LABELS[range].split(" (")[0];
  if (cur || prev) {
    const change = prev ? Math.round(((cur - prev) / prev) * 100) : 100;
    out.push({
      tone: cur >= prev ? "good" : "watch",
      text: prev ? `${label}: ${cur} stage steps finished, ${cur >= prev ? "up" : "down"} ${Math.abs(change)}% on the period before (${prev}).` : `${label}: ${cur} stage steps finished, against none in the period before.`,
    });
  }
  // Leaders and laggards.
  const gs = groupsOf(parts, mode).filter((g) => g.rows.length >= 2);
  if (gs.length > 1) {
    const ranked = gs.map((g) => ({ name: g.name, p: pct(tally(g.rows).publication.done, g.rows.length) })).sort((a, b) => b.p - a.p);
    const top = ranked[0]!;
    const low = ranked[ranked.length - 1]!;
    if (top.p !== low.p) out.push({ tone: "info", text: `${top.name} leads at ${top.p}% published; ${low.name} trails at ${low.p}%.` });
  }
  // Who holds the most work in process.
  const load = new Map<string, number>();
  for (const r of parts) if (STAGES.some((s) => r.stages[s] === "in_process")) for (const id of r.ownerIds) load.set(id, (load.get(id) ?? 0) + 1);
  const busiest = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && users[busiest[0]] && busiest[1] >= 5) out.push({ tone: "watch", text: `${users[busiest[0]]} has the most work in process (${busiest[1]} parts). Check the load is balanced.` });
  const missing = t.recording.missing;
  if (missing) out.push({ tone: "watch", text: `${missing} parts have not been recorded yet.` });
  return out;
}

// ---------------------------------------------------------------------------
// Slide bodies
// ---------------------------------------------------------------------------

function StageBar({ stage, t, total, big }: { stage: Stage; t: Record<SimpleStatus, number>; total: number; big?: boolean }) {
  return (
    <div className={cn("flex overflow-hidden rounded-full bg-muted", big ? "h-5" : "h-3")} title={`${STAGE_LABELS[stage]}: ${t.done} done, ${t.in_process} in process of ${total}`}>
      <div style={{ width: `${pct(t.done, total)}%`, background: `var(--stage-${stage})` }} className="transition-[width] duration-700" />
      <div style={{ width: `${pct(t.in_process, total)}%`, background: `var(--stage-${stage})`, opacity: 0.35 }} className="transition-[width] duration-700" />
    </div>
  );
}

function Overall({ rows, range, now }: { rows: StructureRow[]; range: Range; now: number }) {
  const t = tally(rows);
  const w = windowOf(range, now);
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((s) => {
        const added = doneBetween(rows, s, w.from, w.to);
        return (
          <div key={s} className="rounded-2xl border bg-card p-6">
            <div className="text-sm font-medium uppercase tracking-wide" style={{ color: `var(--stage-${s})` }}>
              {STAGE_LABELS[s]}
            </div>
            <div className="mt-2 text-6xl font-semibold tabular">{pct(t[s].done, rows.length)}%</div>
            <div className="mt-1 text-muted-foreground tabular">
              {t[s].done} of {rows.length} done · {t[s].in_process} in process
            </div>
            {range !== "all" && (
              <div className="mt-1 text-sm font-medium tabular" style={{ color: `var(--stage-${s})` }}>
                +{added} {RANGE_LABELS[range].split(" (")[0].toLowerCase()}
              </div>
            )}
            <div className="mt-5">
              <StageBar stage={s} t={t[s]} total={rows.length} big />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Group({ rows, mode, detailed }: { rows: StructureRow[]; mode: Mode; detailed: boolean }) {
  const list = groupsOf(rows, mode === "grade" ? "subject" : "grade");
  const cap = detailed ? 30 : 12;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid grid-cols-[minmax(8rem,14rem)_repeat(4,1fr)] gap-x-6 border-b px-6 py-3 text-sm font-medium text-muted-foreground">
        <span>{mode === "grade" ? "Subject" : "Grade"}</span>
        {STAGES.map((s) => (
          <span key={s} style={{ color: `var(--stage-${s})` }}>
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
      {list.slice(0, cap).map((g) => {
        const t = tally(g.rows);
        return (
          <div key={g.id} className="grid grid-cols-[minmax(8rem,14rem)_repeat(4,1fr)] items-center gap-x-6 border-b px-6 py-3 last:border-b-0">
            <span className="truncate text-lg font-medium">
              {g.name} <span className="text-sm text-muted-foreground tabular">{g.rows.length}</span>
            </span>
            {STAGES.map((s) => (
              <div key={s} className="space-y-1">
                <StageBar stage={s} t={t[s]} total={g.rows.length} />
                <div className="text-xs text-muted-foreground tabular">
                  {t[s].done}/{g.rows.length} ({pct(t[s].done, g.rows.length)}%)
                  {t[s].in_process ? ` · ${t[s].in_process} in process` : ""}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {list.length > cap && <div className="px-6 py-2 text-sm text-muted-foreground">and {list.length - cap} more</div>}
    </div>
  );
}

const TONE_CLASS: Record<Insight["tone"], string> = { good: "border-l-[var(--st-done-fg)]", watch: "border-l-[var(--st-paused-fg)]", info: "border-l-primary" };
function Analyzer({ insights }: { insights: Insight[] }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {insights.map((i, n) => (
        <li key={n} className={cn("rounded-2xl border border-l-8 bg-card px-6 py-5 text-xl leading-snug animate-in fade-in slide-in-from-bottom-2", TONE_CLASS[i.tone])} style={{ animationDelay: `${n * 150}ms`, animationFillMode: "both" }}>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i.tone === "watch" ? "Watch" : i.tone === "good" ? "Good news" : "Fact"}</span>
          {i.text}
        </li>
      ))}
    </ul>
  );
}

type CompareData = { label: string; a: number; b: number; color?: string }[];
function compareData(parts: StructureRow[], compare: Compare, mode: Mode, range: Range, now: number): { title: string; aLabel: string; bLabel?: string; rows: CompareData } {
  if (compare === "groups") {
    const rows = groupsOf(parts, mode).map((g) => ({ label: g.name, a: pct(tally(g.rows).publication.done, g.rows.length), b: pct(tally(g.rows).recording.done, g.rows.length) }));
    return { title: `${mode === "grade" ? "Grades" : "Subjects"} compared`, aLabel: "% published", bLabel: "% recorded", rows: rows.sort((x, y) => y.a - x.a).slice(0, 14) };
  }
  if (compare === "stages") {
    const t = tally(parts);
    return { title: "From recording to published", aLabel: "Done", bLabel: "In process", rows: STAGES.map((s) => ({ label: STAGE_LABELS[s], a: t[s].done, b: t[s].in_process, color: `var(--stage-${s})` })) };
  }
  const w = windowOf(range, now);
  return {
    title: range === "all" ? "Last 30 days against the 30 before" : `${RANGE_LABELS[range].split(" (")[0]} against the period before`,
    aLabel: "This period",
    bLabel: "Period before",
    rows: STAGES.map((s) => ({ label: STAGE_LABELS[s], a: doneBetween(parts, s, w.from, w.to), b: doneBetween(parts, s, w.prevFrom, w.prevTo), color: `var(--stage-${s})` })),
  };
}

function Comparison({ data, kind }: { data: ReturnType<typeof compareData>; kind: Compare }) {
  const max = Math.max(1, ...data.rows.flatMap((r) => [r.a, r.b]));
  const avg = data.rows.length ? Math.round(data.rows.reduce((s, r) => s + r.a, 0) / data.rows.length) : 0;
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" /> {data.aLabel}
        </span>
        {data.bLabel && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-muted-foreground/40" /> {data.bLabel}
          </span>
        )}
        {kind === "groups" && <span className="ml-auto">Average {avg}% published</span>}
      </div>
      {data.rows.map((r, i) => {
        const delta = r.a - r.b;
        return (
          <div key={r.label} className="grid grid-cols-[minmax(7rem,12rem)_1fr_6rem] items-center gap-4">
            <span className="truncate text-lg font-medium">{r.label}</span>
            <div className="space-y-1">
              <div className="h-4 rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(r.a / max) * 100}%`, background: r.color, animationDelay: `${i * 80}ms` }} />
              {data.bLabel && <div className="h-2.5 rounded-full bg-muted-foreground/40 transition-[width] duration-700" style={{ width: `${(r.b / max) * 100}%` }} />}
            </div>
            <span className="text-right text-lg tabular">
              {r.a}
              {kind === "groups" ? "%" : ""}
              {kind === "previous" && (
                <span className={cn("ml-1 inline-flex items-center text-sm", delta > 0 ? "text-[var(--st-done-fg)]" : delta < 0 ? "text-[var(--st-blocked-fg)]" : "text-muted-foreground")}>
                  {delta > 0 ? <ArrowUpIcon className="size-3.5" /> : delta < 0 ? <ArrowDownIcon className="size-3.5" /> : <MinusIcon className="size-3.5" />}
                  {Math.abs(delta)}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StageDetail({ rows, stage, mode, users }: { rows: StructureRow[]; stage: Stage; mode: Mode; users: Record<string, string> }) {
  const gs = groupsOf(rows, mode)
    .map((g) => ({ name: g.name, n: g.rows.length, t: tally(g.rows)[stage] }))
    .sort((a, b) => pct(a.t.done, a.n) - pct(b.t.done, b.n));
  const load = new Map<string, number>();
  for (const r of rows) if (r.stages[stage] === "in_process") for (const id of r.ownerIds) load.set(id, (load.get(id) ?? 0) + 1);
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-3 rounded-2xl border bg-card p-6">
        <div className="text-sm text-muted-foreground">Furthest behind first</div>
        {gs.slice(0, 12).map((g) => (
          <div key={g.name} className="grid grid-cols-[minmax(7rem,12rem)_1fr_5rem] items-center gap-4">
            <span className="truncate text-lg">{g.name}</span>
            <StageBar stage={stage} t={g.t} total={g.n} />
            <span className="text-right tabular">{pct(g.t.done, g.n)}%</span>
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-2xl border bg-card p-6">
        <div className="text-sm text-muted-foreground">Working on it now</div>
        {[...load.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, n]) => (
            <div key={id} className="flex justify-between text-lg">
              <span className="truncate">{users[id] ?? "Someone"}</span>
              <span className="tabular">{n}</span>
            </div>
          ))}
        {!load.size && <div className="text-muted-foreground">Nobody right now.</div>}
      </div>
    </div>
  );
}

function Recent({ list, now }: { list: { r: StructureRow; s: Stage; at: string }[]; now: number }) {
  if (!list.length) return <Empty text="Nothing finished in this period." />;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {list.map((x) => (
        <li key={`${x.r.partId}-${x.s}`} className="flex items-center gap-4 px-6 py-3 text-lg">
          <span className="w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-sm font-medium" style={{ color: `var(--stage-${x.s})`, background: `var(--stage-${x.s}-bg)` }}>
            {DONE_WORD[x.s]}
          </span>
          <span className="min-w-0 flex-1 truncate">{partName(x.r)}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{ago(x.at, now)}</span>
        </li>
      ))}
    </ul>
  );
}

function Next({ list, users }: { list: { r: StructureRow; s: Stage }[]; users: Record<string, string> }) {
  if (!list.length) return <Empty text="Nothing in process right now." />;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {list.map(({ r, s }) => (
        <li key={`${r.partId}-${s}`} className="flex items-center gap-4 px-6 py-3 text-lg">
          <span className="w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-sm font-medium" style={{ color: `var(--stage-${s})`, background: `var(--stage-${s}-bg)` }}>
            {STAGE_LABELS[s]}
          </span>
          <span className="min-w-0 flex-1 truncate">{partName(r)}</span>
          <span className="shrink-0 truncate text-sm text-muted-foreground">{r.ownerIds.map((id) => users[id]).filter(Boolean).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ text }: { text: string }) => <div className="rounded-2xl border bg-card p-16 text-center text-xl text-muted-foreground">{text}</div>;

// ---------------------------------------------------------------------------
// PowerPoint (editable charts and tables, the narration as speaker notes)
// ---------------------------------------------------------------------------

type PptSlide = {
  addText: (t: string | { text: string; options?: Record<string, unknown> }[], o: Record<string, unknown>) => void;
  addChart: (type: unknown, data: unknown, o: Record<string, unknown>) => void;
  addTable: (rows: unknown[][], o: Record<string, unknown>) => void;
  addNotes: (t: string) => void;
};
type Ppt = { slide: PptSlide; charts: Record<string, unknown> };
const pptTable = (p: Ppt, head: string[], rows: (string | number)[][]) =>
  p.slide.addTable([head.map((h) => ({ text: h, options: { bold: true, fill: { color: "F1F5F9" } } })), ...rows.map((r) => r.map((c) => String(c)))], { x: 0.5, y: 1.5, w: 12.3, fontSize: 12, border: { type: "solid", color: "E2E8F0", pt: 0.5 } });

// ---------------------------------------------------------------------------
// The presentation
// ---------------------------------------------------------------------------

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem("viz.settings") ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function Visualizer({ rows, mode, users, filterLabel, backHref }: { rows: StructureRow[]; mode: Mode; users: Record<string, string>; filterLabel: string; backHref: string }) {
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [cfg, setCfg] = React.useState<Settings>(DEFAULTS);
  const [now, setNow] = React.useState(() => Date.now());
  const [panel, setPanel] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const stage = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setCfg(loadSettings()), []);
  const set = (patch: Partial<Settings>) =>
    setCfg((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem("viz.settings", JSON.stringify(next));
      } catch {}
      return next;
    });
  React.useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const parts = React.useMemo(() => rows.filter((r) => r.partId), [rows]);
  const detailed = cfg.detail === "detailed";
  const w = windowOf(cfg.range, now);
  const periodWord = cfg.range === "all" ? "all time" : RANGE_LABELS[cfg.range].split(" (")[0].toLowerCase();

  const slides = React.useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const t = tally(parts);
    const n = parts.length;
    const on = (k: SlideKind) => cfg.slides.includes(k);
    if (on("overall"))
      out.push({
        key: "overall",
        kind: "overall",
        title: "Where everything stands",
        subtitle: `${filterLabel} · ${n} parts · ${RANGE_LABELS[cfg.range]}`,
        body: <Overall rows={parts} range={cfg.range} now={now} />,
        say:
          `Where everything stands, across ${n} parts. ` +
          STAGES.map((s) => `${STAGE_LABELS[s]}: ${pct(t[s].done, n)} percent done${detailed ? `, that is ${t[s].done} parts, with ${t[s].in_process} in process` : ""}${cfg.range !== "all" ? `, and ${doneBetween(parts, s, w.from, w.to)} finished ${periodWord}` : ""}.`).join(" "),
        ppt: (p) =>
          p.slide.addChart(p.charts.bar, [{ name: "% done", labels: STAGES.map((s) => STAGE_LABELS[s]), values: STAGES.map((s) => pct(t[s].done, n)) }], {
            x: 0.5, y: 1.5, w: 12.3, h: 5.2, barDir: "col", chartColors: STAGES.map((s) => STAGE_HEX[s]), showValue: true, dataLabelFormatCode: '0"%"', valAxisMaxVal: 100, catAxisLabelFontSize: 14,
          }),
      });
    if (on("analyzer")) {
      const ins = analyze(parts, mode, cfg.range, now, users);
      out.push({
        key: "analyzer",
        kind: "analyzer",
        title: "What the numbers say",
        subtitle: `Analyzer · ${RANGE_LABELS[cfg.range]}`,
        body: <Analyzer insights={ins} />,
        say: `Here is what the numbers say. ${ins.map((i) => i.text).join(" ")}`,
        ppt: (p) => p.slide.addText(ins.map((i) => ({ text: i.text, options: { bullet: true, breakLine: true, color: i.tone === "watch" ? "B45309" : i.tone === "good" ? "15803D" : "1E293B" } })), { x: 0.5, y: 1.5, w: 12.3, h: 5.3, fontSize: 18, valign: "top", paraSpaceAfter: 10 }),
      });
    }
    if (on("compare")) {
      const kinds: Compare[] = detailed ? ["previous", "groups", "stages"] : [cfg.compare];
      for (const k of kinds) {
        const d = compareData(parts, k, mode, cfg.range, now);
        out.push({
          key: `compare-${k}`,
          kind: "compare",
          title: d.title,
          subtitle: `Comparison · ${COMPARE_LABELS[k]}`,
          body: <Comparison data={d} kind={k} />,
          say:
            `${d.title}. ` +
            d.rows
              .slice(0, detailed ? 20 : 5)
              .map((r) => (k === "previous" ? `${r.label}: ${r.a} this period against ${r.b} before.` : k === "groups" ? `${r.label}: ${r.a} percent published.` : `${r.label}: ${r.a} done, ${r.b} in process.`))
              .join(" "),
          ppt: (p) =>
            p.slide.addChart(
              p.charts.bar,
              [
                { name: d.aLabel, labels: d.rows.map((r) => r.label), values: d.rows.map((r) => r.a) },
                ...(d.bLabel ? [{ name: d.bLabel, labels: d.rows.map((r) => r.label), values: d.rows.map((r) => r.b) }] : []),
              ],
              { x: 0.5, y: 1.5, w: 12.3, h: 5.2, barDir: k === "groups" ? "bar" : "col", barGrouping: "clustered", chartColors: ["4F46E5", "94A3B8"], showLegend: true, legendPos: "b", showValue: true },
            ),
        });
      }
    }
    if (on("groups"))
      for (const g of groupsOf(parts, mode)) {
        const sub = groupsOf(g.rows, mode === "grade" ? "subject" : "grade");
        const gt = tally(g.rows);
        out.push({
          key: `g-${g.id}`,
          kind: "groups",
          title: g.name,
          subtitle: `${g.rows.length} parts by ${mode === "grade" ? "subject" : "grade"}`,
          body: <Group rows={g.rows} mode={mode} detailed={detailed} />,
          say:
            `${g.name}: ${pct(gt.publication.done, g.rows.length)} percent published and ${pct(gt.recording.done, g.rows.length)} percent recorded. ` +
            sub
              .slice(0, detailed ? 30 : 3)
              .map((x) => {
                const xt = tally(x.rows);
                return detailed ? `${x.name}: ${STAGES.map((s) => `${pct(xt[s].done, x.rows.length)} percent ${DONE_WORD[s].toLowerCase()}`).join(", ")}.` : `${x.name} is ${pct(xt.publication.done, x.rows.length)} percent published.`;
              })
              .join(" "),
          ppt: (p) =>
            p.slide.addChart(
              p.charts.bar,
              STAGES.map((s) => ({ name: STAGE_LABELS[s], labels: sub.map((x) => x.name), values: sub.map((x) => pct(tally(x.rows)[s].done, x.rows.length)) })),
              { x: 0.5, y: 1.5, w: 12.3, h: 5.2, barDir: "bar", barGrouping: "clustered", chartColors: STAGES.map((s) => STAGE_HEX[s]), showLegend: true, legendPos: "b", valAxisMaxVal: 100 },
            ),
        });
      }
    if (on("stages") || detailed)
      for (const s of STAGES)
        out.push({
          key: `s-${s}`,
          kind: "stages",
          title: `${STAGE_LABELS[s]} in detail`,
          subtitle: `${pct(t[s].done, n)}% done · ${t[s].in_process} in process · ${t[s].missing} not started`,
          body: <StageDetail rows={parts} stage={s} mode={mode} users={users} />,
          say: `${STAGE_LABELS[s]} in detail: ${t[s].done} done, ${t[s].in_process} in process and ${t[s].missing} not started.`,
          ppt: (p) => {
            const gs = groupsOf(parts, mode).map((g) => [g.name, g.rows.length, tally(g.rows)[s].done, `${pct(tally(g.rows)[s].done, g.rows.length)}%`]);
            pptTable(p, [mode === "grade" ? "Grade" : "Subject", "Parts", "Done", "%"], gs.slice(0, 18));
          },
        });
    if (on("recent")) {
      const since = cfg.range === "all" ? now - 14 * DAY : w.from;
      const list = parts
        .flatMap((r) => STAGES.filter((s) => r.stages[s] === "done" && r.dates[s]).map((s) => ({ r, s, at: r.dates[s]! })))
        .filter((x) => Date.parse(x.at) >= since)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, detailed ? 20 : 10);
      out.push({
        key: "recent",
        kind: "recent",
        title: "Recently finished",
        subtitle: cfg.range === "all" ? "The last two weeks" : RANGE_LABELS[cfg.range],
        body: <Recent list={list} now={now} />,
        say: list.length ? `Recently finished: ${list.slice(0, detailed ? 20 : 5).map((x) => `${partName(x.r).replace(/ · /g, ", ")} was ${DONE_WORD[x.s].toLowerCase()} ${ago(x.at, now)}`).join(". ")}.` : "Nothing was finished in this period.",
        ppt: (p) => pptTable(p, ["Done", "Part", "When"], list.map((x) => [DONE_WORD[x.s], partName(x.r), ago(x.at, now)])),
      });
    }
    if (on("next")) {
      const list = parts
        .map((r) => ({ r, s: STAGES.find((s) => r.stages[s] === "in_process") }))
        .filter((x): x is { r: StructureRow; s: Stage } => !!x.s)
        .sort((a, b) => STAGES.indexOf(b.s) - STAGES.indexOf(a.s))
        .slice(0, detailed ? 20 : 10);
      out.push({
        key: "next",
        kind: "next",
        title: "In process now",
        subtitle: "What the teams are working on",
        body: <Next list={list} users={users} />,
        say: list.length ? `In process now: ${list.length} parts, furthest along first. ${list.slice(0, detailed ? 20 : 4).map((x) => `${partName(x.r).replace(/ · /g, ", ")} in ${STAGE_LABELS[x.s]}`).join(". ")}.` : "Nothing is in process right now.",
        ppt: (p) => pptTable(p, ["Stage", "Part", "Who"], list.map((x) => [STAGE_LABELS[x.s], partName(x.r), x.r.ownerIds.map((id) => users[id]).filter(Boolean).join(", ")])),
      });
    }
    if (!out.length) out.push({ key: "none", kind: "overall", title: "No slides chosen", subtitle: "Open Customize to choose slides", body: <Empty text="Choose slides in Customize." />, say: "", ppt: () => {} });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- w derives from cfg.range and now
  }, [parts, mode, filterLabel, users, now, cfg.slides, cfg.range, cfg.compare, cfg.detail]);

  const count = slides.length;
  const go = React.useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);
  const at = Math.min(index, count - 1);
  const slide = slides[at]!;

  // Voice mode reads each slide, then moves on when it has finished; otherwise slides change on a timer.
  React.useEffect(() => {
    if (!cfg.voice || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    if (!playing || !slide.say) return;
    const u = new SpeechSynthesisUtterance(slide.say);
    const v = voices.find((x) => x.name === cfg.voiceName);
    if (v) u.voice = v;
    u.rate = cfg.rate;
    u.onend = () => setTimeout(() => go(1), 1200);
    speechSynthesis.speak(u);
    return () => speechSynthesis.cancel();
  }, [cfg.voice, cfg.voiceName, cfg.rate, playing, slide.key, slide.say, voices, go]);
  React.useEffect(() => {
    if (!playing || cfg.voice) return;
    const t = setTimeout(() => go(1), cfg.speed * 1000);
    return () => clearTimeout(t);
  }, [playing, cfg.speed, cfg.voice, at, go]);

  React.useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setNow(Date.now());
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,select,[role=combobox],[role=listbox],[role=dialog]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key.toLowerCase() === "v") set({ voice: !cfg.voice });
      else if (e.key === "Escape" && !document.fullscreenElement && !panel) router.push(backHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set is stable in behaviour
  }, [go, router, backHref, cfg.voice, panel]);

  // ---- Exports ----
  const fileBase = `myseed-overview-${new Date(now).toISOString().slice(0, 10)}`;
  const download = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const waitFrame = (ms = 600) => new Promise((r) => setTimeout(r, ms));

  const exportPpt = async () => {
    setBusy("ppt");
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pres = new PptxGenJS();
      pres.layout = "LAYOUT_WIDE";
      pres.title = `Myseed overview, ${filterLabel}`;
      const cover = pres.addSlide();
      cover.addText("Myseed overview", { x: 0.5, y: 2.4, w: 12.3, fontSize: 40, bold: true, color: "1E293B" });
      cover.addText(`${filterLabel} · ${RANGE_LABELS[cfg.range]} · ${new Date(now).toLocaleDateString()}`, { x: 0.5, y: 3.4, w: 12.3, fontSize: 18, color: "64748B" });
      for (const s of slides) {
        const ps = pres.addSlide();
        ps.addText(s.title, { x: 0.5, y: 0.35, w: 12.3, fontSize: 28, bold: true, color: "1E293B" });
        ps.addText(s.subtitle, { x: 0.5, y: 0.95, w: 12.3, fontSize: 14, color: "64748B" });
        s.ppt({ slide: ps as unknown as PptSlide, charts: pres.ChartType as unknown as Record<string, unknown> });
        if (s.say) ps.addNotes(s.say);
      }
      await pres.writeFile({ fileName: `${fileBase}.pptx` });
      toast.success("PowerPoint downloaded. The narration is in the speaker notes.");
    } catch (e) {
      toast.error(`Could not make the PowerPoint: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  };

  const exportVideo = async () => {
    if (typeof MediaRecorder === "undefined") return toast.error("This browser cannot record video. Try Chrome or Edge.");
    setBusy("video");
    setPlaying(false);
    try {
      const { domToCanvas } = await import("modern-screenshot");
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(15);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      const bg = getComputedStyle(document.body).backgroundColor;
      rec.start(500);
      for (let i = 0; i < slides.length; i++) {
        setIndex(i);
        await waitFrame(900);
        const shot = await domToCanvas(stage.current!, { backgroundColor: bg, scale: 1 });
        const hold = Math.max(3000, Math.min(12000, slides[i]!.say.length * 45));
        const end = performance.now() + hold;
        while (performance.now() < end) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 1920, 1080);
          const k = Math.min(1920 / shot.width, 1080 / shot.height);
          ctx.drawImage(shot, (1920 - shot.width * k) / 2, (1080 - shot.height * k) / 2, shot.width * k, shot.height * k);
          await waitFrame(66);
        }
        toast.message(`Recording slide ${i + 1} of ${slides.length}`, { id: "rec" });
      }
      rec.stop();
      await stopped;
      download(new Blob(chunks, { type: "video/webm" }), `${fileBase}.webm`);
      toast.success("Video downloaded (WebM). It plays in browsers, VLC and PowerPoint, and uploads to YouTube.", { id: "rec" });
    } catch (e) {
      toast.error(`Could not record the video: ${e instanceof Error ? e.message : e}`, { id: "rec" });
    }
    setBusy(null);
  };

  const exportPng = async () => {
    setBusy("png");
    const { domToBlob } = await import("modern-screenshot");
    const blob = await domToBlob(stage.current!, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2 });
    if (blob) download(blob, `${fileBase}-${slide.key}.png`);
    setBusy(null);
  };

  const exportCsv = () => {
    const lines = [["Grade", "Subject", "Unit", "Part", "Code", ...STAGES.map((s) => STAGE_LABELS[s]), ...STAGES.map((s) => `${DONE_WORD[s]} on`)]];
    for (const r of parts) lines.push([r.gradeName, r.subjectName, String(r.unitNumber), String(r.partNumber ?? ""), r.itemCode ?? "", ...STAGES.map((s) => r.stages[s]), ...STAGES.map((s) => r.dates[s]?.slice(0, 10) ?? "")]);
    download(new Blob([lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")], { type: "text/csv" }), `${fileBase}.csv`);
  };
  const exportJson = () => {
    const data = { generatedAt: new Date(now).toISOString(), filter: filterLabel, range: cfg.range, insights: analyze(parts, mode, cfg.range, now, users), stages: tally(parts), slides: slides.map((s) => ({ title: s.title, narration: s.say })) };
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${fileBase}.json`);
  };
  const exportScript = () => download(new Blob([slides.map((s, i) => `${i + 1}. ${s.title}\n${s.say}\n`).join("\n")], { type: "text/plain" }), `${fileBase}-script.txt`);

  const toggleKind = (k: SlideKind, on: boolean) => set({ slides: on ? [...cfg.slides.filter((x) => x !== k), k].sort((a, b) => Object.keys(KIND_LABELS).indexOf(a) - Object.keys(KIND_LABELS).indexOf(b)) : cfg.slides.filter((x) => x !== k) });

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col bg-background", cfg.large && "text-[1.15rem]")}>
      <div ref={stage} className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex items-end justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{slide.subtitle}</div>
            <h1 className="truncate text-3xl font-semibold sm:text-4xl">{slide.title}</h1>
          </div>
          <div className="shrink-0 text-right text-sm text-muted-foreground tabular">
            {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            <div className="text-xs">{cfg.voice ? "Voice on" : "Updates every minute"}</div>
          </div>
        </div>
        <div key={slide.key} className="min-h-0 flex-1 overflow-auto px-6 py-6 animate-in fade-in duration-500 sm:px-10">
          {slide.body}
        </div>
        {cfg.voice && slide.say && <p className="mx-6 mb-3 line-clamp-2 rounded-lg bg-muted/60 px-4 py-2 text-sm text-muted-foreground sm:mx-10">{slide.say}</p>}
      </div>
      {playing && !cfg.voice && <div key={`p${at}-${cfg.speed}`} className="h-0.5 origin-left bg-primary/60" style={{ animation: `viz-progress ${cfg.speed}s linear forwards` }} />}
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 sm:px-8">
        <Button size="icon-sm" variant="ghost" aria-label="Previous" title="Previous slide (left arrow)" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause (space)" : "Play (space)"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next" title="Next slide (right arrow)" onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
        <Select value={cfg.range} onValueChange={(v) => set({ range: v as Range })}>
          <SelectTrigger size="sm" className="w-44" aria-label="Time range" title="The period counted as finished, compared and analysed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <SelectItem key={r} value={r}>
                {RANGE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cfg.detail} onValueChange={(v) => set({ detail: v as Detail })}>
          <SelectTrigger size="sm" className="w-32" aria-label="Detail" title="Detailed adds every comparison, a slide per stage, and reads every number">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="summary">Summary</SelectItem>
            <SelectItem value="detailed">Detailed</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant={cfg.voice ? "default" : "ghost"} onClick={() => set({ voice: !cfg.voice })} title="Voice mode reads each slide aloud, then moves on (V)" aria-pressed={cfg.voice}>
          {cfg.voice ? <Volume2Icon /> : <VolumeXIcon />} Voice
        </Button>
        <div className="mx-auto flex flex-wrap items-center gap-1.5">
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Go to ${s.title}`} title={s.title} onClick={() => setIndex(i)} className={cn("h-2 rounded-full transition-all", i === at ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60")} />
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setPanel(true)} title="Choose slides, comparison, speed and voice">
          <SlidersHorizontalIcon /> Customize
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!!busy} title="Download as PowerPoint, video, image, PDF or data">
              {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Export these {slides.length} slides</DropdownMenuLabel>
            <DropdownMenuItem onClick={exportPpt}>
              <PresentationIcon /> PowerPoint (.pptx, editable charts)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportVideo}>
              <VideoIcon /> Video (.webm)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportPng}>
              <FileImageIcon /> This slide as an image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}>
              <FileTextIcon /> PDF (print this slide)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportCsv}>
              <FileSpreadsheetIcon /> Data for Excel or Power BI (.csv)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportJson}>
              <FileTextIcon /> Data and insights (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportScript}>
              <FileTextIcon /> Narration script (.txt)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon-sm" variant="ghost" aria-label="Full screen" title="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
          <MaximizeIcon />
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={backHref} title="Back to the Overview (Esc)">
            <XIcon /> Exit
          </Link>
        </Button>
      </div>
      <Sheet open={panel} onOpenChange={setPanel}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Customize the presentation</SheetTitle>
            <SheetDescription>Saved on this device. The grade and subject filters come from the Overview.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-6 text-sm">
            <section className="space-y-2">
              <Label>Slides</Label>
              {(Object.keys(KIND_LABELS) as SlideKind[]).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <Checkbox checked={cfg.slides.includes(k)} onCheckedChange={(v) => toggleKind(k, v === true)} /> {KIND_LABELS[k]}
                </label>
              ))}
            </section>
            <section className="space-y-2">
              <Label>Compare</Label>
              <Select value={cfg.compare} onValueChange={(v) => set({ compare: v as Compare })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMPARE_LABELS) as Compare[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {COMPARE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Detailed mode shows all three.</p>
            </section>
            <section className="space-y-2">
              <Label>Seconds per slide (without voice)</Label>
              <Select value={String(cfg.speed)} onValueChange={(v) => set({ speed: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEEDS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} seconds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
            <section className="space-y-2">
              <Label>Voice</Label>
              <label className="flex items-center gap-2">
                <Checkbox checked={cfg.voice} onCheckedChange={(v) => set({ voice: v === true })} /> Read each slide aloud, like an explainer
              </label>
              <Select value={cfg.voiceName || "__default"} onValueChange={(v) => set({ voiceName: v === "__default" ? "" : v })}>
                <SelectTrigger className="w-full" aria-label="Voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Browser default voice</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <span className="w-24 text-xs text-muted-foreground">Speed {cfg.rate.toFixed(1)}x</span>
                <input type="range" min={0.6} max={1.6} step={0.1} value={cfg.rate} onChange={(e) => set({ rate: Number(e.target.value) })} className="flex-1" aria-label="Reading speed" />
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                if (typeof speechSynthesis === "undefined") return;
                speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(slide.say || "This is how the narration sounds.");
                const v = voices.find((x) => x.name === cfg.voiceName);
                if (v) u.voice = v;
                u.rate = cfg.rate;
                speechSynthesis.speak(u);
              }}>
                <Volume2Icon /> Try this slide
              </Button>
            </section>
            <section className="space-y-2">
              <Label>Display</Label>
              <label className="flex items-center gap-2">
                <Checkbox checked={cfg.large} onCheckedChange={(v) => set({ large: v === true })} /> Larger text for big rooms
              </label>
            </section>
            <Button variant="ghost" size="sm" onClick={() => set(DEFAULTS)}>
              Back to the defaults
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
