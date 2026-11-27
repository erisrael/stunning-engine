"use client";

// Sticky notes over the whole system: your pinned notes and your open to-dos in a small panel that stays on top of
// every page, so they can be read and ticked while working. Toggled from the top bar (or Alt+N); it remembers
// whether it was open, where it was dragged to, its size and each note's colour. Ticking a box, editing a note,
// adding one or finishing a to-do saves at once to Notes.

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckIcon, GripHorizontalIcon, MinusIcon, PinOffIcon, PlusIcon, StickyNoteIcon, XIcon, ExternalLinkIcon } from "lucide-react";
import { saveNoteAction, saveTaskAction, setTaskDoneAction, stickyAction } from "@/app/actions/tools";
import { CHECKBOX_RE, toggleCheckbox, type NoteView, type TaskView } from "@/lib/tools";
import { inlineHtml } from "@/components/app/tools/doc-model";
import { cn } from "@/lib/utils";

const COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fce7f3", "#ffedd5", "#ede9fe"];
type State = { open: boolean; min: boolean; x: number; y: number; w: number; h: number; tab: "notes" | "todo"; colors: Record<string, string> };
const KEY = "myseed.sticky";
const read = (): State => {
  const d: State = { open: false, min: false, x: -1, y: 80, w: 320, h: 440, tab: "notes", colors: {} };
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<State>) };
  } catch {
    return d;
  }
};

