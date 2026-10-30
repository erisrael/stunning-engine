"use client";

// Home for the production teams.
// Team members: a board of their own work. Start it, do it (everything the stage needs is on the card), mark it
// done, and send what is done to the team lead, one at a time or all together.
// Team leads: approve what was sent (or return it with a note), hand approved work over to the next team's lead,
// accept what arrives from the previous team, and assign work to people.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  InboxIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import { bulkAction, itemAction, type ItemActionInput } from "@/app/actions/items";
import { createHandoverAction, decideHandoverAction, verifyChecklistAction } from "@/app/actions/editorial";
import type { FlowItem, LeadDeskData } from "@/server/team-flow";
import { RETURN_REASON_LABELS, STAGE_LABELS, STATUS_LABELS, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { tip } from "@/lib/help";

const today = () => new Date().toISOString().slice(0, 10);

type Result = { ok: boolean; error?: string; details?: unknown };

function explain(r: Result) {
  const missing = Array.isArray(r.details) ? (r.details as { label?: string }[]).map((m) => m.label).filter(Boolean) : [];
  toast.error(r.error ?? "Something went wrong.", { description: missing.length ? `Still needed: ${missing.join("; ")}` : undefined, duration: missing.length ? 10000 : 5000 });
}

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async (itemId: string, input: ItemActionInput, done?: string) => {
    setBusy(`${itemId}:${input.action}`);
    const r = (await itemAction(itemId, input, { source: "board" })) as Result;
    setBusy(null);
    if (!r.ok) return explain(r), false;
    if (done) toast.success(done);
    router.refresh();
    return true;
  };
  return { act, busy, refresh: () => router.refresh() };
}

// ---------------------------------------------------------------------------
// The card and its work panel
// ---------------------------------------------------------------------------

function DueTag({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const d = dueAt.slice(0, 10);
  const late = d < today();
  return <span className={cn("text-xs whitespace-nowrap", late ? "font-medium text-destructive" : "text-muted-foreground")}>{late ? `Late: ${d}` : `Due ${d.slice(5)}`}</span>;
}

function Progress({ item }: { item: FlowItem }) {
  const need = item.requirements.filter((r) => !r.key.startsWith("verify:"));
  const met = need.filter((r) => r.met).length;
  if (!need.length) return null;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] tabular", met === need.length ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
      {met}/{need.length} done
    </span>
  );
}

