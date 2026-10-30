"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClockIcon, DownloadIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon, UserCheckIcon, UserMinusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import { EmptyState } from "@/components/app/primitives";
import {
  addApplicantFileAction,
  cancelInterviewAction,
  deactivateAccountAction,
  hireApplicantAction,
  moveApplicantAction,
  saveApplicantAction,
  saveChecklistTemplateAction,
  saveOpeningAction,
  scheduleInterviewAction,
  startChecklistAction,
  startOffboardingAction,
  submitScorecardAction,
  tickChecklistAction,
} from "@/app/actions/hr-growth";
import type { Applicant, EmployeeChecklist, Opening } from "@/server/hr-hiring";
import {
  APPLICANT_STAGES,
  APPLICANT_STAGE_LABELS,
  CHECKLIST_KIND_LABELS,
  CHECKLIST_OWNER_LABELS,
  OPENING_STATUSES,
  OPENING_STATUS_LABELS,
  RECOMMENDATIONS,
  RECOMMENDATION_LABELS,
  type ApplicantStage,
  type ChecklistKind,
  type ChecklistOwner,
  type ChecklistTemplateItem,
} from "@/lib/hr-growth";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS } from "@/lib/hr";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "./hr-home";
import { Field, fmtDay, readBase64 } from "./hr-shared";

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

const STAGE_TONE: Record<ApplicantStage, Tone> = { applied: "queued", screening: "queued", interview: "active", offer: "handoff", hired: "done", rejected: "neutral" };

// ---------------------------------------------------------------------------
// Hiring tab
// ---------------------------------------------------------------------------

