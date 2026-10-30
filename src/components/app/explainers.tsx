"use client";

import * as React from "react";
import { CheckIcon, MousePointer2Icon, PauseIcon, PlayCircleIcon, PlayIcon, RotateCcwIcon, Volume2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Short animated "show me how" clips, drawn with the app's own look: a cursor moves, clicks, and the mock screen
// changes, with a caption per step. Positions are percentages of the stage, so they scale with the space they get.

export type ExplainerKey = "my-board" | "lead-desk" | "ask-leave" | "present" | "assign" | "sidebar" | "view-as" | "profile";

type Frame = { cursor: [number, number]; click?: boolean; caption: string; scene: React.ReactNode };

const Box = ({ x, y, w, h, className, children, style }: { x: number; y: number; w: number; h: number; className?: string; children?: React.ReactNode; style?: React.CSSProperties }) => (
  <div className={cn("absolute rounded-md transition-all duration-700 ease-in-out", className)} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, ...style }}>
    {children}
  </div>
);
const Btn = ({ x, y, w = 12, label, hot, tone = "primary" }: { x: number; y: number; w?: number; label: string; hot?: boolean; tone?: "primary" | "outline" }) => (
  <Box
    x={x}
    y={y}
    w={w}
    h={7}
    className={cn(
      "flex items-center justify-center text-[clamp(7px,1.4cqw,11px)] font-medium",
      tone === "primary" ? "bg-primary text-primary-foreground" : "border bg-background",
      hot && "ring-2 ring-primary/50 ring-offset-1",
    )}
  >
    {label}
  </Box>
);
const Label = ({ x, y, children, className }: { x: number; y: number; children: React.ReactNode; className?: string }) => (
  <div className={cn("absolute text-[clamp(7px,1.4cqw,11px)] transition-all duration-700", className)} style={{ left: `${x}%`, top: `${y}%` }}>
    {children}
  </div>
);
const Card = ({ x, y, w = 21, h = 20, title, children, glow }: { x: number; y: number; w?: number; h?: number; title: string; children?: React.ReactNode; glow?: boolean }) => (
  <Box x={x} y={y} w={w} h={h} className={cn("border bg-card p-[1.2%] shadow-sm", glow && "border-primary shadow-md")}>
    <div className="font-mono text-[clamp(6px,1.1cqw,9px)] text-muted-foreground">MY-G05-MATH</div>
    <div className="text-[clamp(7px,1.5cqw,12px)] font-medium">{title}</div>
    {children}
  </Box>
);
const Column = ({ x, label, w = 22 }: { x: number; label: string; w?: number }) => (
  <Box x={x} y={8} w={w} h={74} className="bg-muted/60">
    <div className="p-[4%] text-[clamp(7px,1.4cqw,11px)] font-semibold">{label}</div>
  </Box>
);
const Pill = ({ x, y, text, tone }: { x: number; y: number; text: string; tone: "wait" | "ok" | "info" }) => (
  <Label x={x} y={y} className={cn("rounded-full px-[1.2%] py-[0.3%] font-medium", tone === "ok" ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : tone === "wait" ? "bg-[var(--st-paused-bg)] text-[var(--st-paused-fg)]" : "bg-[var(--st-handoff-bg)] text-[var(--st-handoff-fg)]")}>
    {text}
  </Label>
);

const COLS = [3, 27, 51, 75];

