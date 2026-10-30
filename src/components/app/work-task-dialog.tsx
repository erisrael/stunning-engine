"use client";

// The task dialog of the work departments: details and custom fields, checklist and subtasks, dependencies, files,
// time, comments and history; plus the reviewer's Approve and Send back, a lead's decision on a request, watching,
// templates for new tasks and the timer.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addTaskCommentAction,
  addTaskFileAction,
  addTimeEntryAction,
  bulkTasksAction,
  decideRequestAction,
  deleteTaskFileAction,
  deleteTimeEntryAction,
  reviewTaskAction,
  saveTaskAction,
  setWatchingAction,
  startTimerAction,
  stopTimerAction,
  taskCommentsAction,
  taskDetailsAction,
} from "@/app/actions/departments";
import type { Project, Task } from "@/server/work";
import type { Sprint, TaskDetails } from "@/server/work-extras";
import { POSITION_LABELS } from "@/lib/domain";
import type { WorkDept } from "@/lib/work";
import { fieldRequired, fieldShown, statusOf, type DeptConfig, type DeptField, type FieldValue, type TaskCheck } from "@/lib/dept-config";
import { cn } from "@/lib/utils";
import { Tone, today, usable, type Access, type Person } from "./work-shared";

const RECUR = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every three months" },
];
const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const sizeLabel = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function TaskDialog({
  dept,
  config: cfg,
  task,
  preset,
  people,
  projects,
  tasks,
  sprints,
  access,
  viewerId,
  onClose,
}: {
  dept: WorkDept;
  config: DeptConfig;
  task: Task | null;
  preset: { status?: string; dueDate?: string; parentId?: string };
  people: Person[];
  projects: Project[];
  tasks: Task[];
  sprints: Sprint[];
  access: Access;
  viewerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const f$ = cfg.features;
  const canEdit = !access.readOnly && (!task || access.rights.editAll || [task.assignee_id, task.reporter_id, task.reviewer_id].includes(viewerId));
  const firstStatus = (cfg.statuses.find((s) => s.active && s.category === "open") ?? cfg.statuses.find((s) => s.active))!.key;
  const [f, setF] = React.useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? cfg.types.find((t) => t.active)!.key,
    status: task?.status ?? preset.status ?? firstStatus,
    priority: task?.priority ?? (cfg.priorities.find((p) => p.key === "normal" && p.active) ?? cfg.priorities.find((p) => p.active))!.key,
    projectId: task?.project_id ?? "",
    milestoneId: task?.milestone_id ?? "",
    assigneeId: task?.assignee_id ?? (access.rights.assign ? "" : viewerId),
    reviewerId: task?.reviewer_id ?? "",
    parentId: task?.parent_id ?? preset.parentId ?? "",
    sprintId: task?.sprint_id ?? "",
    recur: task?.recur ?? "",
    estimate: task?.estimate_hours != null ? String(task.estimate_hours) : "",
    spent: task?.spent_hours != null ? String(task.spent_hours) : "",
    progress: task?.progress ?? 0,
    startDate: task?.start_date ?? "",
    dueDate: task?.due_date ?? preset.dueDate ?? "",
    labels: task?.labels.join(", ") ?? "",
    blockedBy: task?.blocked_by ?? [],
    template: "",
    subtasks: "",
  });
  const [values, setValues] = React.useState<Record<string, FieldValue>>(task?.fields ?? {});
  const [checklist, setChecklist] = React.useState<TaskCheck[]>(task?.checklist ?? []);
  const [busy, setBusy] = React.useState(false);
  const [details, setDetails] = React.useState<TaskDetails | null>(null);
  const [comments, setComments] = React.useState<{ id: string; author_name: string; body: string; created_at: string }[] | null>(null);
  const [comment, setComment] = React.useState("");
  const [decision, setDecision] = React.useState<{ kind: "send_back" | "decline"; note: string } | null>(null);
  const category = statusOf(cfg, f.status)?.category ?? "open";
  const fields = cfg.fields.filter((x) => fieldShown(x, f.type));
  const project = projects.find((p) => p.id === f.projectId);
  const canVerify = access.rights.editAll || task?.reviewer_id === viewerId;
  const reload = React.useCallback(async () => {
    if (!task) return;
    const [d, c] = await Promise.all([taskDetailsAction(dept, task.id), taskCommentsAction(dept, task.id)]);
    if (d.ok) setDetails(d.data as TaskDetails);
    if (c.ok) setComments(c.data as typeof comments);
  }, [dept, task]);
  React.useEffect(() => void reload(), [reload]);

  // A template fills the empty parts of a new task.
  const applyTemplate = (key: string) => {
    const t = cfg.templates.find((x) => x.key === key);
    setF((x) => ({
      ...x,
      template: key,
      ...(t ? { title: x.title || t.title, description: x.description || t.description, type: t.type, priority: t.priority, estimate: x.estimate || (t.estimate ? String(t.estimate) : ""), subtasks: t.subtasks.join("\n") } : {}),
    }));
    if (t) setChecklist(t.checklist.map((l, i) => ({ id: `chk_new${i}`, text: l.text, verify: l.verify, done: false, doneBy: null, verifiedBy: null })));
  };

  const save = async () => {
    setBusy(true);
    const r = await saveTaskAction(dept, {
      id: task?.id,
      title: f.title,
      description: f.description,
      type: f.type,
      status: f.status,
      priority: f.priority,
      projectId: f.projectId || null,
      milestoneId: f.milestoneId || null,
      assigneeId: f.assigneeId || null,
      reviewerId: f$.review ? f.reviewerId || null : undefined,
      parentId: f$.subtasks ? f.parentId || null : undefined,
      sprintId: f$.sprints ? f.sprintId || null : undefined,
      recur: f$.recurring ? f.recur || null : undefined,
      estimateHours: f.estimate ? Number(f.estimate) : null,
      spentHours: f.spent ? Number(f.spent) : null,
      progress: Number(f.progress),
      startDate: f.startDate || null,
      dueDate: f.dueDate || null,
      labels: f.labels.split(","),
      fields: values,
      checklist: f$.checklists && (task || checklist.length) ? checklist : undefined,
      blockedBy: f$.dependencies ? f.blockedBy : undefined,
      templateKey: !task && f.template ? f.template : undefined,
      subtasks: !task && f$.subtasks ? f.subtasks.split("\n").map((x) => x.trim()).filter(Boolean) : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(task ? "Saved" : `${cfg.names.task} created`);
    onClose();
    router.refresh();
  };

  const sel = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[], placeholder?: string, label?: string) => (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={!canEdit}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {placeholder && <SelectItem value="none">{placeholder}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const personOpts = people.map((p) => ({ value: p.id, label: `${p.name}${p.position !== "member" ? ` (${POSITION_LABELS[p.position].toLowerCase()})` : ""}` }));
  const others = tasks.filter((t) => t.id !== task?.id);
  const blockerOptions = others.filter((t) => !f.blockedBy.includes(t.id));
  const codeOf = (id: string) => details?.blockers.find((b) => b.id === id)?.code ?? tasks.find((t) => t.id === id)?.code ?? "…";
  const inReview = task?.status_category === "review";
  const canReview = !!task && inReview && (task.reviewer_id === viewerId || access.rights.editAll) && !access.readOnly;
  const pendingRequest = task?.request_state === "pending";
  const canDecide = pendingRequest && access.rights.assign && !access.readOnly;

  const decide = async (kind: "approve" | "send_back" | "accept" | "decline", note?: string) => {
    if (!task) return;
    setBusy(true);
    const r = kind === "approve" || kind === "send_back" ? await reviewTaskAction(dept, task.id, kind, note) : await decideRequestAction(dept, task.id, kind, { note, assigneeId: f.assigneeId || null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success({ approve: "Approved", send_back: "Sent back", accept: "Request accepted", decline: "Request declined" }[kind]);
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            {task && <span className="font-mono text-sm text-muted-foreground">{task.code}</span>}
            {task ? (canEdit ? `Edit ${cfg.names.task.toLowerCase()}` : task.title) : `New ${cfg.names.task.toLowerCase()}`}
            {task && <Tone config={cfg} status={task.status} />}
            {pendingRequest && <Badge variant="secondary">Request from {task?.requested_by_name ?? "someone"}</Badge>}
            {task?.parent_code && <Badge variant="outline">Subtask of {task.parent_code}</Badge>}
          </DialogTitle>
          {task && (
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span>
                Created by {task.reporter_name ?? "someone"} on {task.created_at.slice(0, 10)}
                {task.completed_at && `, done ${task.completed_at.slice(0, 10)}`}
              </span>
              {details && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    const r = await setWatchingAction(dept, task.id, !details.watching);
                    if (!r.ok) return toast.error(r.error);
                    await reload();
                  }}
                >
                  {details.watching ? <EyeOffIcon /> : <EyeIcon />} {details.watching ? "Stop watching" : "Watch"}
                  {details.watchers.length > 0 && <span className="text-muted-foreground">({details.watchers.length})</span>}
                </Button>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {(canReview || canDecide) && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">{canReview ? `${task!.code} is waiting for ${task!.reviewer_id === viewerId ? "your" : "the"} review.` : "This request is waiting for a decision."}</p>
            {decision ? (
              <div className="space-y-2">
                <Textarea rows={2} autoFocus value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} placeholder={decision.kind === "send_back" ? "What needs changing" : "Why it is declined"} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDecision(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy || !decision.note.trim()} onClick={() => decide(decision.kind, decision.note)}>
                    {decision.kind === "send_back" ? "Send back" : "Decline"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {canReview ? (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => decide("approve")}>
                      <CheckIcon /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setDecision({ kind: "send_back", note: "" })}>
                      <RotateCcwIcon /> Send back
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => decide("accept")}>
                      <CheckIcon /> Accept{f.assigneeId ? " and assign" : ""}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setDecision({ kind: "decline", note: "" })}>
                      <XIcon /> Decline
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="details" className="gap-3">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="details">Details</TabsTrigger>
            {(f$.checklists || f$.subtasks || f$.dependencies) && <TabsTrigger value="work">Checklist{f$.subtasks ? " and subtasks" : ""}</TabsTrigger>}
            {task && f$.attachments && <TabsTrigger value="files">Files{task.files ? ` (${task.files})` : ""}</TabsTrigger>}
            {task && f$.timeTracking && <TabsTrigger value="time">Time</TabsTrigger>}
            {task && <TabsTrigger value="activity">Comments and history{task.comments ? ` (${task.comments})` : ""}</TabsTrigger>}
          </TabsList>

          <TabsContent value="details" className="space-y-3">
            {!task && cfg.templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Start from a template</Label>
                {sel(f.template, applyTemplate, cfg.templates.map((t) => ({ value: t.key, label: t.label })), "No template", "Template")}
              </div>
            )}
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What needs doing" disabled={!canEdit} aria-label="Title" />
            <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Details, links, acceptance criteria" disabled={!canEdit} aria-label="Description" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Type">{sel(f.type, (v) => setF({ ...f, type: v }), usable(cfg.types, task?.type).map((t) => ({ value: t.key, label: t.label })), undefined, "Type")}</Field>
              <Field label="Status">
                {sel(f.status, (v) => setF({ ...f, status: v, progress: statusOf(cfg, v)?.category === "done" ? 100 : f.progress }), usable(cfg.statuses, task?.status).map((s) => ({ value: s.key, label: s.label })), undefined, "Status")}
              </Field>
              <Field label="Priority">{sel(f.priority, (v) => setF({ ...f, priority: v }), usable(cfg.priorities, task?.priority).map((p) => ({ value: p.key, label: p.label })), undefined, "Priority")}</Field>
              <Field label={cfg.names.project}>{sel(f.projectId, (v) => setF({ ...f, projectId: v, milestoneId: "" }), projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` })), "None", cfg.names.project)}</Field>
              {f$.milestones && <Field label={cfg.names.milestone}>{sel(f.milestoneId, (v) => setF({ ...f, milestoneId: v }), (project?.milestones ?? []).map((m) => ({ value: m.id, label: m.name })), "None", cfg.names.milestone)}</Field>}
              <Field label="Assignee">
                {access.rights.assign
                  ? sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), personOpts, "Unassigned", "Assignee")
                  : sel(f.assigneeId, (v) => setF({ ...f, assigneeId: v }), [{ value: viewerId, label: "Me" }, ...(task?.assignee_id && task.assignee_id !== viewerId ? [{ value: task.assignee_id, label: task.assignee_name ?? "Someone" }] : [])], "Unassigned", "Assignee")}
              </Field>
              {f$.review && <Field label="Reviewer">{sel(f.reviewerId, (v) => setF({ ...f, reviewerId: v }), personOpts.filter((p) => p.value !== f.assigneeId), "No reviewer", "Reviewer")}</Field>}
              {f$.subtasks && !(task && task.subtasks_total > 0) && (
                <Field label="Subtask of">{sel(f.parentId, (v) => setF({ ...f, parentId: v }), others.filter((t) => !t.parent_id).map((t) => ({ value: t.id, label: `${t.code} ${t.title}` })), "Not a subtask", "Subtask of")}</Field>
              )}
              {f$.sprints && <Field label="Sprint">{sel(f.sprintId, (v) => setF({ ...f, sprintId: v }), sprints.filter((s) => s.status !== "closed" || s.id === f.sprintId).map((s) => ({ value: s.id, label: `${s.name}${s.status === "active" ? " (current)" : ""}` })), "No sprint", "Sprint")}</Field>}
              {f$.recurring && <Field label="Repeat">{sel(f.recur, (v) => setF({ ...f, recur: v }), RECUR, "Does not repeat", "Repeat")}</Field>}
              {f$.startDate && (
                <Field label="Start">
                  <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} disabled={!canEdit} aria-label="Start" />
                </Field>
              )}
              <Field label="Due">
                <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} disabled={!canEdit} aria-label="Due" />
              </Field>
              {f$.labels && (
                <Field label="Labels">
                  <Input value={f.labels} onChange={(e) => setF({ ...f, labels: e.target.value })} placeholder={cfg.labels.slice(0, 3).join(", ") || "mobile, api"} disabled={!canEdit} list={`labels-${dept}`} aria-label="Labels" />
                  {cfg.labels.length > 0 && (
                    <datalist id={`labels-${dept}`}>
                      {cfg.labels.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  )}
                </Field>
              )}
              {f$.estimates && (
                <Field label="Estimate (hours)">
                  <Input type="number" min={0} step="0.5" value={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.value })} disabled={!canEdit} aria-label="Estimate (hours)" />
                </Field>
              )}
              {f$.timeSpent && (
                <Field label="Spent (hours)" hint={f$.timeTracking && details?.time.length ? "From the time entries" : undefined}>
                  <Input type="number" min={0} step="0.5" value={f.spent} onChange={(e) => setF({ ...f, spent: e.target.value })} disabled={!canEdit || (f$.timeTracking && !!details?.time.length)} aria-label="Spent (hours)" />
                </Field>
              )}
              {f$.progress && (
                <Field label={`Progress: ${f.progress}%`}>
                  <input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} disabled={!canEdit} className="w-full accent-[var(--primary)]" aria-label="Progress" />
                </Field>
              )}
            </div>
            {fields.length > 0 && (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                {fields.map((fd) => (
                  <FieldInput
                    key={fd.key}
                    field={fd}
                    value={values[fd.key] ?? null}
                    people={people}
                    required={fieldRequired(fd, category)}
                    disabled={!canEdit || (fd.leadsOnly && !access.rights.editAll)}
                    onChange={(v) => setValues((x) => ({ ...x, [fd.key]: v }))}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="work" className="space-y-4">
            {f$.checklists && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Checklist</h3>
                <p className="text-xs text-muted-foreground">Every line must be ticked, and lines marked with a shield verified by a lead or the reviewer, before the {cfg.names.task.toLowerCase()} is done.</p>
                <ul className="space-y-1">
                  {checklist.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        aria-label={`Done: ${c.text}`}
                        checked={c.done}
                        disabled={!canEdit}
                        onCheckedChange={(v) => setChecklist(checklist.map((x, j) => (j === i ? { ...x, done: v === true, verifiedBy: v === true ? x.verifiedBy : null } : x)))}
                      />
                      <span className={cn("flex-1", c.done && "text-muted-foreground line-through")}>{c.text}</span>
                      {c.verify && (
                        <Button
                          size="xs"
                          variant={c.verifiedBy ? "secondary" : "outline"}
                          disabled={!canVerify || !c.done}
                          title={c.verifiedBy ? "Verified" : "Needs verifying by a lead or the reviewer"}
                          onClick={() => setChecklist(checklist.map((x, j) => (j === i ? { ...x, verifiedBy: x.verifiedBy ? null : viewerId } : x)))}
                        >
                          <ShieldCheckIcon /> {c.verifiedBy ? "Verified" : "Verify"}
                        </Button>
                      )}
                      {canEdit && (!c.verify || canVerify) && (
                        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${c.text}`} onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}>
                          <XIcon />
                        </Button>
                      )}
                    </li>
                  ))}
                  {!checklist.length && <li className="text-xs text-muted-foreground">No checklist lines.</li>}
                </ul>
                {canEdit && <AddLine placeholder="Add a checklist line" canVerify={canVerify} onAdd={(text, verify) => setChecklist([...checklist, { id: `chk_new${Date.now()}`, text, verify, done: false, doneBy: null, verifiedBy: null }])} />}
              </section>
            )}
            {f$.subtasks && !task && !f.parentId && (
              <section className="space-y-1.5">
                <Label htmlFor="new-subtasks">Subtasks (one per line)</Label>
                <Textarea id="new-subtasks" rows={3} value={f.subtasks} onChange={(e) => setF({ ...f, subtasks: e.target.value })} placeholder={"Design\nBuild\nTest"} />
              </section>
            )}
            {f$.subtasks && task && !task.parent_id && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Subtasks</h3>
                <ul className="divide-y rounded-lg border">
                  {details?.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <span className="font-mono text-[11px] text-muted-foreground">{s.code}</span>
                      <span className={cn("flex-1", s.status_category === "done" && "text-muted-foreground line-through")}>{s.title}</span>
                      <span className="text-xs text-muted-foreground">{s.assignee_name ?? ""}</span>
                      <Tone config={cfg} status={s.status} />
                    </li>
                  ))}
                  {details && !details.subtasks.length && <li className="px-2 py-1.5 text-xs text-muted-foreground">No subtasks yet.</li>}
                </ul>
                {canEdit && (
                  <AddLine
                    placeholder="Add a subtask"
                    onAdd={async (title) => {
                      const r = await saveTaskAction(dept, { title, parentId: task.id, type: task.type, projectId: task.project_id, milestoneId: task.milestone_id, assigneeId: access.rights.assign ? task.assignee_id : viewerId });
                      if (!r.ok) return void toast.error(r.error);
                      await reload();
                      router.refresh();
                    }}
                  />
                )}
              </section>
            )}
            {f$.dependencies && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Blocked by</h3>
                <p className="text-xs text-muted-foreground">This {cfg.names.task.toLowerCase()} cannot start until these are done.</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.blockedBy.map((id) => {
                    const b = details?.blockers.find((x) => x.id === id);
                    return (
                      <Badge key={id} variant={b && b.status_category !== "done" ? "destructive" : "secondary"} className="gap-1">
                        {codeOf(id)} {b && b.status_category === "done" && "✓"}
                        {canEdit && (
                          <button type="button" aria-label={`Remove ${codeOf(id)}`} onClick={() => setF({ ...f, blockedBy: f.blockedBy.filter((x) => x !== id) })}>
                            <XIcon className="size-3" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                  {!f.blockedBy.length && <span className="text-xs text-muted-foreground">Nothing.</span>}
                </div>
                {canEdit && blockerOptions.length > 0 && (
                  <Select value="" onValueChange={(v) => setF({ ...f, blockedBy: [...f.blockedBy, v] })}>
                    <SelectTrigger size="sm" className="h-8 w-72 text-xs" aria-label="Add a blocking task">
                      <SelectValue placeholder="Add a blocking task…" />
                    </SelectTrigger>
                    <SelectContent>
                      {blockerOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.code} {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {details && details.blocking.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Waiting on this: {details.blocking.map((b) => b.code).join(", ")}
                  </p>
                )}
              </section>
            )}
          </TabsContent>

          {task && (
            <TabsContent value="files" className="space-y-2">
              <ul className="divide-y rounded-lg border">
                {details?.files.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <FileIcon className="size-4 text-muted-foreground" />
                    <a href={`/api/dept-files/${x.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {x.name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {sizeLabel(x.size)} · {x.uploaded_by_name ?? ""}
                    </span>
                    {canEdit && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${x.name}`}
                        onClick={async () => {
                          if (!window.confirm(`Remove ${x.name}?`)) return;
                          const r = await deleteTaskFileAction(dept, x.id);
                          if (!r.ok) return toast.error(r.error);
                          await reload();
                          router.refresh();
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                ))}
                {details && !details.files.length && <li className="px-2 py-2 text-xs text-muted-foreground">No files yet.</li>}
              </ul>
              {canEdit && (
                <FileUpload
                  onFile={async (file) => {
                    if (file.size > 8 * 1024 * 1024) return void toast.error("Files are limited to 8 MB.");
                    const base64 = await new Promise<string>((res, rej) => {
                      const fr = new FileReader();
                      fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
                      fr.onerror = () => rej(fr.error);
                      fr.readAsDataURL(file);
                    });
                    const r = await addTaskFileAction(dept, task.id, { name: file.name, mime: file.type || "application/octet-stream", base64 });
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`${file.name} attached`);
                    await reload();
                    router.refresh();
                  }}
                />
              )}
            </TabsContent>
          )}

          {task && (
            <TabsContent value="time" className="space-y-3">
              <TimePanel dept={dept} taskId={task.id} details={details} canEdit={canEdit} viewerId={viewerId} editAll={access.rights.editAll} onChanged={async () => (await reload(), router.refresh())} />
            </TabsContent>
          )}

          {task && (
            <TabsContent value="activity" className="space-y-3">
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {comments?.map((c) => (
                  <div key={c.id} className="rounded-lg bg-muted/50 p-2 text-sm">
                    <p className="text-xs font-medium">
                      {c.author_name} <span className="font-normal text-muted-foreground">{c.created_at.slice(0, 16).replace("T", " ")}</span>
                    </p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
                {comments && !comments.length && <p className="text-xs text-muted-foreground">No comments yet.</p>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment; @handle mentions someone" aria-label="Comment" />
                  <Button
                    variant="outline"
                    disabled={!comment.trim()}
                    onClick={async () => {
                      const r = await addTaskCommentAction(dept, task.id, comment);
                      if (!r.ok) return toast.error(r.error);
                      setComment("");
                      await reload();
                    }}
                  >
                    Post
                  </Button>
                </div>
              )}
              <div className="space-y-1 border-t pt-2">
                <h3 className="text-sm font-semibold">History</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {details?.history.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{h.occurred_at.slice(0, 16).replace("T", " ")}</span>
                      <span>{h.summary}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="sm:justify-between">
          {task && canEdit && (access.rights.deleteAll || task.reporter_id === viewerId) ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm(`Delete ${task.code}?`)) return;
                const r = await bulkTasksAction(dept, [task.id], { delete: true });
                if (!r.ok) return toast.error(r.error);
                onClose();
                router.refresh();
              }}
            >
              <Trash2Icon /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button disabled={busy || !f.title.trim()} onClick={save}>
                {busy && <Loader2Icon className="animate-spin" />} {task ? "Save" : "Create"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AddLine({ placeholder, onAdd, canVerify }: { placeholder: string; onAdd: (text: string, verify: boolean) => void | Promise<void>; canVerify?: boolean }) {
  const [v, setV] = React.useState("");
  const [verify, setVerify] = React.useState(false);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.trim()) return;
        await onAdd(v.trim(), verify);
        setV("");
        setVerify(false);
      }}
    >
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-8 flex-1" />
      {canVerify && (
        <label className="flex items-center gap-1 text-xs">
          <Checkbox checked={verify} onCheckedChange={(x) => setVerify(x === true)} /> Needs verifying
        </label>
      )}
      <Button size="sm" variant="outline" type="submit" disabled={!v.trim()}>
        <PlusIcon /> Add
      </Button>
    </form>
  );
}

function FileUpload({ onFile }: { onFile: (f: File) => Promise<void> }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        aria-label="Attach a file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          await onFile(file);
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Attach a file (up to 8 MB)
      </Button>
    </>
  );
}

function TimePanel({ dept, taskId, details, canEdit, viewerId, editAll, onChanged }: { dept: WorkDept; taskId: string; details: TaskDetails | null; canEdit: boolean; viewerId: string; editAll: boolean; onChanged: () => Promise<void> }) {
  const [entry, setEntry] = React.useState({ date: today(), hours: "", note: "" });
  const [now, setNow] = React.useState(Date.now());
  const running = details?.time.find((t) => t.id === details.running);
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const total = details?.time.filter((t) => t.ended_at).reduce((s, t) => s + t.minutes, 0) ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {canEdit &&
          (running ? (
            <Button
              variant="destructive"
              onClick={async () => {
                const r = await stopTimerAction();
                if (!r.ok) return toast.error(r.error);
                await onChanged();
              }}
            >
              <PauseIcon /> Stop timer ({fmtMin(Math.floor((now - Date.parse(running.started_at)) / 60000))})
            </Button>
          ) : (
            <Button
              onClick={async () => {
                const r = await startTimerAction(dept, taskId);
                if (!r.ok) return toast.error(r.error);
                toast.success("Timer started. Starting another timer stops this one.");
                await onChanged();
              }}
            >
              <PlayIcon /> Start timer
            </Button>
          ))}
        <span className="text-sm text-muted-foreground">Logged: {fmtMin(total)}</span>
      </div>
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await addTimeEntryAction(dept, taskId, { date: entry.date, hours: Number(entry.hours), note: entry.note });
            if (!r.ok) return toast.error(r.error);
            setEntry({ ...entry, hours: "", note: "" });
            await onChanged();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="te-date" className="text-xs">
              Day
            </Label>
            <Input id="te-date" type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} className="h-8 w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-hours" className="text-xs">
              Hours
            </Label>
            <Input id="te-hours" type="number" min={0.1} step="0.25" value={entry.hours} onChange={(e) => setEntry({ ...entry, hours: e.target.value })} className="h-8 w-24" />
          </div>
          <Input aria-label="Note" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="Note (optional)" className="h-8 flex-1" />
          <Button size="sm" variant="outline" type="submit" disabled={!entry.hours}>
            <PlusIcon /> Add time
          </Button>
        </form>
      )}
      <ul className="divide-y rounded-lg border text-sm">
        {details?.time.map((t) => (
          <li key={t.id} className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-24 text-xs text-muted-foreground">{t.started_at.slice(0, 10)}</span>
            <span className="flex-1">
              {t.user_name}
              {t.note && <span className="text-muted-foreground"> · {t.note}</span>}
            </span>
            <span className="tabular">{t.ended_at ? fmtMin(t.minutes) : "running"}</span>
            {(t.user_id === viewerId || editAll) && t.ended_at && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Remove time entry"
                onClick={async () => {
                  const r = await deleteTimeEntryAction(dept, t.id);
                  if (!r.ok) return toast.error(r.error);
                  await onChanged();
                }}
              >
                <XIcon />
              </Button>
            )}
          </li>
        ))}
        {details && !details.time.length && <li className="px-2 py-2 text-xs text-muted-foreground">No time logged yet.</li>}
      </ul>
    </>
  );
}

