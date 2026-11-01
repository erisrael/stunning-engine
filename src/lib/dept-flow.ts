// The flow a department's tasks go through (Configure, Flow), shared by the server and the browser. It is the same
// loop production teams work in: the lead assigns, members start, fill in the card, mark it done and send it; the
// lead approves or returns it; only finished work moves on to the next stage, where it may have to be accepted.
//
// Each stage is one status of the department (so the Board, List and reports keep working), and has a kind:
//   intake   leads triage new work (priority, sprint, person) and plan it into the next stage;
//   work     the assignee does it: To do, In progress, Done not sent, With lead (when the lead reviews);
//   check    leads or named people (a tech lead, testers) pass it on or return it with a note;
//   release  leads group finished work into a release with notes;
//   final    the end; nothing more to do.

import type { ChecklistLine, DeptConfig, DeptField, DeptStatus, StatusCategory } from "./dept-config";

export const STAGE_KINDS = ["intake", "work", "check", "release", "final"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];
export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  intake: "Intake (leads triage and plan)",
  work: "Work (the assignee does it)",
  check: "Check (pass on or return)",
  release: "Release (grouped, with notes)",
  final: "End",
};

export type FlowStage = {
  status: string;
  kind: StageKind;
  // Work stages: the status while not started yet (for example To do), so the Board shows it truthfully.
  queueStatus: string | null;
  // Check stages: department leads, or the people named (testers).
  checkers: "leads" | "people";
  people: string[];
  // Work stages: the lead approves before it moves on (approve, or return with a note).
  review: boolean;
  // Work arriving here waits to be accepted (or sent back as missing).
  accept: boolean;
  // Work stages: every checklist line ticked (and verified) before Done.
  needChecklist: boolean;
  // Where it goes next (a status of another stage), or nowhere: the work is then finished.
  next: string | null;
  // Also hand it to another department, as a request there.
  nextDept: string | null;
  // Who has it when it arrives (work stages): the same person, nobody (the lead assigns), or a named person.
  receiver: "keep" | "lead" | string;
  // A target in days per stage, and how many tasks one person may have in progress here at once.
  days: number | null;
  wip: number | null;
  // The stage's own steps, shown on Home.
  steps: string[];
  // Check stages: returning asks for steps to reproduce and marks it as a bug; and the stage it returns to.
  returnAsBug: boolean;
  returnTo: string | null;
  // Moves on by itself when a GitHub pull request naming the task is merged.
  autoOnMerge: boolean;
};

export type DeptFlow = { on: boolean; stages: FlowStage[] };

// Where a task is inside its stage. Stored on the task; null means "work it out from the status".
export const FLOW_STATES = ["todo", "working", "done", "sent", "ready", "arriving"] as const;
export type FlowState = (typeof FLOW_STATES)[number];
export const FLOW_STATE_LABELS: Record<FlowState, string> = {
  todo: "To do",
  working: "In progress",
  done: "Done, not sent",
  sent: "With the lead",
  ready: "Ready to hand over",
  arriving: "Arriving",
};

export const NO_FLOW: DeptFlow = { on: false, stages: [] };

export function blankStage(status: string, kind: StageKind = "work"): FlowStage {
  return {
    status,
    kind,
    queueStatus: null,
    checkers: "leads",
    people: [],
    review: false,
    accept: false,
    needChecklist: kind === "work",
    next: null,
    nextDept: null,
    receiver: "keep",
    days: null,
    wip: null,
    steps: [],
    returnAsBug: false,
    returnTo: null,
    autoOnMerge: false,
  };
}

// The stage a status belongs to (as its main status, or as the queue of a work stage).
export function stageFor(flow: DeptFlow, status: string): FlowStage | null {
  if (!flow.on) return null;
  return flow.stages.find((s) => s.status === status || s.queueStatus === status) ?? null;
}

// The state of a task that has none stored (made before the flow was switched on, or moved by hand).
export function effectiveState(stage: FlowStage | null, status: string, stored: string | null): FlowState | null {
  if (!stage || stage.kind === "final") return null;
  if (stored && (FLOW_STATES as readonly string[]).includes(stored)) return stored as FlowState;
  if (stage.kind === "work") return stage.queueStatus && status === stage.queueStatus ? "todo" : stage.queueStatus ? "working" : "todo";
  return "todo";
}

