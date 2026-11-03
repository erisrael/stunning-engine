"use client";

// Routines in the browser (Phase 13d): recording what a person does (clicks on buttons, links, tabs and options,
// and what they type or choose, page by page; never passwords), and doing it again for them: each step finds the
// same button or field by its name on the page, rings it, and presses or fills it. It stops and asks when something
// is not where it was. Recordings and runs carry on across pages (kept for this tab only).

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleStopIcon, Loader2Icon, PauseIcon, PlayIcon, SkipForwardIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { finishRunAction, saveRoutineAction, startRunAction } from "@/app/actions/assistant";
import type { RoutineStep } from "@/server/routines";

const REC = "myseed.routine.rec";
const RUN = "myseed.routine.run";
const CLICKABLE = "button, a[href], [role=button], [role=tab], [role=option], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=checkbox], [role=switch], [role=radio], [role=combobox], summary";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const read = <T,>(k: string): T | null => {
  try {
    return JSON.parse(sessionStorage.getItem(k) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const here = () => window.location.pathname + window.location.search;
const visible = (el: Element) => el instanceof HTMLElement && (el.offsetParent !== null || el.getClientRects().length > 0);
const outside = (el: Element) => !el.closest("[data-assistant], [data-routine-ui]");

function nameOf(el: Element) {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim().slice(0, 160);
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = by.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (t) return t.slice(0, 160);
  }
  const t = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 160);
  return (el.getAttribute("title") ?? (el as HTMLInputElement).value ?? "").slice(0, 160);
}
function roleOf(el: Element) {
  const r = el.getAttribute("role");
  if (r) return r;
  if (el.tagName === "A") return "link";
  return "button";
}
function labelOf(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const lab = el.labels?.[0]?.textContent?.trim();
  if (lab) return lab;
  return (el.getAttribute("placeholder") ?? el.getAttribute("name") ?? el.id ?? "").trim();
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function useRecorder() {
  const [steps, setSteps] = React.useState<RoutineStep[] | null>(null);
  React.useEffect(() => {
    const r = read<RoutineStep[]>(REC);
    if (r) setSteps(r);
  }, []);
  const recording = steps !== null;
  React.useEffect(() => {
    if (!recording) return;
    const add = (s: RoutineStep) =>
      setSteps((cur) => {
        const list = [...(cur ?? [])];
        const last = list[list.length - 1];
        // Typing in one field is one step.
        if (last && s.do === "fill" && last.do === "fill" && last.label === s.label && last.path === s.path) list[list.length - 1] = s;
        else list.push(s);
        write(REC, list);
        return list;
      });
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest(CLICKABLE);
      if (!el || !outside(el)) return;
      if (el.matches("input, textarea, select")) return;
      const name = nameOf(el);
      if (!name) return;
      add({ path: here(), do: "click", role: roleOf(el), name });
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!el?.matches?.("input, textarea, select") || !outside(el)) return;
      const type = (el as HTMLInputElement).type;
      if (type === "password" || type === "file" || el.getAttribute("autocomplete")?.includes("password")) return;
      const label = labelOf(el);
      if (!label) return;
      if (type === "checkbox" || type === "radio") add({ path: here(), do: "check", label, value: String((el as HTMLInputElement).checked) });
      else if (el.tagName === "SELECT") add({ path: here(), do: "select", label, value: el.value });
      else add({ path: here(), do: "fill", label, value: el.value, ask: true });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
    };
  }, [recording]);
  const start = () => {
    write(REC, []);
    setSteps([]);
  };
  const stop = () => {
    const s = steps ?? [];
    write(REC, null);
    setSteps(null);
    return s;
  };
  return { recording, steps: steps ?? [], start, stop };
}

export function RecordBar({ count, onStop, onCancel }: { count: number; onStop: () => void; onCancel: () => void }) {
  return (
    <div data-routine-ui className="no-print fixed top-3 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-sm shadow-xl" role="status" aria-label="Recording a routine">
      <span className="size-2.5 animate-pulse rounded-full bg-[#EA4335]" />
      Recording · {count} step{count === 1 ? "" : "s"}
      <Button size="xs" onClick={onStop}>
        <CircleStopIcon /> Stop and save
      </Button>
      <Button size="xs" variant="ghost" onClick={onCancel} aria-label="Cancel the recording">
        <XIcon />
      </Button>
    </div>
  );
}