export function Hiring({
  openings,
  selected,
  applicants,
  departments,
  managers,
  users,
  canGivePrivileged,
}: {
  openings: Opening[];
  selected: string | null;
  applicants: Applicant[] | null;
  departments: Opt[];
  managers: Opt[];
  users: Opt[];
  canGivePrivileged: boolean;
}) {
  const [editing, setEditing] = React.useState<Opening | "new" | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [open, setOpen] = React.useState<Applicant | null>(null);
  const job = openings.find((o) => o.id === selected) ?? null;
  // Keep the open applicant in step with fresh data after each change.
  const current = open ? (applicants?.find((a) => a.id === open.id) ?? null) : null;
  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Openings</CardTitle>
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <PlusIcon /> New
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {openings.map((o) => {
            const active = o.counts.applied + o.counts.screening + o.counts.interview + o.counts.offer;
            return (
              <Link key={o.id} href={`/hr?tab=hiring&job=${o.id}`} scroll={false} className={cn("block rounded-md border px-3 py-2 hover:border-primary", o.id === selected && "border-primary bg-primary/5")}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.title}</span>
                  <StatusPill size="xs" tone={o.status === "open" ? "active" : o.status === "filled" ? "done" : "neutral"} label={OPENING_STATUS_LABELS[o.status]} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {active} in progress · {o.counts.hired} hired of {o.positions}
                </div>
              </Link>
            );
          })}
          {!openings.length && <p className="text-sm text-muted-foreground">No openings yet.</p>}
        </CardContent>
      </Card>
      {job ? (
        <Card>
          <CardHeader>
            <CardTitle>{job.title}</CardTitle>
            <CardDescription>
              {[departments.find((d) => d.value === job.department)?.label, job.location, EMPLOYMENT_TYPE_LABELS[job.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS], job.hiringManagerName && `Hiring manager: ${job.hiringManagerName}`, job.closesOn && `Closes ${fmtDay(job.closesOn)}`]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
            <CardAction className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(job)}>
                <PencilIcon /> Edit
              </Button>
              <Button size="sm" onClick={() => setAdding(true)}>
                <PlusIcon /> Add applicant
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 overflow-x-auto md:grid-cols-3 2xl:grid-cols-6">
              {APPLICANT_STAGES.map((s) => {
                const list = (applicants ?? []).filter((a) => a.stage === s);
                return (
                  <div key={s} className="min-w-44 space-y-1.5 rounded-lg bg-muted/40 p-2">
                    <div className="px-1 text-xs font-semibold">
                      {APPLICANT_STAGE_LABELS[s]} <span className="font-normal text-muted-foreground">{list.length}</span>
                    </div>
                    {list.map((a) => (
                      <button key={a.id} type="button" onClick={() => setOpen(a)} className="block w-full rounded-md border bg-card px-2 py-1.5 text-left hover:border-primary">
                        <div className="truncate text-sm font-medium">{a.fullName}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {a.avgRating !== null ? `★ ${a.avgRating} · ` : ""}
                          {a.interviews.filter((i) => i.status === "scheduled").length ? "Interview booked · " : ""}
                          {a.source ?? "Added " + fmtDay(a.createdAt.slice(0, 10))}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Choose an opening" description="Or press New to open a position. Each opening has its own applicant pipeline." />
      )}
      {editing && <OpeningForm opening={editing === "new" ? null : editing} departments={departments} managers={managers} onClose={() => setEditing(null)} />}
      {adding && job && <ApplicantForm openingId={job.id} onClose={() => setAdding(false)} />}
      {current && <ApplicantPanel a={current} users={users} canGivePrivileged={canGivePrivileged} onClose={() => setOpen(null)} />}
    </div>
  );
}

function OpeningForm({ opening, departments, managers, onClose }: { opening: Opening | null; departments: Opt[]; managers: Opt[]; onClose: () => void }) {
  const router = useRouter();
  const { busy, go } = useRun();
  const [f, setF] = React.useState({
    title: opening?.title ?? "",
    department: opening?.department ?? "",
    location: opening?.location ?? "",
    employmentType: opening?.employmentType ?? "full_time",
    positions: String(opening?.positions ?? 1),
    hiringManagerId: opening?.hiringManagerId ?? "",
    status: opening?.status ?? "open",
    closesOn: opening?.closesOn ?? "",
    description: opening?.description ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const r = await go(() => saveOpeningAction({ ...f, id: opening?.id, positions: Number(f.positions), department: f.department || null, hiringManagerId: f.hiringManagerId || null, closesOn: f.closesOn || null }), "Saved");
    if (r) {
      onClose();
      if (!opening) router.push(`/hr?tab=hiring&job=${r.data}`);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{opening ? "Edit opening" : "New opening"}</DialogTitle>
          <DialogDescription>The hiring manager becomes the new person&apos;s line manager when you hire.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title" className="sm:col-span-2">
            <Input value={f.title} onChange={(e) => set("title")(e.target.value)} />
          </Field>
          <Field label="Department">
            <SimpleSelect value={f.department} onChange={set("department")} options={departments} placeholder="None" />
          </Field>
          <Field label="Hiring manager">
            <SimpleSelect value={f.hiringManagerId} onChange={set("hiringManagerId")} options={managers} placeholder="Nobody" />
          </Field>
          <Field label="Employment type">
            <SimpleSelect value={f.employmentType} onChange={set("employmentType")} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Positions">
            <Input type="number" min="1" value={f.positions} onChange={(e) => set("positions")(e.target.value)} />
          </Field>
          <Field label="Location">
            <Input value={f.location} onChange={(e) => set("location")(e.target.value)} />
          </Field>
          <Field label="Closes on">
            <Input type="date" value={f.closesOn} onChange={(e) => set("closesOn")(e.target.value)} />
          </Field>
          {opening && (
            <Field label="Status">
              <SimpleSelect value={f.status} onChange={set("status")} options={OPENING_STATUSES.map((s) => ({ value: s, label: OPENING_STATUS_LABELS[s] }))} />
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => set("description")(e.target.value)} rows={4} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !f.title.trim()} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicantForm({ openingId, onClose }: { openingId: string; onClose: () => void }) {
  const { busy, go } = useRun();
  const [f, setF] = React.useState({ fullName: "", email: "", phone: "", source: "" });
  const [file, setFile] = React.useState<File | null>(null);
  const save = async () => {
    if (file && file.size > 8 * 1024 * 1024) return void toast.error("Files are limited to 8 MB.");
    const payload = file ? { name: file.name, mime: file.type, base64: await readBase64(file) } : null;
    if (await go(() => saveApplicantAction({ ...f, openingId, file: payload }), "Applicant added")) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add applicant</DialogTitle>
          <DialogDescription>Attach their CV now or later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Full name">
            <Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Where they came from">
            <Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Referral, LinkedIn, walk-in" />
          </Field>
          <Field label="CV">
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !f.fullName.trim()} onClick={save}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACCOUNT_ROLES: Role[] = ["recording", "editing", "uploading", "publication", "developer", "content", "marketing", "hr_officer"];
const PRIVILEGED_ROLES: Role[] = ["manager", "admin", "owner", "hr_manager"];

function ApplicantPanel({ a, users, canGivePrivileged, onClose }: { a: Applicant; users: Opt[]; canGivePrivileged: boolean; onClose: () => void }) {
  const { busy, go } = useRun();
  const [move, setMove] = React.useState<{ stage: string; reason: string; offerStartDate: string } | null>(null);
  const [iv, setIv] = React.useState<{ at: string; location: string; ids: string[] } | null>(null);
  const [hire, setHire] = React.useState<{ startDate: string; probationEnd: string; account: boolean; roles: Role[] } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const done = a.stage === "hired";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {a.fullName} <StatusPill size="xs" tone={STAGE_TONE[a.stage]} label={APPLICANT_STAGE_LABELS[a.stage]} />
          </DialogTitle>
          <DialogDescription>{[a.email, a.phone, a.source].filter(Boolean).join(" · ") || "No contact details"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {a.rejectedReason && <p className="text-muted-foreground">Not selected: {a.rejectedReason}</p>}
          {a.employeeId && (
            <Link href={`/hr/people/${a.employeeId}`} className="font-medium text-primary hover:underline">
              Open their employee record
            </Link>
          )}
          <section className="space-y-1.5">
            <h3 className="font-semibold">Files</h3>
            {a.files.map((f) => (
              <a key={f.id} href={`/api/applicant-files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                <DownloadIcon className="size-3.5" /> {f.name}
              </a>
            ))}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-label="Choose a file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await go(async () => addApplicantFileAction(a.id, { name: file.name, mime: file.type, base64: await readBase64(file) }), "File added");
              }}
            />
            <Button size="xs" variant="outline" onClick={() => fileRef.current?.click()}>
              <UploadIcon /> Add file
            </Button>
          </section>
          <section className="space-y-1.5">
            <h3 className="font-semibold">Interviews</h3>
            {a.interviews.map((i) => (
              <div key={i.id} className={cn("rounded-md border px-3 py-2", i.status === "cancelled" && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{new Date(i.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span className="text-muted-foreground">{[i.location, i.interviewers.map((x) => x.name).join(", ")].filter(Boolean).join(" · ")}</span>
                  {i.status === "scheduled" && (
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => go(() => cancelInterviewAction(i.id), "Cancelled")}>
                      Cancel
                    </Button>
                  )}
                  {i.status === "cancelled" && <span className="ml-auto text-xs">Cancelled</span>}
                </div>
                {i.scorecards.map((c) => (
                  <div key={c.reviewerId} className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.reviewerName}</span>: {c.rating}/5, {RECOMMENDATION_LABELS[c.recommendation]}
                    {c.notes ? `. ${c.notes}` : ""}
                  </div>
                ))}
              </div>
            ))}
            {!done && (
              <Button size="xs" variant="outline" onClick={() => setIv({ at: "", location: "", ids: [] })}>
                <CalendarClockIcon /> Schedule interview
              </Button>
            )}
          </section>
          {iv && (
            <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
              <Field label="When">
                <Input type="datetime-local" value={iv.at} onChange={(e) => setIv({ ...iv, at: e.target.value })} />
              </Field>
              <Field label="Where">
                <Input value={iv.location} onChange={(e) => setIv({ ...iv, location: e.target.value })} placeholder="Studio, or a call link" />
              </Field>
              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm font-medium">Interviewers</p>
                <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-auto">
                  {users.map((u) => (
                    <label key={u.value} className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={iv.ids.includes(u.value)} onCheckedChange={(v) => setIv({ ...iv, ids: v === true ? [...iv.ids, u.value] : iv.ids.filter((x) => x !== u.value) })} />
                      {u.label}
                    </label>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy || !iv.at || !iv.ids.length}
                onClick={async () => {
                  if (await go(() => scheduleInterviewAction(a.id, { scheduledAt: new Date(iv.at).toISOString(), location: iv.location, interviewerIds: iv.ids }), "Interview booked; interviewers told")) setIv(null);
                }}
              >
                Book
              </Button>
            </div>
          )}
          {!done && (
            <section className="flex flex-wrap items-end gap-2 border-t pt-3">
              <Field label="Move to">
                <SimpleSelect
                  value={move?.stage ?? a.stage}
                  onChange={(v) => setMove({ stage: v, reason: "", offerStartDate: a.offerStartDate ?? "" })}
                  options={APPLICANT_STAGES.filter((s) => s !== "hired").map((s) => ({ value: s, label: APPLICANT_STAGE_LABELS[s] }))}
                />
              </Field>
              {move?.stage === "rejected" && (
                <Field label="Why">
                  <Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} />
                </Field>
              )}
              {move?.stage === "offer" && (
                <Field label="Proposed start">
                  <Input type="date" value={move.offerStartDate} onChange={(e) => setMove({ ...move, offerStartDate: e.target.value })} />
                </Field>
              )}
              {move && move.stage !== a.stage && (
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => (await go(() => moveApplicantAction(a.id, { stage: move.stage, reason: move.reason, offerStartDate: move.offerStartDate || null }), "Moved")) && setMove(null)}>
                  Move
                </Button>
              )}
              {a.stage !== "rejected" && (
                <Button size="sm" className="ml-auto" onClick={() => setHire({ startDate: a.offerStartDate ?? "", probationEnd: "", account: !!a.email, roles: [] })}>
                  <UserCheckIcon /> Hire
                </Button>
              )}
            </section>
          )}
          {hire && (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <p className="font-medium">Hire {a.fullName}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Start date">
                  <Input type="date" value={hire.startDate} onChange={(e) => setHire({ ...hire, startDate: e.target.value })} />
                </Field>
                <Field label="Probation ends">
                  <Input type="date" value={hire.probationEnd} onChange={(e) => setHire({ ...hire, probationEnd: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-center gap-2">
                <Checkbox checked={hire.account} disabled={!a.email} onCheckedChange={(v) => setHire({ ...hire, account: v === true })} /> Create their app account{a.email ? ` (${a.email})` : " (add an email first)"}
              </label>
              {hire.account && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {[...ACCOUNT_ROLES, ...(canGivePrivileged ? PRIVILEGED_ROLES : [])].map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={hire.roles.includes(r)} onCheckedChange={(v) => setHire({ ...hire, roles: v === true ? [...hire.roles, r] : hire.roles.filter((x) => x !== r) })} />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">They become an employee on probation under the hiring manager, and onboarding starts.</p>
              <Button
                size="sm"
                disabled={busy || !hire.startDate || (hire.account && !hire.roles.length)}
                onClick={async () => {
                  const r = await go(() => hireApplicantAction(a.id, { startDate: hire.startDate, probationEnd: hire.probationEnd || null, createAccount: hire.account, roles: hire.roles }));
                  if (!r) return;
                  const d = r.data as { tempPassword: string | null };
                  toast.success(d.tempPassword ? `Hired. Temporary password: ${d.tempPassword}` : "Hired", { duration: d.tempPassword ? 60000 : 4000 });
                  setHire(null);
                }}
              >
                Confirm hire
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Interviews on My record (for interviewers)
// ---------------------------------------------------------------------------

export type MyInterview = { id: string; applicantName: string; opening: string; scheduledAt: string; location: string | null; files: { id: string; name: string }[]; scorecard: { rating: number; recommendation: string; notes: string | null } | null };

export function MyInterviews({ items }: { items: MyInterview[] }) {
  const { busy, go } = useRun();
  const [f, setF] = React.useState<Record<string, { rating: string; recommendation: string; notes: string }>>({});
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interviews you take part in</CardTitle>
        <CardDescription>Add your scorecard after each interview. HR sees everyone&apos;s scores.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items.map((i) => {
          const v = f[i.id] ?? { rating: String(i.scorecard?.rating ?? ""), recommendation: i.scorecard?.recommendation ?? "", notes: i.scorecard?.notes ?? "" };
          const set = (patch: Partial<typeof v>) => setF({ ...f, [i.id]: { ...v, ...patch } });
          return (
            <div key={i.id} className="space-y-2 rounded-md border p-3">
              <div>
                <span className="font-medium">{i.applicantName}</span> <span className="text-muted-foreground">for {i.opening}</span>
                <div className="text-xs text-muted-foreground">
                  {new Date(i.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {i.location ? ` · ${i.location}` : ""}
                  {i.files.map((x) => (
                    <a key={x.id} href={`/api/applicant-files/${x.id}`} target="_blank" rel="noreferrer" className="ml-2 text-primary hover:underline">
                      {x.name}
                    </a>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[8rem_10rem_1fr_auto] sm:items-end">
                <Field label="Rating">
                  <SimpleSelect value={v.rating} onChange={(x) => set({ rating: x })} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` }))} placeholder="Choose" />
                </Field>
                <Field label="Recommend">
                  <SimpleSelect value={v.recommendation} onChange={(x) => set({ recommendation: x })} options={RECOMMENDATIONS.map((r) => ({ value: r, label: RECOMMENDATION_LABELS[r] }))} placeholder="Choose" />
                </Field>
                <Field label="Notes">
                  <Input value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
                </Field>
                <Button size="sm" disabled={busy || !v.rating || !v.recommendation} onClick={() => go(() => submitScorecardAction(i.id, { rating: Number(v.rating), recommendation: v.recommendation, notes: v.notes }), "Scorecard saved")}>
                  {i.scorecard ? "Update" : "Submit"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Onboarding and offboarding
// ---------------------------------------------------------------------------

export function ChecklistCard({ list, canTickAll, myRole, canManage }: { list: EmployeeChecklist; canTickAll: boolean; myRole: "manager" | "employee" | null; canManage: boolean }) {
  const { busy, go } = useRun();
  const done = list.items.filter((i) => i.doneAt).length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{CHECKLIST_KIND_LABELS[list.kind]}</span>
        <span className="text-muted-foreground tabular">
          {done} of {list.items.length}
        </span>
        {list.status === "done" && <StatusPill size="xs" tone="done" label="Done" />}
      </div>
      <ul className="space-y-1">
        {list.items.map((i) => {
          const can = canTickAll || (myRole !== null && i.owner === myRole);
          return (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              <Checkbox checked={!!i.doneAt} disabled={!can || busy} onCheckedChange={(v) => go(() => tickChecklistAction(list.id, i.key, v === true))} aria-label={i.label} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className={cn(i.doneAt && "text-muted-foreground line-through")}>{i.label}</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {CHECKLIST_OWNER_LABELS[i.owner]}
                  {i.doneAt ? ` · ${i.doneBy}, ${fmtDay(i.doneAt.slice(0, 10))}` : ""}
                </span>
              </div>
              {list.kind === "offboarding" && i.key === "access" && !i.doneAt && canManage && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                    if ((await go(() => deactivateAccountAction(list.employeeId), "App access removed")) !== null) await go(() => tickChecklistAction(list.id, i.key, true));
                  }}
                >
                  <UserMinusIcon /> Remove access now
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EmployeeLifecycle({ employeeId, lists, view, canManage, status }: { employeeId: string; lists: EmployeeChecklist[]; view: "hr" | "self" | "team"; canManage: boolean; status: string }) {
  const { busy, go } = useRun();
  const [leaving, setLeaving] = React.useState<{ lastDay: string; reason: string } | null>(null);
  const shown = view === "hr" ? lists : lists.filter((l) => l.status === "open");
  if (view !== "hr" && !shown.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Joining and leaving</CardTitle>
        <CardDescription>{view === "hr" ? "Onboarding starts when someone is hired; offboarding when they leave." : "Tick the lines that are yours."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {shown.map((l) => (
          <ChecklistCard key={l.id} list={l} canTickAll={view === "hr"} myRole={view === "self" ? "employee" : view === "team" ? "manager" : null} canManage={canManage} />
        ))}
        {view === "hr" && (
          <div className="flex flex-wrap gap-2">
            {!lists.some((l) => l.kind === "onboarding") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => go(() => startChecklistAction(employeeId, "onboarding"), "Onboarding started")}>
                Start onboarding
              </Button>
            )}
            {canManage && status !== "left" && !lists.some((l) => l.kind === "offboarding" && l.status === "open") && (
              <Button size="sm" variant="outline" onClick={() => setLeaving({ lastDay: "", reason: "" })}>
                <UserMinusIcon /> Start offboarding
              </Button>
            )}
          </div>
        )}
        {leaving && (
          <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <Field label="Last working day">
              <Input type="date" value={leaving.lastDay} onChange={(e) => setLeaving({ ...leaving, lastDay: e.target.value })} />
            </Field>
            <Field label="Reason">
              <Input value={leaving.reason} onChange={(e) => setLeaving({ ...leaving, reason: e.target.value })} />
            </Field>
            <Button size="sm" disabled={busy || !leaving.lastDay} onClick={async () => (await go(() => startOffboardingAction(employeeId, leaving), "Offboarding started; the line manager is told")) && setLeaving(null)}>
              Start
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Lifecycle({ lists, templates, canManage }: { lists: EmployeeChecklist[]; templates: Record<ChecklistKind, ChecklistTemplateItem[]>; canManage: boolean }) {
  const [editing, setEditing] = React.useState<ChecklistKind | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {(["onboarding", "offboarding"] as ChecklistKind[]).map((k) => {
          const open = lists.filter((l) => l.kind === k);
          return (
            <Card key={k}>
              <CardHeader>
                <CardTitle>
                  {k === "onboarding" ? "Joining" : "Leaving"} ({open.length})
                </CardTitle>
                <CardDescription>{k === "onboarding" ? "New people still being onboarded." : "People on their way out."}</CardDescription>
                {canManage && (
                  <CardAction>
                    <Button size="sm" variant="outline" onClick={() => setEditing(k)}>
                      <PencilIcon /> Edit checklist
                    </Button>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {open.map((l) => {
                  const done = l.items.filter((i) => i.doneAt).length;
                  const next = l.items.find((i) => !i.doneAt);
                  return (
                    <Link key={l.id} href={`/hr/people/${l.employeeId}`} className="block rounded-md border px-3 py-2 hover:border-primary">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{l.employeeName}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular">
                          {done} of {l.items.length}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${(done / Math.max(1, l.items.length)) * 100}%` }} />
                      </div>
                      {next && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          Next: {next.label} ({CHECKLIST_OWNER_LABELS[next.owner]})
                        </div>
                      )}
                    </Link>
                  );
                })}
                {!open.length && <p className="text-sm text-muted-foreground">Nobody right now.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {editing && <TemplateEditor kind={editing} items={templates[editing]} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateEditor({ kind, items, onClose }: { kind: ChecklistKind; items: ChecklistTemplateItem[]; onClose: () => void }) {
  const { busy, go } = useRun();
  const [list, setList] = React.useState(items);
  const owners = Object.entries(CHECKLIST_OWNER_LABELS).map(([value, label]) => ({ value, label }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{CHECKLIST_KIND_LABELS[kind]} checklist</DialogTitle>
          <DialogDescription>Applies to checklists started from now on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {list.map((i, n) => (
            <div key={i.key} className="grid grid-cols-[1fr_9rem_auto] gap-2">
              <Input value={i.label} onChange={(e) => setList(list.map((x, j) => (j === n ? { ...x, label: e.target.value } : x)))} aria-label={`Line ${n + 1}`} />
              <SimpleSelect value={i.owner} onChange={(v) => setList(list.map((x, j) => (j === n ? { ...x, owner: v as ChecklistOwner } : x)))} options={owners} />
              <Button size="icon-sm" variant="ghost" aria-label="Remove line" onClick={() => setList(list.filter((_, j) => j !== n))}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setList([...list, { key: `n${Date.now()}`, label: "", owner: "hr" }])}>
            <PlusIcon /> Add line
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={async () => (await go(() => saveChecklistTemplateAction(kind, list), "Checklist saved")) && onClose()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