const SCRIPTS: Record<ExplainerKey, { title: string; frames: () => Frame[] }> = {
  "my-board": {
    title: "From To do to your team lead",
    frames: () => {
      const board = (col: number, extra?: React.ReactNode, glow?: boolean) => (
        <>
          {["To do", "In progress", "Done, not sent", "With team lead"].map((l, i) => (
            <Column key={l} x={COLS[i]!} label={l} />
          ))}
          <Card x={COLS[col]! + 0.5} y={18} title="Unit 3 · Part 2" glow={glow} h={extra ? 40 : 20}>
            {extra}
          </Card>
        </>
      );
      return [
        { cursor: [50, 92], caption: "Work assigned to you lands in To do.", scene: board(0) },
        { cursor: [10, 33], click: true, caption: "Press Start. Your time starts counting.", scene: <>{board(0)}<Btn x={4.5} y={30} w={8} label="Start" hot /></> },
        { cursor: [36, 26], click: true, caption: "Tap the card to open it.", scene: board(1, undefined, true) },
        {
          cursor: [31, 36],
          click: true,
          caption: "Tick the checklist and paste the links. No other page needed.",
          scene: board(
            1,
            <div className="mt-[4%] space-y-[3%] text-[clamp(6px,1.2cqw,10px)]">
              {["Cuts reviewed", "Audio cleaned", "Master link"].map((x, i) => (
                <div key={x} className="flex items-center gap-1">
                  <span className={cn("flex size-[1.1em] items-center justify-center rounded-sm border", i < 2 && "bg-primary text-primary-foreground")}>{i < 2 && <CheckIcon className="size-[0.8em]" />}</span>
                  {x}
                </div>
              ))}
            </div>,
            true,
          ),
        },
        { cursor: [57, 33], click: true, caption: "Press Done when it is finished.", scene: <>{board(2)}<Btn x={52.5} y={30} w={8} label="Done" hot /></> },
        { cursor: [81, 33], click: true, caption: "Send it to your team lead: one card now, or all of them at the end of the day.", scene: <>{board(3)}<Pill x={77} y={32} text="Waiting for approval" tone="wait" /></> },
      ];
    },
  },
  "lead-desk": {
    title: "Approve, hand over, accept and assign",
    frames: () => {
      const desk = (where: "approve" | "ready" | "next", pill?: React.ReactNode) => (
        <>
          <Column x={3} w={29} label="To approve" />
          <Column x={35} w={29} label="Ready for handover" />
          <Column x={67} w={30} label="Next team's lead" />
          <Card x={where === "approve" ? 4 : where === "ready" ? 36 : 68} y={18} w={27} title="Part 1 · by Abel">
            {pill}
          </Card>
        </>
      );
      return [
        { cursor: [50, 92], caption: "Your team's finished work arrives in To approve.", scene: desk("approve") },
        { cursor: [16, 34], click: true, caption: "Open it, check the work, then press Approve (or Return with a note).", scene: <>{desk("approve")}<Btn x={5} y={31} w={10} label="Approve" hot /><Btn x={16} y={31} w={10} label="Return" tone="outline" /></> },
        { cursor: [50, 14], caption: "Approved work waits in Ready for handover.", scene: desk("ready") },
        { cursor: [48, 34], click: true, caption: "Press Hand over. The next team's lead is told straight away.", scene: <>{desk("ready")}<Btn x={37} y={31} w={18} label="Hand over" hot /></> },
        { cursor: [82, 34], click: true, caption: "They accept it and assign it to someone on their team.", scene: <>{desk("next", <Pill x={4} y={60} text="Accepted" tone="ok" />)}</> },
      ];
    },
  },
  "ask-leave": {
    title: "Asking for leave",
    frames: () => {
      const form = (status?: React.ReactNode, filled?: boolean) => (
        <>
          <Box x={4} y={8} w={42} h={78} className="border bg-card" />
          <Label x={7} y={12} className="font-semibold">Ask for leave</Label>
          <Box x={7} y={22} w={36} h={8} className="border bg-background px-[1%] text-[clamp(7px,1.3cqw,10px)] leading-[2]">Annual leave</Box>
          <Box x={7} y={34} w={17} h={8} className="border bg-background px-[1%] text-[clamp(7px,1.3cqw,10px)] leading-[2]">{filled ? "Mon 23" : ""}</Box>
          <Box x={26} y={34} w={17} h={8} className="border bg-background px-[1%] text-[clamp(7px,1.3cqw,10px)] leading-[2]">{filled ? "Tue 24" : ""}</Box>
          {filled && <Label x={7} y={46} className="text-muted-foreground">2 working days</Label>}
          <Btn x={7} y={56} w={20} label="Ask for leave" hot={filled && !status} />
          <Box x={52} y={8} w={44} h={78} className="border bg-card" />
          <Label x={55} y={12} className="font-semibold">Your leave</Label>
          {status}
        </>
      );
      return [
        { cursor: [24, 26], click: true, caption: "Choose the leave type.", scene: form() },
        { cursor: [20, 38], click: true, caption: "Pick the first and last day. Weekends and public holidays are not counted.", scene: form(undefined, true) },
        { cursor: [16, 60], click: true, caption: "Ask for leave. Your line manager is told.", scene: form(<Pill x={55} y={24} text="With line manager" tone="wait" />, true) },
        { cursor: [70, 30], caption: "Your line manager approves, then HR.", scene: form(<Pill x={55} y={24} text="With HR" tone="info" />, true) },
        { cursor: [70, 30], caption: "Approved. You are told, and your team's calendar shows it.", scene: form(<Pill x={55} y={24} text="Approved" tone="ok" />, true) },
      ];
    },
  },
  present: {
    title: "Presenting the Overview",
    frames: () => {
      const bars = (grow: boolean) => (
        <>
          {[62, 44, 41, 24].map((v, i) => (
            <Box key={i} x={8 + i * 22} y={30 + (grow ? 50 - v * 0.6 : 50)} w={14} h={grow ? v * 0.6 : 0} style={{ background: `var(--stage-${["recording", "editing", "uploading", "publication"][i]})` }} />
          ))}
        </>
      );
      return [
        { cursor: [83, 12], click: true, caption: "On the Overview, press Present. It keeps your filters.", scene: <><Label x={4} y={8} className="text-[clamp(9px,2cqw,16px)] font-semibold">Overview</Label><Btn x={76} y={8} w={14} label="Present" hot tone="outline" /><Box x={4} y={22} w={92} h={60} className="border bg-card" /></> },
        { cursor: [50, 92], caption: "Slides change by themselves: progress, each grade, what finished, what is next.", scene: <><Label x={4} y={8} className="text-[clamp(9px,2cqw,16px)] font-semibold">Where everything stands</Label>{bars(true)}</> },
        { cursor: [30, 92], click: true, caption: "Turn on Voice and it reads each slide aloud, like an explainer.", scene: <><Label x={4} y={8} className="text-[clamp(9px,2cqw,16px)] font-semibold">What the numbers say</Label><Box x={4} y={24} w={92} h={14} className="border-l-4 border-l-[var(--st-paused-fg)] bg-card p-[1%] text-[clamp(7px,1.3cqw,11px)]">The bottleneck is Editing: 360 parts are recorded but not edited.</Box><Box x={4} y={42} w={92} h={14} className="border-l-4 border-l-primary bg-card p-[1%] text-[clamp(7px,1.3cqw,11px)]">At this pace the rest is published around March.</Box><Label x={27} y={86}><Volume2Icon className="size-[1.4em] animate-pulse text-primary" /></Label></> },
        { cursor: [88, 92], click: true, caption: "Export to PowerPoint, video, an image or data for Power BI.", scene: <><Box x={62} y={42} w={34} h={44} className="border bg-popover p-[1.5%] text-[clamp(7px,1.3cqw,10px)] shadow-md"><div>PowerPoint (.pptx)</div><div>Video (.webm)</div><div>Image</div><div>Data for Power BI</div></Box>{bars(true)}</> },
      ];
    },
  },
  assign: {
    title: "Assigning work",
    frames: () => {
      const list = (ticked: number, assigned?: boolean) => (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} x={assigned && i < ticked ? 70 : 4} y={assigned && i < ticked ? 62 : 20 + i * 16} w={assigned && i < ticked ? 0 : 50} h={12} className={cn("border bg-card px-[1%] text-[clamp(7px,1.3cqw,10px)] leading-[2.4]", assigned && i < ticked && "opacity-0")}>
              <span className={cn("mr-1 inline-flex size-[1.1em] items-center justify-center rounded-sm border align-middle", i < ticked && "bg-primary text-primary-foreground")}>{i < ticked && <CheckIcon className="size-[0.8em]" />}</span> Unit 5 · Part {i + 1}
            </Box>
          ))}
          <Box x={60} y={20} w={30} h={9} className="border bg-background px-[1%] text-[clamp(7px,1.3cqw,10px)] leading-[2]">{ticked ? "Hana Girma" : "Assign to…"}</Box>
          <Label x={64} y={58} className="flex items-center gap-1"><span className="flex size-[2em] items-center justify-center rounded-full bg-primary/15 font-semibold">HG</span>{assigned ? `${ticked} new` : ""}</Label>
        </>
      );
      return [
        { cursor: [7, 25], click: true, caption: "Tick the parts to assign, or press Tick next 5.", scene: list(2) },
        { cursor: [72, 24], click: true, caption: "Choose the person. You see how much they already have open.", scene: list(2) },
        { cursor: [72, 40], click: true, caption: "Press Assign. They are told once, and the work is on their board.", scene: <>{list(2, true)}<Btn x={60} y={34} w={16} label="Assign 2" hot /></> },
      ];
    },
  },
  sidebar: {
    title: "Making the sidebar yours",
    frames: () => {
      const side = (items: string[], open?: boolean) => (
        <>
          <Box x={3} y={6} w={26} h={86} className="border bg-muted/50" />
          {items.map((l, i) => (
            <Label key={l} x={6} y={12 + i * 9}>
              {l}
            </Label>
          ))}
          <Label x={24} y={84}>⚙</Label>
          {open && (
            <Box x={36} y={14} w={56} h={64} className="border bg-popover p-[2%] text-[clamp(7px,1.3cqw,10px)] shadow-lg">
              <div className="font-semibold">Customize your sidebar</div>
              {["Overview", "Work views", "Coverage"].map((l, i) => (
                <div key={l} className="mt-[2%] flex items-center gap-1">
                  <span className={cn("flex size-[1.1em] items-center justify-center rounded-sm border", i !== 2 && "bg-primary text-primary-foreground")}>{i !== 2 && <CheckIcon className="size-[0.8em]" />}</span>
                  {l}
                </div>
              ))}
            </Box>
          )}
        </>
      );
      return [
        { cursor: [16, 40], caption: "Hover any entry to see what it is for.", scene: side(["My work", "My record", "Overview", "Work views", "Coverage"]) },
        { cursor: [25, 86], click: true, caption: "Press the gear at the bottom of the sidebar.", scene: side(["My work", "My record", "Overview", "Work views", "Coverage"], true) },
        { cursor: [40, 52], click: true, caption: "Untick what you do not use, and save.", scene: side(["My work", "My record", "Overview", "Work views"], true) },
        { cursor: [50, 92], caption: "Your sidebar now shows only what you need.", scene: side(["My work", "My record", "Overview", "Work views"]) },
      ];
    },
  },
  "view-as": {
    title: "Seeing the app as someone else",
    frames: () => {
      const pick = (chosen?: boolean) => (
        <>
          <Box x={4} y={8} w={40} h={80} className="border bg-card p-[2%] text-[clamp(7px,1.3cqw,10px)]">
            <div className="font-semibold">View as</div>
            <div className="mt-[4%]">Role: Editing</div>
            <div>Position: Team lead</div>
            <div className={cn("mt-[4%] rounded px-[2%]", chosen && "bg-primary/15")}>Eden Haile</div>
            <div>Abel Tesfaye</div>
          </Box>
        </>
      );
      return [
        { cursor: [20, 30], click: true, caption: "In Admin, View as: choose a role, a department or a position.", scene: pick() },
        { cursor: [16, 42], click: true, caption: "Pick a person who matches.", scene: pick(true) },
        { cursor: [70, 10], caption: "You see exactly their sidebar, Home and pages. Nothing can be changed while you look.", scene: <><Box x={0} y={0} w={100} h={9} className="rounded-none bg-[var(--st-paused-bg)] px-[2%] text-[clamp(7px,1.3cqw,10px)] leading-[2.2] text-[var(--st-paused-fg)]">Viewing as Eden Haile (read only) · Exit</Box><Box x={3} y={14} w={22} h={78} className="border bg-muted/50" /><Box x={28} y={14} w={68} h={78} className="border bg-card" /></> },
      ];
    },
  },
  profile: {
    title: "Your profile",
    frames: () => {
      const prof = (skills: string[], photo?: boolean) => (
        <>
          <Box x={4} y={6} w={92} h={24} className="bg-gradient-to-r from-primary/60 to-primary/20" />
          <Box x={8} y={20} w={13} h={22} className={cn("rounded-full border-4 border-background", photo ? "bg-primary/40" : "bg-muted")} />
          <Label x={24} y={33} className="font-semibold">Hana Girma · Video editor</Label>
          <Label x={8} y={50} className="font-semibold">Skills</Label>
          {skills.map((s, i) => (
            <Label key={s} x={8 + i * 18} y={58} className="rounded-full bg-muted px-[1%]">{s}</Label>
          ))}
          <Label x={8} y={70} className="font-semibold">Education</Label>
          <Label x={8} y={78} className="text-muted-foreground">BSc Film, Addis Ababa University</Label>
        </>
      );
      return [
        { cursor: [14, 30], click: true, caption: "Add a photo and choose your cover colour.", scene: prof([], true) },
        { cursor: [30, 60], click: true, caption: "Add your skills with a level.", scene: prof(["Premiere", "Colour"], true) },
        { cursor: [30, 78], caption: "Add education and upload certificates. Colleagues see your profile; files stay private to you, your lead and HR.", scene: prof(["Premiere", "Colour", "After Effects"], true) },
      ];
    },
  },
};

