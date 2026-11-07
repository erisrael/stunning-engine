"use client";

// The assistant (Phase 13, 13b) in the corner of every page: buttons for the person's own flows, a box to type in
// and a microphone. Without AI, typed or spoken text is matched against written keywords (typos allowed); with AI
// answers on (Admin, Assistant), it goes to Claude, which answers from the person's own data and prepares actions
// shown with Confirm. Simple voice commands (open a page, go back, scroll, close) work at once either way. A flow
// either does the task with pickers, a summary and Confirm (the same actions as the pages), or shows the way: it
// opens the page, dims it, rings what to press with a short note, and moves on when it is pressed.

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { BotIcon, CheckIcon, CircleDotIcon, ExternalLinkIcon, GripVerticalIcon, HistoryIcon, Loader2Icon, MessageSquareIcon, MicIcon, MicOffIcon, PanelRightCloseIcon, PanelRightOpenIcon, PlayIcon, RotateCcwIcon, SendIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { askAiAction, assistantDataAction, confirmProposalAction, deleteConversationAction, listConversationsAction, listRoutinesAction, loadConversationAction, logAssistantAction, requestRunAction } from "@/app/actions/assistant";
import { askedSteps, beginRun, RecordBar, RoutineRunner, SaveRoutineDialog, useRecorder } from "@/components/app/routines-client";
import type { Routine, RoutineStep } from "@/server/routines";
import { punchAction } from "@/app/actions/attendance";
import { saveTaskAction } from "@/app/actions/departments";
import { requestLeaveAction } from "@/app/actions/leave";
import { flowAssignAction, flowStartAction } from "@/app/actions/departments";
import { matchText, PLACES, score, type Flow, type Match, type ShowStep } from "@/lib/assistant";
import type { AssistantContext } from "@/server/assistant";
import type { AgentStep, Proposal } from "@/server/assistant-ai";
import { cn } from "@/lib/utils";

type Msg = { from: "me" | "bot"; text: string; actions?: { label: string; run: () => void }[]; proposal?: Proposal; busy?: boolean; settled?: string; done?: AgentStep[] };
type Convo = { id: string; title: string; mode: string; updatedAt: string; count: number };
const DOCK_KEY = "myseed.assistant.dock";
const MODE_KEY = "myseed.assistant.mode";
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLocal = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

// What the agent did on its own, one line per action, with a link to the result.
function AgentSteps({ steps, onOpen }: { steps: AgentStep[]; onOpen: (href: string) => void }) {
  return (
    <div className="space-y-1 rounded-lg border border-[#188038]/30 bg-[#188038]/5 p-2" data-agent-steps>
      <p className="flex items-center gap-1 text-xs font-medium">
        <BotIcon className="size-3.5" /> Done by the agent ({steps.filter((s) => s.ok).length} of {steps.length})
      </p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs" data-agent-step={s.ok ? "ok" : "failed"}>
          {s.ok ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-[#188038]" /> : <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
          <div className="min-w-0">
            <p className="font-medium">{s.title}</p>
            <p className={s.ok ? "text-muted-foreground" : "text-destructive"}>{s.result}</p>
            {s.href && (
              <button type="button" className="text-primary hover:underline" onClick={() => onOpen(s.href!)}>
                Open
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
type Opt = { id: string; label: string; note?: string | null };
const KEY = "myseed.assistant.show";

const fill = (href: string, base: string | null) => href.replace("{home}", base ?? "/dashboard");

function findTarget(step: ShowStep): HTMLElement | null {
  const visible = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.offsetParent !== null;
  if (step.selector)
    for (const sel of step.selector.split(",")) {
      const el = document.querySelector(sel.trim());
      if (visible(el)) return el;
    }
  if (step.text) {
    const want = step.text.toLowerCase();
    for (const el of document.querySelectorAll("button, a, [role=button]")) if (visible(el) && (el.textContent ?? "").trim().toLowerCase().startsWith(want)) return el as HTMLElement;
  }
  return null;
}

// Rings the element to press and dims the rest; the next step comes when it is pressed (or Next).
function ShowMe({ flow, base, onEnd }: { flow: Extract<Flow, { kind: "show" }>; base: string | null; onEnd: (finished: boolean, step: number) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = React.useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? "{}").step ?? 0;
    } catch {
      return 0;
    }
  });
  const [box, setBox] = React.useState<DOMRect | null>(null);
  const step = flow.steps[i];
  React.useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ flow: flow.key, step: i }));
    } catch {}
    if (!step) return;
    const href = step.href ? fill(step.href, base) : null;
    if (href && pathname !== href.split("?")[0]) router.push(href);
    let el: HTMLElement | null = null;
    let tries = 0;
    const next = () => setI((n: number) => n + 1);
    const timer = window.setInterval(() => {
      el = findTarget(step);
      tries++;
      if (el) {
        window.clearInterval(timer);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => setBox(el!.getBoundingClientRect()), 350);
        el.addEventListener("click", next, { once: true });
      } else if (tries > 40) {
        window.clearInterval(timer);
        setBox(null);
      }
    }, 200);
    const onScroll = () => el && setBox(el.getBoundingClientRect());
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearInterval(timer);
      el?.removeEventListener("click", next);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [i, step, base, pathname, router, flow.key]);
  React.useEffect(() => {
    if (!step) {
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
      onEnd(true, i);
    }
  }, [step, i, onEnd]);
  if (!step) return null;
  const pad = 6;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-assistant-show={flow.key}>
      {box ? (
        <div
          className="absolute rounded-lg outline-2 outline-primary outline-solid transition-all motion-reduce:transition-none"
          style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/40" />
      )}
      <div
        role="dialog"
        aria-label="Show me"
        className="pointer-events-auto absolute w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-sm shadow-lg"
        style={box ? { left: Math.min(Math.max(16, box.left), window.innerWidth - 336), top: box.bottom + 14 > window.innerHeight - 140 ? Math.max(16, box.top - 150) : box.bottom + 14 } : { left: "50%", top: "40%", transform: "translateX(-50%)" }}
      >
        <p className="text-xs text-muted-foreground">
          {flow.title} · step {i + 1} of {flow.steps.length}
        </p>
        <p className="mt-1">{box ? step.note : "Looking for it on this page…"}</p>
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => (sessionStorage.removeItem(KEY), onEnd(false, i))}>
            Stop
          </Button>
          <Button size="sm" onClick={() => setI(i + 1)}>
            {i + 1 < flow.steps.length ? "Next" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// A task done here, one question at a time, then a summary and Confirm.
function DoFlow({ flow, ctx, onEnd }: { flow: Extract<Flow, { kind: "do" }>; ctx: AssistantContext; onEnd: (finished: boolean, step: number, text?: string) => void }) {
  const router = useRouter();
  const [data, setData] = React.useState<{ types?: Opt[]; tasks?: Opt[]; people?: Opt[]; dept?: string; depts?: (Opt & { people: Opt[] })[]; state?: string; since?: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [v, setV] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void assistantDataAction(flow.key).then((r) => {
      if (!r.ok) return setError(r.error ?? "Not possible now.");
      const d = r.data as { types?: { key: string; label: string }[]; tasks?: Opt[]; people?: Opt[]; dept?: string; depts?: (Opt & { people: Opt[] })[]; state?: string; since?: string | null };
      setData({ ...d, types: d.types?.map((t) => ({ id: t.key, label: t.label })) });
    });
  }, [flow.key]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Loader2Icon className="size-4 animate-spin" />;
  const pick = (k: string, opts: Opt[], label: string, empty: string) =>
    opts.length ? (
      <div className="space-y-1.5">
        <p className="text-sm">{label}</p>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {opts.map((o) => (
            <button key={o.id} type="button" onClick={() => (setV({ ...v, [k]: o.id, [`${k}Label`]: o.label }), setStep(step + 1))} className="block w-full rounded border px-2 py-1 text-left text-sm hover:bg-muted">
              {o.label}
              {o.note && <span className="block text-xs text-amber-700 dark:text-amber-400">{o.note}</span>}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );
  const confirm = async (p: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done: string) => {
    setBusy(true);
    const r = await p();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const many = Array.isArray(r.data) ? (r.data as { ok: boolean; error?: string }[]) : null;
    if (many?.some((x) => !x.ok)) return toast.error(many.find((x) => !x.ok)!.error);
    toast.success(done);
    router.refresh();
    onEnd(true, step, done);
  };
  const summary = (lines: string[], go: () => void) => (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Check, then confirm:</p>
      <ul className="list-disc pl-5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setStep(0)}>
          Start again
        </Button>
        <Button size="sm" disabled={busy} onClick={go}>
          {busy && <Loader2Icon className="animate-spin" />} Confirm
        </Button>
      </div>
    </div>
  );
  if (flow.key === "do.leave") {
    if (step === 0) return pick("type", data.types ?? [], "Which kind of leave?", "No leave types are set up yet; ask HR.");
    if (step === 1)
      return (
        <div className="space-y-2 text-sm">
          <p>Which days?</p>
          <div className="flex gap-2">
            <Input type="date" aria-label="First day" value={v.start ?? ""} onChange={(e) => setV({ ...v, start: e.target.value })} />
            <Input type="date" aria-label="Last day" value={v.end ?? ""} onChange={(e) => setV({ ...v, end: e.target.value })} />
          </div>
          <Textarea rows={2} placeholder="Reason (optional)" aria-label="Reason" value={v.reason ?? ""} onChange={(e) => setV({ ...v, reason: e.target.value })} />
          <Button size="sm" disabled={!v.start || !v.end || v.end < v.start} onClick={() => setStep(2)}>
            Next
          </Button>
        </div>
      );
    return summary([`${v.typeLabel}`, `From ${v.start} to ${v.end}`, ...(v.reason ? [`Reason: ${v.reason}`] : []), "It goes to your manager for approval"], () =>
      confirm(() => requestLeaveAction({ typeKey: v.type!, startDate: v.start!, endDate: v.end!, reason: v.reason || null }), "Leave asked for"),
    );
  }
  if (flow.key === "do.start") {
    if (step === 0) return pick("task", data.tasks ?? [], "Which one?", "Nothing is waiting to start on your board.");
    return summary([v.taskLabel!, "It moves to In progress and your timer starts"], () => confirm(() => flowStartAction(data.dept!, v.task!), "Started"));
  }
  if (flow.key === "do.assign") {
    if (step === 0) return pick("task", data.tasks ?? [], "Which work?", "Everything is assigned.");
    if (step === 1) return pick("person", data.people ?? [], "To whom?", "Nobody is in the department.");
    return summary([v.taskLabel!, `To ${v.personLabel}`], () => confirm(() => flowAssignAction(data.dept!, [v.task!], v.person!), "Assigned"));
  }
  if (flow.key === "do.task") {
    const ds = data.depts ?? [];
    if (step === 0) return pick("dept", ds, "In which department?", "You are not in a department with tasks.");
    if (step === 1)
      return (
        <div className="space-y-2 text-sm">
          <p>What is the task?</p>
          <Input aria-label="Task title" autoFocus placeholder="Title" value={v.title ?? ""} onChange={(e) => setV({ ...v, title: e.target.value })} />
          <Input type="date" aria-label="Due date (optional)" value={v.due ?? ""} onChange={(e) => setV({ ...v, due: e.target.value })} />
          <Button size="sm" disabled={!v.title?.trim()} onClick={() => setStep(2)}>
            Next
          </Button>
        </div>
      );
    if (step === 2) {
      const people = ds.find((d) => d.id === v.dept)?.people ?? [];
      return (
        <div className="space-y-1.5">
          {pick("person", people, "For whom?", "Nobody is in this department yet.")}
          <Button size="xs" variant="outline" onClick={() => (setV({ ...v, person: "", personLabel: "Nobody yet" }), setStep(3))}>
            Leave unassigned
          </Button>
        </div>
      );
    }
    return summary([`${v.title}`, `In ${v.deptLabel}`, `For ${v.personLabel}`, ...(v.due ? [`Due ${v.due}`] : [])], () =>
      confirm(() => saveTaskAction(v.dept!, { title: v.title!.trim(), assigneeId: v.person || null, dueDate: v.due || null }), "Task created"),
    );
  }
  if (flow.key === "do.checkin") {
    const inNow = data.state === "in";
    const back = data.state === "break" || data.state === "lunch";
    return summary([inNow ? "Check out now" : back ? "Back from your break now" : "Check in now", ...(data.since ? [`Last change at ${new Date(data.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`] : [])], () =>
      confirm(() => punchAction({}), inNow ? "Checked out" : "Checked in"),
    );
  }
  void ctx;
  return null;
}

// Speech in the browser (Chrome, Edge, Safari): what is said becomes the question; answers can be read aloud.
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const VOICE_KEY = "myseed.assistant.voice";
const LANGS = [
  { id: "en-US", label: "English" },
  { id: "am-ET", label: "አማርኛ" },
];
function readVoice(): { lang: string; speak: boolean } {
  try {
    return { lang: "en-US", speak: false, ...JSON.parse(localStorage.getItem(VOICE_KEY) ?? "{}") };
  } catch {
    return { lang: "en-US", speak: false };
  }
}
function useSpeech(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const rec = React.useRef<Rec | null>(null);
  const final = React.useRef(onFinal);
  React.useEffect(() => {
    final.current = onFinal;
  });
  React.useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const stop = React.useCallback(() => rec.current?.stop(), []);
  const start = React.useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return void toast.error("This browser cannot listen. Use Chrome or Edge, or type instead.");
    rec.current?.abort();
    const r = new C();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    let said = "";
    r.onresult = (e) => {
      let live = "";
      said = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) said += res[0]!.transcript;
        else live += res[0]!.transcript;
      }
      setInterim(said + live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast.error("The microphone is blocked. Allow it in the browser's address bar.");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast.error(`Could not hear that (${e.error}).`);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      if (said.trim()) final.current(said.trim());
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang]);
  return { supported, listening, interim, start, stop };
}
function speak(text: string, lang: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, "").replace(/^- /gm, "").slice(0, 600));
    u.lang = lang;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch {}
}