// Everything the stage needs, filled in right here: checklist, links, durations, uploads, notes.
function WorkPanel({ item, canEdit, lead }: { item: FlowItem; canEdit: boolean; lead: boolean }) {
  const { act } = useAct();
  const router = useRouter();
  const [link, setLink] = React.useState("");
  const [rawMin, setRawMin] = React.useState("");
  const missing = item.requirements.filter((r) => !r.met && !r.key.startsWith("verify:") && !r.key.startsWith("check:") && !r.key.startsWith("wc:"));
  const has = (kind: string) => item.assets.find((a) => a.kind === kind);
  const needs = (key: string) => item.requirements.some((r) => r.key === key);
  const addAsset = async (kind: "raw" | "master" | "captions" | "thumbnail", value: string, durationMin?: number | null) => {
    const v = value.trim();
    if (!v) return;
    const isUrl = /^https?:\/\//i.test(v);
    if (kind !== "raw" && !isUrl) return void toast.error("Paste the link (starting with https://).");
    if (await act(item.id, { action: "asset", kind, url: isUrl ? v : null, cameraCode: isUrl ? null : v, durationMin: durationMin ?? null }, "Added")) setLink("");
  };
  return (
    <div className="space-y-3 border-t pt-2 text-sm">
      {item.checks.length > 0 && (
        <ul className="space-y-1">
          {item.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <Checkbox
                aria-label={c.label}
                checked={c.checked}
                disabled={!canEdit}
                onCheckedChange={(v) => act(item.id, { action: "checklist", key: c.key, checked: v === true })}
              />
              <span className={cn("flex-1", c.checked && "text-muted-foreground line-through")}>
                {c.label}
                {c.required && !c.checked && <span className="text-destructive"> *</span>}
              </span>
              {c.verify &&
                (lead ? (
                  <Button
                    size="xs"
                    variant={c.verified ? "secondary" : "outline"}
                    disabled={!c.checked}
                    onClick={async () => {
                      const r = (await verifyChecklistAction(item.id, c.key, !c.verified)) as Result;
                      if (!r.ok) return explain(r);
                      router.refresh();
                    }}
                  >
                    <ShieldCheckIcon /> {c.verified ? "Verified" : "Verify"}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{c.verified ? "verified" : "lead checks"}</span>
                ))}
            </li>
          ))}
        </ul>
      )}

      {item.stage === "recording" && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Recordings</p>
          {item.assets.filter((a) => a.kind === "raw").map((a, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {a.cameraCode ?? a.url} (v{a.version})
            </p>
          ))}
          {canEdit && (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), void addAsset("raw", link, rawMin ? Number(rawMin) : null))}>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Camera code or link" aria-label="Camera code or link" className="h-8 flex-1" />
              <Input value={rawMin} onChange={(e) => setRawMin(e.target.value)} type="number" min={0} placeholder="Minutes" aria-label="Minutes recorded" className="h-8 w-24" />
              <Button size="sm" variant="outline" type="submit" disabled={!link.trim()}>
                Add
              </Button>
            </form>
          )}
          {needs("raw_duration") && (
            <NumberField label="Raw minutes in total" value={item.rawDurationMin} disabled={!canEdit} onSave={(v) => act(item.id, { action: "durations", rawDurationMin: v })} />
          )}
        </div>
      )}

      {item.stage === "editing" && (
        <div className="space-y-2">
          <LinkField label="Edited master (link)" current={has("master")?.url ?? null} disabled={!canEdit} onSave={(v) => addAsset("master", v)} />
          {needs("captions") && <LinkField label="Captions (link)" current={has("captions")?.url ?? null} disabled={!canEdit} onSave={(v) => addAsset("captions", v)} />}
          {needs("thumbnail") && <LinkField label="Thumbnail (link)" current={has("thumbnail")?.url ?? null} disabled={!canEdit} onSave={(v) => addAsset("thumbnail", v)} />}
          <NumberField label="Final length (minutes)" value={item.finalDurationMin} disabled={!canEdit} onSave={(v) => act(item.id, { action: "durations", actualDurationMin: v })} />
        </div>
      )}

      {item.stage === "uploading" &&
        item.targets.map((t) => (
          <div key={t.platform} className="space-y-1.5 rounded-lg border p-2">
            <p className="text-xs font-medium">
              {t.label} <span className="font-normal text-muted-foreground">· {t.status}</span>
            </p>
            <UploadField target={t} disabled={!canEdit} onSave={(v) => act(item.id, { action: "upload", platform: t.platform, status: "uploaded", ...(/^https?:\/\//i.test(v) ? { uploadUrl: v } : { externalId: v }) }, "Upload recorded")} />
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <Checkbox checked={t.playback} disabled={!canEdit} onCheckedChange={(v) => act(item.id, { action: "verify", platform: t.platform, playback: v === true })} /> Plays correctly
              </label>
              <label className="flex items-center gap-1.5">
                <Checkbox checked={t.metadata} disabled={!canEdit} onCheckedChange={(v) => act(item.id, { action: "verify", platform: t.platform, metadata: v === true })} /> Title and details right
              </label>
            </div>
          </div>
        ))}

      <NotesField notes={item.notes} disabled={!canEdit} onSave={(v) => act(item.id, { action: "stageNotes", notes: v })} />
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Still needed: <span className="text-foreground">{missing.map((m) => m.label).join("; ")}</span>
        </p>
      )}
    </div>
  );
}