export const EXPLAINER_TITLES: Record<ExplainerKey, string> = Object.fromEntries(Object.entries(SCRIPTS).map(([k, v]) => [k, v.title])) as Record<ExplainerKey, string>;

// The clip itself: plays on a loop, pausable, with captions (and an optional spoken caption).
export function Explainer({ id, className, autoPlay = true }: { id: ExplainerKey; className?: string; autoPlay?: boolean }) {
  const frames = React.useMemo(() => SCRIPTS[id].frames(), [id]);
  const [at, setAt] = React.useState(0);
  const [playing, setPlaying] = React.useState(autoPlay);
  const [clicking, setClicking] = React.useState(false);
  const [voice, setVoice] = React.useState(false);
  const f = frames[at]!;
  React.useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % frames.length), 2600);
    return () => clearTimeout(t);
  }, [playing, at, frames.length]);
  React.useEffect(() => {
    if (!f.click) return;
    const a = setTimeout(() => setClicking(true), 800);
    const b = setTimeout(() => setClicking(false), 1150);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [at, f.click]);
  React.useEffect(() => {
    if (!voice || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(f.caption));
  }, [voice, f.caption]);
  React.useEffect(() => () => void (typeof speechSynthesis !== "undefined" && speechSynthesis.cancel()), []);
  return (
    <figure className={cn("space-y-2", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-gradient-to-br from-muted/40 to-background [container-type:inline-size]" aria-label={`${SCRIPTS[id].title}, animated`}>
        {f.scene}
        <div className="pointer-events-none absolute transition-all duration-700 ease-in-out" style={{ left: `${f.cursor[0]}%`, top: `${f.cursor[1]}%` }}>
          <MousePointer2Icon className={cn("size-[clamp(14px,3cqw,22px)] fill-foreground text-background drop-shadow transition-transform", clicking && "scale-75")} />
          {clicking && <span className="absolute -top-2 -left-2 size-6 animate-ping rounded-full bg-primary/40" />}
        </div>
      </div>
      <figcaption className="flex items-center gap-2 text-sm">
        <Button size="icon-xs" variant="ghost" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="From the start" onClick={() => setAt(0)}>
          <RotateCcwIcon />
        </Button>
        <Button size="icon-xs" variant={voice ? "secondary" : "ghost"} aria-label="Read the captions aloud" aria-pressed={voice} onClick={() => setVoice(!voice)}>
          <Volume2Icon />
        </Button>
        <span className="min-w-0 flex-1">
          <span className="mr-1 text-xs text-muted-foreground tabular">
            {at + 1}/{frames.length}
          </span>
          {f.caption}
        </span>
      </figcaption>
    </figure>
  );
}

// "Show me how" next to a page title: opens the clip in place.
export function ShowMeHow({ id }: { id: ExplainerKey }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" title={`Show me how: ${SCRIPTS[id].title}`}>
          <PlayCircleIcon className="size-3.5" /> Show me how
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,92vw)]">
        <p className="mb-2 text-sm font-semibold">{SCRIPTS[id].title}</p>
        <Explainer id={id} />
      </PopoverContent>
    </Popover>
  );
}
