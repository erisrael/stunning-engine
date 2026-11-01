"use client";

// The assistant (Phase 13) in the corner of every page: buttons for the person's own flows and a box to type in.
// Typed text is matched against written keywords (no language model, nothing sent outside). A flow either does
// the task with pickers, a summary and Confirm (the same actions as the pages), or shows the way: it opens the
// page, dims it, rings what to press with a short note, and moves on when it is pressed.

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CompassIcon, Loader2Icon, SendIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { assistantDataAction, logAssistantAction } from "@/app/actions/assistant";
import { requestLeaveAction } from "@/app/actions/leave";
import { flowAssignAction, flowStartAction } from "@/app/actions/departments";
import { matchText, type Flow, type Match, type ShowStep } from "@/lib/assistant";
import type { AssistantContext } from "@/server/assistant";
import { cn } from "@/lib/utils";

type Msg = { from: "me" | "bot"; text: string; actions?: { label: string; run: () => void }[] };
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
  const [data, setData] = React.useState<{ types?: Opt[]; tasks?: Opt[]; people?: Opt[]; dept?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [v, setV] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void assistantDataAction(flow.key).then((r) => {
      if (!r.ok) return setError(r.error ?? "Not possible now.");
      const d = r.data as { types?: { key: string; label: string }[]; tasks?: Opt[]; people?: Opt[]; dept?: string };
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
  void ctx;
  return null;
}

export function Assistant({ ctx }: { ctx: AssistantContext }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [doing, setDoing] = React.useState<Extract<Flow, { kind: "do" }> | null>(null);
  const [showing, setShowing] = React.useState<Extract<Flow, { kind: "show" }> | null>(null);
  const base = ctx.home?.base ?? null;
  const log = (e: Parameters<typeof logAssistantAction>[0]) => void logAssistantAction(e);
  // A "show me" that moved to another page carries on there.
  React.useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      const f = s && ctx.flows.find((x) => x.key === s.flow && x.kind === "show");
      if (f) setShowing(f as Extract<Flow, { kind: "show" }>);
    } catch {}
  }, [ctx.flows]);
  const startFlow = (f: Flow) => {
    log({ flow: f.key, event: f.kind === "show" ? "show" : "start" });
    if (f.kind === "do") {
      setDoing(f);
      setMsgs((m) => [...m, { from: "bot", text: `${f.title}. ${f.hint}.` }]);
    } else if (f.kind === "show") {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ flow: f.key, step: 0 }));
      } catch {}
      setOpen(false);
      setShowing(f);
    }
  };
  const reply = (m: Match): Msg => {
    if (m.type === "flow") return { from: "bot", text: `${m.flow.title}: ${m.flow.hint}.`, actions: [{ label: m.flow.kind === "do" ? "Do it with me" : "Show me", run: () => startFlow(m.flow) }] };
    if (m.type === "place") return { from: "bot", text: `${m.place.name} is here.`, actions: [{ label: `Open ${m.place.name}`, run: () => router.push(fill(m.place.href, base)) }] };
    if (m.type === "term") return { from: "bot", text: `${m.term.term}: ${m.term.meaning}` };
    return { from: "bot", text: m.answer.a };
  };
  const ask = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const found = matchText(t, ctx.flows, ctx.cfg);
    setMsgs((m) => [...m, { from: "me", text: t }]);
    if (!found.length) {
      log({ event: "nomatch", text: t });
      setMsgs((m) => [
        ...m,
        {
          from: "bot",
          text: "I could not find that. These may help, or search Help:",
          actions: [...ctx.flows.slice(0, 3).map((f) => ({ label: f.title, run: () => startFlow(f) })), { label: "Search Help", run: () => router.push(`/profile/help?q=${encodeURIComponent(t)}`) }],
        },
      ]);
    } else setMsgs((m) => [...m, reply(found[0]!), ...found.slice(1, 3).filter((x) => x.type === "flow").map((x) => ({ ...reply(x), text: `Or: ${reply(x).text}` }))]);
    setText("");
  };
  const endDo = (finished: boolean, step: number, done?: string) => {
    log({ flow: doing?.key, event: finished ? "finish" : "abandon", step });
    if (finished && done) setMsgs((m) => [...m, { from: "bot", text: `${done}.` }]);
    setDoing(null);
  };
  const endShow = React.useCallback(
    (finished: boolean, step: number) => {
      setShowing((f) => {
        if (f) void logAssistantAction({ flow: f.key, event: finished ? "finish" : "abandon", step });
        return null;
      });
    },
    [],
  );
  return (
    <>
      {showing && <ShowMe flow={showing} base={base} onEnd={endShow} />}
      <div className="no-print fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2" data-assistant>
        {open && (
          <section role="dialog" aria-label="Assistant" className="flex max-h-[min(36rem,calc(100vh-6rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-popover shadow-xl">
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <CompassIcon className="size-4 text-primary" />
              <p className="flex-1 text-sm font-semibold">Assistant</p>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Close the assistant" onClick={() => (doing && endDo(false, 0), setOpen(false))}>
                <XIcon />
              </Button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              {!msgs.length && !doing && (
                <>
                  <p className="text-muted-foreground">What would you like to do? Pick one, or type it in your own words.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ctx.flows.map((f) => (
                      <button key={f.key} type="button" onClick={() => startFlow(f)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted" data-assistant-flow={f.key}>
                        {f.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={cn("max-w-[90%] rounded-lg px-2.5 py-1.5", m.from === "me" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                  <p>{m.text}</p>
                  {m.actions && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.actions.map((a) => (
                        <Button key={a.label} size="xs" variant="outline" onClick={a.run}>
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {doing && (
                <div className="rounded-lg border p-2.5" data-assistant-do={doing.key}>
                  <DoFlow flow={doing} ctx={ctx} onEnd={endDo} />
                  <Button size="xs" variant="ghost" className="mt-2" onClick={() => endDo(false, 0)}>
                    Stop
                  </Button>
                </div>
              )}
            </div>
            <form className="flex gap-2 border-t p-2" onSubmit={(e) => (e.preventDefault(), ask(text))}>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: assign videos, where is leave" aria-label="Ask the assistant" className="h-8" />
              <Button size="icon" className="size-8" type="submit" aria-label="Ask" disabled={!text.trim()}>
                <SendIcon />
              </Button>
            </form>
          </section>
        )}
        <Button size="icon" className="size-11 rounded-full shadow-lg" aria-label={open ? "Close the assistant" : "Open the assistant"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <SparklesIcon />
        </Button>
      </div>
    </>
  );
}