const describe = (s: RoutineStep) =>
  s.do === "click" ? `Press "${s.name}"` : s.do === "fill" ? `Type in "${s.label}"` : s.do === "select" ? `Choose in "${s.label}"` : s.do === "check" ? `${s.value === "true" ? "Tick" : "Untick"} "${s.label}"` : (s.note ?? "Note");

export function SaveRoutineDialog({ steps, sharing, onClose, onSaved }: { steps: RoutineStep[]; sharing: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [shared, setShared] = React.useState("none");
  const [list, setList] = React.useState(steps);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const r = await saveRoutineAction({ name, description, steps: list, shared });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Routine "${name}" saved`);
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-routine-ui data-save-routine>
        <DialogHeader>
          <DialogTitle>Save the routine</DialogTitle>
          <DialogDescription>Check the steps. Ticked values are asked each time it runs; the others are typed as recorded.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input aria-label="Routine name" placeholder="Name, for example Weekly report" value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="What it does" placeholder="What it does (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          {sharing && (
            <select aria-label="Who can use it" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={shared} onChange={(e) => setShared(e.target.value)}>
              <option value="none">Only me</option>
              <option value="team">People in my departments</option>
              <option value="everyone">Everyone</option>
            </select>
          )}
          <ol className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {list.map((s, i) => (
              <li key={i} className="flex items-center gap-2 rounded border px-2 py-1">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {describe(s)}
                  {s.do !== "click" && s.value && !s.ask ? `: ${s.value}` : ""}
                </span>
                {s.do === "fill" && (
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox checked={!!s.ask} onCheckedChange={(v) => setList(list.map((x, j) => (j === i ? { ...x, ask: v === true } : x)))} aria-label={`Ask for ${s.label} each time`} /> ask
                  </label>
                )}
                <Button size="icon-xs" variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => setList(list.filter((_, j) => j !== i))}>
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Discard
          </Button>
          <Button disabled={busy || !name.trim() || !list.length} onClick={save}>
            {busy && <Loader2Icon className="animate-spin" />} Save routine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

type RunState = { id: string; name: string; steps: RoutineStep[]; values: Record<string, string>; i: number; confirmEachStep: boolean };

function findClickable(s: RoutineStep): HTMLElement | null {
  const want = norm(s.name);
  const all = [...document.querySelectorAll(CLICKABLE)].filter((el) => visible(el) && outside(el)) as HTMLElement[];
  // In an open dialog first (what was pressed in a dialog is in the dialog again).
  const dialogs = [...document.querySelectorAll("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]")].filter(visible);
  const scope = (list: HTMLElement[]) => (dialogs.length ? [...list.filter((el) => dialogs.some((d) => d.contains(el))), ...list] : list);
  const byRole = all.filter((el) => roleOf(el) === s.role);
  return scope(byRole).find((el) => norm(nameOf(el)) === want) ?? scope(all).find((el) => norm(nameOf(el)) === want) ?? scope(all).find((el) => norm(nameOf(el)).startsWith(want) && want.length > 2) ?? null;
}
function findField(s: RoutineStep) {
  const want = norm(s.label);
  const all = [...document.querySelectorAll("input, textarea, select")].filter((el) => visible(el) && outside(el)) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
  return all.find((el) => norm(labelOf(el)) === want) ?? null;
}
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function beginRun(runId: string) {
  const r = await startRunAction(runId);
  if (!r.ok || !r.data) return void toast.error((!r.ok && r.error) || "The routine could not start.");
  write(RUN, { ...r.data, i: 0 } satisfies RunState);
  window.dispatchEvent(new Event("myseed-routine"));
}

export function RoutineRunner() {
  const router = useRouter();
  const pathname = usePathname();
  const [st, setSt] = React.useState<RunState | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [ring, setRing] = React.useState<DOMRect | null>(null);
  const busy = React.useRef(false);
  React.useEffect(() => {
    const load = () => setSt(read<RunState>(RUN));
    load();
    window.addEventListener("myseed-routine", load);
    return () => window.removeEventListener("myseed-routine", load);
  }, []);
  const save = (next: RunState | null) => {
    write(RUN, next);
    setSt(next);
  };
  const end = React.useCallback(async (ok: boolean, error?: string) => {
    const cur = read<RunState>(RUN);
    write(RUN, null);
    setSt(null);
    setProblem(null);
    setRing(null);
    if (cur) {
      await finishRunAction(cur.id, ok, error ?? null);
      if (ok) toast.success(`"${cur.name}" is done`);
    }
  }, []);
  const doStep = React.useCallback(async () => {
    const cur = read<RunState>(RUN);
    if (!cur || busy.current) return;
    const s = cur.steps[cur.i];
    if (!s) return void end(true);
    busy.current = true;
    setProblem(null);
    try {
      const path = s.path.split("?")[0]!;
      if (window.location.pathname !== path) {
        for (let t = 0; t < 15 && window.location.pathname !== path; t++) await wait(200);
        if (window.location.pathname !== path) {
          router.push(s.path);
          for (let t = 0; t < 50 && window.location.pathname !== path; t++) await wait(200);
          await wait(600);
        }
      }
      if (s.do === "note") {
        save({ ...cur, i: cur.i + 1 });
        return;
      }
      let el: HTMLElement | null = null;
      for (let t = 0; t < 40 && !el; t++) {
        el = s.do === "click" ? findClickable(s) : findField(s);
        if (!el) await wait(200);
      }
      if (!el) {
        setProblem(`Could not find ${s.do === "click" ? `"${s.name}"` : `the field "${s.label}"`} on this page. Do it yourself and press Skip, or Try again.`);
        return;
      }
      el.scrollIntoView({ block: "center" });
      setRing(el.getBoundingClientRect());
      await wait(450);
      const value = s.ask ? (cur.values[String(cur.i)] ?? s.value ?? "") : (s.value ?? "");
      if (s.do === "click") el.click();
      else if (s.do === "check") {
        const want = s.value === "true";
        if ((el as HTMLInputElement).checked !== want) el.click();
      } else setValue(el as HTMLInputElement, value);
      setRing(null);
      await wait(500);
      save({ ...cur, i: cur.i + 1 });
    } finally {
      busy.current = false;
    }
  }, [end, router]);
  // Steps go on one after another (or one at a time with "Do it" when Admin asks for that).
  React.useEffect(() => {
    if (!st || problem || asking) return;
    if (st.confirmEachStep) return;
    const t = setTimeout(() => void doStep(), 250);
    return () => clearTimeout(t);
  }, [st, problem, asking, pathname, doStep]);
  if (!st) return null;
  const s = st.steps[st.i];
  return (
    <>
      {ring && <div className="pointer-events-none fixed z-[69] rounded-lg outline-3 outline-[#1A73E8] outline-solid transition-all" style={{ left: ring.left - 4, top: ring.top - 4, width: ring.width + 8, height: ring.height + 8 }} />}
      <div data-routine-ui data-routine-runner className="no-print fixed top-3 left-1/2 z-[70] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border bg-popover p-3 text-sm shadow-xl" role="status" aria-label="Running a routine">
        <div className="flex items-center gap-2">
          <PlayIcon className="size-4 text-[#1A73E8]" />
          <p className="flex-1 font-medium">
            {st.name} · step {Math.min(st.i + 1, st.steps.length)} of {st.steps.length}
          </p>
          <Button size="icon-xs" variant="ghost" aria-label="Stop the routine" onClick={() => void end(false, "Stopped by the person")}>
            <XIcon />
          </Button>
        </div>
        {s && <p className="mt-1 text-muted-foreground">{describe(s)}</p>}
        {problem && <p className="mt-1 text-[var(--st-paused-fg)]">{problem}</p>}
        <div className="mt-2 flex gap-2">
          {(st.confirmEachStep || problem) && (
            <Button size="xs" onClick={() => void doStep()}>
              <PlayIcon /> {problem ? "Try again" : "Do it"}
            </Button>
          )}
          {!st.confirmEachStep && !problem && (
            <Button size="xs" variant="outline" onClick={() => setAsking(!asking)}>
              <PauseIcon /> {asking ? "Go on" : "Pause"}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => save({ ...st, i: st.i + 1 })}>
            <SkipForwardIcon /> Skip
          </Button>
        </div>
      </div>
    </>
  );
}

// The values a routine asks for, before it runs.
export function askedSteps(steps: RoutineStep[]) {
  return steps.map((s, i) => ({ i, s })).filter((x) => x.s.do === "fill" && x.s.ask);
}