export function StickyNotes() {
  const [s, setS] = React.useState<State | null>(null);
  const [notes, setNotes] = React.useState<NoteView[]>([]);
  const [tasks, setTasks] = React.useState<TaskView[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);

  React.useEffect(() => setS(read()), []);
  const save = React.useCallback((p: Partial<State>) => {
    setS((cur) => {
      const next = { ...(cur ?? read()), ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* the panel still works without remembering */
      }
      return next;
    });
  }, []);

  const load = React.useCallback(async () => {
    const r = await stickyAction();
    if (!r.ok) return;
    const d = r.data as { notes: NoteView[]; tasks: TaskView[] };
    setNotes(d.notes);
    setTasks(d.tasks);
    setLoaded(true);
  }, []);

  // The top bar's button and Alt+N toggle it.
  React.useEffect(() => {
    const toggle = () => save({ open: !(read().open), min: false });
    const key = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("myseed:sticky", toggle);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("myseed:sticky", toggle);
      window.removeEventListener("keydown", key);
    };
  }, [save]);
  // Fresh when opened, every minute while open, and when coming back to the tab.
  React.useEffect(() => {
    if (!s?.open) return;
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    const vis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [s?.open, load]);

  if (!s?.open) return null;
  const x = s.x < 0 ? Math.max(8, window.innerWidth - s.w - 24) : Math.min(s.x, window.innerWidth - 80);
  const y = Math.min(Math.max(8, s.y), window.innerHeight - 48);

  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const sx = e.clientX - x;
    const sy = e.clientY - y;
    const mv = (ev: PointerEvent) => save({ x: Math.max(0, ev.clientX - sx), y: Math.max(0, ev.clientY - sy) });
    const up = () => (window.removeEventListener("pointermove", mv), window.removeEventListener("pointerup", up));
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const resize = (e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const w0 = s.w;
    const h0 = s.h;
    const mv = (ev: PointerEvent) => save({ w: Math.min(720, Math.max(240, w0 + ev.clientX - sx)), h: Math.min(window.innerHeight - 40, Math.max(200, h0 + ev.clientY - sy)) });
    const up = () => (window.removeEventListener("pointermove", mv), window.removeEventListener("pointerup", up));
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const putNote = async (n: NoteView, patch: Partial<NoteView>) => {
    const next = { ...n, ...patch };
    setNotes((all) => all.map((x) => (x.id === n.id ? next : x)).filter((x) => x.pinned));
    const r = await saveNoteAction({ id: n.id, title: next.title, body: next.body, tags: next.tags, pinned: next.pinned, link: next.link });
    if (!r.ok) {
      toast.error(r.error);
      void load();
    }
  };
  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const [title, ...rest] = text.split("\n");
    const r = await saveNoteAction({ title: title!.slice(0, 120), body: rest.join("\n"), pinned: true });
    if (!r.ok) return toast.error(r.error);
    void load();
  };
  const addTask = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    const r = await saveTaskAction({ title: t.slice(0, 200) });
    if (!r.ok) return toast.error(r.error);
    void load();
  };
  const done = async (t: TaskView) => {
    setTasks((all) => all.filter((x) => x.id !== t.id));
    const r = await setTaskDoneAction(t.id, true);
    if (!r.ok) {
      toast.error(r.error);
      void load();
    } else toast.success(`Done: ${t.title}`);
  };

  return (
    <div
      role="dialog"
      aria-label="Sticky notes"
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border bg-background/95 shadow-2xl ring-1 ring-black/5 backdrop-blur"
      style={{ left: x, top: y, width: s.w, height: s.min ? undefined : s.h }}
    >
      <div onPointerDown={drag} className="flex cursor-grab items-center gap-1.5 border-b bg-amber-100/70 px-2 py-1.5 active:cursor-grabbing dark:bg-amber-500/15">
        <StickyNoteIcon className="size-4 text-amber-600" />
        <span className="text-sm font-semibold">Sticky notes</span>
        <GripHorizontalIcon className="mx-auto size-4 text-muted-foreground/50" />
        <Link href="/tools/notes" title="Open Notes" aria-label="Open Notes" className="rounded p-1 hover:bg-black/5">
          <ExternalLinkIcon className="size-3.5" />
        </Link>
        <button type="button" aria-label={s.min ? "Show" : "Minimise"} title={s.min ? "Show" : "Minimise"} onClick={() => save({ min: !s.min })} className="rounded p-1 hover:bg-black/5">
          <MinusIcon className="size-3.5" />
        </button>
        <button type="button" aria-label="Close (Alt+N)" title="Close (Alt+N)" onClick={() => save({ open: false })} className="rounded p-1 hover:bg-black/5">
          <XIcon className="size-3.5" />
        </button>
      </div>
      {!s.min && (
        <>
          <div className="flex border-b text-xs" role="tablist">
            {(
              [
                ["notes", `Notes (${notes.length})`],
                ["todo", `To-do (${tasks.length})`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={s.tab === k} onClick={() => save({ tab: k })} className={cn("flex-1 border-b-2 py-1.5", s.tab === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {!loaded && <p className="p-3 text-center text-xs text-muted-foreground">Loading…</p>}
            {loaded && s.tab === "notes" && !notes.length && <p className="p-3 text-center text-xs text-muted-foreground">No pinned notes. Add one below, or pin a note in Notes to keep it here.</p>}
            {s.tab === "notes" &&
              notes.map((n) => {
                const color = s.colors[n.id] ?? COLORS[0]!;
                let box = -1;
                return (
                  <div key={n.id} className="group rounded-lg p-2.5 text-[13px] text-slate-800 shadow-sm" style={{ background: color }}>
                    <div className="flex items-start gap-1">
                      <p className="min-w-0 flex-1 font-semibold break-words">{n.title || "Untitled"}</p>
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" aria-label="Colour" title="Colour" className="size-4 rounded-full border border-black/20" style={{ background: COLORS[(COLORS.indexOf(color) + 1) % COLORS.length] }} onClick={() => save({ colors: { ...s.colors, [n.id]: COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]! } })} />
                        <button type="button" aria-label="Unpin" title="Take off the sticky notes" onClick={() => putNote(n, { pinned: false })} className="rounded p-0.5 hover:bg-black/10">
                          <PinOffIcon className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {editing === n.id ? (
                      <textarea
                        autoFocus
                        defaultValue={n.body}
                        rows={Math.max(3, n.body.split("\n").length + 1)}
                        className="mt-1 w-full resize-y rounded bg-white/60 p-1 text-[13px] outline-none"
                        placeholder={"Write here. A line like - [ ] task becomes a tick box."}
                        onBlur={(e) => (setEditing(null), e.target.value !== n.body && void putNote(n, { body: e.target.value }))}
                      />
                    ) : (
                      <div className="mt-1 cursor-text space-y-0.5" onClick={() => setEditing(n.id)} title="Click to edit">
                        {n.body.split("\n").map((line, i) => {
                          const m = CHECKBOX_RE.exec(line);
                          if (m) {
                            box++;
                            const idx = box;
                            const on = m[2] !== " ";
                            return (
                              <label key={i} className="flex items-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" className="mt-0.5" checked={on} onChange={() => putNote(n, { body: toggleCheckbox(n.body, idx) })} />
                                <span className={cn(on && "text-slate-500 line-through")}>{(m[3] ?? "").trim()}</span>
                              </label>
                            );
                          }
                          // Every piece of text is escaped by inlineHtml.
                          return line.trim() ? <p key={i} className="break-words" dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^\s*[-*+]\s+/, "• ")) }} /> : <div key={i} className="h-1" />;
                        })}
                        {!n.body.trim() && <p className="text-xs text-slate-500">Click to write…</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            {loaded && s.tab === "todo" && !tasks.length && <p className="p-3 text-center text-xs text-muted-foreground">Nothing to do. Add a to-do below.</p>}
            {s.tab === "todo" &&
              tasks.map((t) => {
                const late = t.dueAt && t.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
                return (
                  <div key={t.id} className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-[13px]">
                    <button type="button" aria-label={`Mark ${t.title} done`} onClick={() => done(t)} className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border hover:border-primary hover:bg-primary/10">
                      <CheckIcon className="size-3 opacity-0 hover:opacity-100" />
                    </button>
                    <span className="min-w-0 flex-1 break-words">
                      {t.title}
                      {t.dueAt && <span className={cn("ml-1 text-[11px]", late ? "text-destructive" : "text-muted-foreground")}>{late ? "late, " : ""}due {t.dueAt.slice(0, 10)}</span>}
                    </span>
                  </div>
                );
              })}
          </div>
          <div className="flex items-end gap-1 border-t p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void (s.tab === "notes" ? addNote() : addTask());
                }
              }}
              rows={1}
              placeholder={s.tab === "notes" ? "New sticky note (Enter to add)" : "New to-do (Enter to add)"}
              className="max-h-24 min-h-8 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button" aria-label="Add" onClick={() => void (s.tab === "notes" ? addNote() : addTask())} className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PlusIcon className="size-4" />
            </button>
          </div>
          <span onPointerDown={resize} aria-hidden className="absolute right-0 bottom-0 size-3 cursor-nwse-resize" style={{ background: "linear-gradient(135deg, transparent 50%, rgba(100,116,139,.5) 50%)" }} />
        </>
      )}
    </div>
  );
}

// The top bar's button.
export function StickyButton({ className }: { className?: string }) {
  return (
    <button type="button" title="Sticky notes (Alt+N)" aria-label="Sticky notes" onClick={() => window.dispatchEvent(new Event("myseed:sticky"))} className={cn("inline-flex size-9 items-center justify-center rounded-md hover:bg-accent", className)}>
      <StickyNoteIcon className="size-4 text-amber-600" />
    </button>
  );
}