type Command = { kind: "go"; href: string; name: string } | { kind: "back" | "forward" | "up" | "down" | "top" | "close" | "clear" };

// Spoken (or typed) commands handled here at once, without the AI: open a page, go back, scroll, close.
export function localCommand(text: string, base: string | null, places?: string[]): Command | null {
  const t = text.toLowerCase().replace(/[.!?]+$/, "").trim();
  if (/^(go )?back$/.test(t)) return { kind: "back" };
  if (/^(go )?forward$/.test(t)) return { kind: "forward" };
  if (/^scroll( down)?$|^(page )?down$/.test(t)) return { kind: "down" };
  if (/^scroll up$|^(page )?up$/.test(t)) return { kind: "up" };
  if (/^(scroll to the |go to the )?top$/.test(t)) return { kind: "top" };
  if (/^(close|stop|cancel|never ?mind|ዝጋ)$/.test(t)) return { kind: "close" };
  if (/^(clear|new conversation|start again)$/.test(t)) return { kind: "clear" };
  const m = t.match(/^(?:please )?(?:open|go to|take me to|navigate to|ክፈት)\s+(?:the |my )?(.+?)(?: page)?$/);
  if (m) {
    const want = m[1]!;
    const best = PLACES.filter((p) => !places || places.includes(p.name)).map((p) => ({ p, s: score(want, [...p.words, p.name]) })).sort((x, y) => y.s - x.s)[0];
    if (best && best.s >= 3) return { kind: "go", href: fill(best.p.href, base), name: best.p.name };
  }
  return null;
}

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