function LinkField({ label, current, disabled, onSave }: { label: string; current: string | null; disabled: boolean; onSave: (v: string) => void }) {
  const [v, setV] = React.useState("");
  return (
    <form className="space-y-1" onSubmit={(e) => (e.preventDefault(), onSave(v), setV(""))}>
      <p className="text-xs font-medium">{label}</p>
      {current && (
        <a href={current} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">
          {current}
        </a>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={current ? "Paste a newer link" : "https://"} aria-label={label} className="h-8 flex-1" />
          <Button size="sm" variant="outline" type="submit" disabled={!v.trim()}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

function NumberField({ label, value, disabled, onSave }: { label: string; value: number | null; disabled: boolean; onSave: (v: number | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-medium">{label}</span>
      <Input
        type="number"
        min={0}
        step="0.5"
        defaultValue={value ?? ""}
        key={value ?? "none"}
        disabled={disabled}
        aria-label={label}
        className="h-8 w-24"
        onBlur={(e) => {
          const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
          if (v !== value) onSave(v);
        }}
      />
    </label>
  );
}

function UploadField({ target, disabled, onSave }: { target: FlowItem["targets"][number]; disabled: boolean; onSave: (v: string) => void }) {
  const [v, setV] = React.useState("");
  const current = target.externalId ?? target.url;
  return (
    <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), v.trim() && onSave(v.trim()), setV(""))}>
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={current ? `Recorded: ${current}` : "Video ID or link"} aria-label={`${target.label} ID or link`} className="h-8 flex-1" disabled={disabled} />
      {!disabled && (
        <Button size="sm" variant="outline" type="submit" disabled={!v.trim()}>
          Uploaded
        </Button>
      )}
    </form>
  );
}

function NotesField({ notes, disabled, onSave }: { notes: string | null; disabled: boolean; onSave: (v: string | null) => void }) {
  return (
    <Textarea
      rows={2}
      defaultValue={notes ?? ""}
      key={notes ?? ""}
      disabled={disabled}
      placeholder="Notes for the team lead (optional)"
      aria-label="Notes"
      className="text-sm"
      onBlur={(e) => {
        const v = e.currentTarget.value.trim() || null;
        if (v !== (notes ?? null)) onSave(v);
      }}
    />
  );
}

function Card({ item, open, onToggle, children, badge, select }: { item: FlowItem; open: boolean; onToggle: () => void; children?: React.ReactNode; badge?: React.ReactNode; select?: React.ReactNode }) {
  return (
    <div data-item={item.id} className={cn("rounded-lg border bg-card p-2.5 shadow-xs", open && "ring-1 ring-primary/40")}>
      <div className="flex items-start gap-2">
        {select}
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
            <span className="font-mono">{item.code}</span>
            {item.running && <span className="rounded bg-emerald-500/15 px-1 text-emerald-700 dark:text-emerald-400">timer on</span>}
          </span>
          <span className="mt-0.5 block font-medium">{item.title}</span>
          {item.place && <span className="block truncate text-xs text-muted-foreground">{item.place}</span>}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Progress item={item} />
        {badge}
        <span className="ml-auto">
          <DueTag dueAt={item.dueAt} />
        </span>
      </div>
      {item.notes && !open && <p className="mt-1 line-clamp-2 text-xs text-amber-700 dark:text-amber-400">{item.notes}</p>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team member's board
// ---------------------------------------------------------------------------

const COLUMNS: { key: string; label: string; statuses: string[]; hint: string }[] = [
  { key: "todo", label: "To do", statuses: ["queued", "paused", "blocked"], hint: "Assigned to you" },
  { key: "doing", label: "In progress", statuses: ["in_progress"], hint: "Your timer runs while it is here" },
  { key: "done", label: "Done, not sent", statuses: ["finished"], hint: "Send to the team lead when you are ready" },
  { key: "lead", label: "With team lead", statuses: ["lead_review"], hint: "Waiting for approval" },
];

export function MyBoard({ items, title = "My work" }: { items: FlowItem[]; title?: string }) {
  const { act, busy } = useAct();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState<string | null>(params.get("item"));
  const [sending, setSending] = React.useState(false);
  // Columns show twelve cards at a time; a link to one item opens its whole column.
  const [shown, setShown] = React.useState<Record<string, number>>(() => {
    const it = items.find((i) => i.id === params.get("item"));
    const col = it && COLUMNS.find((c) => c.statuses.includes(it.status));
    return col ? { [col.key]: items.length } : {};
  });
  const done = items.filter((i) => i.status === "finished");
  React.useEffect(() => {
    const id = params.get("item");
    if (id) document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ block: "center" });
  }, [params]);
  const sendAll = async () => {
    setSending(true);
    const r = await bulkAction(done.map((i) => i.id), { action: "submitLead" });
    setSending(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data as { ok: boolean; code: string; error?: string }[];
    const bad = res.filter((x) => !x.ok);
    if (bad.length) toast.warning(`${res.length - bad.length} sent, ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n") });
    else toast.success(`${res.length} sent to the team lead`);
    router.refresh();
  };
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">Tap a card to see and fill in what it needs.</span>
        {done.length > 0 && (
          <Button className="ml-auto" onClick={sendAll} disabled={sending}>
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send {done.length} done to the team lead
          </Button>
        )}
      </div>
      {!items.length ? (
        <EmptyState icon={<InboxIcon className="size-5" />} title="Nothing assigned to you" description="Your team lead assigns work; it appears here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = items.filter((i) => col.statuses.includes(i.status));
            return (
              <div key={col.key} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2">
                <div className="px-1">
                  <p className="text-sm font-semibold" title={tip(`flow.${col.key}`)}>
                    {col.label} <span className="font-normal text-muted-foreground tabular">{list.length}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{col.hint}</p>
                </div>
                {list.slice(0, shown[col.key] ?? 12).map((it) => {
                  const isOpen = open === it.id;
                  const b = (a: string) => busy === `${it.id}:${a}`;
                  return (
                    <Card
                      key={it.id}
                      item={it}
                      open={isOpen}
                      onToggle={() => setOpen(isOpen ? null : it.id)}
                      badge={it.status === "paused" || it.status === "blocked" ? <Badge variant="secondary">{STATUS_LABELS[it.status]}</Badge> : null}
                    >
                      {isOpen && <WorkPanel item={it} canEdit={it.status !== "lead_review"} lead={false} />}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {["queued", "paused"].includes(it.status) && (
                          <Button title={tip("action.start")} size="sm" variant="outline" disabled={b("start")} onClick={() => act(it.id, { action: "start", switchFrom: true }, "Started")}>
                            <PlayIcon /> Start
                          </Button>
                        )}
                        {it.status === "in_progress" && (
                          <Button title={tip("action.pause")} size="sm" variant="outline" disabled={b("pause")} onClick={() => act(it.id, { action: "pause" })}>
                            <PauseIcon /> Pause
                          </Button>
                        )}
                        {["queued", "paused", "in_progress"].includes(it.status) && (
                          <Button title={tip("action.finish")} size="sm" disabled={b("finish")} onClick={async () => (await act(it.id, { action: "finish" }, "Marked done")) || setOpen(it.id)}>
                            <CheckIcon /> Done
                          </Button>
                        )}
                        {it.status === "finished" && (
                          <>
                            <Button title={tip("action.submitLead")} size="sm" disabled={b("submitLead")} onClick={() => act(it.id, { action: "submitLead" }, "Sent to the team lead")}>
                              <SendIcon /> Send
                            </Button>
                            <Button title={tip("action.reopenFinished")} size="sm" variant="ghost" disabled={b("reopenFinished")} onClick={() => act(it.id, { action: "reopenFinished" })}>
                              <RotateCcwIcon /> Reopen
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
                {list.length > (shown[col.key] ?? 12) && (
                  <Button size="sm" variant="ghost" onClick={() => setShown({ ...shown, [col.key]: (shown[col.key] ?? 12) + 12 })}>
                    Show more ({list.length - (shown[col.key] ?? 12)})
                  </Button>
                )}
                {!list.length && <p className="py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Team lead's desk
// ---------------------------------------------------------------------------

function Section({ title, hint, count, actions, children, tipKey }: { title: string; hint: string; count: number; actions?: React.ReactNode; children: React.ReactNode; tipKey?: string }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold" title={tipKey && tip(tipKey)}>
          {title} <span className="font-normal text-muted-foreground tabular">{count}</span>
        </h3>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className="ml-auto flex flex-wrap gap-2">{actions}</span>
      </div>
      {children}
    </section>
  );
}

function usePick(ids: string[]) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setPicked((p) => new Set([...p].filter((x) => ids.includes(x)))), [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  const all = () => setPicked(picked.size === ids.length ? new Set() : new Set(ids));
  return { picked, toggle, all, chosen: picked.size ? [...picked] : ids };
}

// The whole workflow at a glance, from drafts to published, with the lead's own stage highlighted.
function WorkflowGlance({ glance, mine }: { glance: LeadDeskData["glance"]; mine: string }) {
  const cell = "flex min-w-28 flex-1 flex-col rounded-lg border bg-card px-3 py-2";
  return (
    <section aria-label="Workflow at a glance" className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Workflow at a glance</span>
        {glance.overdue > 0 && <span className="text-[var(--st-blocked-fg)]">{glance.overdue} overdue</span>}
        <a href="/overview" className="ml-auto hover:underline">
          Open the Overview
        </a>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className={cell}>
          <span className="text-xs text-muted-foreground">Drafts</span>
          <span className="text-xl font-semibold tabular">{glance.drafts}</span>
        </div>
        {glance.stages.map((g) => (
          <div key={g.stage} className={cn(cell, g.stage === mine && "border-primary")} style={{ borderTop: `3px solid var(--stage-${g.stage})` }}>
            <span className="text-xs text-muted-foreground">{STAGE_LABELS[g.stage as Stage]}</span>
            <span className="text-xl font-semibold tabular">{g.inWork}</span>
            <span className="text-[11px] text-muted-foreground">
              {g.doneWeek} done this week{g.waiting ? ` · ${g.waiting} handed over` : ""}
            </span>
          </div>
        ))}
        <div className={cell}>
          <span className="text-xs text-muted-foreground">Published</span>
          <span className="text-xl font-semibold tabular">{glance.published}</span>
        </div>
      </div>
    </section>
  );
}

export function LeadDesk({ data }: { data: LeadDeskData }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const [open, setOpen] = React.useState<string | null>(null);
  const [returning, setReturning] = React.useState<{ id: string; note: string; reason?: string } | null>(null);
  const [assignTo, setAssignTo] = React.useState("");
  const [working, setWorking] = React.useState(false);
  // Long lists show a page at a time, so Home stays short even with hundreds of items.
  const [shown, setShown] = React.useState<Record<string, number>>({});
  const PAGE = 10;
  const cap = <T,>(k: string, list: T[]) => list.slice(0, shown[k] ?? PAGE);
  const More = ({ k, total }: { k: string; total: number }) =>
    total > (shown[k] ?? PAGE) ? (
      <Button size="sm" variant="ghost" className="w-full" onClick={() => setShown({ ...shown, [k]: (shown[k] ?? PAGE) + PAGE })}>
        Show {Math.min(PAGE, total - (shown[k] ?? PAGE))} more of {total - (shown[k] ?? PAGE)}
      </Button>
    ) : null;
  const review = usePick(data.review.map((i) => i.id));
  const ready = usePick(data.ready.map((i) => i.id));
  const unassigned = usePick(data.unassigned.map((i) => i.id));
  const stageLabel = STAGE_LABELS[data.stage];
  const results = (r: { ok: boolean; error?: string; data?: unknown }, what: string) => {
    if (!r.ok) return toast.error(r.error);
    const res = (r.data as { ok: boolean; code: string; error?: string }[]) ?? [];
    const bad = res.filter((x) => !x.ok);
    if (bad.length) toast.warning(`${res.length - bad.length} ${what}, ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n"), duration: 10000 });
    else toast.success(`${res.length} ${what}`);
    router.refresh();
  };
  const tick = (p: ReturnType<typeof usePick>, id: string) => <Checkbox aria-label="Select" checked={p.picked.has(id)} onCheckedChange={() => p.toggle(id)} className="mt-1" />;
  const reasons = Object.entries(RETURN_REASON_LABELS);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{stageLabel} team lead</h2>
      <WorkflowGlance glance={data.glance} mine={data.stage} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Section
          title="To approve"
          tipKey="flow.review" hint="Sent to you by the team"
          count={data.review.length}
          actions={
            data.review.length > 0 && (
              <Button
                size="sm"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  results(await bulkAction(review.chosen, { action: "leadApprove" }), "approved");
                  setWorking(false);
                }}
              >
                <CheckCircle2Icon /> Approve {review.picked.size ? review.picked.size : "all"}
              </Button>
            )
          }
        >
          {cap("review", data.review).map((it) => (
            <Card key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} select={tick(review, it.id)} badge={<span className="text-xs text-muted-foreground">by {it.ownerName ?? "someone"}</span>}>
              {open === it.id && <WorkPanel item={it} canEdit lead />}
              {returning?.id === it.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea autoFocus rows={2} value={returning.note} onChange={(e) => setReturning({ ...returning, note: e.target.value })} placeholder="What needs to change" aria-label="What needs to change" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setReturning(null)}>
                      Cancel
                    </Button>
                    <Button title={tip("action.leadReturn")} size="sm" disabled={!returning.note.trim()} onClick={async () => (await act(it.id, { action: "leadReturn", note: returning.note }, "Returned to the team member")) && setReturning(null)}>
                      Return
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  <Button title={tip("action.leadApprove")} size="sm" disabled={busy === `${it.id}:leadApprove`} onClick={() => act(it.id, { action: "leadApprove" }, "Approved")}>
                    <CheckIcon /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReturning({ id: it.id, note: "" })}>
                    <RotateCcwIcon /> Return
                  </Button>
                </div>
              )}
            </Card>
          ))}
          <More k="review" total={data.review.length} />
          {!data.review.length && <p className="text-xs text-muted-foreground">Nothing waiting for approval.</p>}
        </Section>

        {data.next && (
          <Section
            title="Ready for handover"
            tipKey="flow.ready" hint={`Approved; hand over to the ${STAGE_LABELS[data.next]} team lead`}
            count={data.ready.length}
            actions={
              data.ready.length > 0 && (
                <Button
                  size="sm"
                  disabled={working}
                  onClick={async () => {
                    setWorking(true);
                    const r = await createHandoverAction({ itemIds: ready.chosen });
                    setWorking(false);
                    if (!r.ok) return toast.error(r.error);
                    const d = r.data as { code: string | null; results: { ok: boolean; code: string; error?: string }[] };
                    const bad = d.results.filter((x) => !x.ok);
                    if (bad.length) toast.warning(`${d.results.length - bad.length} handed over, ${bad.length} not`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n") });
                    else toast.success(`Handed over as ${d.code} to the ${STAGE_LABELS[data.next!]} team lead`);
                    router.refresh();
                  }}
                >
                  <SendIcon /> Hand over {ready.picked.size ? ready.picked.size : "all"} to {STAGE_LABELS[data.next]}
                </Button>
              )
            }
          >
            {cap("ready", data.ready).map((it) => (
              <Card key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} select={tick(ready, it.id)} badge={<span className="text-xs text-muted-foreground">by {it.ownerName ?? "someone"}</span>}>
                {open === it.id && <WorkPanel item={it} canEdit lead />}
              </Card>
            ))}
            <More k="ready" total={data.ready.length} />
            {!data.ready.length && <p className="text-xs text-muted-foreground">Nothing approved and waiting.</p>}
          </Section>
        )}

        {data.prev && (
          <Section title={`Arriving from ${STAGE_LABELS[data.prev]}`} tipKey="flow.incoming" hint="Handed over to your team; accept it, then assign it" count={data.incoming.length}>
            {cap("incoming", data.incoming).map((it) => (
              <Card key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} badge={it.batch ? <Badge variant="secondary">{it.batch.code}</Badge> : null}>
                {open === it.id && <WorkPanel item={it} canEdit={false} lead />}
                {returning?.id === it.id ? (
                  <div className="mt-2 space-y-2">
                    <Select value={returning.reason ?? reasons[0]![0]} onValueChange={(v) => setReturning({ ...returning, reason: v })}>
                      <SelectTrigger size="sm" className="w-full" aria-label="Reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reasons.map(([k, l]) => (
                          <SelectItem key={k} value={k}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea rows={2} value={returning.note} onChange={(e) => setReturning({ ...returning, note: e.target.value })} placeholder="What is wrong" aria-label="What is wrong" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setReturning(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!returning.note.trim()}
                        onClick={async () => {
                          const ok = it.batch
                            ? await decideHandoverAction(it.batch.handover_id, { itemIds: [it.id], decision: "missing", note: returning.note }).then((r) => (r.ok ? (router.refresh(), true) : (toast.error(r.error), false)))
                            : await act(it.id, { action: "return", reasonCategory: returning.reason ?? reasons[0]![0], note: returning.note }, "Returned");
                          if (ok) setReturning(null);
                        }}
                      >
                        Return to {STAGE_LABELS[data.prev!]}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (it.batch) {
                          const r = await decideHandoverAction(it.batch.handover_id, { itemIds: [it.id], decision: "accepted" });
                          if (!r.ok) return toast.error(r.error);
                          toast.success("Accepted");
                          return router.refresh();
                        }
                        await act(it.id, { action: "accept" }, "Accepted");
                      }}
                    >
                      <CheckIcon /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReturning({ id: it.id, note: "" })}>
                      <RotateCcwIcon /> Return
                    </Button>
                  </div>
                )}
              </Card>
            ))}
            <More k="incoming" total={data.incoming.length} />
            {!data.incoming.length && <p className="text-xs text-muted-foreground">Nothing arriving.</p>}
          </Section>
        )}

        <Section
          title="To assign"
          tipKey="flow.assign" hint={`${stageLabel} work nobody has yet`}
          count={data.unassigned.length}
          actions={
            data.unassigned.length > 0 && (
              <>
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Assign to">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.todo + p.active} open)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => data.unassigned.filter((i) => !unassigned.picked.has(i.id)).slice(0, 5).forEach((i) => unassigned.toggle(i.id))} title="Tick the next five in the list">
                  Tick next 5
                </Button>
                <Button
                  size="sm"
                  disabled={!assignTo || working || !unassigned.picked.size}
                  title={unassigned.picked.size ? undefined : "Tick the cards to assign first"}
                  onClick={async () => {
                    setWorking(true);
                    results(await bulkAction([...unassigned.picked], { action: "assign", stage: data.stage as Stage, userId: assignTo }), "assigned");
                    setWorking(false);
                  }}
                >
                  <UserPlusIcon /> Assign {unassigned.picked.size || ""}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="/assign">Many at once</a>
                </Button>
              </>
            )
          }
        >
          {cap("unassigned", data.unassigned).map((it) => (
            <Card key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} select={tick(unassigned, it.id)} />
          ))}
          <More k="unassigned" total={data.unassigned.length} />
          {!data.unassigned.length && <p className="text-xs text-muted-foreground">Everything is assigned.</p>}
        </Section>
      </div>

      <Section title="Your team now" hint="Open work per person" count={data.people.length}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.people.map((p) => (
            <li key={p.id} className="rounded-lg border p-2 text-sm">
              <p className="font-medium">{p.name}</p>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>
                  <CircleIcon className="inline size-2.5" /> {p.todo} to do
                </span>
                <span>{p.active} in progress</span>
                <span>{p.done} done, not sent</span>
                <span>{p.review} with you</span>
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