// One custom field in the task dialog, drawn by its type.
export function FieldInput({
  field: f,
  value,
  people,
  required,
  disabled,
  onChange,
}: {
  field: DeptField;
  value: FieldValue;
  people: Person[];
  required: boolean;
  disabled: boolean;
  onChange: (v: FieldValue) => void;
}) {
  const id = `fld-${f.key}`;
  const wide = f.type === "longtext" || f.type === "multiselect";
  let input: React.ReactNode;
  switch (f.type) {
    case "longtext":
      input = <Textarea id={id} rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
      break;
    case "number":
    case "money":
      input = <Input id={id} type="number" step="any" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} disabled={disabled} />;
      break;
    case "date":
      input = <Input id={id} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />;
      break;
    case "url":
      input = <Input id={id} type="url" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="https://" disabled={disabled} />;
      break;
    case "checkbox":
      input = (
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} /> Yes
        </label>
      );
      break;
    case "rating":
      input = (
        <div className="flex h-9 items-center gap-1" role="radiogroup" aria-label={f.label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of 5`}
              disabled={disabled}
              onClick={() => onChange(value === n ? null : n)}
              className={cn("text-lg leading-none", Number(value) >= n ? "text-amber-500" : "text-muted-foreground/40")}
            >
              ★
            </button>
          ))}
        </div>
      );
      break;
    case "select":
    case "person": {
      const options = f.type === "person" ? people.map((p) => ({ value: p.id, label: p.name })) : f.options.map((o) => ({ value: o, label: o }));
      input = (
        <Select value={value ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : v)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    }
    case "multiselect": {
      const picked = Array.isArray(value) ? value : [];
      input = (
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => {
            const on = picked.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    default:
      input = <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {f.label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {input}
      {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
    </div>
  );
}