export function Assistant({ ctx, ai = false, agent = false }: { ctx: AssistantContext; ai?: boolean; agent?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Docked: a full-height panel on the right that stays open while moving between pages (the page makes room on
  // wide screens). Agent mode: it does the allowed actions itself instead of proposing them.
  const [dock, setDock] = React.useState(false);
  const [mode, setMode] = React.useState<"ask" | "agent">("ask");
  const [convId, setConvId] = React.useState<string | null>(null);
  const [convos, setConvos] = React.useState<Convo[] | null>(null);
  const [showConvos, setShowConvos] = React.useState(false);

  // Movable Floating Widget State (PC / Desktop Draggable)
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);
  const dragStartRef = React.useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("assistant_pos_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          const clampedX = Math.min(Math.max(12, parsed.x), Math.max(12, window.innerWidth - 80));
          const clampedY = Math.min(Math.max(12, parsed.y), Math.max(12, window.innerHeight - 80));
          setPos({ x: clampedX, y: clampedY });
        }
      }
    } catch {}

    const handleResize = () => {
      setPos((prev) => {
        if (!prev) return null;
        const clampedX = Math.min(Math.max(12, prev.x), Math.max(12, window.innerWidth - 80));
        const clampedY = Math.min(Math.max(12, prev.y), Math.max(12, window.innerHeight - 80));
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (dock && open) return;
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) return;

    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect.left,
      startY: rect.top,
    };

    const handlePointerMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mouseX;
      const dy = ev.clientY - dragStartRef.current.mouseY;
      const currentWidth = el.offsetWidth || 60;
      const currentHeight = el.offsetHeight || 60;
      const nextX = Math.min(Math.max(12, dragStartRef.current.startX + dx), Math.max(12, window.innerWidth - currentWidth - 12));
      const nextY = Math.min(Math.max(12, dragStartRef.current.startY + dy), Math.max(12, window.innerHeight - currentHeight - 12));
      setPos({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setPos((cur) => {
        if (cur) {
          try {
            localStorage.setItem("assistant_pos_v2", JSON.stringify(cur));
          } catch {}
        }
        return cur;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleResetPos = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPos(null);
    try {
      localStorage.removeItem("assistant_pos_v2");
    } catch {}
  };
  React.useEffect(() => {
    const d = readLocal(DOCK_KEY) === "1";
    setDock(d);
    if (d && readLocal(DOCK_KEY + ".open") === "1") setOpen(true);
    if (agent && readLocal(MODE_KEY) === "agent") setMode("agent");
  }, [agent]);
  React.useEffect(() => {
    const on = dock && open;
    document.documentElement.classList.toggle("asst-docked", on);
    if (dock) writeLocal(DOCK_KEY + ".open", open ? "1" : "0");
    return () => document.documentElement.classList.remove("asst-docked");
  }, [dock, open]);
  const toggleDock = () => {
    writeLocal(DOCK_KEY, dock ? "0" : "1");
    setDock(!dock);
  };
  const pickMode = (m: "ask" | "agent") => {
    writeLocal(MODE_KEY, m);
    setMode(m);
  };
  const loadConvos = async () => {
    const r = await listConversationsAction();
    if (r.ok) setConvos(r.data ?? []);
  };
  const openConvo = async (id: string) => {
    const r = await loadConversationAction(id);
    if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "Could not open it.");
    setConvId(r.data.id);
    setMsgs(r.data.messages.map((m) => ({ from: m.from, text: m.text, done: m.done })));
    setHistory(r.data.messages.map((m) => ({ role: m.from === "me" ? ("user" as const) : ("assistant" as const), text: m.text })));
    if (r.data.mode === "agent" && agent) pickMode("agent");
    setShowConvos(false);
  };
  const [text, setText] = React.useState("");
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [history, setHistory] = React.useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [thinking, setThinking] = React.useState(false);
  const [doing, setDoing] = React.useState<Extract<Flow, { kind: "do" }> | null>(null);
  const [showing, setShowing] = React.useState<Extract<Flow, { kind: "show" }> | null>(null);
  const [voice, setVoice] = React.useState<{ lang: string; speak: boolean }>({ lang: "en-US", speak: false });
  const [guide, setGuide] = React.useState<{ flow: Extract<Flow, { kind: "guide" }>; step: number } | null>(null);
  const [routines, setRoutines] = React.useState<Routine[] | null>(null);
  const [runFor, setRunFor] = React.useState<{ routine: Routine; values: Record<string, string> } | null>(null);
  const [toSave, setToSave] = React.useState<RoutineStep[] | null>(null);
  const rec = useRecorder();
  const opts = ctx.options;
  const routinesOn = !!ctx.routines;
  const loadRoutines = React.useCallback(() => {
    if (!routinesOn) return;
    void listRoutinesAction().then((r) => r.ok && r.data && setRoutines(r.data));
  }, [routinesOn]);
  React.useEffect(() => {
    if (open && routines === null) loadRoutines();
  }, [open, routines, loadRoutines]);
  const runRoutine = (r: Routine) => {
    setOpen(true);
    setRunFor({ routine: r, values: Object.fromEntries(askedSteps(r.steps).map((x) => [String(x.i), x.s.value ?? ""])) });
  };
  const sendRun = async () => {
    if (!runFor) return;
    const r = await requestRunAction(runFor.routine.id, runFor.values);
    if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "Could not start it.");
    setRunFor(null);
    if (r.data.status === "approved") {
      setOpen(false);
      await beginRun(r.data.id);
    } else say({ from: "bot", text: `"${runFor.routine.name}" was sent for approval. You will be told when you can run it (Routines page).` });
  };
  const base = ctx.home?.base ?? null;
  const pathname = usePathname();
  const end = React.useRef<HTMLDivElement>(null);
  const viaVoice = React.useRef(false);
  const log = (e: Parameters<typeof logAssistantAction>[0]) => void logAssistantAction(e);
  React.useEffect(() => {
    setVoice(readVoice());
  }, []);
  const saveVoice = (v: { lang: string; speak: boolean }) => {
    setVoice(v);
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify(v));
    } catch {}
  };
  // A block body: newer browsers return a promise from scrollIntoView, which must not become the effect's cleanup.
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, thinking, doing]);
  // A "show me" that moved to another page carries on there.
  React.useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      const f = s && ctx.flows.find((x) => x.key === s.flow && x.kind === "show");
      if (f) setShowing(f as Extract<Flow, { kind: "show" }>);
    } catch {}
  }, [ctx.flows]);
  const say = (m: Msg) => {
    setMsgs((x) => [...x, m]);
    if (m.from === "bot" && viaVoice.current && voice.speak) speak(m.text, voice.lang);
  };
  const startFlow = (f: Flow) => {
    log({ flow: f.key, event: f.kind === "show" ? "show" : "start" });
    if (f.kind === "do") {
      setOpen(true);
      setDoing(f);
      say({ from: "bot", text: `${f.title}. ${f.hint}.` });
    } else if (f.kind === "guide") {
      setOpen(true);
      setGuide({ flow: f, step: 0 });
    } else if (f.kind === "show") {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ flow: f.key, step: 0 }));
      } catch {}
      setOpen(false);
      setShowing(f);
    }
  };
  const reply = (m: Match): Msg => {
    if (m.type === "flow") return { from: "bot", text: `${m.flow.title}: ${m.flow.hint}.`, actions: [{ label: m.flow.kind === "do" ? "Do it with me" : m.flow.kind === "guide" ? "Show the steps" : "Show me", run: () => startFlow(m.flow) }] };
    if (m.type === "place") return { from: "bot", text: `${m.place.name} is here.`, actions: [{ label: `Open ${m.place.name}`, run: () => router.push(fill(m.place.href, base)) }] };
    if (m.type === "term") return { from: "bot", text: `${m.term.term}: ${m.term.meaning}` };
    return { from: "bot", text: m.answer.a };
  };
  const keywordAnswer = (t: string) => {
    const found = matchText(t, ctx.flows, ctx.cfg, ctx.places);
    if (!found.length) {
      log({ event: "nomatch", text: t });
      say({
        from: "bot",
        text: "I could not find that. These may help, or search Help:",
        actions: [...ctx.flows.slice(0, 3).map((f) => ({ label: f.title, run: () => startFlow(f) })), { label: "Search Help", run: () => router.push(`/profile/help?q=${encodeURIComponent(t)}`) }],
      });
    } else {
      say(reply(found[0]!));
      for (const x of found.slice(1, 3).filter((x) => x.type === "flow")) setMsgs((m) => [...m, { ...reply(x), text: `Or: ${reply(x).text}` }]);
    }
  };
  const confirmProposal = async (p: Proposal, idx: number) => {
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, busy: true } : x)));
    const r = await confirmProposalAction(p.token).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
    if (!r.ok) {
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, busy: false } : x)));
      return void toast.error(r.error);
    }
    const done = r.data?.done ?? "Done";
    if (r.data?.routine) {
      const rt = (routines ?? []).find((x) => x.id === r.data!.routine) ?? (await listRoutinesAction().then((x) => (x.ok ? x.data?.find((y) => y.id === r.data!.routine) : undefined)));
      if (rt) runRoutine(rt);
    }
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, busy: false, settled: done } : x)));
    toast.success(done);
    setHistory((h) => [...h, { role: "user", text: `(I confirmed: ${p.title}.)` }, { role: "assistant", text: `${done}.` }]);
    router.refresh();
  };
  const askAi = async (t: string) => {
    setThinking(true);
    // A failed request (network, server) is an answer in the panel, never a broken page.
    const r = await askAiAction({ history, text: t, page: pathname, mode: agent ? mode : "ask", conversationId: convId }).catch(() => ({ ok: false as const, error: "The assistant could not be reached. Check the connection and try again." }));
    setThinking(false);
    if (!r.ok || !r.data) {
      say({ from: "bot", text: (!r.ok && r.error) || "The AI could not answer." });
      keywordAnswer(t);
      return;
    }
    const d = r.data;
    if (d.conversationId) setConvId(d.conversationId);
    if (d.done.length) {
      setMsgs((m) => [...m, { from: "bot", text: "", done: d.done }]);
      if (d.done.some((s) => s.ok)) router.refresh();
    }
    setHistory((h) => [...h, { role: "user", text: t }, { role: "assistant", text: d.text }]);
    const flow = d.show ? ctx.flows.find((f) => f.key === d.show) : null;
    say({
      from: "bot",
      text: plain(d.text),
      actions: [...d.links.map((l) => ({ label: `Open ${l.label}`, run: () => router.push(l.href) })), ...(flow ? [{ label: "Show me", run: () => startFlow(flow) }] : [])],
    });
    for (const p of d.proposals) setMsgs((m) => [...m, { from: "bot", text: p.title, proposal: p }]);
    // Asked by voice to go somewhere: go.
    if (viaVoice.current && d.links.length === 1 && /\b(open|go to|take me|show me)\b/i.test(t)) router.push(d.links[0]!.href);
  };
  const ask = (q: string, spoken = false) => {
    const t = q.trim();
    if (!t) return;
    viaVoice.current = spoken;
    setText("");
    const cmd = localCommand(t, base, ctx.places);
    if (cmd) {
      if (spoken) log({ event: "voice", text: t });
      if (cmd.kind === "go") {
        setMsgs((m) => [...m, { from: "me", text: t }, { from: "bot", text: `Opening ${cmd.name}.` }]);
        router.push(cmd.href);
      } else if (cmd.kind === "back") router.back();
      else if (cmd.kind === "forward") router.forward();
      else if (cmd.kind === "down") window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
      else if (cmd.kind === "up") window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "smooth" });
      else if (cmd.kind === "top") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (cmd.kind === "close") setOpen(false);
      else {
        setMsgs([]);
        setHistory([]);
      }
      return;
    }
    const want = t.match(/^(?:run|do|start|play)\s+(?:the\s+|my\s+)?(?:routine\s+)?(.+)$/i)?.[1]?.toLowerCase();
    const rt = want && routines ? routines.find((r) => r.name.toLowerCase() === want) ?? routines.find((r) => r.name.toLowerCase().includes(want)) : null;
    if (rt) {
      setMsgs((m) => [...m, { from: "me", text: t }]);
      runRoutine(rt);
      return;
    }
    setMsgs((m) => [...m, { from: "me", text: t }]);
    if (ai) void askAi(t);
    else keywordAnswer(t);
  };
  const speech = useSpeech(voice.lang, (t) => ask(t, true));
  const listen = () => {
    setOpen(true);
    if (speech.listening) speech.stop();
    else speech.start();
  };
  // Keyboard: Alt+A opens or closes the assistant, Alt+V talks to it.
  const listenRef = React.useRef(listen);
  React.useEffect(() => {
    listenRef.current = listen;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyA") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.code === "KeyV") {
        e.preventDefault();
        listenRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const endDo = (finished: boolean, step: number, done?: string) => {
    log({ flow: doing?.key, event: finished ? "finish" : "abandon", step });
    if (finished && done) say({ from: "bot", text: `${done}.` });
    setDoing(null);
  };
  const endShow = React.useCallback((finished: boolean, step: number) => {
    setShowing((f) => {
      if (f) void logAssistantAction({ flow: f.key, event: finished ? "finish" : "abandon", step });
      return null;
    });
  }, []);
  // Out of the way during a presentation.
  if (/\/present$/.test(pathname)) return null;
  // Suggestions for what the role does (Admin can set their own per role).
  const suggestions = opts.suggestions.length
    ? opts.suggestions
    : ai
      ? ctx.who.hr
        ? ["Who is absent or late today?", "What leave is waiting for HR?", "Whose probation or contract ends soon?"]
        : ctx.who.lead
          ? ["How is my team doing?", "What is waiting for my approval?", "What is stuck or overdue?"]
          : ["What should I work on today?", "How many leave days do I have?", "What is waiting for me?"]
      : [];
  const voiceOn = speech.supported && opts.voice;
  return (
    <>
      {showing && <ShowMe flow={showing} base={base} onEnd={endShow} />}
      <RoutineRunner />
      {rec.recording && <RecordBar count={rec.steps.length} onStop={() => setToSave(rec.stop())} onCancel={() => rec.stop()} />}
      {toSave && <SaveRoutineDialog steps={toSave} sharing onClose={() => setToSave(null)} onSaved={() => (setToSave(null), loadRoutines())} />}
      <div
        ref={containerRef}
        className={cn(
          "no-print fixed z-50 flex flex-col items-end gap-2",
          dock && open ? "inset-y-0 right-0" : pos ? "" : "right-4 bottom-20 md:bottom-4"
        )}
        style={
          pos && (!dock || !open)
            ? {
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                right: "auto",
                bottom: "auto",
                touchAction: "none",
              }
            : undefined
        }
        data-assistant
        data-docked={dock && open ? "1" : undefined}
      >
        {open && (
          <section
            role="dialog"
            aria-label="Assistant"
            className={cn(
              "flex flex-col overflow-hidden bg-popover",
              dock ? "h-dvh w-screen border-l shadow-xl sm:w-[26rem]" : "max-h-[min(40rem,calc(100vh-6rem))] w-[24rem] max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl",
            )}
          >
            <header
              onPointerDown={handlePointerDown}
              onDoubleClick={handleResetPos}
              title={dock ? undefined : "Drag to move assistant · Double-click to reset position"}
              className={cn(
                "flex items-center gap-1.5 border-b bg-gradient-to-r from-[#4285F4]/10 via-[#9334E6]/10 to-[#EA4335]/10 px-3 py-2 select-none",
                !dock && "cursor-grab active:cursor-grabbing"
              )}
            >
              <SparklesIcon className="size-4 shrink-0 text-[#9334E6] dark:text-[#C58AF9]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Assistant</p>
                <p className="truncate text-[11px] text-muted-foreground">{ai ? (mode === "agent" && agent ? "Agent: does it for you" : "AI on") : "Type or speak"} · Alt+V to talk</p>
              </div>
              {msgs.length > 0 && (
                <Button size="icon" variant="ghost" className="size-7" aria-label="New conversation" title="New conversation" onClick={() => (setMsgs([]), setHistory([]), setDoing(null), setConvId(null))}>
                  <RotateCcwIcon />
                </Button>
              )}
              {ai && (
                <Button size="icon" variant="ghost" className="size-7" aria-label="Earlier conversations" aria-pressed={showConvos} title="Earlier conversations" onClick={() => (setShowConvos(!showConvos), void loadConvos())} data-assistant-history>
                  <HistoryIcon />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="hidden size-7 sm:inline-flex" aria-label={dock ? "Float the assistant" : "Dock the assistant on the side"} title={dock ? "Float" : "Dock on the side"} onClick={toggleDock} data-assistant-dock>
                {dock ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={voice.speak ? "Stop reading answers aloud" : "Read answers aloud"}
                aria-pressed={voice.speak}
                title={voice.speak ? "Answers to spoken questions are read aloud" : "Read answers aloud"}
                onClick={() => {
                  if (voice.speak) window.speechSynthesis?.cancel();
                  saveVoice({ ...voice, speak: !voice.speak });
                }}
              >
                {voice.speak ? <Volume2Icon className="text-[#1E8E3E] dark:text-[#81C995]" /> : <VolumeXIcon />}
              </Button>
              <select aria-label="Voice language" className="h-7 rounded-md border bg-background px-1 text-xs" value={voice.lang} onChange={(e) => saveVoice({ ...voice, lang: e.target.value })}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Close the assistant" onClick={() => (doing && endDo(false, 0), setOpen(false))}>
                <XIcon />
              </Button>
            </header>
            {agent && (
              <div className="flex items-center gap-1 border-b px-3 py-1.5 text-xs" role="radiogroup" aria-label="Assistant mode" data-assistant-mode={mode}>
                {(["ask", "agent"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => pickMode(m)}
                    className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5", mode === m ? (m === "agent" ? "border-[#188038] bg-[#188038] text-white" : "border-primary bg-primary text-primary-foreground") : "hover:bg-muted")}
                  >
                    {m === "agent" ? <BotIcon className="size-3" /> : <MessageSquareIcon className="size-3" />}
                    {m === "agent" ? "Agent" : "Ask"}
                  </button>
                ))}
                <span className="ml-1 truncate text-muted-foreground">{mode === "agent" ? "Does the allowed actions itself, as you" : "Answers and prepares actions to confirm"}</span>
              </div>
            )}
            {showConvos && (
              <div className="max-h-64 overflow-y-auto border-b p-2 text-xs" data-assistant-convos>
                {!convos ? (
                  <p className="text-muted-foreground">Loading…</p>
                ) : !convos.length ? (
                  <p className="text-muted-foreground">No earlier conversations yet.</p>
                ) : (
                  convos.map((c) => (
                    <div key={c.id} className={cn("group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted", c.id === convId && "bg-muted")}>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openConvo(c.id)}>
                        <span className="block truncate font-medium">
                          {c.mode === "agent" && <BotIcon className="mr-1 inline size-3 text-[#188038]" />}
                          {c.title}
                        </span>
                        <span className="text-muted-foreground">{new Date(c.updatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · {c.count} messages</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete conversation"
                        className="opacity-60 hover:opacity-100"
                        onClick={async () => {
                          await deleteConversationAction(c.id);
                          if (c.id === convId) (setConvId(null), setMsgs([]), setHistory([]));
                          void loadConvos();
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              {guide && (
                <div className="rounded-lg border p-2.5" data-assistant-guide={guide.flow.key}>
                  <p className="font-medium">{guide.flow.title}</p>
                  <ol className="mt-1.5 space-y-1">
                    {guide.flow.steps.map((st, i) => (
                      <li key={i} className={cn("flex gap-2 rounded px-1.5 py-1", i === guide.step ? "bg-[#1A73E8]/10 font-medium" : i < guide.step ? "text-muted-foreground line-through" : "")}>
                        <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                        {st}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {guide.flow.href && (
                      <Button size="xs" variant="outline" onClick={() => router.push(fill(guide.flow.href!, base))}>
                        <ExternalLinkIcon /> Open the page
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" disabled={guide.step === 0} onClick={() => setGuide({ ...guide, step: guide.step - 1 })}>
                      Back
                    </Button>
                    {guide.step + 1 < guide.flow.steps.length ? (
                      <Button size="xs" onClick={() => setGuide({ ...guide, step: guide.step + 1 })}>
                        Next
                      </Button>
                    ) : (
                      <Button size="xs" onClick={() => (log({ flow: guide.flow.key, event: "finish", step: guide.step }), setGuide(null))}>
                        Done
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {runFor && (
                <div className="space-y-2 rounded-lg border border-[#1A73E8]/40 bg-[#1A73E8]/5 p-2.5" data-assistant-run={runFor.routine.id}>
                  <p className="font-medium">Run &quot;{runFor.routine.name}&quot;</p>
                  <p className="text-xs text-muted-foreground">{runFor.routine.steps.length} steps, done in this browser as you would do them. You can pause, skip or stop at any time.</p>
                  {askedSteps(runFor.routine.steps).map(({ i, s: st }) => (
                    <Input key={i} aria-label={st.label ?? `Value ${i + 1}`} placeholder={st.label ?? ""} value={runFor.values[String(i)] ?? ""} onChange={(e) => setRunFor({ ...runFor, values: { ...runFor.values, [String(i)]: e.target.value } })} />
                  ))}
                  <div className="flex gap-2">
                    <Button size="xs" onClick={() => void sendRun()}>
                      <PlayIcon /> Confirm and run
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setRunFor(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!msgs.length && !doing && !guide && !runFor && routinesOn && (
                <div className="space-y-1.5" data-assistant-routines>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">My routines</p>
                    <span className="flex items-center gap-1">
                      <Button size="xs" variant="ghost" asChild>
                        <a href="/routines">Edit or import</a>
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => (rec.start(), setOpen(false), toast("Recording. Do the task as usual, then press Stop and save at the top."))}>
                        <CircleDotIcon className="text-[#EA4335]" /> Record a routine
                      </Button>
                    </span>
                  </div>
                  {routines && routines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {routines.map((r) => (
                        <button key={r.id} type="button" onClick={() => runRoutine(r)} className="rounded-full border border-[#1A73E8]/30 bg-[#1A73E8]/5 px-2.5 py-1 text-xs hover:bg-[#1A73E8]/10" data-assistant-routine={r.id}>
                          <PlayIcon className="mr-1 inline size-3" />
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!msgs.length && !doing && !guide && !runFor && (
                <>
                  <p className="text-muted-foreground">What would you like to do? Pick one, type it in your own words, or press the microphone and say it.</p>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-[#9334E6]/30 bg-[#9334E6]/5 px-2.5 py-1 text-xs hover:bg-[#9334E6]/10" data-assistant-suggest>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {ctx.flows
                      .filter((f) => f.kind !== "guide")
                      .map((f) => (
                        <button key={f.key} type="button" onClick={() => startFlow(f)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted" data-assistant-flow={f.key}>
                          {f.title}
                        </button>
                      ))}
                  </div>
                  <details className="rounded-lg border px-2.5 py-1.5" data-assistant-tutorials>
                    <summary className="cursor-pointer text-xs font-medium">How-to tutorials ({ctx.flows.filter((f) => f.kind === "guide").length})</summary>
                    <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto">
                      {ctx.flows
                        .filter((f) => f.kind === "guide")
                        .map((f) => (
                          <li key={f.key}>
                            <button type="button" onClick={() => startFlow(f)} className="w-full rounded px-1.5 py-0.5 text-left text-xs hover:bg-muted" data-assistant-flow={f.key}>
                              {f.title}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </details>
                  <p className="text-[11px] text-muted-foreground">Say &quot;open leave&quot;, &quot;go back&quot;, &quot;scroll down&quot; or ask a question.</p>
                </>
              )}
              {msgs.map((m, i) =>
                m.done && m.done.length ? (
                  <AgentSteps key={i} steps={m.done} onOpen={(h) => router.push(h)} />
                ) : m.proposal ? (
                  <div key={i} className="rounded-lg border border-[#1A73E8]/40 bg-[#1A73E8]/5 p-2.5" data-assistant-proposal>
                    <p className="font-medium">{m.proposal.title}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {m.proposal.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                    {m.settled ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-[#1E8E3E] dark:text-[#81C995]">
                        <CheckIcon className="size-3.5" /> {m.settled}
                      </p>
                    ) : m.settled === "" ? (
                      <p className="mt-2 text-xs text-muted-foreground">Cancelled</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button size="xs" disabled={m.busy} onClick={() => void confirmProposal(m.proposal!, i)}>
                          {m.busy && <Loader2Icon className="animate-spin" />} Confirm
                        </Button>
                        <Button size="xs" variant="ghost" disabled={m.busy} onClick={() => setMsgs((x) => x.map((y, j) => (j === i ? { ...y, settled: "" } : y)))}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={i} className={cn("max-w-[90%] rounded-2xl px-3 py-1.5", m.from === "me" ? "ml-auto rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")} data-assistant-msg={m.from}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.actions && m.actions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.actions.map((a) => (
                          <Button key={a.label} size="xs" variant="outline" onClick={a.run}>
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
              {thinking && (
                <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-muted-foreground" data-assistant-thinking>
                  <Loader2Icon className="size-3.5 animate-spin" /> Looking…
                </div>
              )}
              {doing && (
                <div className="rounded-lg border p-2.5" data-assistant-do={doing.key}>
                  <DoFlow flow={doing} ctx={ctx} onEnd={endDo} />
                  <Button size="xs" variant="ghost" className="mt-2" onClick={() => endDo(false, 0)}>
                    Stop
                  </Button>
                </div>
              )}
              <div ref={end} />
            </div>
            <form className="flex items-center gap-2 border-t p-2" onSubmit={(e) => (e.preventDefault(), ask(text))}>
              {voiceOn && (
                <Button
                  size="icon"
                  type="button"
                  variant={speech.listening ? "destructive" : "outline"}
                  className={cn("size-8 shrink-0 rounded-full", speech.listening && "animate-pulse")}
                  aria-label={speech.listening ? "Stop listening" : "Speak to the assistant"}
                  title="Speak (Alt+V)"
                  onClick={listen}
                  data-assistant-mic
                >
                  {speech.listening ? <MicOffIcon /> : <MicIcon className="text-[#EA4335]" />}
                </Button>
              )}
              <Input
                value={speech.listening ? speech.interim || "Listening…" : text}
                readOnly={speech.listening}
                onChange={(e) => setText(e.target.value)}
                placeholder={ai ? (mode === "agent" && agent ? "Tell the agent what to do" : "Ask anything about your work") : "For example: assign videos, where is leave"}
                aria-label="Ask the assistant"
                className="h-8"
              />
              <Button size="icon" className="size-8 shrink-0" type="submit" aria-label="Ask" disabled={!text.trim() || thinking}>
                <SendIcon />
              </Button>
            </form>
          </section>
        )}
        <div
          className="flex items-center gap-1.5 p-1 rounded-full bg-background/85 backdrop-blur-xs border border-border/70 shadow-lg select-none"
        >
          {/* Subtle drag grip handle */}
          <div
            onPointerDown={handlePointerDown}
            onDoubleClick={handleResetPos}
            className="cursor-grab active:cursor-grabbing px-1 py-2 text-muted-foreground/60 hover:text-foreground transition-colors touch-none"
            title="Drag to reposition anywhere on PC (Double-click to reset)"
          >
            <GripVerticalIcon className="size-3.5" />
          </div>
          {!open && voiceOn && (
            <Button
              size="icon"
              variant="outline"
              className="size-9 rounded-full bg-background shadow-xs hover:bg-muted"
              aria-label="Speak to the assistant"
              title="Speak (Alt+V)"
              onClick={listen}
            >
              <MicIcon className="text-[#EA4335]" />
            </Button>
          )}
          <Button
            size="icon"
            className="size-11 rounded-full bg-gradient-to-br from-[#4285F4] via-[#9334E6] to-[#EA4335] text-white shadow-md hover:opacity-95"
            aria-label={open ? "Close the assistant" : "Open the assistant"}
            aria-expanded={open}
            title="Assistant (Alt+A)"
            onClick={() => setOpen(!open)}
          >
            <SparklesIcon />
          </Button>
        </div>
      </div>
    </>
  );
}
