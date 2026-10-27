"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Combobox } from "@/components/app/multi-select";
import { itemAction, requirementsAction, type ItemActionInput } from "@/app/actions/items";
import { askQuestionAction } from "@/app/actions/collab";
import {
  ASSET_KIND_LABELS,
  BLOCKER_CAUSE_LABELS,
  NEXT_STAGE,
  REDO_LABELS,
  RETURN_REASON_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  STAGES,
  type AssetKind,
  type Role,
  type Stage,
} from "@/lib/domain";
import { DEFAULT_TZ, isoToLocalInput, localInputToIso, endOfLocalDayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ItemRef = {
  id: string;
  code: string;
  title: string;
  version?: number;
  stage?: Stage | null;
  status?: string | null;
};

export type DialogKind =
  | "block"
  | "unblock"
  | "pause"
  | "submit"
  | "accept"
  | "return"
  | "reopen"
  | "review"
  | "schedule"
  | "live"
  | "releaseFailed"
  | "upload"
  | "assign"
  | "deadline"
  | "close"
  | "revision"
  | "asset"
  | "release"
  | "redo"
  | "question";

type Requirement = { key: string; label: string; met: boolean };
type ReqInfo = {
  requirements: Requirement[];
  version: number;
  stage: Stage | null;
  status: string | null;
  substate: string | null;
  lifecycle: string;
  ownerId: string | null;
  targets: { platform: string; required: boolean; uploadStatus: string; releaseStatus: string; externalId: string | null; uploadUrl: string | null; liveUrl: string | null; playback: boolean; metadata: boolean }[];
  canPublish: boolean;
  hasApproval: boolean;
};

type Ctx = {
  run: (item: ItemRef, input: ItemActionInput, opts?: { source?: "ui" | "sheet" | "board"; silent?: boolean; successMessage?: string }) => Promise<boolean>;
  open: (kind: DialogKind, item: ItemRef, preset?: Record<string, unknown>) => void;
  users: { id: string; name: string; roles: Role[] }[];
  destinations: { key: string; label: string }[];
  isManager: boolean;
  timezone: string;
};

const ActionContext = React.createContext<Ctx | null>(null);

export function useActions() {
  const ctx = React.useContext(ActionContext);
  if (!ctx) throw new Error("useActions must be used inside ActionCenter");
  return ctx;
}

const SUCCESS: Partial<Record<ItemActionInput["action"], string>> = {
  release: "Queued",
  start: "Timer started",
  pause: "Paused",
  block: "Marked blocked; the resolver and managers were notified",
  unblock: "Blocker cleared",
  submit: "Handoff submitted; the next owner was notified",
  accept: "Handoff accepted; the next stage is queued",
  return: "Returned with your reason",
  reopen: "Earlier stage reopened",
  asset: "File linked",
  upload: "Upload status recorded",
  verify: "Verification updated",
  review: "Review recorded",
  schedule: "Release scheduled. Scheduled is not live until confirmed.",
  live: "Live release confirmed",
  releaseFailed: "Release failure recorded",
  assign: "Owner updated",
  deadline: "Deadline changed; the original deadline is preserved",
  close: "Item closed",
  restore: "Item restored",
  revision: "Revision workflow started",
};

export function ActionCenter({
  children,
  users,
  destinations,
  isManager,
  timezone = DEFAULT_TZ,
}: {
  children: React.ReactNode;
  users: { id: string; name: string; roles: Role[] }[];
  destinations: { key: string; label: string }[];
  isManager: boolean;
  timezone?: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ kind: DialogKind; item: ItemRef; preset?: Record<string, unknown> } | null>(null);
  const [missing, setMissing] = React.useState<{ item: ItemRef; list: Requirement[]; message: string } | null>(null);
  const [conflict, setConflict] = React.useState<{ item: ItemRef; message: string } | null>(null);
  const [switchPrompt, setSwitchPrompt] = React.useState<{ item: ItemRef; code: string; otherId: string } | null>(null);

  const run = React.useCallback<Ctx["run"]>(
    async (item, input, opts = {}) => {
      const requestId = crypto.randomUUID();
      const res = await itemAction(item.id, input, { expectedVersion: item.version, requestId, source: opts.source });
      if (res.ok) {
        if (!opts.silent) toast.success(opts.successMessage ?? SUCCESS[input.action] ?? "Saved", { description: `${item.code}` });
        router.refresh();
        return true;
      }
      if (res.code === "REQUIREMENTS_MISSING") {
        setMissing({ item, list: (res.details as Requirement[]) ?? [], message: res.error });
        return false;
      }
      if (res.code === "CONFLICT") {
        setConflict({ item, message: res.error });
        return false;
      }
      if (res.code === "ACTIVE_SESSION_ELSEWHERE") {
        const d = res.details as { itemId: string; code: string };
        setSwitchPrompt({ item, code: d.code, otherId: d.itemId });
        return false;
      }
      toast.error(res.error, { description: item.code });
      return false;
    },
    [router],
  );

  const open = React.useCallback<Ctx["open"]>((kind, item, preset) => setDialog({ kind, item, preset }), []);
  const value = React.useMemo(() => ({ run, open, users, destinations, isManager, timezone }), [run, open, users, destinations, isManager, timezone]);

  return (
    <ActionContext.Provider value={value}>
      {children}
      {dialog && <ActionDialog key={`${dialog.kind}-${dialog.item.id}`} {...dialog} onClose={() => setDialog(null)} />}
      <Dialog open={!!missing} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Required evidence is missing</DialogTitle>
            <DialogDescription>
              {missing?.message} The move was not made; nothing changed for {missing?.item.code}.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {missing?.list.map((r) => (
              <li key={r.key} className="flex items-start gap-2 text-sm">
                {r.met ? <CheckCircle2Icon className="mt-0.5 size-4 text-[var(--st-done-fg)]" /> : <CircleIcon className="mt-0.5 size-4 text-[var(--st-blocked-fg)]" />}
                <span className={cn(r.met && "text-muted-foreground line-through")}>{r.label}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissing(null)}>
              Close
            </Button>
            {missing && (
              <Button asChild>
                <Link href={`/items/${missing.item.id}?tab=workflow`} onClick={() => setMissing(null)}>
                  Open item to complete
                </Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This item changed while you were working</DialogTitle>
            <DialogDescription>{conflict?.message} Your change was not saved, so nothing was overwritten.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setConflict(null);
                router.refresh();
              }}
            >
              Load latest values
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!switchPrompt} onOpenChange={(o) => !o && setSwitchPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You already have a running timer</DialogTitle>
            <DialogDescription>
              Your timer on {switchPrompt?.code} is still running. One person keeps one timer at a time so effort stays accurate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" asChild>
              <Link href={`/items/${switchPrompt?.otherId}`} onClick={() => setSwitchPrompt(null)}>
                Open {switchPrompt?.code}
              </Link>
            </Button>
            <Button
              onClick={async () => {
                const s = switchPrompt!;
                setSwitchPrompt(null);
                await run({ ...s.item, version: undefined }, { action: "start", switchFrom: true }, { successMessage: `Paused ${s.code} and started here` });
              }}
            >
              Pause it and start here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ActionContext.Provider>
  );
}

function useReq(itemId: string, enabled = true) {
  const [info, setInfo] = React.useState<ReqInfo | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    requirementsAction(itemId).then((r) => {
      if (alive && r.ok) setInfo(r.data as ReqInfo);
    });
    return () => {
      alive = false;
    };
  }, [itemId, enabled]);
  return info;
}

function Field({ label, children, hint, htmlFor }: { label: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReasonSelect({ value, onChange, labels }: { value: string; onChange: (v: string) => void; labels: Record<string, string> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a reason" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(labels).map(([k, l]) => (
          <SelectItem key={k} value={k}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RequirementList({ list }: { list: Requirement[] }) {
  if (!list.length) return <p className="text-xs text-muted-foreground">No additional evidence is required for this step.</p>;
  return (
    <ul className="space-y-1 rounded-lg border bg-muted/30 p-3">
      {list.map((r) => (
        <li key={r.key} className="flex items-start gap-2 text-sm">
          {r.met ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[var(--st-done-fg)]" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-[var(--st-blocked-fg)]" />}
          <span className={cn(r.met ? "text-muted-foreground" : "font-medium")}>{r.label}</span>
          <span className="sr-only">{r.met ? "complete" : "missing"}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionDialog({ kind, item, preset, onClose }: { kind: DialogKind; item: ItemRef; preset?: Record<string, unknown>; onClose: () => void }) {
  const { run, users, destinations, isManager, timezone } = useActions();
  const needsInfo = ["submit", "accept", "live", "upload", "releaseFailed", "review", "schedule", "reopen", "block", "assign", "redo"].includes(kind);
  const info = useReq(item.id, needsInfo);
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState<Record<string, unknown>>({ ...preset });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const str = (k: string) => (f[k] as string) ?? "";
  const stage = (info?.stage ?? item.stage ?? null) as Stage | null;
  const destLabel = (k: string) => destinations.find((d) => d.key === k)?.label ?? k;
  const userOpts = (role?: Role) =>
    users.filter((u) => !role || u.roles.includes(role)).map((u) => ({ value: u.id, label: u.name, hint: u.roles.map((r) => ROLE_LABELS[r]).join(", ") }));

  const submit = async (input: ItemActionInput) => {
    setBusy(true);
    const ok = await run({ ...item, version: info?.version ?? item.version }, input);
    setBusy(false);
    if (ok) onClose();
  };

  let title = "";
  let description: React.ReactNode = null;
  let body: React.ReactNode = null;
  let confirm: { label: string; disabled?: boolean; onClick: () => void; destructive?: boolean } | null = null;

  switch (kind) {
    case "release":
      title = "Queue for Recording";
      description = "The item enters the To do queue of the chosen stage and its production lead time starts now. Staff still press Start when they begin.";
      body = (
        <Field label="Start at stage" hint="Most lessons start at Recording. Worksheets or re-edits can start later.">
          <Select value={str("startStage") || "recording"} onValueChange={(v) => set("startStage", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
      confirm = { label: "Queue", onClick: () => submit({ action: "release", startStage: (str("startStage") || "recording") as Stage }) };
      break;
    case "pause":
      title = "Pause work";
      description = "Pausing stops your timer. The stage shows as paused until someone resumes.";
      body = (
        <Field label="Reason (optional)">
          <Select value={str("reason")} onValueChange={(v) => set("reason", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose or leave blank" />
            </SelectTrigger>
            <SelectContent>
              {["End of day", "Break", "Meeting", "Switching to urgent work", "Waiting for feedback"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
      confirm = { label: "Pause", onClick: () => submit({ action: "pause", reason: str("reason") || undefined }) };
      break;
    case "block":
      title = "Mark blocked";
      description = "Blocked time is tracked separately from active work and the due date does not move automatically.";
      body = (
        <div className="space-y-3">
          <Field label="Cause">
            <ReasonSelect value={str("cause")} onChange={(v) => set("cause", v)} labels={BLOCKER_CAUSE_LABELS} />
          </Field>
          <Field label="What is needed" htmlFor="blk-note">
            <Textarea id="blk-note" value={str("note")} onChange={(e) => set("note", e.target.value)} placeholder="Replacement audio for minutes 6 to 9" />
          </Field>
          <Field label="Who can resolve it (optional)" hint="They are notified and can clear the blocker.">
            <Combobox options={userOpts()} value={(f.resolverId as string) ?? null} onChange={(v) => set("resolverId", v)} placeholder="Choose a person" />
          </Field>
        </div>
      );
      confirm = { label: "Mark blocked", disabled: !str("cause"), onClick: () => submit({ action: "block", cause: str("cause"), note: str("note"), resolverId: (f.resolverId as string) ?? null }) };
      break;
    case "unblock":
      title = "Clear blocker";
      description = "Record how it was resolved. Blocked time stops now.";
      body = (
        <div className="space-y-3">
          <Field label="Resolution" htmlFor="ub-res">
            <Textarea id="ub-res" value={str("resolution")} onChange={(e) => set("resolution", e.target.value)} placeholder="Audio received from the studio" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.resume !== false} onCheckedChange={(v) => set("resume", !!v)} /> Resume my timer now (if I own this stage)
          </label>
        </div>
      );
      confirm = { label: "Clear blocker", onClick: () => submit({ action: "unblock", resolution: str("resolution"), resume: f.resume !== false }) };
      break;
    case "submit": {
      const next = stage ? NEXT_STAGE[stage] : null;
      const missingCount = info?.requirements.filter((r) => !r.met).length ?? 0;
      title = `Submit handoff to ${next ? STAGE_LABELS[next] : "next stage"}`;
      description = "Submitting closes your active work and asks the receiving owner to accept or return it.";
      body = (
        <div className="space-y-3">
          {!info ? <Loader2Icon className="size-4 animate-spin" /> : <RequirementList list={info.requirements} />}
          {missingCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--st-blocked-fg)]">
              <TriangleAlertIcon className="size-3.5" /> {missingCount} requirement{missingCount === 1 ? "" : "s"} still missing. Complete them on the item page.
            </p>
          )}
          <Field label="Note for the receiver (optional)" htmlFor="sub-note">
            <Textarea id="sub-note" value={str("note")} onChange={(e) => set("note", e.target.value)} placeholder="Board camera starts at 02:10" />
          </Field>
        </div>
      );
      confirm = { label: "Submit handoff", disabled: !info || missingCount > 0, onClick: () => submit({ action: "submit", note: str("note") || undefined }) };
      break;
    }
    case "accept":
      title = "Accept handoff";
      description = "Accepting completes the previous stage and opens yours as Queued in one step. Your timer does not start until you press Start.";
      body = (
        <Field label="Note (optional)" htmlFor="acc-note">
          <Textarea id="acc-note" value={str("note")} onChange={(e) => set("note", e.target.value)} />
        </Field>
      );
      confirm = { label: "Accept", onClick: () => submit({ action: "accept", note: str("note") || undefined }) };
      break;
    case "return":
      title = "Return handoff";
      description = "The submitting stage gets a new attempt with your reason. History of the returned attempt is kept.";
      body = (
        <div className="space-y-3">
          <Field label="Reason category">
            <ReasonSelect value={str("reasonCategory")} onChange={(v) => set("reasonCategory", v)} labels={RETURN_REASON_LABELS} />
          </Field>
          <Field label="What must change" htmlFor="ret-note" hint="Be specific; include timecodes where useful.">
            <Textarea id="ret-note" value={str("note")} onChange={(e) => set("note", e.target.value)} placeholder="Audio drops at 04:12; please re-export" />
          </Field>
        </div>
      );
      confirm = { label: "Return work", destructive: true, disabled: !str("reasonCategory") || !str("note").trim(), onClick: () => submit({ action: "return", reasonCategory: str("reasonCategory"), note: str("note") }) };
      break;
    case "reopen": {
      const earlier = stage ? STAGES.slice(0, STAGES.indexOf(stage)) : [];
      title = "Request changes upstream";
      description = "Reopens an earlier stage as a new attempt. Later work is held, and approvals tied to replaced files become invalid.";
      body = (
        <div className="space-y-3">
          <Field label="Reopen stage">
            <Select value={str("target")} onValueChange={(v) => set("target", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose the stage that must change" />
              </SelectTrigger>
              <SelectContent>
                {earlier.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reason category">
            <ReasonSelect value={str("reasonCategory")} onChange={(v) => set("reasonCategory", v)} labels={RETURN_REASON_LABELS} />
          </Field>
          <Field label="What must change" htmlFor="ro-note">
            <Textarea id="ro-note" value={str("note")} onChange={(e) => set("note", e.target.value)} />
          </Field>
        </div>
      );
      confirm = {
        label: "Reopen stage",
        destructive: true,
        disabled: !str("target") || !str("reasonCategory") || !str("note").trim(),
        onClick: () => submit({ action: "reopen", target: str("target") as Stage, reasonCategory: str("reasonCategory"), note: str("note") }),
      };
      break;
    }
    case "redo": {
      // A waiting handoff can be sent back to the stage that submitted it; any earlier stage can be reopened.
      const waiting = info?.status === "awaiting_handoff" && stage ? [stage] : [];
      const targets = [...waiting, ...(stage ? STAGES.slice(0, STAGES.indexOf(stage)) : [])].filter((s, i, a) => a.indexOf(s) === i);
      title = "Request a redo";
      description = "Asks the team to do the work again (a retake, re-edit, re-upload or re-publish). The request is posted in that team's chat with a link to this item, and its team lead is notified.";
      body = (
        <div className="space-y-3">
          <Field label="What needs to be redone">
            <RadioGroup value={str("target")} onValueChange={(v) => set("target", v)} className="gap-2">
              {targets.map((s) => (
                <label key={s} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <RadioGroupItem value={s} /> {REDO_LABELS[s]} <span className="text-xs text-muted-foreground">({STAGE_LABELS[s]} team)</span>
                </label>
              ))}
              {!targets.length && <p className="text-sm text-muted-foreground">Nothing can be sent back from this stage yet.</p>}
            </RadioGroup>
          </Field>
          <Field label="Reason">
            <ReasonSelect value={str("reasonCategory")} onChange={(v) => set("reasonCategory", v)} labels={RETURN_REASON_LABELS} />
          </Field>
          <Field label="What is wrong and what to do" htmlFor="rd-note" hint="Be specific, for example a timecode or the camera code to retake.">
            <Textarea id="rd-note" value={str("note")} onChange={(e) => set("note", e.target.value)} />
          </Field>
        </div>
      );
      confirm = {
        label: "Send request",
        destructive: true,
        disabled: !str("target") || !str("reasonCategory") || !str("note").trim(),
        onClick: () => submit({ action: "redo", target: str("target") as Stage, reasonCategory: str("reasonCategory"), note: str("note") }),
      };
      break;
    }
    case "question": {
      title = "Ask a question";
      description = "Sends a tracked question to the person you choose. It appears in their notifications, in Questions and in your direct chat with them.";
      body = (
        <div className="space-y-3">
          <Field label="Ask">
            <Combobox options={userOpts()} value={(f.ownerId as string) ?? null} onChange={(v) => set("ownerId", v)} placeholder="Choose a person" />
          </Field>
          <Field label="Question" htmlFor="q-text">
            <Textarea id="q-text" value={str("question")} onChange={(e) => set("question", e.target.value)} />
          </Field>
        </div>
      );
      confirm = {
        label: "Send question",
        disabled: !str("ownerId") || !str("question").trim(),
        onClick: async () => {
          setBusy(true);
          const r = await askQuestionAction({ itemId: item.id, ownerId: str("ownerId"), question: str("question"), stage: item.stage ?? null });
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Question sent");
          onClose();
        },
      };
      break;
    }
    case "review": {
      const decision = str("decision") || "approved";
      const checks = info?.requirements.filter((r) => r.key.startsWith("check:")) ?? [];
      title = "Publication review";
      description = "Record the educational and placement review. Approval applies only to the current master version.";
      body = (
        <div className="space-y-3">
          <RadioGroup value={decision} onValueChange={(v) => set("decision", v)} className="grid grid-cols-2 gap-2">
            {[
              ["approved", "Approve"],
              ["changes_requested", "Request changes"],
            ].map(([v, l]) => (
              <label key={v} className={cn("flex items-center gap-2 rounded-lg border p-2.5 text-sm", decision === v && "border-primary bg-accent/40")}>
                <RadioGroupItem value={v} /> {l}
              </label>
            ))}
          </RadioGroup>
          {decision === "approved" && <RequirementList list={checks} />}
          {decision === "changes_requested" && (
            <>
              <Field label="Reason category">
                <ReasonSelect value={str("reasonCategory")} onChange={(v) => set("reasonCategory", v)} labels={RETURN_REASON_LABELS} />
              </Field>
              <Field label="Send back to">
                <Select value={str("returnTo") || "none"} onValueChange={(v) => set("returnTo", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keep in Publication (fix metadata here)</SelectItem>
                    <SelectItem value="uploading">Uploading</SelectItem>
                    <SelectItem value="editing">Editing</SelectItem>
                    <SelectItem value="recording">Recording</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <Field label={decision === "approved" ? "Note (optional)" : "What must change"} htmlFor="rv-note">
            <Textarea id="rv-note" value={str("note")} onChange={(e) => set("note", e.target.value)} />
          </Field>
          {isManager && decision === "approved" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!f.managerApproval} onCheckedChange={(v) => set("managerApproval", !!v)} /> Record as manager approval (policy step)
            </label>
          )}
        </div>
      );
      confirm = {
        label: decision === "approved" ? "Record approval" : "Request changes",
        destructive: decision !== "approved",
        disabled: decision !== "approved" && (!str("note").trim() || !str("reasonCategory")),
        onClick: () =>
          submit({
            action: "review",
            decision: decision as "approved" | "changes_requested",
            reasonCategory: str("reasonCategory") || undefined,
            note: str("note") || undefined,
            returnTo: str("returnTo") && str("returnTo") !== "none" ? (str("returnTo") as Stage) : null,
            managerApproval: !!f.managerApproval,
          }),
      };
      break;
    }
    case "schedule":
      title = "Schedule release";
      description = `Scheduled is a plan, not a release. Confirm each destination live after it happens. Times are in ${timezone}.`;
      body = (
        <Field label="Release time" htmlFor="sch-at">
          <Input id="sch-at" type="datetime-local" value={str("at")} onChange={(e) => set("at", e.target.value)} />
        </Field>
      );
      confirm = { label: "Schedule", disabled: !str("at") || (info ? !info.hasApproval : true), onClick: () => submit({ action: "schedule", scheduledAt: localInputToIso(str("at"), timezone)! }) };
      if (info && !info.hasApproval) description = "Record the final approval before scheduling.";
      break;
    case "live": {
      const pending = info?.targets.filter((t) => t.releaseStatus !== "live") ?? [];
      const platform = str("platform") || pending[0]?.platform || "";
      const override = info && !info.canPublish;
      title = "Confirm live release";
      description = "Enter the verified live link. Published is recorded only when every required destination is confirmed live.";
      body = (
        <div className="space-y-3">
          {!info ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
              {info.targets.map((t) => (
                <li key={t.platform} className="flex items-center justify-between gap-2">
                  <span>
                    {destLabel(t.platform)} <span className="text-xs text-muted-foreground">{t.required ? "required" : "optional"}</span>
                  </span>
                  <span className={cn("text-xs", t.releaseStatus === "live" ? "text-[var(--st-done-fg)]" : "text-muted-foreground")}>{t.releaseStatus}</span>
                </li>
              ))}
            </ul>
          )}
          <Field label="Destination">
            <Select value={platform} onValueChange={(v) => set("platform", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {pending.map((t) => (
                  <SelectItem key={t.platform} value={t.platform}>
                    {destLabel(t.platform)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Confirmed live link" htmlFor="live-url">
            <Input id="live-url" value={str("liveUrl")} onChange={(e) => set("liveUrl", e.target.value)} placeholder="https://" inputMode="url" />
          </Field>
          <Field label="Actual platform release time (optional)" hint="Leave blank to use now. Verification time is always recorded separately." htmlFor="live-at">
            <Input id="live-at" type="datetime-local" value={str("at")} onChange={(e) => set("at", e.target.value)} />
          </Field>
          {override && (
            <Field label="Emergency release reason (manager override)" htmlFor="live-ovr" hint="You do not hold the Publication role. This override is recorded in the audit history.">
              <Textarea id="live-ovr" value={str("override")} onChange={(e) => set("override", e.target.value)} />
            </Field>
          )}
        </div>
      );
      confirm = {
        label: "Confirm live",
        disabled: !platform || !/^https?:\/\//.test(str("liveUrl")) || (!!override && !str("override").trim()),
        onClick: () =>
          submit({ action: "live", platform, liveUrl: str("liveUrl"), publishedAt: str("at") ? localInputToIso(str("at"), timezone) : null, overrideReason: str("override") || undefined }),
      };
      break;
    }
    case "releaseFailed": {
      const platform = str("platform") || info?.targets[0]?.platform || "";
      title = "Report failed release";
      description = "The item stays in Publication with a Failed release status until it is retried and confirmed.";
      body = (
        <div className="space-y-3">
          <Field label="Destination">
            <Select value={platform} onValueChange={(v) => set("platform", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {info?.targets.map((t) => (
                  <SelectItem key={t.platform} value={t.platform}>
                    {destLabel(t.platform)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="What happened" htmlFor="rf-reason">
            <Textarea id="rf-reason" value={str("reason")} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        </div>
      );
      confirm = { label: "Record failure", destructive: true, disabled: !platform || !str("reason").trim(), onClick: () => submit({ action: "releaseFailed", platform, reason: str("reason") }) };
      break;
    }
    case "upload": {
      const platform = str("platform") || info?.targets.find((t) => t.required && t.uploadStatus !== "uploaded")?.platform || info?.targets[0]?.platform || "";
      const status = str("status") || "uploaded";
      title = "Record upload";
      description = "Uploaded means transfer, processing and the destination ID are complete. It never means published.";
      body = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Destination">
              <Select value={platform} onValueChange={(v) => set("platform", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {info?.targets.map((t) => (
                    <SelectItem key={t.platform} value={t.platform}>
                      {destLabel(t.platform)} {t.required ? "" : "(optional)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploading">Uploading</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Destination item ID" htmlFor="up-id">
            <Input id="up-id" value={str("externalId")} onChange={(e) => set("externalId", e.target.value)} placeholder="YT-482910" />
          </Field>
          <Field label="Destination link" htmlFor="up-url">
            <Input id="up-url" value={str("uploadUrl")} onChange={(e) => set("uploadUrl", e.target.value)} placeholder="https://" />
          </Field>
          {status === "failed" && (
            <Field label="Failure reason" htmlFor="up-fail">
              <Textarea id="up-fail" value={str("failureReason")} onChange={(e) => set("failureReason", e.target.value)} />
            </Field>
          )}
        </div>
      );
      confirm = {
        label: "Save upload status",
        disabled: !platform || (status === "failed" && !str("failureReason").trim()),
        onClick: () =>
          submit({
            action: "upload",
            platform,
            status: status as "uploading" | "processing" | "uploaded" | "failed",
            externalId: str("externalId") || undefined,
            uploadUrl: str("uploadUrl") || undefined,
            failureReason: str("failureReason") || undefined,
          }),
      };
      break;
    }
    case "assign": {
      const st = (str("stage") || stage || "recording") as Stage;
      title = "Assign owner";
      description = "Reassignment keeps the previous owner and your reason in the history.";
      body = (
        <div className="space-y-3">
          <Field label="Stage">
            <Select value={st} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Owner" hint="Only people holding this stage role are listed.">
            <Combobox options={userOpts(st)} value={(f.userId as string) ?? null} onChange={(v) => set("userId", v)} placeholder="Unassigned" />
          </Field>
          <Field label="Reason (optional)" htmlFor="as-reason">
            <Input id="as-reason" value={str("reason")} onChange={(e) => set("reason", e.target.value)} placeholder="Balancing workload" />
          </Field>
        </div>
      );
      confirm = { label: "Assign", onClick: () => submit({ action: "assign", stage: st, userId: (f.userId as string) ?? null, reason: str("reason") || undefined }) };
      break;
    }
    case "deadline":
      title = "Change deadline";
      description = "The original deadline stays as the baseline for reporting. A reason is required.";
      body = (
        <div className="space-y-3">
          <Field label="New due date" htmlFor="dl-date">
            <Input id="dl-date" type="date" value={str("date")} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="dl-reason">
            <Textarea id="dl-reason" value={str("reason")} onChange={(e) => set("reason", e.target.value)} placeholder="Presenter rescheduled the recording" />
          </Field>
        </div>
      );
      confirm = { label: "Change deadline", disabled: !str("reason").trim(), onClick: () => submit({ action: "deadline", dueAt: str("date") ? endOfLocalDayIso(str("date"), timezone) : null, reason: str("reason") }) };
      break;
    case "close":
      title = "Archive or cancel";
      description = "Closed items are excluded from completed-work counts but remain fully auditable and can be restored.";
      body = (
        <div className="space-y-3">
          <RadioGroup value={str("lifecycle") || "cancelled"} onValueChange={(v) => set("lifecycle", v)} className="grid grid-cols-2 gap-2">
            {[
              ["cancelled", "Cancel"],
              ["archived", "Archive"],
            ].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <RadioGroupItem value={v} /> {l}
              </label>
            ))}
          </RadioGroup>
          <Field label="Reason" htmlFor="cl-reason">
            <Textarea id="cl-reason" value={str("reason")} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        </div>
      );
      confirm = { label: "Close item", destructive: true, disabled: !str("reason").trim(), onClick: () => submit({ action: "close", lifecycle: (str("lifecycle") || "cancelled") as "archived" | "cancelled", reason: str("reason") }) };
      break;
    case "revision":
      title = "Start a post-publication revision";
      description = "Creates a linked revision item. The current live version stays published until a replacement is verified.";
      body = (
        <div className="space-y-3">
          <Field label="Why is a revision needed" htmlFor="rev-reason">
            <Textarea id="rev-reason" value={str("reason")} onChange={(e) => set("reason", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start at stage">
              <Select value={str("startStage") || "editing"} onValueChange={(v) => set("startStage", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="rev-due">
              <Input id="rev-due" type="date" value={str("due")} onChange={(e) => set("due", e.target.value)} />
            </Field>
          </div>
        </div>
      );
      confirm = {
        label: "Start revision",
        disabled: !str("reason").trim(),
        onClick: () => submit({ action: "revision", reason: str("reason"), startStage: (str("startStage") || "editing") as Stage, dueAt: str("due") ? endOfLocalDayIso(str("due"), timezone) : null }),
      };
      break;
    case "asset": {
      const kind = (str("kind") || "master") as AssetKind;
      const recording = kind === "raw" || kind === "take_notes";
      title = recording ? "Log a recording" : "Link a file";
      description = recording
        ? "Identify the recording by its camera code (for example C001), a storage link, or both. Each camera shot is logged separately."
        : "Link the file in shared storage. A new version supersedes the previous one; approvals tied to an older master become invalid.";
      body = (
        <div className="space-y-3">
          <Field label="File type">
            <Select value={kind} onValueChange={(v) => set("kind", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASSET_KIND_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {recording && (
            <Field label="Camera code" htmlFor="as-cam" hint="As written on the camera card, for example C001. Separate several with spaces.">
              <Input id="as-cam" value={str("cameraCode")} onChange={(e) => set("cameraCode", e.target.value.toUpperCase())} placeholder="C001" className="font-mono" />
            </Field>
          )}
          <Field label={recording ? "Storage link (optional)" : "Storage link"} htmlFor="as-url" hint="https://, a network path, or another storage URL your team uses.">
            <Input id="as-url" value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://drive.example.com/..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={recording ? "Title" : "Label (optional)"} htmlFor="as-label">
              <Input id="as-label" value={str("label")} onChange={(e) => set("label", e.target.value)} placeholder={recording ? "Introduction and core concepts" : "Main camera"} />
            </Field>
            {(kind === "raw" || kind === "master") && (
              <Field label="Duration (min)" htmlFor="as-dur">
                <Input id="as-dur" type="number" min={0} step="0.5" value={str("duration")} onChange={(e) => set("duration", e.target.value)} />
              </Field>
            )}
          </div>
          <Field label={recording ? "Description (optional)" : "Notes (optional)"} htmlFor="as-notes">
            <Textarea id="as-notes" value={str("notes")} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      );
      confirm = {
        label: recording ? "Log recording" : "Link file",
        disabled: recording ? !str("url").trim() && !str("cameraCode").trim() : !str("url").trim(),
        onClick: () =>
          submit({
            action: "asset",
            kind,
            url: str("url") || null,
            cameraCode: recording ? str("cameraCode") || null : null,
            label: str("label") || undefined,
            durationMin: str("duration") ? Number(str("duration")) : null,
            notes: str("notes") || undefined,
          }),
      };
      break;
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{item.code}</span> {item.title}
            {description && <span className="mt-1 block">{description}</span>}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {confirm && (
            <Button variant={confirm.destructive ? "destructive" : "default"} disabled={busy || confirm.disabled} onClick={confirm.onClick}>
              {busy && <Loader2Icon className="animate-spin" />}
              {confirm.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isoForInput(iso: string | null | undefined, tz = DEFAULT_TZ) {
  return isoToLocalInput(iso, tz);
}
