// The smarter assistant (Phase 13b): when Admin turns it on (Admin, Assistant, AI) with an Anthropic API key, typed
// and spoken questions go to Claude, which answers in plain words from the person's own data and the app's help.
//
// What it can do:
// - read, with the person's own permissions (the same functions as the pages): their work in every department
//   and production, their department's tasks (as far as they may see them), leave balances and requests, today's
//   attendance, what waits for them, colleagues by name, production parts, the help;
// - propose an action (ask for leave, create, start, move, assign or comment on a task, check in). It never acts
//   by itself: a proposal is shown with a Confirm button, sealed so it cannot be changed in the browser, and on
//   Confirm the page's own action runs with the usual checks;
// - open a page or start a "show me" walk-through.
// What is sent to Anthropic: the question, the conversation so far, and the results of those reads. Admin chooses
// who may use it (by role), the model, and a daily limit per person.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { can, scopeSql, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { shellCounts } from "./shell";
import { myDepartments, deptPeople } from "./departments";
import { getDeptConfig } from "./dept-config";
import { listTasks, saveTask, moveTask, addTaskComment, bulkTasks } from "./work";
import { flowStart } from "./dept-flow";
import { myLeave, requestLeave, leaveTypes } from "./leave";
import { myEmployeeId } from "./hr";
import { stateOf, punchSelf } from "./attendance";
import { assistantContext } from "./assistant";
import { CHAPTERS } from "@/lib/help";
import { FLOWS, GLOSSARY, PLACES } from "@/lib/assistant";
import { ROLE_LABELS, STAGE_LABELS } from "@/lib/domain";
import { deptPath } from "@/lib/work";

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best answers)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
] as const;
export const AI_EFFORTS = ["low", "medium", "high"] as const;

export type AiConfig = {
  on: boolean;
  model: string;
  effort: (typeof AI_EFFORTS)[number];
  // Roles that may not use it (the keyword assistant stays for them).
  offRoles: string[];
  // Questions per person per day (0: no limit).
  dailyLimit: number;
  // Whether it may propose actions (always confirmed by the person).
  actions: boolean;
};
type Stored = AiConfig & { keyEnc?: string | null };
const DEFAULT: AiConfig = { on: false, model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 60, actions: true };

const fake = () => process.env.AI_FAKE === "1";

async function stored(): Promise<Stored> {
  const v = parseJson<Partial<Stored>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant.ai'"))?.value, {});
  return { ...DEFAULT, ...v, offRoles: Array.isArray(v.offRoles) ? v.offRoles : [] };
}

async function apiKey(): Promise<string | null> {
  const s = await stored();
  if (s.keyEnc) return await unseal(s.keyEnc);
  return process.env.ANTHROPIC_API_KEY || null;
}

export async function aiConfig() {
  const { keyEnc, ...rest } = await stored();
  return { ...rest, hasKey: !!keyEnc, envKey: !!process.env.ANTHROPIC_API_KEY, fake: fake() };
}
export type AiConfigView = Awaited<ReturnType<typeof aiConfig>>;

