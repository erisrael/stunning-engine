"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, DownloadIcon, PencilIcon, PlusIcon, ShieldAlertIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/app/status-pill";
import { EmptyState } from "@/components/app/primitives";
import {
  addOneOnOneAction,
  assignCourseAction,
  completeTrainingAction,
  courseTrainingsAction,
  openCaseAction,
  saveCourseAction,
  saveGoalAction,
  startCycleAction,
  submitReviewAction,
  updateCaseAction,
} from "@/app/actions/hr-growth";
import type { Course, Evidence, HrCase } from "@/server/hr-growth";
import {
  CASE_KINDS,
  CASE_KIND_LABELS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  GOAL_STATUS_LABELS,
  RATING_LABELS,
  REVIEW_STATUS_LABELS,
  type GoalStatus,
  type ReviewStatus,
} from "@/lib/hr-growth";
import { EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "./hr-home";
import { DueBadge, Field, fmtDay } from "./hr-shared";

type Opt = { value: string; label: string };
type Result = { ok: boolean; error?: string; data?: unknown };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const go = async (fn: () => Promise<Result>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (done) toast.success(done);
    router.refresh();
    return r;
  };
  return { busy, go };
}

const ratingOptions = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}: ${RATING_LABELS[n]}` }));

// ---------------------------------------------------------------------------
// On a person's record: goals, one-to-ones, reviews, training
// ---------------------------------------------------------------------------

export type Growth = {
  relation: "hr" | "self" | "manager";
  goals: { id: string; title: string; detail: string | null; dueDate: string | null; progress: number; status: GoalStatus }[];
  meetings: { id: string; heldOn: string; managerName: string; notes: string | null; actions: string | null }[];
  reviews: {
    id: string;
    cycle: string;
    period: string;
    status: ReviewStatus;
    selfRating: number | null;
    selfNotes: string | null;
    leadRating: number | null;
    leadNotes: string | null;
    evidence: Evidence;
    canSelf: boolean;
    canLead: boolean;
    selfDue: string | null;
    leadDue: string | null;
  }[];
  trainings: { id: string; title: string; status: string; dueDate: string | null; completedOn: string | null; expiresOn: string | null; mandatory: boolean }[];
};

function EvidenceLine({ e }: { e: Evidence }) {
  const parts = [
    ...(e.stageWork ?? []).map((s) => `${s.stage}: ${s.count} done`),
    e.workHours ? `${e.workHours} h on production work` : null,
    e.deptTasksDone ? `${e.deptTasksDone} department tasks done` : null,
    e.deptHours ? `${e.deptHours} h logged on tasks` : null,
    `${e.goalsDone ?? 0} goals done, ${e.goalsOpen ?? 0} open`,
    e.leaveDays ? `${e.leaveDays} days of leave` : null,
    e.absentDays !== undefined ? `${e.absentDays} ${e.absentDays === 1 ? "day" : "days"} absent` : null,
    e.lateDays ? `late ${e.lateDays} ${e.lateDays === 1 ? "time" : "times"} (${e.lateMin ?? 0} min)` : null,
  ].filter(Boolean);
  return <p className="text-xs text-muted-foreground">Evidence for the period: {parts.join(" · ")}</p>;
}

export function GrowthSection({ employeeId, growth }: { employeeId: string; growth: Growth }) {
  const { busy, go } = useRun();
  const [goal, setGoal] = React.useState<{ id?: string; title: string; dueDate: string; progress: string; status: string } | null>(null);
  const [meeting, setMeeting] = React.useState<{ heldOn: string; notes: string; actions: string } | null>(null);
  const [review, setReview] = React.useState<{ id: string; part: "self" | "lead"; rating: string; notes: string } | null>(null);
  const canMeet = growth.relation !== "self";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals and reviews</CardTitle>
        <CardDescription>{growth.relation === "self" ? "Your goals, one-to-ones with your manager, reviews and training." : "Shared with the person and their line manager."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {growth.reviews.filter((r) => r.canSelf || r.canLead).map((r) => (
          <div key={r.id} className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="font-medium">
              {r.cycle}: {r.canSelf ? "write your self review" : "write the manager's review"}
              {(r.canSelf ? r.selfDue : r.leadDue) && <span className="ml-2 font-normal text-muted-foreground">by {fmtDay(r.canSelf ? r.selfDue : r.leadDue)}</span>}
            </div>
            <EvidenceLine e={r.evidence} />
            {r.canLead && r.selfNotes && (
              <p className="text-xs">
                Self review: {r.selfRating}/5. {r.selfNotes}
              </p>
            )}
            <Button size="sm" onClick={() => setReview({ id: r.id, part: r.canSelf ? "self" : "lead", rating: "", notes: "" })}>
              <PencilIcon /> Write it
            </Button>
          </div>
        ))}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Goals</h3>
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => setGoal({ title: "", dueDate: "", progress: "0", status: "open" })}>
              <PlusIcon /> Add goal
            </Button>
          </div>
          {growth.goals.map((g) => (
            <button key={g.id} type="button" onClick={() => setGoal({ id: g.id, title: g.title, dueDate: g.dueDate ?? "", progress: String(g.progress), status: g.status })} className="block w-full rounded-md border px-3 py-2 text-left hover:border-primary">
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate font-medium", g.status !== "open" && "text-muted-foreground")}>{g.title}</span>
                {g.status === "open" ? g.dueDate && <DueBadge date={g.dueDate} /> : <StatusPill size="xs" tone={g.status === "done" ? "done" : "neutral"} label={GOAL_STATUS_LABELS[g.status]} />}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${g.progress}%` }} />
              </div>
            </button>
          ))}
          {!growth.goals.length && <p className="text-muted-foreground">No goals yet.</p>}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">One-to-ones</h3>
            {canMeet && (
              <Button size="xs" variant="outline" className="ml-auto" onClick={() => setMeeting({ heldOn: new Date().toISOString().slice(0, 10), notes: "", actions: "" })}>
                <UsersIcon /> Add notes
              </Button>
            )}
          </div>
          {growth.meetings.map((m) => (
            <div key={m.id} className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {fmtDay(m.heldOn)} with {m.managerName}
              </div>
              {m.notes && <p className="whitespace-pre-wrap">{m.notes}</p>}
              {m.actions && <p className="text-xs">Agreed: {m.actions}</p>}
            </div>
          ))}
          {!growth.meetings.length && <p className="text-muted-foreground">No one-to-ones recorded.</p>}
        </section>
        {growth.reviews.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">Reviews</h3>
            {growth.reviews.map((r) => (
              <div key={r.id} className="space-y-1 rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.cycle}</span>
                  <span className="text-xs text-muted-foreground">{r.period}</span>
                  <StatusPill size="xs" tone={r.status === "done" ? "done" : "paused"} label={REVIEW_STATUS_LABELS[r.status]} className="ml-auto" />
                </div>
                {r.selfRating !== null && (
                  <p className="text-xs">
                    <span className="font-medium">Self:</span> {r.selfRating}/5 ({RATING_LABELS[r.selfRating]}). {r.selfNotes}
                  </p>
                )}
                {r.leadRating !== null && (
                  <p className="text-xs">
                    <span className="font-medium">Manager:</span> {r.leadRating}/5 ({RATING_LABELS[r.leadRating]}). {r.leadNotes}
                  </p>
                )}
                <EvidenceLine e={r.evidence} />
              </div>
            ))}
          </section>
        )}
        {growth.trainings.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="font-semibold">Training</h3>
            {growth.trainings.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {t.title}
                  {t.mandatory && <span className="ml-1 text-xs text-muted-foreground">(required)</span>}
                </span>
                {t.status === "done" ? (
                  <span className="text-xs text-muted-foreground">
                    Done {fmtDay(t.completedOn)}
                    {t.expiresOn ? `, renew by ${fmtDay(t.expiresOn)}` : ""}
                  </span>
                ) : t.dueDate ? (
                  <DueBadge date={t.dueDate} />
                ) : (
                  <span className="text-xs text-muted-foreground">To do</span>
                )}
              </div>
            ))}
          </section>
        )}
      </CardContent>
      {goal && (
        <Dialog open onOpenChange={(o) => !o && setGoal(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{goal.id ? "Update goal" : "Add a goal"}</DialogTitle>
              <DialogDescription>Goals are shared between the person and their line manager.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Goal">
                <Input value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} placeholder="Edit 20 parts this quarter" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="By">
                  <Input type="date" value={goal.dueDate} onChange={(e) => setGoal({ ...goal, dueDate: e.target.value })} />
                </Field>
                <Field label="Progress (%)">
                  <Input type="number" min="0" max="100" step="10" value={goal.progress} onChange={(e) => setGoal({ ...goal, progress: e.target.value })} />
                </Field>
              </div>
              {goal.id && (
                <Field label="Status">
                  <SimpleSelect value={goal.status} onChange={(v) => setGoal({ ...goal, status: v })} options={Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
                </Field>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGoal(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !goal.title.trim()} onClick={async () => (await go(() => saveGoalAction({ employeeId, id: goal.id, title: goal.title, dueDate: goal.dueDate || null, progress: Number(goal.progress), status: goal.status }), "Saved")) && setGoal(null)}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {meeting && (
        <Dialog open onOpenChange={(o) => !o && setMeeting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>One-to-one notes</DialogTitle>
              <DialogDescription>The person can read these.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Date">
                <Input type="date" value={meeting.heldOn} onChange={(e) => setMeeting({ ...meeting, heldOn: e.target.value })} />
              </Field>
              <Field label="What you discussed">
                <Textarea value={meeting.notes} onChange={(e) => setMeeting({ ...meeting, notes: e.target.value })} rows={4} />
              </Field>
              <Field label="What you agreed">
                <Input value={meeting.actions} onChange={(e) => setMeeting({ ...meeting, actions: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMeeting(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={async () => (await go(() => addOneOnOneAction({ employeeId, ...meeting }), "Saved; they are told")) && setMeeting(null)}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {review && (
        <Dialog open onOpenChange={(o) => !o && setReview(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{review.part === "self" ? "Your self review" : "Manager's review"}</DialogTitle>
              <DialogDescription>{review.part === "self" ? "Your line manager reads this before writing theirs." : "The person reads this once you submit it."}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Overall">
                <SimpleSelect value={review.rating} onChange={(v) => setReview({ ...review, rating: v })} options={ratingOptions} placeholder="Choose" />
              </Field>
              <Field label={review.part === "self" ? "What went well, what was hard, what you want to learn" : "Strengths, what to improve, and support you will give"}>
                <Textarea value={review.notes} onChange={(e) => setReview({ ...review, notes: e.target.value })} rows={6} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !review.rating || !review.notes.trim()} onClick={async () => (await go(() => submitReviewAction(review.id, { part: review.part, rating: Number(review.rating), notes: review.notes }), "Submitted")) && setReview(null)}>
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HR, Performance tab
// ---------------------------------------------------------------------------

type Cycle = { id: string; name: string; periodStart: string; periodEnd: string; selfDue: string | null; leadDue: string | null; status: string; counts: Record<ReviewStatus, number> };

export function Performance({ cycles, departments, canManage }: { cycles: Cycle[]; departments: Opt[]; canManage: boolean }) {
  const { busy, go } = useRun();
  const [f, setF] = React.useState<{ name: string; periodStart: string; periodEnd: string; selfDue: string; leadDue: string; department: string } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review cycles</CardTitle>
        <CardDescription>Each person writes a self review, then their line manager writes theirs, with production and task work attached as evidence. Goals and one-to-ones live on each person&apos;s record.</CardDescription>
        {canManage && (
          <CardAction>
            <Button size="sm" onClick={() => setF({ name: "", periodStart: `${new Date().getUTCFullYear()}-01-01`, periodEnd: new Date().toISOString().slice(0, 10), selfDue: "", leadDue: "", department: "" })}>
              <PlusIcon /> Start a cycle
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {cycles.map((c) => {
          const total = c.counts.self + c.counts.lead + c.counts.done;
          return (
            <div key={c.id} className="rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtDay(c.periodStart)} to {fmtDay(c.periodEnd)}
                </span>
                <span className="ml-auto text-xs tabular">
                  {c.counts.done} of {total} done · {c.counts.self} self reviews to write · {c.counts.lead} with managers
                </span>
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${(c.counts.done / Math.max(1, total)) * 100}%` }} />
                <div className="h-full bg-primary/40" style={{ width: `${(c.counts.lead / Math.max(1, total)) * 100}%` }} />
              </div>
            </div>
          );
        })}
        {!cycles.length && <p className="text-muted-foreground">No review cycles yet.{canManage ? "" : " The HR Manager starts them."}</p>}
      </CardContent>
      {f && (
        <Dialog open onOpenChange={(o) => !o && setF(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Start a review cycle</DialogTitle>
              <DialogDescription>Everyone in scope is asked for their self review in My record.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" className="sm:col-span-2">
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="2026 annual review" />
              </Field>
              <Field label="Period from">
                <Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
              </Field>
              <Field label="Period to">
                <Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
              </Field>
              <Field label="Self reviews by">
                <Input type="date" value={f.selfDue} onChange={(e) => setF({ ...f, selfDue: e.target.value })} />
              </Field>
              <Field label="Managers' reviews by">
                <Input type="date" value={f.leadDue} onChange={(e) => setF({ ...f, leadDue: e.target.value })} />
              </Field>
              <Field label="Who" className="sm:col-span-2">
                <SimpleSelect value={f.department} onChange={(v) => setF({ ...f, department: v })} options={departments} placeholder="Everyone" />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setF(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy || !f.name.trim()}
                onClick={async () => {
                  const r = await go(() => startCycleAction({ ...f, selfDue: f.selfDue || null, leadDue: f.leadDue || null, department: f.department || null }));
                  if (r) {
                    toast.success(`Started for ${(r.data as { count: number }).count} people`);
                    setF(null);
                  }
                }}
              >
                Start
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HR, Training tab
// ---------------------------------------------------------------------------

type TrainingRow = { id: string; employee_id: string; full_name: string; status: string; due_date: string | null; completed_on: string | null; expires_on: string | null };

export function Training({ courses, people }: { courses: Course[]; people: Opt[] }) {
  const { busy, go } = useRun();
  const [edit, setEdit] = React.useState<{ id?: string; title: string; provider: string; renewMonths: string; mandatory: boolean; active: boolean } | null>(null);
  const [open, setOpen] = React.useState<Course | null>(null);
  const [rows, setRows] = React.useState<TrainingRow[] | null>(null);
  const [assign, setAssign] = React.useState<{ ids: string[]; dueDate: string }>({ ids: [], dueDate: "" });
  const [completed, setCompleted] = React.useState(new Date().toISOString().slice(0, 10));
  const load = async (c: Course) => {
    setOpen(c);
    setRows(null);
    const r = await courseTrainingsAction(c.id);
    if (r.ok) setRows(r.data as TrainingRow[]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Courses and certifications</CardTitle>
        <CardDescription>Assign courses to people, record completion, and get reminded 30 days before certificates need renewing.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEdit({ title: "", provider: "", renewMonths: "", mandatory: false, active: true })}>
            <PlusIcon /> Add course
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {courses.map((c) => (
          <div key={c.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2", !c.active && "opacity-60")}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => load(c)}>
              <div className="font-medium hover:underline">
                {c.title}
                {c.mandatory && <span className="ml-1 text-xs font-normal text-muted-foreground">(required)</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {[c.provider, c.renewMonths ? `renew every ${c.renewMonths} months` : null, `${c.done} of ${c.assigned} done`].filter(Boolean).join(" · ")}
              </div>
            </button>
            <Button size="icon-xs" variant="ghost" aria-label={`Edit ${c.title}`} onClick={() => setEdit({ id: c.id, title: c.title, provider: c.provider ?? "", renewMonths: c.renewMonths ? String(c.renewMonths) : "", mandatory: c.mandatory, active: c.active })}>
              <PencilIcon />
            </Button>
          </div>
        ))}
        {!courses.length && <p className="text-muted-foreground">No courses yet.</p>}
      </CardContent>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{edit.id ? "Edit course" : "Add course"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Course">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="First aid" />
              </Field>
              <Field label="Provider">
                <Input value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value })} />
              </Field>
              <Field label="Renew every (months)" hint="Leave empty if it does not expire.">
                <Input type="number" min="1" value={edit.renewMonths} onChange={(e) => setEdit({ ...edit, renewMonths: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={edit.mandatory} onCheckedChange={(v) => setEdit({ ...edit, mandatory: v === true })} /> Required for the people it is assigned to
              </label>
              {edit.id && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v === true })} /> Still offered
                </label>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !edit.title.trim()} onClick={async () => (await go(() => saveCourseAction({ ...edit, renewMonths: edit.renewMonths ? Number(edit.renewMonths) : null }), "Saved")) && setEdit(null)}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{open.title}</DialogTitle>
              <DialogDescription>Assign it to people and record when they complete it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Assign to</p>
              <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-auto">
                {people.map((p) => (
                  <label key={p.value} className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={assign.ids.includes(p.value)} onCheckedChange={(v) => setAssign({ ...assign, ids: v === true ? [...assign.ids, p.value] : assign.ids.filter((x) => x !== p.value) })} />
                    {p.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Complete by">
                  <Input type="date" value={assign.dueDate} onChange={(e) => setAssign({ ...assign, dueDate: e.target.value })} />
                </Field>
                <Button
                  size="sm"
                  disabled={busy || !assign.ids.length}
                  onClick={async () => {
                    const r = await go(() => assignCourseAction(open.id, { employeeIds: assign.ids, dueDate: assign.dueDate || null }));
                    if (r) {
                      toast.success(`Assigned to ${r.data} ${r.data === 1 ? "person" : "people"}`);
                      setAssign({ ids: [], dueDate: "" });
                      void load(open);
                    }
                  }}
                >
                  Assign
                </Button>
              </div>
            </div>
            <div className="flex items-end gap-2 text-sm">
              <Field label="Completed on (for the buttons below)">
                <Input type="date" value={completed} onChange={(e) => setCompleted(e.target.value)} />
              </Field>
            </div>
            <ul className="space-y-1 text-sm">
              {rows === null && <li className="text-muted-foreground">Loading…</li>}
              {rows?.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                  <Link href={`/hr/people/${r.employee_id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {r.full_name}
                  </Link>
                  {r.status === "done" ? (
                    <span className="text-xs text-muted-foreground">
                      Done {fmtDay(r.completed_on)}
                      {r.expires_on ? `, renew by ${fmtDay(r.expires_on)}` : ""}
                    </span>
                  ) : (
                    <>
                      {r.due_date && <DueBadge date={r.due_date} />}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={async () => {
                          if (await go(() => completeTrainingAction(r.id, { completedOn: completed }), "Recorded")) void load(open);
                        }}
                      >
                        <CheckIcon /> Completed
                      </Button>
                    </>
                  )}
                </li>
              ))}
              {rows?.length === 0 && <li className="text-muted-foreground">Not assigned to anyone yet.</li>}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HR, Cases tab (hr.cases only)
// ---------------------------------------------------------------------------

export function Cases({ cases, people }: { cases: HrCase[]; people: Opt[] }) {
  const { busy, go } = useRun();
  const [adding, setAdding] = React.useState<{ employeeId: string; kind: string; title: string; note: string } | null>(null);
  const [upd, setUpd] = React.useState<Record<string, { note: string; status: string; outcome: string }>>({});
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlertIcon className="size-4" /> Confidential. Only people with the cases right (the HR Manager by default) see this tab. The audit log records that a case was opened, without names or details.
        <Button size="sm" className="ml-auto" onClick={() => setAdding({ employeeId: "", kind: "grievance", title: "", note: "" })}>
          <PlusIcon /> Open a case
        </Button>
      </div>
      {!cases.length && <EmptyState title="No cases" description="Disciplinary, grievance and investigation cases are kept here." />}
      {cases.map((c) => {
        const u = upd[c.id] ?? { note: "", status: c.status, outcome: c.outcome ?? "" };
        const set = (patch: Partial<typeof u>) => setUpd({ ...upd, [c.id]: { ...u, ...patch } });
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}
                <StatusPill size="xs" tone={c.status === "closed" ? "neutral" : "paused"} label={CASE_STATUS_LABELS[c.status]} />
              </CardTitle>
              <CardDescription>
                {CASE_KIND_LABELS[c.kind]} ·{" "}
                <Link href={`/hr/people/${c.employeeId}`} className="hover:underline">
                  {c.employeeName}
                </Link>{" "}
                · opened {fmtDay(c.openedOn)}
                {c.closedOn ? `, closed ${fmtDay(c.closedOn)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.notes.map((n) => (
                <div key={n.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">
                    {n.actor}, {new Date(n.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <p className="whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
              {c.outcome && <p>Outcome: {c.outcome}</p>}
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                <Field label="Add a note">
                  <Textarea value={u.note} onChange={(e) => set({ note: e.target.value })} rows={2} />
                </Field>
                <Field label="Status">
                  <SimpleSelect value={u.status} onChange={(v) => set({ status: v })} options={CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))} />
                </Field>
                <Button size="sm" disabled={busy || (!u.note.trim() && u.status === c.status)} onClick={async () => (await go(() => updateCaseAction(c.id, u), "Saved")) && setUpd({ ...upd, [c.id]: { note: "", status: u.status, outcome: u.outcome } })}>
                  Save
                </Button>
                {u.status === "closed" && c.status !== "closed" && (
                  <Field label="Outcome" className="sm:col-span-3">
                    <Input value={u.outcome} onChange={(e) => set({ outcome: e.target.value })} />
                  </Field>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {adding && (
        <Dialog open onOpenChange={(o) => !o && setAdding(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Open a case</DialogTitle>
              <DialogDescription>Keep notes factual: what happened, when, who was there.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="About">
                <SimpleSelect value={adding.employeeId} onChange={(v) => setAdding({ ...adding, employeeId: v })} options={people} placeholder="Choose a person" />
              </Field>
              <Field label="Kind">
                <SimpleSelect value={adding.kind} onChange={(v) => setAdding({ ...adding, kind: v })} options={CASE_KINDS.map((k) => ({ value: k, label: CASE_KIND_LABELS[k] }))} />
              </Field>
              <Field label="Title">
                <Input value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
              </Field>
              <Field label="First note">
                <Textarea value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} rows={4} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !adding.employeeId || !adding.title.trim()} onClick={async () => (await go(() => openCaseAction(adding), "Case opened")) && setAdding(null)}>
                Open
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR, Reports tab
// ---------------------------------------------------------------------------

type Report = {
  year: number;
  headcount: number;
  byDepartment: { label: string; count: number }[];
  byType: { label: string; count: number }[];
  byStatus: { label: string; count: number }[];
  months: string[];
  joiners: number[];
  leavers: number[];
  turnover: number;
  leave: { label: string; days: number; people: number }[];
  training: { title: string; assigned: number; done: number; overdue: number }[];
  hiring: { open: number; applicants: number; hired: number };
  attendance: {
    months: { month: string; absent: number; late: number; lateMin: number; halfDays: number }[];
    byDepartment: { key: string; label: string; people: number; absent: number; late: number; lateMin: number; workdays: number; rate: number }[];
  };
};

function Bars({ rows, label }: { rows: { label: string; count: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate">{label(r.label)}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="text-right tabular">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
}

export function Reports({ report, departments }: { report: Report; departments: Opt[] }) {
  const dept = (k: string) => departments.find((d) => d.value === k)?.label ?? k;
  const download = () => {
    const rows: (string | number)[][] = [
      [`HR report ${report.year}`],
      ["Headcount", report.headcount],
      ["Turnover %", report.turnover],
      [],
      ["Department", "People"],
      ...report.byDepartment.map((r) => [dept(r.label), r.count]),
      [],
      ["Month", "Joiners", "Leavers"],
      ...report.months.map((m, i) => [m, report.joiners[i]!, report.leavers[i]!]),
      [],
      ["Leave type", "Days", "People"],
      ...report.leave.map((l) => [l.label, l.days, l.people]),
      [],
      ["Course", "Assigned", "Done", "Overdue"],
      ...report.training.map((t) => [t.title, t.assigned, t.done, t.overdue]),
      [],
      ["Month", "Absent days", "Late days", "Late minutes", "Half days"],
      ...report.attendance.months.map((m) => [m.month, m.absent, m.late, m.lateMin, m.halfDays]),
      [],
      ["Department", "People", "Absent days", "Absence rate %", "Late days", "Late minutes"],
      ...report.attendance.byDepartment.map((d) => [d.label, d.people, d.absent, d.rate, d.late, d.lateMin]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv" }));
    a.download = `hr-report-${report.year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const maxMonth = Math.max(1, ...report.joiners, ...report.leavers);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[-1, 0].map((d) => {
          const y = new Date().getUTCFullYear() + d;
          return (
            <Button key={y} size="sm" variant={y === report.year ? "default" : "outline"} asChild>
              <Link href={`/hr?tab=reports&year=${y}`} scroll={false}>
                {y}
              </Link>
            </Button>
          );
        })}
        <Button size="sm" variant="outline" className="ml-auto" onClick={download}>
          <DownloadIcon /> Download CSV
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Headcount", report.headcount],
          ["Joined", report.joiners.reduce((a, b) => a + b, 0)],
          ["Left", report.leavers.reduce((a, b) => a + b, 0)],
          ["Turnover", `${report.turnover}%`],
          ["Open positions", report.hiring.open],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-2xl font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By department</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars rows={report.byDepartment} label={dept} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By employment type</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars rows={report.byType} label={(k) => EMPLOYMENT_TYPE_LABELS[k as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? k} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars rows={report.byStatus} label={(k) => EMPLOYEE_STATUS_LABELS[k as keyof typeof EMPLOYEE_STATUS_LABELS] ?? k} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Joiners and leavers, {report.year}</CardTitle>
          <CardDescription>
            {report.hiring.applicants} applicants and {report.hiring.hired} hired through Hiring this year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid h-40 grid-cols-12 items-end gap-2">
            {report.months.map((m, i) => (
              <div key={m} className="flex h-full flex-col items-center justify-end gap-1" title={`${m}: ${report.joiners[i]} joined, ${report.leavers[i]} left`}>
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div className="w-1/3 rounded-t bg-primary" style={{ height: `${(report.joiners[i]! / maxMonth) * 100}%` }} />
                  <div className="w-1/3 rounded-t bg-muted-foreground/40" style={{ height: `${(report.leavers[i]! / maxMonth) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-primary" /> Joined
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-muted-foreground/40" /> Left
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leave taken</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.leave.map((l) => (
                  <TableRow key={l.label}>
                    <TableCell>{l.label}</TableCell>
                    <TableCell className="text-right tabular">{l.days}</TableCell>
                    <TableCell className="text-right tabular">{l.people}</TableCell>
                  </TableRow>
                ))}
                {!report.leave.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No approved leave this year.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Training completion</CardTitle>

          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.training.map((t) => (
                  <TableRow key={t.title}>
                    <TableCell>{t.title}</TableCell>
                    <TableCell className="text-right tabular">
                      {t.done} of {t.assigned}
                    </TableCell>
                    <TableCell className={cn("text-right tabular", t.overdue && "text-[var(--st-blocked-fg)]")}>{t.overdue}</TableCell>
                  </TableRow>
                ))}
                {!report.training.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No courses yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Absence and lateness</CardTitle>
          <CardDescription>From Attendance: days absent without leave, late arrivals and half days. The absence rate is absent days over days meant to be worked.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Late</TableHead>
                <TableHead className="text-right">Late min</TableHead>
                <TableHead className="text-right">Half days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.attendance.months
                .filter((m) => m.absent || m.late || m.halfDays)
                .map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.month}</TableCell>
                    <TableCell className="text-right tabular">{m.absent}</TableCell>
                    <TableCell className="text-right tabular">{m.late}</TableCell>
                    <TableCell className="text-right tabular">{m.lateMin}</TableCell>
                    <TableCell className="text-right tabular">{m.halfDays}</TableCell>
                  </TableRow>
                ))}
              {!report.attendance.months.some((m) => m.absent || m.late || m.halfDays) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No absences or late arrivals recorded this year.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Late</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.attendance.byDepartment.map((d) => (
                <TableRow key={d.key || "none"}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="text-right tabular">{d.people}</TableCell>
                  <TableCell className="text-right tabular">{d.absent}</TableCell>
                  <TableCell className="text-right tabular">{d.rate}%</TableCell>
                  <TableCell className="text-right tabular">{d.late}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
