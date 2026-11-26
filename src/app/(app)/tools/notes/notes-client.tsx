"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarIcon, CheckSquareIcon, DownloadIcon, EyeIcon, FileTextIcon, PencilIcon, PinIcon, PlusIcon, SearchIcon, SendIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MiniMarkdown } from "@/lib/mini-markdown";
import { aiContext, CHECKBOX_RE, checkboxStats, toggleCheckbox, type LinkRef, type NoteView, type TaskView } from "@/lib/tools";
import { deleteNoteAction, deleteTaskAction, saveNoteAction, saveTaskAction, setTaskDoneAction } from "@/app/actions/tools";
import { CopyAiButton, downloadBlob, RecordPicker, safeName, toCsv } from "@/components/app/tools/shared";
import { NotionButton } from "@/components/app/tools/notion-button";
import { cn } from "@/lib/utils";

const blank = (): NoteView => ({ id: "", title: "", body: "", tags: [], pinned: false, link: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const overdue = (t: TaskView) => !t.done && !!t.dueAt && t.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);

function noteMarkdown(n: NoteView, tasks: TaskView[]) {
  const s = checkboxStats(n.body);
  const own = tasks.filter((t) => t.noteId === n.id);
  return [
    `# ${n.title || "Untitled"}`,
    "",
    [n.tags.length && `Tags: ${n.tags.join(", ")}`, n.link && `Linked to: ${n.link.label}`, s.total && `Checklist: ${s.done}/${s.total} done`].filter(Boolean).join("  \n"),
    "",
    n.body,
    ...(own.length ? ["", "## Tasks", "", ...own.map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.dueAt ? ` (due ${day(t.dueAt)})` : ""}`)] : []),
    "",
  ].join("\n");
}

// The note's body with its tick boxes clickable; headings and the rest as light Markdown (never raw HTML).
function Preview({ body, onToggle }: { body: string; onToggle: (i: number) => void }) {
  const blocks: React.ReactNode[] = [];
  let buf: string[] = [];
  let box = -1;
  const flush = (k: string) => {
    if (buf.length) blocks.push(<MiniMarkdown key={k} text={buf.join("\n")} className="text-sm" />);
    buf = [];
  };
  body.split(/\r?\n/).forEach((line, i) => {
    const m = CHECKBOX_RE.exec(line);
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush(`t${i}`);
      const idx = ++box;
      const done = m[2] !== " ";
      blocks.push(
        <label key={`c${i}`} className="flex items-start gap-2 py-0.5 text-sm" style={{ paddingLeft: `${Math.min(6, Math.floor(m[1]!.length / 2)) * 0.75}rem` }}>
          <Checkbox className="mt-0.5" checked={done} onCheckedChange={() => onToggle(idx)} />
          <span className={cn(done && "text-muted-foreground line-through")}>{(m[3] ?? "").trim()}</span>
        </label>,
      );
    } else if (h) {
      flush(`t${i}`);
      const Tag = (["h2", "h3", "h4"] as const)[h[1]!.length - 1]!;
      blocks.push(<Tag key={`h${i}`} className={cn("font-semibold", h[1]!.length === 1 ? "mt-2 text-lg" : "mt-1.5 text-base")}>{h[2]}</Tag>);
    } else buf.push(line);
  });
  flush("end");
  return <div className="space-y-1">{blocks.length ? blocks : <p className="text-sm text-muted-foreground">Nothing written yet.</p>}</div>;
}

export function NotesClient({ initialNotes, initialTasks, workspace, who, features, openNote, openTask }: { initialNotes: NoteView[]; initialTasks: TaskView[]; workspace: string; who: string; features: string[]; openNote: string | null; openTask: string | null }) {
  const [notes, setNotes] = React.useState(initialNotes);
  const [tasks, setTasks] = React.useState(initialTasks);
  const [sel, setSel] = React.useState<NoteView | null>(() => initialNotes.find((n) => n.id === openNote) ?? initialNotes[0] ?? null);
  const [mode, setMode] = React.useState<"edit" | "view">("view");
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState(openTask ? "tasks" : "notes");
  const [saving, setSaving] = React.useState<"idle" | "saving" | "saved">("idle");
  const dirty = React.useRef(false);
  // A new note is created once: later saves wait for that first insert and then update it.
  const creating = React.useRef<Promise<string | null> | null>(null);
  const ai = features.includes("ai_copy");

  // Saves the open note a moment after typing stops.
  const persist = React.useCallback(async (n: NoteView): Promise<string | null> => {
    if (!n.id && creating.current) {
      const id = await creating.current;
      if (!id) return null;
      n = { ...n, id };
    }
    setSaving("saving");
    const call = saveNoteAction({ id: n.id || undefined, title: n.title, body: n.body, tags: n.tags, pinned: n.pinned, link: n.link }).then((r) => (r.ok ? (r.data as string) : (toast.error(r.error), null)));
    if (!n.id) creating.current = call;
    const id = await call;
    if (!n.id) creating.current = null;
    if (!id) {
      setSaving("idle");
      return null;
    }
    const saved = { ...n, id, updatedAt: new Date().toISOString() };
    setNotes((all) => [saved, ...all.filter((x) => x.id !== id && x !== n)].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
    setSel((cur) => (cur && (cur.id === id || !cur.id) ? { ...cur, id } : cur));
    dirty.current = false;
    setSaving("saved");
    return id;
  }, []);
  React.useEffect(() => {
    if (!sel || !dirty.current) return;
    const t = setTimeout(() => void persist(sel), 900);
    return () => clearTimeout(t);
  }, [sel, persist]);
  const edit = (patch: Partial<NoteView>) => {
    dirty.current = true;
    setSaving("idle");
    setSel((s) => (s ? { ...s, ...patch } : s));
  };

  const shown = notes.filter((n) => !q || `${n.title} ${n.body} ${n.tags.join(" ")} ${n.link?.label ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const stats = sel ? checkboxStats(sel.body) : { done: 0, total: 0 };

  const exportAllMd = () => downloadBlob(new Blob([notes.map((n) => noteMarkdown(n, tasks)).join("\n---\n\n")], { type: "text/markdown" }), safeName(`${workspace} notes`, "md"));
  const exportTasksCsv = () =>
    downloadBlob(
      new Blob([toCsv(["Title", "Description", "Due", "Done", "Done at", "Note", "Linked record"], tasks.map((t) => [t.title, t.description, day(t.dueAt), t.done ? "yes" : "no", day(t.doneAt), notes.find((n) => n.id === t.noteId)?.title ?? "", t.link?.label ?? ""]))], { type: "text/csv" }),
      safeName("tasks", "csv"),
    );

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="notes">
            <FileTextIcon /> Notes ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <CheckSquareIcon /> Tasks ({tasks.filter((t) => !t.done).length} open)
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportAllMd} disabled={!notes.length}>
            <DownloadIcon /> Notes (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={exportTasksCsv} disabled={!tasks.length}>
            <DownloadIcon /> Tasks (.csv)
          </Button>
          {ai && <CopyAiButton label="Copy all for AI" build={(ask) => aiContext({ workspace, who, notes, tasks, ask })} />}
        </div>
      </div>

      <TabsContent value="notes" className="mt-3">
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="pl-7" aria-label="Search notes" />
              </div>
              <Button
                size="icon"
                aria-label="New note"
                onClick={() => {
                  const n = { ...blank(), body: "- [ ] " };
                  setSel(n);
                  setMode("edit");
                }}
              >
                <PlusIcon />
              </Button>
            </div>
            <ul className="max-h-[65vh] space-y-1 overflow-auto">
              {shown.map((n) => {
                const s = checkboxStats(n.body);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (dirty.current && sel) void persist(sel);
                        setSel(n);
                        setMode("view");
                      }}
                      className={cn("w-full rounded-md border px-3 py-2 text-left hover:bg-muted", sel?.id === n.id && "border-primary bg-primary/5")}
                    >
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {n.pinned && <PinIcon className="size-3 shrink-0" />}
                        <span className="truncate">{n.title || "Untitled"}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {s.total > 0 && <span className="tabular">{s.done}/{s.total} done</span>}
                        <span>{new Date(n.updatedAt).toLocaleDateString()}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{notes.length ? "No note matches." : "No notes yet. Press + to write one."}</li>}
            </ul>
          </aside>

          {sel ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={sel.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Title" className="min-w-48 flex-1 text-base font-medium" aria-label="Title" />
                  <Button variant={sel.pinned ? "secondary" : "ghost"} size="icon" aria-label={sel.pinned ? "Unpin" : "Pin"} onClick={() => edit({ pinned: !sel.pinned })}>
                    <PinIcon />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={mode === "edit" ? "Preview" : "Edit"} onClick={() => setMode(mode === "edit" ? "view" : "edit")}>
                    {mode === "edit" ? <EyeIcon /> : <PencilIcon />}
                  </Button>
                  {sel.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete note"
                      onClick={async () => {
                        if (!confirm("Delete this note?")) return;
                        const r = await deleteNoteAction(sel.id);
                        if (!r.ok) return toast.error(r.error);
                        const rest = notes.filter((x) => x.id !== sel.id);
                        setNotes(rest);
                        setSel(rest[0] ?? null);
                        dirty.current = false;
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RecordPicker value={sel.link} onChange={(link) => edit({ link })} />
                  <Input
                    value={sel.tags.join(", ")}
                    onChange={(e) => edit({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    placeholder="Tags, separated by commas"
                    className="h-7 max-w-64 text-xs"
                    aria-label="Tags"
                  />
                  {stats.total > 0 && (
                    <Badge variant="secondary" className="tabular">
                      {stats.done}/{stats.total} completed
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                    {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : dirty.current ? "Unsaved" : ""}
                  </span>
                </div>
                {stats.total > 0 && (
                  <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={stats.done} aria-valuemax={stats.total}>
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
                  </div>
                )}
                {mode === "edit" ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {[
                        ["Tick box", "- [ ] "],
                        ["Heading", "## "],
                        ["List", "- "],
                      ].map(([l, ins]) => (
                        <Button key={l} variant="outline" size="sm" className="h-7 text-xs" onClick={() => edit({ body: `${sel.body}${sel.body && !sel.body.endsWith("\n") ? "\n" : ""}${ins}` })}>
                          {l}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={sel.body}
                      onChange={(e) => edit({ body: e.target.value })}
                      rows={18}
                      className="font-mono text-sm"
                      placeholder={"Write in Markdown.\n- [ ] A task\n- [x] A finished task"}
                      aria-label="Note"
                    />
                  </>
                ) : (
                  <div className="min-h-40 rounded-md border p-3" onDoubleClick={() => setMode("edit")}>
                    <Preview body={sel.body} onToggle={(i) => edit({ body: toggleCheckbox(sel.body, i) })} />
                  </div>
                )}
                <NoteTasks
                  noteId={sel.id}
                  tasks={tasks.filter((t) => sel.id && t.noteId === sel.id)}
                  setTasks={setTasks}
                  needSave={() => (sel.id ? Promise.resolve(sel.id) : persist({ ...sel, title: sel.title || "Untitled" }))}
                />
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => downloadBlob(new Blob([noteMarkdown(sel, tasks)], { type: "text/markdown" }), safeName(sel.title, "md"))}>
                    <DownloadIcon /> Markdown
                  </Button>
                  {ai && <CopyAiButton build={(ask) => aiContext({ workspace, who, notes: [sel], tasks: tasks.filter((t) => t.noteId === sel.id), ask })} />}
                  {features.includes("notion") && sel.id && <NotionButton title={sel.title || "Untitled"} markdown={noteMarkdown(sel, tasks)} />}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">Choose a note, or press + to write one.</CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      <TabsContent value="tasks" className="mt-3">
        <TaskBoard tasks={tasks} setTasks={setTasks} notes={notes} focus={openTask} />
      </TabsContent>
    </Tabs>
  );
}

function NoteTasks({ noteId, tasks, setTasks, needSave }: { noteId: string; tasks: TaskView[]; setTasks: React.Dispatch<React.SetStateAction<TaskView[]>>; needSave: () => Promise<string | null> }) {
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const done = tasks.filter((t) => t.done).length;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        Tasks in this note{" "}
        {tasks.length > 0 && (
          <span className="text-muted-foreground tabular">
            ({done}/{tasks.length} completed)
          </span>
        )}
      </p>
      {tasks.map((t) => (
        <TaskRow key={t.id} t={t} setTasks={setTasks} compact />
      ))}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const id = noteId || (await needSave());
          if (!id) return;
          const input = { noteId: id, title, dueAt: due || null };
          const r = await saveTaskAction(input);
          if (!r.ok) return toast.error(r.error);
          setTasks((all) => [...all, { id: r.data as string, noteId: id, title, description: "", dueAt: due ? new Date(due).toISOString() : null, done: false, doneAt: null, link: null, createdAt: new Date().toISOString() }]);
          setTitle("");
          setDue("");
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" className="h-8 min-w-40 flex-1" aria-label="New task" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" aria-label="Due date" />
        <Button size="sm" type="submit" disabled={!title.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
    </div>
  );
}

function TaskRow({ t, setTasks, compact, noteTitle }: { t: TaskView; setTasks: React.Dispatch<React.SetStateAction<TaskView[]>>; compact?: boolean; noteTitle?: string }) {
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState(t);
  React.useEffect(() => setD(t), [t]);
  const patch = (p: Partial<TaskView>) => setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, ...p } : x)));
  return (
    <div className={cn("rounded-md border px-2.5 py-1.5", overdue(t) && "border-destructive/50")} id={`task-${t.id}`}>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={t.done}
          aria-label={`Done: ${t.title}`}
          onCheckedChange={async (v) => {
            patch({ done: !!v, doneAt: v ? new Date().toISOString() : null });
            const r = await setTaskDoneAction(t.id, !!v);
            if (!r.ok) toast.error(r.error);
          }}
        />
        <button type="button" className={cn("min-w-0 flex-1 truncate text-left text-sm", t.done && "text-muted-foreground line-through")} onClick={() => setOpen(!open)}>
          {t.title}
        </button>
        {!compact && noteTitle && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{noteTitle}</span>}
        {t.link && <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline">{t.link.label}</span>}
        {t.dueAt && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs tabular", overdue(t) ? "text-destructive" : "text-muted-foreground")}>
            <CalendarIcon className="size-3" /> {day(t.dueAt)}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Title" className="h-8" />
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Description" rows={3} />
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={day(d.dueAt)} onChange={(e) => setD({ ...d, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className="h-8 w-40" aria-label="Due date" />
            <RecordPicker value={d.link} onChange={(link: LinkRef) => setD({ ...d, link })} />
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Delete this task?")) return;
                  const r = await deleteTaskAction(t.id);
                  if (!r.ok) return toast.error(r.error);
                  setTasks((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                <Trash2Icon /> Delete
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const r = await saveTaskAction({ id: t.id, noteId: d.noteId, title: d.title, description: d.description, dueAt: d.dueAt, done: d.done, link: d.link });
                  if (!r.ok) return toast.error(r.error);
                  patch(d);
                  setOpen(false);
                  toast.success("Task saved");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskBoard({ tasks, setTasks, notes, focus }: { tasks: TaskView[]; setTasks: React.Dispatch<React.SetStateAction<TaskView[]>>; notes: NoteView[]; focus: string | null }) {
  const [filter, setFilter] = React.useState<"open" | "overdue" | "done" | "all">("open");
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [link, setLink] = React.useState<LinkRef>(null);
  React.useEffect(() => {
    if (focus) document.getElementById(`task-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus]);
  const shown = tasks.filter((t) => (filter === "all" ? true : filter === "done" ? t.done : filter === "overdue" ? overdue(t) : !t.done));
  const done = tasks.filter((t) => t.done).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["open", "overdue", "done", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)} className="capitalize">
              {f} ({tasks.filter((t) => (f === "all" ? true : f === "done" ? t.done : f === "overdue" ? overdue(t) : !t.done)).length})
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground tabular">
            {done}/{tasks.length} completed
          </span>
        </div>
        {shown.map((t) => (
          <TaskRow key={t.id} t={t} setTasks={setTasks} noteTitle={notes.find((n) => n.id === t.noteId)?.title} />
        ))}
        {!shown.length && <p className="py-10 text-center text-sm text-muted-foreground">No tasks here.</p>}
      </div>
      <Card className="h-fit">
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium">New task</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" rows={3} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <RecordPicker value={link} onChange={setLink} />
          <Button
            className="w-full"
            disabled={!title.trim()}
            onClick={async () => {
              const r = await saveTaskAction({ title, description: desc, dueAt: due || null, link });
              if (!r.ok) return toast.error(r.error);
              setTasks((all) => [{ id: r.data as string, noteId: null, title, description: desc, dueAt: due ? new Date(due).toISOString() : null, done: false, doneAt: null, link, createdAt: new Date().toISOString() }, ...all]);
              setTitle("");
              setDesc("");
              setDue("");
              setLink(null);
            }}
          >
            <SendIcon /> Add task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
