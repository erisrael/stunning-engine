"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlertIcon, CirclePlayIcon, HistoryIcon, Link2Icon, PlusIcon, RotateCcwIcon, SaveIcon, SendIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as A from "@/app/actions/support-ivr";
import {
  CONDITION_FIELDS,
  IVR_NODE_HELP,
  IVR_NODE_LABELS,
  PORT_LABELS,
  portsOf,
  textOf,
  validateIvr,
  type IvrGraph,
  type IvrIssue,
  type IvrLang,
  type IvrNode,
  type IvrNodeType,
  type IvrScreen,
  starterIvrGraph,
} from "@/lib/support-ivr";
import { DAY_NAMES } from "@/lib/support-queues";

// Support › Phone menu (Update 1.2, Phase 9): the visual IVR builder. Nodes are dragged on a canvas; each output is
// connected by clicking it, then the node it leads to. Drafts save without checks; publishing needs a valid flow and
// makes a numbered version; a published flow is switched on to answer callers. The test call runs the draft.

type Flow = { id: string; name: string; appId: string | null; lang: string | null; category: string | null; publishedVersion: number | null; active: boolean; updatedAt: string };
type Detail = { flow: Flow; graph: IvrGraph; check: { errors: IvrIssue[]; warnings: IvrIssue[] }; versions: { version: number; note: string | null; published_at: string; by: string | null }[] };
type Opt = { id: string; name: string };

const W = 224;
const HEAD = 52;
const ROW = 26;
const select = "h-8 w-full rounded-md border bg-background px-2 text-sm";
const COLORS: Partial<Record<IvrNodeType, string>> = {
  welcome: "border-sky-500/60",
  language: "border-violet-500/60",
  menu: "border-violet-500/60",
  dtmf: "border-violet-500/60",
  queue: "border-emerald-500/60",
  department: "border-emerald-500/60",
  agent: "border-emerald-500/60",
  transfer: "border-emerald-500/60",
  voicemail: "border-amber-500/60",
  callback: "border-amber-500/60",
  end: "border-rose-500/60",
};
const portName = (p: string) => (p.startsWith("opt:") ? `Key ${p.slice(4)}` : (PORT_LABELS[p] ?? p));
const newId = (type: string, nodes: IvrNode[]) => {
  let i = 1;
  while (nodes.some((n) => n.id === `${type}_${i}`)) i++;
  return `${type}_${i}`;
};