export async function saveAiConfig(user: AppUser, input: Partial<AiConfig> & { key?: string | null; clearKey?: boolean }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the assistant.");
  const cur = await stored();
  const next: Stored = {
    on: !!input.on,
    model: AI_MODELS.some((m) => m.id === input.model) ? input.model! : cur.model,
    effort: (AI_EFFORTS as readonly string[]).includes(input.effort ?? "") ? input.effort! : cur.effort,
    offRoles: (input.offRoles ?? cur.offRoles).map(String).slice(0, 30),
    dailyLimit: Math.max(0, Math.min(1000, Math.round(Number(input.dailyLimit ?? cur.dailyLimit)))),
    actions: input.actions ?? cur.actions,
    keyEnc: input.clearKey ? null : input.key?.trim() ? await seal(input.key.trim()) : (cur.keyEnc ?? null),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant.ai', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.assistant.ai", summary: `${user.name} ${next.on ? "turned on" : "turned off"} the AI assistant (${next.model})${input.key?.trim() ? "; a new API key was saved" : ""}${input.clearKey ? "; the API key was removed" : ""}` });
}

// Whether this person gets the AI (the client hides it otherwise).
export async function aiAvailable(user: AppUser & { activeRole: string }) {
  const c = await stored();
  if (!c.on || c.offRoles.includes(user.activeRole)) return false;
  return fake() || !!(c.keyEnc || process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// The tools: reads with the person's own permissions, and proposals
// ---------------------------------------------------------------------------

type Viewer = AppUser & { activeRole: string };
type Out = { text: string; proposals: Proposal[]; links: { label: string; href: string }[]; show: string | null };
export type Proposal = { token: string; title: string; lines: string[] };

const short = (s: string | null | undefined, n = 300) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);

async function deptTitle(d: string) {
  try {
    return (await getDeptConfig(d)).title;
  } catch {
    return d;
  }
}

// Departments the person may open, with their position.
async function depts(user: Viewer) {
  return await myDepartments(user);
}
async function needDept(user: Viewer, d: string) {
  const ds = await depts(user);
  const found = ds.find((x) => x.dept === d || x.title.toLowerCase() === d.toLowerCase());
  if (!found) throw new WorkflowError("FORBIDDEN", `You cannot open the department "${d}". Yours: ${ds.map((x) => `${x.title} (${x.dept})`).join(", ") || "none"}.`);
  return found;
}

const T = {
  my_overview: {
    description: "What waits for the person now: unread notifications, chat, email, approvals, production work, plus their departments and position. Use first for 'what should I do', 'what is new', 'my day'.",
    input: z.object({}),
  },
  my_work: {
    description: "The person's own open work: department tasks assigned to them in every department (code, title, status, due date, priority) and production parts they own.",
    input: z.object({}),
  },
  department_tasks: {
    description: "Tasks in one department, as far as the person may see them. Filter by text, status keys, assignee ('me', 'none' or a person's name), overdue or due this week. Up to 40 results.",
    input: z.object({
      department: z.string().describe("Department key or title, e.g. 'dev', 'marketing' or a created department's key"),
      text: z.string().optional(),
      assignee: z.string().optional(),
      due: z.enum(["overdue", "week"]).optional(),
      open_only: z.boolean().optional(),
    }),
  },
  department_setup: {
    description: "One department's statuses (keys and labels), priorities, task types and people (ids, names, positions). Needed before proposing to create, move or assign a task.",
    input: z.object({ department: z.string() }),
  },
  my_leave: {
    description: "The person's leave: balances per type (available days), their requests and their status, and leave waiting for their approval.",
    input: z.object({}),
  },
  my_attendance: {
    description: "The person's attendance right now: checked in or out, since when.",
    input: z.object({}),
  },
  find_people: {
    description: "Colleagues by name or title (name, title, departments). No private data.",
    input: z.object({ text: z.string() }),
  },
  search_production: {
    description: "Production parts (videos) by code, title or teacher, as far as the person may see: stage and status.",
    input: z.object({ text: z.string() }),
  },
  search_help: {
    description: "The app's own help pages, matched by words. Use for 'how do I...' questions.",
    input: z.object({ text: z.string() }),
  },
  open_page: {
    description: "Offer the person a button to open a page in the app (and open it when they asked to go there). Use a path from the page list in the instructions.",
    input: z.object({ href: z.string(), label: z.string() }),
  },
  show_me: {
    description: "Start a 'show me' walk-through that points at what to press on the page. Use a flow key from the list in the instructions.",
    input: z.object({ flow: z.string() }),
  },
  propose: {
    description:
      "Propose an action for the person to confirm (nothing happens until they press Confirm). kind: leave {leave_type, start, end, reason}; create_task {department, title, description, assignee_id, due, priority}; start_task {department, task_id}; move_task {department, task_id, status}; assign_task {department, task_id, assignee_id}; comment_task {department, task_id, text}; check_in {}. Dates as YYYY-MM-DD. Look up ids first.",
    input: z.object({
      kind: z.enum(["leave", "create_task", "start_task", "move_task", "assign_task", "comment_task", "check_in"]),
      department: z.string().optional(),
      task_id: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      assignee_id: z.string().optional(),
      due: z.string().optional(),
      priority: z.string().optional(),
      status: z.string().optional(),
      text: z.string().optional(),
      leave_type: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      reason: z.string().optional(),
    }),
  },
} as const;
type ToolName = keyof typeof T;

function toolDefs(actions: boolean): Anthropic.Beta.BetaTool[] {
  return (Object.keys(T) as ToolName[])
    .filter((n) => actions || n !== "propose")
    .map((name) => {
      const schema = z.toJSONSchema(T[name].input) as { properties?: Record<string, unknown>; required?: string[] };
      return { name, description: T[name].description, input_schema: { type: "object" as const, properties: schema.properties ?? {}, required: schema.required ?? [] } };
    });
}

async function personName(id: string | null | undefined) {
  if (!id) return null;
  return (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id))?.name ?? null;
}

// A proposal, sealed with what to run and for whom; Confirm checks it again with the page's own action.
async function propose(user: Viewer, p: z.infer<(typeof T)["propose"]["input"]>): Promise<Proposal> {
  const lines: string[] = [];
  let title = "";
  const params: Record<string, unknown> = { kind: p.kind };
  if (p.kind === "leave") {
    const types = await leaveTypes();
    const t = types.find((x) => x.key === p.leave_type || x.label.toLowerCase() === (p.leave_type ?? "").toLowerCase());
    if (!t) throw new WorkflowError("VALIDATION", `Unknown leave type. Types: ${types.map((x) => `${x.label} (${x.key})`).join(", ")}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(p.end ?? "") || p.end! < p.start!) throw new WorkflowError("VALIDATION", "Give start and end as YYYY-MM-DD, end not before start.");
    title = "Ask for leave";
    lines.push(t.label, `From ${p.start} to ${p.end}`, ...(p.reason ? [`Reason: ${p.reason}`] : []), "It goes to your manager for approval");
    Object.assign(params, { typeKey: t.key, start: p.start, end: p.end, reason: p.reason ?? null });
  } else if (p.kind === "check_in") {
    const emp = await myEmployeeId(user);
    if (!emp) throw new WorkflowError("NOT_FOUND", "The person has no HR record yet.");
    const s = await stateOf(emp);
    title = s.state === "in" ? "Check out" : "Check in";
    lines.push(`${title} now`);
  } else {
    const d = await needDept(user, p.department ?? "");
    const dt = d.title;
    params.dept = d.dept;
    const cfg = await getDeptConfig(d.dept);
    const task = p.task_id ? (await listTasks(user, d.dept, { q: p.task_id })).tasks.find((x) => x.id === p.task_id || x.code === p.task_id) : null;
    if (p.kind !== "create_task" && !task) throw new WorkflowError("NOT_FOUND", "Task not found; look it up with department_tasks first (use its id).");
    if (task) params.taskId = task.id;
    if (p.kind === "create_task") {
      if (!p.title?.trim()) throw new WorkflowError("VALIDATION", "A title is needed.");
      const who = p.assignee_id ? await personName(p.assignee_id) : null;
      if (p.assignee_id && !who) throw new WorkflowError("NOT_FOUND", "Unknown assignee id.");
      const pr = p.priority ? cfg.priorities.find((x) => x.key === p.priority || x.label.toLowerCase() === p.priority!.toLowerCase()) : null;
      title = `New ${cfg.names.task.toLowerCase()} in ${dt}`;
      lines.push(p.title.trim(), ...(p.description ? [short(p.description, 160)!] : []), who ? `For ${who}` : "Not assigned yet", ...(p.due ? [`Due ${p.due}`] : []), ...(pr ? [`Priority ${pr.label}`] : []));
      Object.assign(params, { title: p.title.trim().slice(0, 200), description: p.description?.slice(0, 4000) ?? null, assigneeId: p.assignee_id ?? null, due: /^\d{4}-\d{2}-\d{2}$/.test(p.due ?? "") ? p.due : null, priority: pr?.key ?? null });
    } else if (p.kind === "start_task") {
      title = "Start a task";
      lines.push(`${task!.code} ${task!.title}`, "It moves to In progress and your timer starts");
    } else if (p.kind === "move_task") {
      const st = cfg.statuses.find((x) => x.key === p.status || x.label.toLowerCase() === (p.status ?? "").toLowerCase());
      if (!st) throw new WorkflowError("VALIDATION", `Unknown status. Statuses: ${cfg.statuses.map((x) => `${x.label} (${x.key})`).join(", ")}`);
      title = "Move a task";
      lines.push(`${task!.code} ${task!.title}`, `From ${cfg.statuses.find((x) => x.key === task!.status)?.label ?? task!.status} to ${st.label}`);
      params.status = st.key;
    } else if (p.kind === "assign_task") {
      const who = await personName(p.assignee_id);
      if (!who) throw new WorkflowError("NOT_FOUND", "Unknown assignee id; use department_setup for the people.");
      title = "Assign a task";
      lines.push(`${task!.code} ${task!.title}`, `To ${who}`);
      params.assigneeId = p.assignee_id;
    } else if (p.kind === "comment_task") {
      if (!p.text?.trim()) throw new WorkflowError("VALIDATION", "The comment is empty.");
      title = "Comment on a task";
      lines.push(`${task!.code} ${task!.title}`, `"${short(p.text, 300)}"`);
      params.text = p.text.slice(0, 4000);
    }
  }
  const token = await seal(JSON.stringify({ u: user.id, exp: Date.now() + 30 * 60e3, p: params }));
  return { token, title, lines };
}

// Confirm: open the sealed proposal and run the page's own action, as the person.
export async function confirmProposal(user: Viewer, token: string) {
  const raw = await unseal(token);
  const v = raw ? parseJson<{ u: string; exp: number; p: Record<string, string | null> }>(raw, null as never) : null;
  if (!v || v.u !== user.id) throw new WorkflowError("FORBIDDEN", "This proposal is not yours.");
  if (v.exp < Date.now()) throw new WorkflowError("VALIDATION", "This proposal is too old; ask again.");
  const p = v.p;
  let done = "Done";
  let href: string | null = null;
  if (p.kind === "leave") {
    await requestLeave(user, { typeKey: p.typeKey!, startDate: p.start!, endDate: p.end!, reason: p.reason });
    done = "Leave asked for";
    href = "/profile?tab=leave";
  } else if (p.kind === "check_in") {
    await punchSelf(user, {});
    done = "Recorded";
    href = "/attendance";
  } else {
    const d = p.dept!;
    href = deptPath(d);
    if (p.kind === "create_task") {
      const id = await saveTask(user, d, { title: p.title!, description: p.description, assigneeId: p.assigneeId, dueDate: p.due, ...(p.priority ? { priority: p.priority } : {}) });
      done = "Created";
      href = `${deptPath(d)}/list?task=${id}`;
    } else if (p.kind === "start_task") {
      await flowStart(user, d, p.taskId!).catch(async (e) => {
        // Departments without a flow: move it to the first "in progress" status instead.
        const cfg = await getDeptConfig(d);
        const st = cfg.statuses.find((x) => x.category === "active");
        if (!st) throw e;
        await moveTask(user, d, p.taskId!, st.key, null);
      });
      done = "Started";
    } else if (p.kind === "move_task") {
      await moveTask(user, d, p.taskId!, p.status!, null);
      done = "Moved";
    } else if (p.kind === "assign_task") {
      await bulkTasks(user, d, [p.taskId!], { assigneeId: p.assigneeId });
      done = "Assigned";
    } else if (p.kind === "comment_task") {
      await addTaskComment(user, d, p.taskId!, p.text!);
      done = "Comment added";
    }
  }
  await logAi(user, `confirm:${p.kind}`);
  return { done, href };
}

async function runTool(user: Viewer, name: string, input: unknown, out: Out, actions: boolean): Promise<unknown> {
  const tool = T[name as ToolName];
  if (!tool || (name === "propose" && !actions)) return { error: "Unknown tool." };
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };
  const a = parsed.data as Record<string, string | boolean | undefined>;
  switch (name as ToolName) {
    case "my_overview": {
      const c = await shellCounts(user);
      const ds = await depts(user);
      return {
        name: user.name,
        role: ROLE_LABELS[user.activeRole as keyof typeof ROLE_LABELS] ?? user.activeRole,
        leads_production_stages: user.leads.map((s) => STAGE_LABELS[s]),
        departments: ds.map((d) => ({ key: d.dept, title: d.title, position: d.position, manage: d.manage })),
        waiting: { notifications: c.notifications, chat: c.chat, email: c.mailbox ? c.mail : "no mailbox", approvals: c.approvals, leave_to_approve: c.leave, claims_to_approve: c.claims, attendance_to_approve: c.attendance, handovers_to_check: c.incoming, production_work: c.myWork, questions: c.questions },
      };
    }
    case "my_work": {
      const out2: unknown[] = [];
      for (const d of await depts(user)) {
        try {
          const r = await listTasks(user, d.dept, { assignee: "me", open: true, sort: "due", dir: "asc" });
          for (const t of r.tasks.slice(0, 25)) out2.push({ department: d.title, dept: d.dept, id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, due: t.due_date ?? null });
        } catch {
          // Studio and departments without tasks.
        }
      }
      const sc = scopeSql(user, "i");
      const parts = await all<{ code: string; title: string; stage: string | null; stage_status: string | null }>(
        `SELECT i.code, i.title, i.stage, i.stage_status FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
         WHERE i.lifecycle = 'in_production' AND (a.owner_id = ? OR i.next_action_owner_id = ?) AND ${sc.sql} ORDER BY i.updated_at DESC LIMIT 25`,
        user.id,
        user.id,
        ...sc.params,
      );
      return { department_tasks: out2, production_parts: parts };
    }
    case "department_tasks": {
      const d = await needDept(user, String(a.department));
      let assignee: string | null = null;
      if (a.assignee === "me" || a.assignee === "none") assignee = a.assignee;
      else if (a.assignee) {
        const p = (await deptPeople(d.dept)).find((x) => x.name.toLowerCase().includes(String(a.assignee).toLowerCase()));
        if (!p) return { error: `Nobody called "${a.assignee}" in ${d.title}.` };
        assignee = p.id;
      }
      const r = await listTasks(user, d.dept, { q: (a.text as string) || null, assignee, due: (a.due as "overdue" | "week") ?? null, open: a.open_only !== false, sort: "due", dir: "asc" });
      return { department: d.title, total: r.tasks.length, tasks: r.tasks.slice(0, 40).map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, assignee: t.assignee_name, priority: t.priority, due: t.due_date ?? null, project: t.project_name })) };
    }
    case "department_setup": {
      const d = await needDept(user, String(a.department));
      const cfg = await getDeptConfig(d.dept);
      return {
        department: d.title,
        key: d.dept,
        your_position: d.position,
        statuses: cfg.statuses.map((s) => ({ key: s.key, label: s.label, category: s.category })),
        priorities: cfg.priorities.map((p) => ({ key: p.key, label: p.label })),
        types: cfg.types.map((t) => ({ key: t.key, label: t.label })),
        people: (await deptPeople(d.dept)).map((p) => ({ id: p.id, name: p.name, position: p.position })),
      };
    }
    case "my_leave": {
      const l = await myLeave(user);
      if (!l.employeeId) return { note: "No HR record yet; HR adds it." };
      return {
        balances: l.balances.map((b) => ({ type: b.type.label, key: b.type.key, available: b.available, used: b.used, pending: b.pending })),
        my_requests: l.requests.slice(0, 15).map((r) => ({ type: r.typeLabel, from: r.startDate, to: r.endDate, days: r.days, status: r.status })),
        waiting_for_my_approval: l.approvals.map((r) => ({ who: r.employeeName, type: r.typeLabel, from: r.startDate, to: r.endDate })),
      };
    }
    case "my_attendance": {
      const emp = await myEmployeeId(user);
      if (!emp) return { note: "No HR record yet; HR adds it." };
      const s = await stateOf(emp);
      return { state: s.state, since: s.since, day: s.day };
    }
    case "find_people": {
      const q = `%${String(a.text).trim()}%`;
      const rows = await all<{ id: string; name: string; title: string | null }>("SELECT id, name, title FROM users WHERE active = 1 AND deleted_at IS NULL AND (name ILIKE ? OR title ILIKE ?) ORDER BY name LIMIT 10", q, q);
      const out2 = [];
      for (const r of rows) {
        const ds = await all<{ department: string; position: string }>("SELECT department, position FROM department_positions WHERE user_id = ?", r.id);
        out2.push({ id: r.id, name: r.name, title: r.title, departments: await Promise.all(ds.map(async (x) => `${await deptTitle(x.department)} (${x.position})`)) });
      }
      return out2;
    }
    case "search_production": {
      const term = String(a.text).trim();
      if (term.length < 2) return [];
      const sc = scopeSql(user, "i");
      const like = `%${term}%`;
      return await all(`SELECT i.code, i.title, i.lifecycle, i.stage, i.stage_status FROM items i WHERE ${sc.sql} AND (i.code ILIKE ? OR i.title ILIKE ? OR i.teacher ILIKE ?) ORDER BY i.updated_at DESC LIMIT 12`, ...sc.params, like, like, like);
    }
    case "search_help": {
      const words = String(a.text).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const hits: { chapter: string; section: string; text: string; score: number }[] = [];
      for (const c of CHAPTERS)
        for (const s of c.sections) {
          const body = `${s.title} ${s.text ?? ""} ${(s.steps ?? []).join(" ")}`;
          const lower = `${c.title} ${body}`.toLowerCase();
          const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
          if (score) hits.push({ chapter: c.title, section: s.title, text: short(`${s.text ?? ""} ${(s.steps ?? []).map((x, i) => `${i + 1}. ${x}`).join(" ")}`.trim(), 700)!, score });
        }
      return hits.sort((x, y) => y.score - x.score).slice(0, 5).map(({ score, ...h }) => (void score, h));
    }
    case "open_page": {
      const href = String(a.href);
      if (!href.startsWith("/") || href.startsWith("//")) return { error: "Use a path inside the app, starting with /." };
      out.links.push({ href, label: String(a.label).slice(0, 60) });
      return { ok: true, note: "A button to open it is shown under your answer." };
    }
    case "show_me": {
      const ctx = await assistantContext(user);
      const f = ctx.flows.find((x) => x.key === a.flow && x.kind === "show");
      if (!f) return { error: `No such walk-through for this person. Open to them: ${ctx.flows.filter((x) => x.kind === "show").map((x) => x.key).join(", ")}` };
      out.show = f.key;
      return { ok: true, note: "A Show me button is shown under your answer." };
    }
    case "propose": {
      try {
        const pr = await propose(user, parsed.data as z.infer<(typeof T)["propose"]["input"]>);
        out.proposals.push(pr);
        return { ok: true, shown_to_person: pr.lines, note: "Shown with a Confirm button. Nothing is done until they press it. Tell them to check and confirm." };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
}

// The frozen part of the instructions (cached): who the assistant is, the pages and walk-throughs, the rules.
const SYSTEM = `You are the assistant inside Myseed's work app (an Ethiopian education company making video lessons). People from every department use it: production (Recording, Editing, Uploading, Publication), the Dev team, Marketing, Studio, HR, Finance and departments Admin created.

How to answer:
- Short, plain and friendly; the person may be listening (voice), so no tables or code. Use "- " bullets only for lists. Answer in the language the person writes in (English or Amharic).
- Use the tools to look at the person's real data before answering questions about their work, leave, attendance or team. Never invent numbers, names, ids or statuses.
- You only see what the person may see. If a tool says they cannot open something, tell them who can help (their lead, HR or Admin).
- To do something (ask for leave, create, start, move, assign or comment on a task, check in), look up what you need, then call propose. Nothing happens until they press Confirm, so say what will happen and ask them to confirm. Never claim it is done.
- When they ask where something is or to go somewhere, call open_page. When they want to be shown how, call show_me if a walk-through fits, else explain the steps and open the page.
- If something is outside the app or you are unsure, say so briefly and offer the Help search.

Pages (paths): ${PLACES.map((p) => `${p.name} ${p.href}`).join("; ")}. {home} means the person's own department page (given below). Departments: /dev, /marketing, /studio, created ones at /d/<key>; within a department: /board, /list, /sprint, /projects, /calendar, /report, /team, /configure. Production: /overview, /handovers, /sessions, /coverage, /reports. Also /hr, /finance, /admin, /email, /chat, /requests, /approvals, /notifications.

Walk-throughs for show_me: ${FLOWS.filter((f) => f.kind === "show").map((f) => `${f.key} (${f.title})`).join("; ")}.

Words of the app: ${GLOSSARY.map((g) => `${g.term}: ${g.meaning}`).join(" ")}`;

type Turn = { role: "user" | "assistant"; text: string };

async function logAi(user: Viewer, text: string) {
  await run("INSERT INTO assistant_events (id, user_id, role, flow, event, step, text, at) VALUES (?, ?, ?, 'ai', 'ai', NULL, ?, ?)", uid("ase_"), user.id, user.activeRole, text.slice(0, 200), nowIso());
}

async function usedToday(userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM assistant_events WHERE user_id = ? AND event = 'ai' AND text NOT LIKE 'confirm:%' AND at >= ?", userId, since.toISOString()))?.c ?? 0);
}

// One question: the conversation so far (text only), the page the person is on. Tools run here; the answer, any
// proposals, page buttons and a walk-through come back.
export async function askAi(user: Viewer, input: { history: Turn[]; text: string; page?: string | null }): Promise<Out> {
  const cfg = await stored();
  if (!(await aiAvailable(user))) throw new WorkflowError("FORBIDDEN", "The AI assistant is not on for you.");
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!text) throw new WorkflowError("VALIDATION", "Ask something.");
  if (cfg.dailyLimit && (await usedToday(user.id)) >= cfg.dailyLimit) throw new WorkflowError("VALIDATION", `You reached today's ${cfg.dailyLimit} questions. The buttons and Help still work.`);
  await logAi(user, text);
  const ctx = await assistantContext(user);
  const today = new Date().toISOString().slice(0, 10);
  const who = `The person: ${user.name}${user.title ? `, ${user.title}` : ""}; viewing as ${ROLE_LABELS[user.activeRole as keyof typeof ROLE_LABELS] ?? user.activeRole}${ctx.home ? `; their department: ${ctx.home.title} at ${ctx.home.base} ({home})` : ""}${user.leads.length ? `; leads production stages: ${user.leads.join(", ")}` : ""}. Today is ${today}. They are on the page ${String(input.page ?? "/").slice(0, 200)}.`;
  const history: Anthropic.Beta.BetaMessageParam[] = (input.history ?? [])
    .slice(-12)
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && String(t.text ?? "").trim())
    .map((t) => ({ role: t.role, content: String(t.text).slice(0, 4000) }));
  while (history.length && history[0]!.role !== "user") history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: `${who}\n\n${text}` }];
  const out: Out = { text: "", proposals: [], links: [], show: null };
  const tools = toolDefs(cfg.actions);
  const call = fake() ? fakeModel : await realModel(cfg);
  for (let i = 0; i < 8; i++) {
    const res = await call({ system: SYSTEM, tools, messages });
    if (res.stop_reason === "refusal") {
      out.text = "I cannot help with that one. Try the Help search, or ask your lead.";
      return out;
    }
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const said = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (res.stop_reason === "pause_turn") continue;
    if (!uses.length || res.stop_reason !== "tool_use") {
      out.text = said || (out.proposals.length ? "Check it, then press Confirm." : "Done.");
      return out;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      let content: string;
      let isError = false;
      try {
        content = JSON.stringify(await runTool(user, u.name, u.input, out, cfg.actions)).slice(0, 20000);
      } catch (e) {
        content = e instanceof Error ? e.message : String(e);
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  out.text = out.text || "That took too many steps. Try asking in smaller parts.";
  return out;
}

type ModelCall = (r: { system: string; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<{ stop_reason: string | null; content: Anthropic.Beta.BetaContentBlock[] }>;

async function realModel(cfg: Stored): Promise<ModelCall> {
  const key = await apiKey();
  if (!key) throw new WorkflowError("INVALID_STATE", "No API key is set (Admin, Assistant, AI).");
  const client = new Anthropic({ apiKey: key, timeout: 90_000, maxRetries: 2 });
  return async ({ system, tools, messages }) => {
    try {
      const res = await client.beta.messages.create({
        model: cfg.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: cfg.effort },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });
      void system;
      return { stop_reason: res.stop_reason, content: res.content };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new WorkflowError("INVALID_STATE", "The AI key was refused. Admin checks it in Admin, Assistant, AI.");
      if (e instanceof Anthropic.RateLimitError) throw new WorkflowError("INVALID_STATE", "The AI is busy right now; try again in a minute.");
      if (e instanceof Anthropic.APIConnectionError) throw new WorkflowError("INVALID_STATE", "The AI could not be reached from the server.");
      if (e instanceof Anthropic.APIError) throw new WorkflowError("INVALID_STATE", `The AI answered with an error (${e.status}).`);
      throw e;
    }
  };
}

// Admin's "Test": one tiny request with the saved key.
export async function testAi(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin tests the assistant.");
  if (fake()) return { ok: true, model: "fake" };
  const cfg = await stored();
  const call = await realModel(cfg);
  const r = await call({ system: SYSTEM, tools: [], messages: [{ role: "user", content: "Say OK." }] });
  return { ok: r.stop_reason !== "refusal", model: cfg.model };
}

// Usage for Admin: questions per day and per role over the last weeks.
export async function aiUsage(user: AppUser, days = 30) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees this.");
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await all<{ role: string; text: string | null; at: string; user_id: string }>("SELECT role, text, at, user_id FROM assistant_events WHERE event = 'ai' AND at >= ?", since);
  const questions = rows.filter((r) => !(r.text ?? "").startsWith("confirm:"));
  const byRole = new Map<string, number>();
  for (const r of questions) byRole.set(r.role, (byRole.get(r.role) ?? 0) + 1);
  return {
    questions: questions.length,
    confirmed: rows.length - questions.length,
    people: new Set(questions.map((r) => r.user_id)).size,
    byRole: [...byRole.entries()].sort((x, y) => y[1] - x[1]).map(([role, n]) => ({ role, n })),
  };
}

// For tests and the browser checks (AI_FAKE=1): a stand-in that picks a tool from words, then answers from the result.
const fakeModel: ModelCall = async ({ messages }) => {
  const last = messages[messages.length - 1]!;
  const block = (b: Record<string, unknown>) => b as unknown as Anthropic.Beta.BetaContentBlock;
  if (Array.isArray(last.content) && (last.content as { type: string }[]).some((b) => b.type === "tool_result")) {
    const r = (last.content as { content: string }[]).map((b) => b.content).join("\n");
    return { stop_reason: "end_turn", content: [block({ type: "text", text: `Here is what I found: ${r.slice(0, 400)}`, citations: null })] };
  }
  const said = String(typeof last.content === "string" ? last.content : "").split("\n\n").pop()!;
  const q = said.toLowerCase();
  const use = (name: string, input: object) => ({ stop_reason: "tool_use", content: [block({ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2, 10)}`, name, input, caller: { type: "direct" } })] });
  if (/leave|balance/.test(q) && !/ask for/.test(q)) return use("my_leave", {});
  const create = said.match(/create (?:a )?task (.+?) in (\w+)/i);
  if (create) return use("propose", { kind: "create_task", department: create[2], title: create[1] });
  if (/my work|my tasks|what should i do/.test(q)) return use("my_work", {});
  if (/where|open|go to/.test(q)) return use("open_page", { href: "/attendance", label: "Attendance" });
  if (/who is|find/.test(q)) return use("find_people", { text: q.replace(/.*(who is|find)\s*/, "") });
  return { stop_reason: "end_turn", content: [block({ type: "text", text: "I can look at your work, leave and attendance, find people and pages, and prepare actions for you to confirm.", citations: null })] };
};