// The status a task gets when it enters a stage.
export const entryStatus = (s: FlowStage) => (s.kind === "work" && s.queueStatus ? s.queueStatus : s.status);

// The stage work returns to from a check (the one named, else the nearest work stage before it).
export function returnStage(flow: DeptFlow, from: FlowStage): FlowStage | null {
  if (from.returnTo) {
    const s = flow.stages.find((x) => x.status === from.returnTo);
    if (s) return s;
  }
  let cur: FlowStage | undefined = from;
  for (let i = 0; i < flow.stages.length && cur; i++) {
    const prev: FlowStage | undefined = flow.stages.find((x) => x.next === cur!.status);
    if (!prev) return null;
    if (prev.kind === "work") return prev;
    cur = prev;
  }
  return null;
}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const posInt = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return v != null && v !== "" && Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};

// Cleans the flow from the editor and checks it can work. Throws a plain message.
// deptKeys: the departments a stage may hand work to (left out: not checked here).
export function normalizeFlow(raw: unknown, statuses: DeptStatus[], deptKeys?: string[]): DeptFlow {
  if (!raw || typeof raw !== "object") return { ...NO_FLOW };
  const r = raw as Record<string, unknown>;
  const keys = statuses.map((s) => s.key);
  const label = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;
  const used = new Set<string>();
  const stages: FlowStage[] = [];
  for (const x of Array.isArray(r.stages) ? r.stages.slice(0, 20) : []) {
    if (!x || typeof x !== "object") continue;
    const s = x as Record<string, unknown>;
    const status = str(s.status, 32);
    if (!keys.includes(status)) throw new Error(`Flow: the status "${status}" does not exist.`);
    const kind = (STAGE_KINDS as readonly string[]).includes(s.kind as string) ? (s.kind as StageKind) : "work";
    let queueStatus = kind === "work" ? str(s.queueStatus, 32) || null : null;
    if (queueStatus === status) queueStatus = null;
    if (queueStatus && !keys.includes(queueStatus)) throw new Error(`Flow: the status "${queueStatus}" does not exist.`);
    for (const k of [status, queueStatus]) {
      if (!k) continue;
      if (used.has(k)) throw new Error(`Flow: ${label(k)} is used by two stages. Each status belongs to one stage at most.`);
      used.add(k);
    }
    const receiver = str(s.receiver, 40);
    stages.push({
      status,
      kind,
      queueStatus,
      checkers: s.checkers === "people" ? "people" : "leads",
      people: Array.isArray(s.people) ? [...new Set(s.people.filter((p): p is string => typeof p === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(p)))].slice(0, 30) : [],
      review: kind === "work" && bool(s.review),
      accept: (kind === "work" || kind === "check") && bool(s.accept),
      needChecklist: kind === "work" && bool(s.needChecklist, true),
      next: str(s.next, 32) || null,
      nextDept: str(s.nextDept, 40) || null,
      receiver: receiver === "lead" || receiver === "keep" || /^[A-Za-z0-9_-]{1,40}$/.test(receiver) ? receiver || "keep" : "keep",
      days: posInt(s.days, 365),
      wip: kind === "work" ? posInt(s.wip, 50) : null,
      steps: Array.isArray(s.steps) ? s.steps.map((t) => str(t, 200)).filter(Boolean).slice(0, 15) : [],
      returnAsBug: kind === "check" && bool(s.returnAsBug),
      returnTo: kind === "check" ? str(s.returnTo, 32) || null : null,
      autoOnMerge: (kind === "work" || kind === "check") && bool(s.autoOnMerge),
    });
  }
  const on = bool(r.on) && stages.length > 0;
  const stageKeys = stages.map((s) => s.status);
  for (const s of stages) {
    if (s.next && !stageKeys.includes(s.next)) throw new Error(`Flow: after ${label(s.status)} comes "${label(s.next)}", which is not a stage.`);
    if (s.next === s.status) throw new Error(`Flow: ${label(s.status)} cannot lead to itself.`);
    if (s.returnTo && !stageKeys.includes(s.returnTo)) throw new Error(`Flow: ${label(s.status)} returns to "${label(s.returnTo)}", which is not a stage.`);
    if (s.nextDept && deptKeys && !deptKeys.includes(s.nextDept)) throw new Error(`Flow: ${label(s.status)} hands work to a department that does not take requests.`);
    if (s.kind === "final") Object.assign(s, { next: null, nextDept: null });
    if (on && s.kind === "check" && s.checkers === "people" && !s.people.length) throw new Error(`Flow: name at least one person who checks ${label(s.status)}.`);
    if (on && s.kind === "release" && !s.next) throw new Error(`Flow: say which stage ${label(s.status)} releases into (for example Released).`);
  }
  // Following "next" from any stage must come to an end.
  for (const s of stages) {
    const seen = new Set<string>();
    let cur: FlowStage | undefined = s;
    while (cur?.next) {
      if (seen.has(cur.status)) throw new Error(`Flow: the stages after ${label(s.status)} go round in a circle. Make one of them lead to the end.`);
      seen.add(cur.status);
      cur = stages.find((x) => x.status === cur!.next);
    }
  }
  if (on) {
    const live = new Set(statuses.filter((s) => s.active).map((s) => s.key));
    const off = stages.find((s) => !live.has(s.status) || (s.queueStatus && !live.has(s.queueStatus)));
    if (off) throw new Error(`Flow: ${label(off.status)} is switched off in Statuses. Switch it on or take it out of the flow.`);
  }
  return { on, stages };
}