export function IvrBuilder({ flows: firstFlows, detail: first, queues, departments, agents, apps, channels }: { flows: Flow[]; detail: Detail | null; queues: Opt[]; departments: { key: string; label: string }[]; agents: Opt[]; apps: Opt[]; channels: { key: string; label: string; connected: boolean }[] }) {
  const router = useRouter();
  const [flows] = React.useState(firstFlows);
  const [d, setD] = React.useState<Detail | null>(first);
  const [g, setG] = React.useState<IvrGraph | null>(first?.graph ?? null);
  const [meta, setMeta] = React.useState({ name: first?.flow.name ?? "", appId: first?.flow.appId ?? "", lang: first?.flow.lang ?? "", category: first?.flow.category ?? "" });
  const [sel, setSel] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState<{ from: string; port: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const check = React.useMemo(() => (g ? validateIvr(g) : { errors: [], warnings: [] }), [g]);
  const drag = React.useRef<{ id: string; dx: number; dy: number } | null>(null);
  const canvas = React.useRef<HTMLDivElement>(null);

  const open = async (id: string | null) => {
    if (dirty && !window.confirm("Leave without saving the draft?")) return;
    if (!id) {
      setD(null);
      setG({ start: null, nodes: [], settings: first?.graph.settings ?? { timeoutSec: 8, maxRetries: 3, invalid: { en: "Sorry, that is not one of the choices." }, noInput: { en: "We did not hear a choice." }, announcement: { on: false, text: {} } } });
      setMeta({ name: "", appId: "", lang: "", category: "" });
      setDirty(false);
      return;
    }
    const r = await A.ivrFlowAction(id);
    if (!r.ok) return void toast.error(r.error);
    setD(r.data as Detail);
    setG((r.data as Detail).graph);
    setMeta({ name: (r.data as Detail).flow.name, appId: (r.data as Detail).flow.appId ?? "", lang: (r.data as Detail).flow.lang ?? "", category: (r.data as Detail).flow.category ?? "" });
    setSel(null);
    setDirty(false);
  };

  const edit = (fn: (g: IvrGraph) => IvrGraph) => {
    setG((cur) => (cur ? fn(cur) : cur));
    setDirty(true);
  };
  const editNode = (id: string, patch: Partial<IvrNode>) => edit((cur) => ({ ...cur, nodes: cur.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const addNode = (type: IvrNodeType) => {
    if (!g) return;
    const id = newId(type, g.nodes);
    const sc = canvas.current;
    const node: IvrNode = {
      id,
      type,
      x: Math.round((sc?.scrollLeft ?? 0) + 40),
      y: Math.round((sc?.scrollTop ?? 0) + 40),
      next: {},
      ...(["welcome", "tts", "audio", "menu", "language", "dtmf", "voicemail", "callback", "end"].includes(type) ? { text: { en: "", am: "" } } : {}),
      ...(type === "menu" ? { options: [{ key: "1", label: { en: "", am: "" } }] } : {}),
      ...(type === "language" ? { options: [{ key: "1", label: { en: "Amharic", am: "አማርኛ" }, lang: "am" as const }, { key: "2", label: { en: "English", am: "እንግሊዝኛ" }, lang: "en" as const }] } : {}),
      config: type === "hours" ? { days: [1, 2, 3, 4, 5], from: "08:00", to: "17:00" } : type === "dtmf" ? { variable: "account", maxDigits: 10 } : type === "condition" ? { field: "verified" } : type === "payment" ? { days: 30 } : type === "voicemail" ? { maxSec: 120 } : {},
    };
    edit((cur) => ({ ...cur, start: cur.start ?? id, nodes: [...cur.nodes, node] }));
    setSel(id);
  };
  const removeNode = (id: string) =>
    edit((cur) => ({
      ...cur,
      start: cur.start === id ? null : cur.start,
      nodes: cur.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, next: Object.fromEntries(Object.entries(n.next).map(([k, v]) => [k, v === id ? null : v])) })),
    }));

  const onPointerDown = (e: React.PointerEvent, n: IvrNode) => {
    if ((e.target as HTMLElement).closest("button,input,select,textarea")) return;
    if (linking) {
      if (linking.from !== n.id || true) {
        const from = g?.nodes.find((x) => x.id === linking.from);
        if (from) editNode(from.id, { next: { ...from.next, [linking.port]: n.id } });
      }
      setLinking(null);
      return;
    }
    setSel(n.id);
    const box = canvas.current!.getBoundingClientRect();
    drag.current = { id: n.id, dx: e.clientX - box.left + canvas.current!.scrollLeft - n.x, dy: e.clientY - box.top + canvas.current!.scrollTop - n.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr || !canvas.current) return;
    const box = canvas.current.getBoundingClientRect();
    const x = Math.max(0, Math.round((e.clientX - box.left + canvas.current.scrollLeft - dr.dx) / 10) * 10);
    const y = Math.max(0, Math.round((e.clientY - box.top + canvas.current.scrollTop - dr.dy) / 10) * 10);
    setG((cur) => (cur ? { ...cur, nodes: cur.nodes.map((n) => (n.id === dr.id ? { ...n, x, y } : n)) } : cur));
    setDirty(true);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const save = async () => {
    if (!g) return null;
    setBusy(true);
    const r = await A.saveIvrFlowAction({ id: d?.flow.id ?? null, name: meta.name, appId: meta.appId || null, lang: meta.lang || null, category: meta.category || null, graph: g });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setDirty(false);
    toast.success("Draft saved");
    if (!d) router.push(`/support?tab=ivr&flow=${r.data!.id}`);
    return r.data!.id;
  };
  const publish = async () => {
    const id = dirty || !d ? await save() : d.flow.id;
    if (!id) return;
    const note = window.prompt("What changed in this version? (optional)") ?? "";
    setBusy(true);
    const r = await A.publishIvrFlowAction(id, note);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Version ${r.data} published`);
    await open(id);
    router.refresh();
  };
  const toggle = async (on: boolean) => {
    if (!d) return;
    const r = await A.setIvrFlowActiveAction(d.flow.id, on);
    if (!r.ok) return void toast.error(r.error);
    toast.success(on ? "The phone menu now answers callers" : "Switched off: callers go straight to the queue");
    await open(d.flow.id);
    router.refresh();
  };

  const node = g?.nodes.find((n) => n.id === sel) ?? null;
  const size = { w: Math.max(1200, ...(g?.nodes ?? []).map((n) => n.x + W + 80)), h: Math.max(700, ...(g?.nodes ?? []).map((n) => n.y + HEAD + 8 * ROW + 80)) };
  const issues = (id: string) => check.errors.filter((e) => e.nodeId === id);

  return (
    <div className="space-y-4" data-ivr-builder>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phone menu (IVR)</CardTitle>
          <CardDescription>
            What a caller hears and chooses before they reach an agent. In Telegram and the website, calls run in the browser: prompts are spoken (or a recording plays) and the choices show as a keypad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Flow" className={cn(select, "w-auto min-w-48")} value={d?.flow.id ?? ""} onChange={(e) => void open(e.target.value || null)}>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.active ? "· on" : "· off"} {f.publishedVersion ? `· v${f.publishedVersion}` : "· draft"}
                </option>
              ))}
              <option value="">+ New flow</option>
            </select>
            {/* A complete menu to start from: welcome, language, topics into the waiting lines, call me back. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (dirty && !window.confirm("Replace the unsaved changes with the ready-made menu?")) return;
                setD(null);
                setG(starterIvrGraph());
                setMeta({ name: "Main menu", appId: "", lang: "", category: "" });
                setSel(null);
                setDirty(true);
                toast.message("Ready-made menu loaded. Check the steps, then save and publish it.");
              }}
              data-ivr-starter
            >
              <CirclePlayIcon /> Ready-made menu
            </Button>
            {d && (
              <label className="flex items-center gap-2 text-sm" data-ivr-active>
                <Switch checked={d.flow.active} onCheckedChange={(v) => void toggle(v)} /> {d.flow.active ? "Answering callers" : "Switched off"}
              </label>
            )}
            {d?.flow.publishedVersion ? <span className="text-xs text-muted-foreground">Live version: {d.flow.publishedVersion}</span> : <span className="text-xs text-muted-foreground">Not published yet</span>}
            {dirty && <span className="text-xs text-amber-600" data-ivr-dirty>Unsaved changes</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy || !g} onClick={() => void save()} data-ivr-save>
                <SaveIcon /> Save draft
              </Button>
              <Button size="sm" disabled={busy || !g || check.errors.length > 0} onClick={() => void publish()} data-ivr-publish>
                <SendIcon /> Publish
              </Button>
              {d && !d.flow.active && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(`Delete the flow ${d.flow.name}?`)) return;
                    const r = await A.deleteIvrFlowAction(d.flow.id);
                    if (!r.ok) return void toast.error(r.error);
                    router.push("/support?tab=ivr");
                    router.refresh();
                  }}
                >
                  <Trash2Icon /> Delete
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input aria-label="Flow name" placeholder="Name, e.g. Main line" value={meta.name} onChange={(e) => (setMeta({ ...meta, name: e.target.value }), setDirty(true))} />
            <select aria-label="For which app" className={select} value={meta.appId} onChange={(e) => (setMeta({ ...meta, appId: e.target.value }), setDirty(true))}>
              <option value="">Every app</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select aria-label="For which language" className={select} value={meta.lang} onChange={(e) => (setMeta({ ...meta, lang: e.target.value }), setDirty(true))}>
              <option value="">Any language</option>
              <option value="en">English callers</option>
              <option value="am">Amharic callers</option>
            </select>
            <Input aria-label="For which topic" placeholder="Any topic (or e.g. payment)" value={meta.category} onChange={(e) => (setMeta({ ...meta, category: e.target.value }), setDirty(true))} />
          </div>
          <p className="text-xs text-muted-foreground">
            Channels: {channels.map((c) => `${c.label} (${c.connected ? "connected" : "not connected"})`).join(" · ")}. The most specific active flow answers: one for the caller&apos;s app before one for every app.
          </p>
        </CardContent>
      </Card>

      {g && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="min-w-0">
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Add a node" className={cn(select, "w-auto")} value="" onChange={(e) => e.target.value && addNode(e.target.value as IvrNodeType)} data-ivr-add>
                  <option value="">+ Add a node…</option>
                  {(Object.keys(IVR_NODE_LABELS) as IvrNodeType[]).map((t) => (
                    <option key={t} value={t}>{IVR_NODE_LABELS[t]}</option>
                  ))}
                </select>
                {linking ? (
                  <span className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1 text-xs" data-ivr-linking>
                    Click the node that &ldquo;{portName(linking.port)}&rdquo; leads to
                    <Button size="xs" variant="ghost" onClick={() => setLinking(null)}>Cancel</Button>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Drag nodes by their title. Click an output&apos;s link button, then the node it leads to.</span>
                )}
              </div>
              <div
                ref={canvas}
                className="relative h-[560px] overflow-auto rounded-lg border bg-muted/30"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onClick={(e) => e.target === e.currentTarget && setSel(null)}
                data-ivr-canvas
              >
                <div className="relative" style={{ width: size.w, height: size.h }}>
                  <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden>
                    {g.nodes.flatMap((n) =>
                      portsOf(n).map((p, i) => {
                        const to = n.next[p] ? g.nodes.find((x) => x.id === n.next[p]) : null;
                        if (!to) return null;
                        const x1 = n.x + W;
                        const y1 = n.y + HEAD + i * ROW + ROW / 2;
                        const x2 = to.x;
                        const y2 = to.y + 22;
                        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
                        return <path key={`${n.id}-${p}`} d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`} fill="none" className="stroke-muted-foreground/60" strokeWidth={1.5} />;
                      }),
                    )}
                  </svg>
                  {g.nodes.map((n) => {
                    const bad = issues(n.id).length > 0;
                    return (
                      <div
                        key={n.id}
                        className={cn("absolute rounded-lg border-2 bg-background shadow-sm select-none", COLORS[n.type] ?? "border-border", sel === n.id && "ring-2 ring-primary", linking && "cursor-crosshair")}
                        style={{ left: n.x, top: n.y, width: W }}
                        onPointerDown={(e) => onPointerDown(e, n)}
                        data-ivr-node={n.id}
                      >
                        <div className="cursor-grab px-2 pt-1.5" style={{ height: HEAD }}>
                          <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                            {g.start === n.id && <CirclePlayIcon className="size-3 text-emerald-600" aria-label="Start" />}
                            {IVR_NODE_LABELS[n.type]}
                            {bad && <CircleAlertIcon className="ml-auto size-3.5 text-destructive" aria-label="Needs attention" />}
                          </div>
                          <div className="truncate text-sm font-medium">{n.name || textOf(n.text, "en") || n.id}</div>
                        </div>
                        {portsOf(n).map((p) => {
                          const to = n.next[p] ? g.nodes.find((x) => x.id === n.next[p]) : null;
                          return (
                            <div key={p} className="flex items-center gap-1 border-t px-2 text-xs" style={{ height: ROW }}>
                              <span className="w-24 shrink-0 truncate text-muted-foreground">{portName(p)}</span>
                              <span className="min-w-0 flex-1 truncate">{to ? to.name || IVR_NODE_LABELS[to.type] : <span className="text-muted-foreground">—</span>}</span>
                              <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={`Connect ${portName(p)}`} onClick={() => setLinking({ from: n.id, port: p })} data-ivr-port={p}>
                                <Link2Icon className="size-3.5" />
                              </button>
                              {to && (
                                <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={`Disconnect ${portName(p)}`} onClick={() => editNode(n.id, { next: { ...n.next, [p]: null } })}>
                                  <XIcon className="size-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Issues check={check} onPick={setSel} />
            </CardContent>
          </Card>
          <div className="space-y-4">
            {node ? (
              <NodeEditor key={node.id} node={node} start={g.start === node.id} onStart={() => edit((cur) => ({ ...cur, start: node.id }))} onChange={(p) => editNode(node.id, p)} onRemove={() => (removeNode(node.id), setSel(null))} queues={queues} departments={departments} agents={agents} />
            ) : (
              <FlowSettings g={g} onChange={(s) => edit((cur) => ({ ...cur, settings: s }))} />
            )}
            <TestCall graph={g} />
            {d && d.versions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm"><HistoryIcon className="size-4" /> Versions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs" data-ivr-versions>
                  {d.versions.map((v) => (
                    <div key={v.version} className="flex items-center gap-2">
                      <span className="font-medium">v{v.version}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground" suppressHydrationWarning>{new Date(v.published_at).toLocaleString()} · {v.by ?? "?"}{v.note ? ` · ${v.note}` : ""}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={async () => {
                          if (dirty && !window.confirm("Replace the unsaved draft with this version?")) return;
                          const r = await A.restoreIvrVersionAction(d.flow.id, v.version);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success(`Version ${v.version} is the draft again`);
                          await open(d.flow.id);
                        }}
                      >
                        <RotateCcwIcon /> To draft
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Issues({ check, onPick }: { check: { errors: IvrIssue[]; warnings: IvrIssue[] }; onPick: (id: string) => void }) {
  if (!check.errors.length && !check.warnings.length) return <p className="text-xs text-emerald-700 dark:text-emerald-400" data-ivr-valid>The flow is ready to publish.</p>;
  return (
    <ul className="space-y-1 text-xs" data-ivr-issues>
      {!check.errors.length && <li className="text-emerald-700 dark:text-emerald-400" data-ivr-valid>The flow is ready to publish. The warnings below do not stop it.</li>}
      {check.errors.map((e, i) => (
        <li key={`e${i}`} className="flex items-start gap-1 text-destructive">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          {e.nodeId ? <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onPick(e.nodeId!)}>{e.message}</button> : e.message}
        </li>
      ))}
      {check.warnings.map((e, i) => (
        <li key={`w${i}`} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          {e.nodeId ? <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onPick(e.nodeId!)}>{e.message}</button> : e.message}
        </li>
      ))}
    </ul>
  );
}

function Bilingual({ label, value, onChange, rows = 2 }: { label: string; value: { en?: string; am?: string } | undefined; onChange: (v: { en: string; am: string }) => void; rows?: number }) {
  const v = { en: value?.en ?? "", am: value?.am ?? "" };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea rows={rows} aria-label={`${label} (English)`} placeholder="English" value={v.en} onChange={(e) => onChange({ ...v, en: e.target.value })} />
      <Textarea rows={rows} aria-label={`${label} (Amharic)`} placeholder="አማርኛ" value={v.am} onChange={(e) => onChange({ ...v, am: e.target.value })} />
    </div>
  );
}

function NodeEditor({ node: n, start, onStart, onChange, onRemove, queues, departments, agents }: { node: IvrNode; start: boolean; onStart: () => void; onChange: (p: Partial<IvrNode>) => void; onRemove: () => void; queues: Opt[]; departments: { key: string; label: string }[]; agents: Opt[] }) {
  const c = n.config ?? {};
  const setC = (patch: Record<string, unknown>) => onChange({ config: { ...c, ...patch } });
  const opts = n.options ?? [];
  const speaks = ["welcome", "tts", "audio", "menu", "language", "dtmf", "voicemail", "callback", "end", "queue", "transfer", "agent", "department"].includes(n.type);
  return (
    <Card data-ivr-editor>
      <CardHeader>
        <CardTitle className="text-sm">{IVR_NODE_LABELS[n.type]}</CardTitle>
        <CardDescription className="text-xs">{IVR_NODE_HELP[n.type]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input aria-label="Node name" placeholder="Name on the canvas (optional)" value={n.name ?? ""} onChange={(e) => onChange({ name: e.target.value })} />
        {speaks && <Bilingual label={n.type === "menu" || n.type === "language" ? "What is said (read the choices out)" : "What is said"} value={n.text} onChange={(t) => onChange({ text: t })} rows={n.type === "menu" ? 4 : 2} />}
        {["welcome", "audio", "tts", "menu"].includes(n.type) && <Input aria-label="Recording link" placeholder="Recording link (https://…), optional" value={n.audioUrl ?? ""} onChange={(e) => onChange({ audioUrl: e.target.value || null })} />}
        {(n.type === "menu" || n.type === "language") && (
          <div className="space-y-2" data-ivr-options>
            <Label className="text-xs">Choices</Label>
            {opts.map((o, i) => (
              <div key={i} className="space-y-1 rounded-md border p-2">
                <div className="flex gap-1">
                  <Input aria-label="Key" className="w-12" value={o.key} maxLength={1} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
                  <Input aria-label="Choice (English)" placeholder="English" value={o.label.en ?? ""} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)) })} />
                  <Button size="icon-sm" variant="ghost" aria-label="Remove choice" onClick={() => onChange({ options: opts.filter((_, j) => j !== i), next: Object.fromEntries(Object.entries(n.next).filter(([k]) => k !== `opt:${o.key}`)) })}>
                    <XIcon />
                  </Button>
                </div>
                <Input aria-label="Choice (Amharic)" placeholder="አማርኛ" value={o.label.am ?? ""} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? { ...x, label: { ...x.label, am: e.target.value } } : x)) })} />
                {n.type === "language" ? (
                  <select aria-label="Sets the language" className={select} value={o.lang ?? "en"} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? { ...x, lang: e.target.value as IvrLang } : x)) })}>
                    <option value="en">Sets English</option>
                    <option value="am">Sets Amharic</option>
                  </select>
                ) : (
                  <Input aria-label="Topic for reports and routing" placeholder="Topic (optional), e.g. payment" value={o.category ?? ""} onChange={(e) => onChange({ options: opts.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} />
                )}
              </div>
            ))}
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const used = new Set(opts.map((o) => o.key));
                const key = "1234567890*#".split("").find((k) => !used.has(k)) ?? "9";
                onChange({ options: [...opts, { key, label: { en: "", am: "" } }] });
              }}
            >
              <PlusIcon /> Add a choice
            </Button>
          </div>
        )}
        {n.type === "dtmf" && (
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Value name" placeholder="Value name, e.g. account" value={String(c.variable ?? "")} onChange={(e) => setC({ variable: e.target.value })} />
            <Input aria-label="Most digits" type="number" min={1} max={20} value={Number(c.maxDigits ?? 10)} onChange={(e) => setC({ maxDigits: Number(e.target.value) })} />
          </div>
        )}
        {(n.type === "queue" || n.type === "transfer") && (
          <select aria-label="Queue" className={select} value={String(c.queueId ?? "")} onChange={(e) => setC({ queueId: e.target.value || null })}>
            <option value="">{n.type === "queue" ? "The queue that matches the topic" : "No queue"}</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        )}
        {n.type === "queue" && !c.queueId && <Input aria-label="Topic" placeholder="Topic to match a queue, e.g. payment" value={String(c.category ?? "")} onChange={(e) => setC({ category: e.target.value })} />}
        {(n.type === "agent" || n.type === "transfer") && (
          <select aria-label="Agent" className={select} value={String(c.agentId ?? "")} onChange={(e) => setC({ agentId: e.target.value || null })}>
            <option value="">{n.type === "agent" ? "Choose an agent" : "No agent"}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {n.type === "department" && (
          <select aria-label="Department" className={select} value={String(c.department ?? "")} onChange={(e) => setC({ department: e.target.value || null })}>
            <option value="">Choose a department</option>
            {departments.map((x) => (
              <option key={x.key} value={x.key}>{x.label}</option>
            ))}
          </select>
        )}
        {n.type === "hours" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {DAY_NAMES.map((day, i) => {
                const days = (Array.isArray(c.days) ? c.days : []).map(Number);
                const on = days.includes(i);
                return (
                  <Button key={day} size="xs" variant={on ? "default" : "outline"} onClick={() => setC({ days: on ? days.filter((x) => x !== i) : [...days, i].sort() })}>
                    {day}
                  </Button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Opens" type="time" value={String(c.from ?? "08:00")} onChange={(e) => setC({ from: e.target.value })} />
              <Input aria-label="Closes" type="time" value={String(c.to ?? "17:00")} onChange={(e) => setC({ to: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">Addis Ababa time.</p>
          </div>
        )}
        {n.type === "holiday" && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={c.useCompany !== false} onCheckedChange={(v) => setC({ useCompany: v })} /> Use the workspace&apos;s public holidays
            </label>
            <Input aria-label="Extra dates" placeholder="Extra dates, e.g. 2026-12-24, 2026-12-31" value={(Array.isArray(c.dates) ? c.dates : []).join(", ")} onChange={(e) => setC({ dates: e.target.value.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) })} />
          </div>
        )}
        {n.type === "condition" && (
          <div className="space-y-2">
            <select aria-label="Check" className={select} value={String(c.field ?? "")} onChange={(e) => setC({ field: e.target.value })}>
              {CONDITION_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            {c.field === "var" && <Input aria-label="Value name" placeholder="Value name" value={String(c.variable ?? "")} onChange={(e) => setC({ variable: e.target.value })} />}
            {["lang", "category", "tag", "var"].includes(String(c.field)) && <Input aria-label="Value" placeholder={c.field === "lang" ? "en or am" : "Value"} value={String(c.value ?? "")} onChange={(e) => setC({ value: e.target.value })} />}
          </div>
        )}
        {n.type === "payment" && <Input aria-label="Days to look back" type="number" min={1} max={180} value={Number(c.days ?? 30)} onChange={(e) => setC({ days: Number(e.target.value) })} />}
        {n.type === "voicemail" && <Input aria-label="Longest message (seconds)" type="number" min={10} max={300} value={Number(c.maxSec ?? 120)} onChange={(e) => setC({ maxSec: Number(e.target.value) })} />}
        <div className="flex flex-wrap gap-2 pt-1">
          {!start && <Button size="sm" variant="outline" onClick={onStart}><CirclePlayIcon /> Start here</Button>}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove} data-ivr-remove>
            <Trash2Icon /> Remove node
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowSettings({ g, onChange }: { g: IvrGraph; onChange: (s: IvrGraph["settings"]) => void }) {
  const s = g.settings;
  return (
    <Card data-ivr-settings>
      <CardHeader>
        <CardTitle className="text-sm">Flow settings</CardTitle>
        <CardDescription className="text-xs">Click a node on the canvas to change it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ivr-timeout" className="text-xs">Wait for a key (seconds)</Label>
            <Input id="ivr-timeout" type="number" min={3} max={60} value={s.timeoutSec} onChange={(e) => onChange({ ...s, timeoutSec: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ivr-retries" className="text-xs">Tries before the fallback</Label>
            <Input id="ivr-retries" type="number" min={0} max={5} value={s.maxRetries} onChange={(e) => onChange({ ...s, maxRetries: Number(e.target.value) })} />
          </div>
        </div>
        <Bilingual label="After a wrong key" value={s.invalid} onChange={(t) => onChange({ ...s, invalid: t })} />
        <Bilingual label="When nothing is pressed" value={s.noInput} onChange={(t) => onChange({ ...s, noInput: t })} />
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={s.announcement.on} onCheckedChange={(v) => onChange({ ...s, announcement: { ...s.announcement, on: v } })} data-ivr-announcement /> Emergency announcement before everything else
        </label>
        {s.announcement.on && <Bilingual label="Announcement" value={s.announcement.text} onChange={(t) => onChange({ ...s, announcement: { ...s.announcement, text: t } })} />}
      </CardContent>
    </Card>
  );
}

// Runs the current draft as a caller would: the prompts, then a keypad; each press runs the flow again from the start
// with all keys so far, so what shows is exactly what the engine does.
function TestCall({ graph }: { graph: IvrGraph }) {
  const [lang, setLang] = React.useState<IvrLang>("en");
  const [keys, setKeys] = React.useState<string[] | null>(null);
  const [steps, setSteps] = React.useState<{ input: string | null; screen: Omit<IvrScreen, "sessionId"> }[]>([]);
  const [speak, setSpeak] = React.useState(false);
  const run = async (k: string[]) => {
    const r = await A.testIvrAction(graph, k, lang);
    if (!r.ok) return void toast.error(r.error);
    setKeys(k);
    setSteps(r.data!.steps);
    const last = r.data!.steps.at(-1)?.screen;
    if (speak && last && typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
      for (const s of last.say) {
        const u = new SpeechSynthesisUtterance(s.text);
        u.lang = last.lang === "am" ? "am-ET" : "en-US";
        speechSynthesis.speak(u);
      }
    }
  };
  const last = steps.at(-1)?.screen;
  return (
    <Card data-ivr-test>
      <CardHeader>
        <CardTitle className="text-sm">Test call</CardTitle>
        <CardDescription className="text-xs">Runs the draft on screen. Nothing is saved and no agent rings. Business hours use the time now.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Caller's language" className={cn(select, "w-auto")} value={lang} onChange={(e) => setLang(e.target.value as IvrLang)}>
            <option value="en">English caller</option>
            <option value="am">Amharic caller</option>
          </select>
          <label className="flex items-center gap-1 text-xs">
            <Switch checked={speak} onCheckedChange={setSpeak} /> Speak
          </label>
          <Button size="sm" onClick={() => void run([])} data-ivr-test-start>
            <CirclePlayIcon /> {keys ? "Start again" : "Start"}
          </Button>
        </div>
        {keys && (
          <div className="space-y-2" data-ivr-test-screen>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs">
              {steps.map((s, i) => (
                <div key={i}>
                  {s.input !== null && <p className="font-medium">Pressed {s.input === "#timeout" ? "nothing" : s.input}</p>}
                  {s.screen.say.map((x, j) => (
                    <p key={j} className="text-muted-foreground">{x.text || "(recording)"}</p>
                  ))}
                </div>
              ))}
            </div>
            {last?.ask && (
              <div className="grid grid-cols-3 gap-1">
                {(last.ask.kind === "choice" ? last.ask.options.map((o) => o.key) : "123456789*0#".split("")).map((k) => (
                  <Button key={k} size="sm" variant="outline" onClick={() => void run([...keys, k])} data-ivr-key={k}>
                    {k}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="col-span-3" onClick={() => void run([...keys, "#timeout"])}>Press nothing</Button>
              </div>
            )}
            {last?.done && (
              <p className="rounded-md border p-2 text-xs" data-ivr-test-done={last.done.action}>
                Ends: {last.done.action === "queue" ? `waits in a queue${last.done.category ? ` (topic: ${last.done.category})` : ""}` : last.done.action === "agent" ? "rings the chosen agent" : last.done.action === "voicemail" ? "takes a voice message" : last.done.action === "callback" ? "asks for a call-back number" : "the call ends"}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