// ---------------------------------------------------------------------------
// Ready flows (Configure, Flow, "Start from"), also used by the templates for new departments
// ---------------------------------------------------------------------------

type PresetStatus = { key: string; label: string; category: StatusCategory; color: string };
type Preset = {
  key: string;
  label: string;
  hint: string;
  statuses: PresetStatus[];
  stages: (Partial<FlowStage> & { status: string; kind: StageKind })[];
  fields?: DeptField[];
  // Lines added to the checklist of these types (all types when the list is empty).
  checklist?: { types: string[]; lines: ChecklistLine[] };
};

const S = (key: string, label: string, category: StatusCategory, color: string): PresetStatus => ({ key, label, category, color });
const F = (key: string, label: string, type: DeptField["type"], extra: Partial<DeptField> = {}): DeptField => ({
  key,
  label,
  type,
  options: [],
  help: "",
  requiredFrom: null,
  types: [],
  onCard: false,
  inList: true,
  leadsOnly: false,
  active: true,
  ...extra,
});

export const FLOW_PRESETS: Preset[] = [
  {
    key: "dev",
    label: "Dev team",
    hint: "Backlog, To do, In progress, Code review, QA, Ready to release, Released",
    statuses: [
      S("backlog", "Backlog", "open", "#94a3b8"),
      S("todo", "To do", "open", "#64748b"),
      S("in_progress", "In progress", "active", "#0ea5e9"),
      S("review", "Code review", "review", "#f59e0b"),
      S("qa", "QA", "review", "#a855f7"),
      S("ready_release", "Ready to release", "review", "#14b8a6"),
      S("released", "Released", "done", "#22c55e"),
    ],
    stages: [
      { status: "backlog", kind: "intake", next: "in_progress", steps: ["Bugs and requests land here.", "Set the priority, the sprint and the developer, then plan it."] },
      {
        status: "in_progress",
        kind: "work",
        queueStatus: "todo",
        next: "review",
        wip: 2,
        days: 5,
        steps: ["Start it; the timer runs while you work.", "Name the branch and the pull request after the task code (for example DEV-12).", "Tick the tests and docs checklist and meet the acceptance criteria.", "Mark it done and send it to code review."],
      },
      { status: "review", kind: "check", checkers: "leads", next: "qa", days: 2, autoOnMerge: false, steps: ["Look at the pull request and its checks.", "Pass it to QA, or return it with comments."] },
      // Heads and leads test until testers are named (Configure, Flow: "The people named").
      { status: "qa", kind: "check", checkers: "leads", accept: true, next: "ready_release", returnAsBug: true, days: 2, steps: ["Accept what arrives.", "Test it against the acceptance criteria.", "Pass it, or send it back as a bug with steps to reproduce."] },
      { status: "ready_release", kind: "release", next: "released", steps: ["Group what is ready into a release, write the notes, and release it."] },
      { status: "released", kind: "final" },
    ],
    fields: [F("acceptance", "Acceptance criteria", "longtext", { inList: false, help: "What must be true for this to be accepted" })],
    checklist: { types: ["feature", "bug", "improvement"], lines: [{ text: "Tests added or updated", verify: false }, { text: "Docs updated", verify: false }] },
  },
  {
    key: "marketing",
    label: "Marketing",
    hint: "Brief, Draft, Review, Approved, Scheduled, Published, Results",
    statuses: [
      S("brief", "Brief", "open", "#94a3b8"),
      S("draft", "Draft", "active", "#0ea5e9"),
      S("review", "Review", "review", "#f59e0b"),
      S("approved", "Approved", "review", "#14b8a6"),
      S("scheduled", "Scheduled", "active", "#7b68ee"),
      S("published", "Published", "done", "#22c55e"),
      S("results", "Results", "done", "#16a34a"),
    ],
    stages: [
      { status: "brief", kind: "intake", next: "draft", steps: ["Requests and the lead's ideas arrive as briefs.", "Choose the writer or designer and plan it."] },
      { status: "draft", kind: "work", next: "review", days: 3, steps: ["Write or design it; attach the files.", "Mark it done and send it for review."] },
      { status: "review", kind: "check", checkers: "leads", next: "approved", days: 1, steps: ["Approve it, or return it with what to change."] },
      { status: "approved", kind: "work", queueStatus: null, next: "scheduled", steps: ["Choose the channel and the time on the content calendar."] },
      { status: "scheduled", kind: "work", next: "published", steps: ["When it is out, add the link."] },
      { status: "published", kind: "work", next: "results", steps: ["After a week, log reach, clicks and the other numbers against the campaign."] },
      { status: "results", kind: "final" },
    ],
    fields: [
      F("channel", "Channel", "select", { options: ["Facebook", "Instagram", "TikTok", "YouTube", "Telegram", "Website", "Email"], requiredFrom: "active", onCard: true }),
      F("publish_at", "Publish on", "date", { onCard: true }),
      F("post_link", "Published link", "url", { requiredFrom: "done" }),
    ],
  },
  {
    key: "support",
    label: "Support",
    hint: "Intake, Triage, In progress, Waiting on the requester, Resolved",
    statuses: [S("new", "New", "open", "#94a3b8"), S("triage", "Triage", "open", "#64748b"), S("in_progress", "In progress", "active", "#0ea5e9"), S("waiting", "Waiting on the requester", "active", "#f59e0b"), S("resolved", "Resolved", "done", "#22c55e")],
    stages: [
      { status: "new", kind: "intake", next: "in_progress", steps: ["Read the ticket, set the priority and the person."] },
      { status: "in_progress", kind: "work", queueStatus: "triage", next: "waiting", review: false, days: 2, steps: ["Work on it; reply to the requester.", "Done: send it to wait for the requester's answer."] },
      { status: "waiting", kind: "work", next: "resolved", receiver: "keep", days: 5, steps: ["When the requester confirms, mark it done."] },
      { status: "resolved", kind: "final" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    hint: "Lead, Qualified, Proposal, Won or Lost",
    statuses: [S("lead", "Lead", "open", "#94a3b8"), S("qualified", "Qualified", "active", "#0ea5e9"), S("proposal", "Proposal", "review", "#7b68ee"), S("won", "Won", "done", "#22c55e"), S("lost", "Lost", "cancelled", "#ef4444")],
    stages: [
      { status: "lead", kind: "intake", next: "qualified", steps: ["New leads: choose who follows up."] },
      { status: "qualified", kind: "work", next: "proposal", steps: ["Call, meet and qualify the lead."] },
      { status: "proposal", kind: "work", review: true, next: "won", steps: ["Send the proposal; the lead approves the terms.", "If it is lost, move it to Lost from the task."] },
      { status: "won", kind: "final" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    hint: "To do, In progress, Check, Done",
    statuses: [S("todo", "To do", "open", "#64748b"), S("in_progress", "In progress", "active", "#0ea5e9"), S("check", "Check", "review", "#f59e0b"), S("done", "Done", "done", "#22c55e")],
    stages: [
      { status: "in_progress", kind: "work", queueStatus: "todo", next: "check", steps: ["Do the job; attach quotes and receipts."] },
      { status: "check", kind: "check", checkers: "leads", next: "done", steps: ["Check it was done properly; pass or return it."] },
      { status: "done", kind: "final" },
    ],
  },
  {
    key: "hr",
    label: "HR requests",
    hint: "New, In progress, Approval, Done",
    statuses: [S("new", "New", "open", "#94a3b8"), S("in_progress", "In progress", "active", "#0ea5e9"), S("approval", "Waiting for approval", "review", "#f59e0b"), S("done", "Done", "done", "#22c55e")],
    stages: [
      { status: "new", kind: "intake", next: "in_progress", steps: ["Read the request and choose who handles it."] },
      { status: "in_progress", kind: "work", next: "approval", steps: ["Prepare what is needed; tick the checklist."] },
      { status: "approval", kind: "check", checkers: "leads", next: "done", steps: ["Approve, or return it with a note."] },
      { status: "done", kind: "final" },
    ],
  },
  {
    key: "finance",
    label: "Finance requests",
    hint: "Submitted, Checking, Approval, Paid",
    statuses: [S("submitted", "Submitted", "open", "#94a3b8"), S("checking", "Checking", "active", "#0ea5e9"), S("approval", "Waiting for approval", "review", "#f59e0b"), S("paid", "Paid", "done", "#22c55e")],
    stages: [
      { status: "submitted", kind: "intake", next: "checking", steps: ["Check the request is complete; choose who handles it."] },
      { status: "checking", kind: "work", next: "approval", steps: ["Check the invoice or receipt against the budget."] },
      { status: "approval", kind: "check", checkers: "leads", next: "paid", steps: ["Approve the payment, or return it."] },
      { status: "paid", kind: "final" },
    ],
  },
  {
    key: "blank",
    label: "Simple",
    hint: "To do, In progress, Done, with the lead approving",
    statuses: [S("todo", "To do", "open", "#64748b"), S("in_progress", "In progress", "active", "#0ea5e9"), S("done", "Done", "done", "#22c55e")],
    stages: [
      { status: "in_progress", kind: "work", queueStatus: "todo", review: true, next: "done", steps: ["Start it, do it, mark it done and send it to the lead."] },
      { status: "done", kind: "final" },
    ],
  },
];

// Applies a ready flow to a configuration: adds the statuses, fields and checklist lines it needs (keeping what is
// there; existing statuses keep their colour, and are switched on) and replaces the flow. Nothing is removed.
export function applyFlowPreset(c: DeptConfig, key: string): DeptConfig {
  const p = FLOW_PRESETS.find((x) => x.key === key);
  if (!p) return c;
  const statuses = c.statuses.map((s) => {
    const want = p.statuses.find((x) => x.key === s.key);
    return want ? { ...s, label: want.label, category: want.category, active: true } : s;
  });
  for (const s of p.statuses) if (!statuses.some((x) => x.key === s.key)) statuses.push({ ...s, limit: null, restricted: false, onBoard: s.category !== "cancelled", active: true });
  // Keep the preset's order for its own statuses, then whatever else the department had.
  const order = (k: string) => {
    const i = p.statuses.findIndex((x) => x.key === k);
    return i < 0 ? 100 + statuses.findIndex((x) => x.key === k) : i;
  };
  statuses.sort((a, b) => order(a.key) - order(b.key));
  const fields = [...c.fields];
  for (const f of p.fields ?? []) if (!fields.some((x) => x.key === f.key)) fields.push(f);
  const types = c.types.map((t) => {
    if (!p.checklist || (p.checklist.types.length && !p.checklist.types.includes(t.key))) return t;
    const add = p.checklist.lines.filter((l) => !t.checklist.some((x) => x.text.toLowerCase() === l.text.toLowerCase()));
    return { ...t, checklist: [...t.checklist, ...add] };
  });
  const stages = p.stages.map((s) => ({ ...blankStage(s.status, s.kind), ...s }));
  return { ...c, statuses, fields, types, flow: { on: true, stages }, features: { ...c.features, checklists: c.features.checklists || !!p.checklist } };
}
