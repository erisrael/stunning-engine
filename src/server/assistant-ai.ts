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
import { listTasks } from "./work";
import { myLeave } from "./leave";
import { myEmployeeId } from "./hr";
import { stateOf } from "./attendance";
import { assistantContext, roleOptions } from "./assistant";
import { executeOp, myApprovals, OP_KEYS, OPS, prepareOp } from "./assistant-ops";
import { listRoutines, routinesOpen } from "./routines";
import { CHAPTERS } from "@/lib/help";
import { FLOWS, GLOSSARY, PLACES } from "@/lib/assistant";
import { ROLE_LABELS, STAGE_LABELS } from "@/lib/domain";

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google (Gemini)" },
  { id: "openai", label: "OpenAI (GPT / o-series)" },
  { id: "custom", label: "Custom / OpenAI-Compatible (DeepSeek, Local LLM)" },
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number]["id"];

export const AI_MODELS = [
  // Anthropic
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best answers)", provider: "anthropic" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)", provider: "anthropic" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)", provider: "anthropic" },
  // Google Gemini
  { id: "gemini-2.5-flash", label: "Google Gemini 2.5 Flash (Ultra Fast & Smart)", provider: "gemini" },
  { id: "gemini-2.5-pro", label: "Google Gemini 2.5 Pro (Deep Reasoning)", provider: "gemini" },
  { id: "gemini-1.5-flash", label: "Google Gemini 1.5 Flash", provider: "gemini" },
  { id: "gemini-1.5-pro", label: "Google Gemini 1.5 Pro", provider: "gemini" },
  // OpenAI
  { id: "gpt-4o", label: "OpenAI GPT-4o (Omni flagship)", provider: "openai" },
  { id: "gpt-4o-mini", label: "OpenAI GPT-4o Mini (Cost-efficient)", provider: "openai" },
  { id: "o3-mini", label: "OpenAI o3-mini (High reasoning)", provider: "openai" },
  // Custom
  { id: "custom-model", label: "Custom Model (configured via base URL)", provider: "custom" },
] as const;
export const AI_EFFORTS = ["low", "medium", "high"] as const;

export type AiConfig = {
  on: boolean;
  provider: AiProvider;
  model: string;
  customBaseUrl?: string | null;
  effort: (typeof AI_EFFORTS)[number];
  // Roles that may not use it (the keyword assistant stays for them).
  offRoles: string[];
  // Questions per person per day (0: no limit).
  dailyLimit: number;
  // Whether it may propose actions (always confirmed by the person).
  actions: boolean;
  // Agent mode: the person may let it do the allowed actions itself (each one logged), up to agentMax per question.
  agent: boolean;
  agentMax: number;
};
type Stored = AiConfig & { keyEnc?: string | null };
const DEFAULT: AiConfig = { on: false, provider: "anthropic", model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 60, actions: true, agent: true, agentMax: 8 };

const fake = () => process.env.AI_FAKE === "1";

async function stored(): Promise<Stored> {
  const v = parseJson<Partial<Stored>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant.ai'"))?.value, {});
  return { ...DEFAULT, ...v, offRoles: Array.isArray(v.offRoles) ? v.offRoles : [] };
}

async function apiKey(): Promise<string | null> {
  const s = await stored();
  if (s.keyEnc) return await unseal(s.keyEnc);
  if (s.provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  if (s.provider === "openai") return process.env.OPENAI_API_KEY || null;
  return process.env.ANTHROPIC_API_KEY || null;
}

export async function aiConfig() {
  const { keyEnc, ...rest } = await stored();
  return { ...rest, hasKey: !!keyEnc, envKey: !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY), fake: fake() };
}
export type AiConfigView = Awaited<ReturnType<typeof aiConfig>>;

export async function saveAiConfig(user: AppUser, input: Partial<AiConfig> & { key?: string | null; clearKey?: boolean }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the assistant.");
  const cur = await stored();
  const next: Stored = {
    on: !!input.on,
    provider: input.provider ?? cur.provider ?? "anthropic",
    model: AI_MODELS.some((m) => m.id === input.model) ? input.model! : (input.model || cur.model),
    customBaseUrl: input.customBaseUrl !== undefined ? (input.customBaseUrl ? input.customBaseUrl.trim() : null) : (cur.customBaseUrl ?? null),
    effort: (AI_EFFORTS as readonly string[]).includes(input.effort ?? "") ? input.effort! : cur.effort,
    offRoles: (input.offRoles ?? cur.offRoles).map(String).slice(0, 30),
    dailyLimit: Math.max(0, Math.min(1000, Math.round(Number(input.dailyLimit ?? cur.dailyLimit)))),
    actions: input.actions ?? cur.actions,
    agent: input.agent ?? cur.agent,
    agentMax: Math.max(1, Math.min(25, Math.round(Number(input.agentMax ?? cur.agentMax) || 8))),
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

export type StoredAiModel = {
  id: string;
  name: string;
  provider: AiProvider;
  model: string;
  apiKeyEnc?: string | null;
  customBaseUrl?: string | null;
  isDefault: boolean;
  active: boolean;
  hasKey?: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listAiModels(user: AppUser): Promise<StoredAiModel[]> {
  const rows = await all<{
    id: string;
    name: string;
    provider: string;
    model: string;
    api_key_enc: string | null;
    custom_base_url: string | null;
    is_default: number;
    active: number;
    created_at: string;
    updated_at: string;
  }>("SELECT id, name, provider, model, api_key_enc, custom_base_url, is_default, active, created_at, updated_at FROM ai_models ORDER BY is_default DESC, name ASC");

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider as AiProvider,
    model: r.model,
    hasKey: !!r.api_key_enc,
    customBaseUrl: r.custom_base_url,
    isDefault: !!r.is_default,
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function saveAiModel(
  user: AppUser,
  input: {
    id?: string;
    name: string;
    provider: AiProvider;
    model: string;
    apiKey?: string | null;
    customBaseUrl?: string | null;
    isDefault?: boolean;
    active?: boolean;
  }
) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can manage AI models and API keys.");
  }
  const name = input.name.trim();
  if (!name) throw new WorkflowError("VALIDATION", "Model name is required.");
  const provider = input.provider;
  const model = input.model.trim();
  if (!model) throw new WorkflowError("VALIDATION", "Model identifier is required.");

  const now = nowIso();
  const id = input.id || uid();

  if (input.isDefault) {
    await run("UPDATE ai_models SET is_default = 0");
  }

  const existing = input.id
    ? await get<{ id: string; api_key_enc: string | null }>("SELECT id, api_key_enc FROM ai_models WHERE id = ?", input.id)
    : null;

  let apiKeyEnc = existing?.api_key_enc ?? null;
  if (input.apiKey && input.apiKey.trim()) {
    apiKeyEnc = await seal(input.apiKey.trim());
  }

  const isDefault = input.isDefault ? 1 : 0;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : 1;
  const customBaseUrl = input.customBaseUrl?.trim() || null;

  if (existing) {
    await run(
      "UPDATE ai_models SET name = ?, provider = ?, model = ?, api_key_enc = ?, custom_base_url = ?, is_default = ?, active = ?, updated_at = ? WHERE id = ?",
      name,
      provider,
      model,
      apiKeyEnc,
      customBaseUrl,
      isDefault,
      active,
      now,
      id
    );
  } else {
    await run(
      "INSERT INTO ai_models (id, name, provider, model, api_key_enc, custom_base_url, is_default, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      provider,
      model,
      apiKeyEnc,
      customBaseUrl,
      isDefault,
      active,
      now,
      now
    );
  }

  if (input.isDefault) {
    const curCfg = await stored();
    const nextCfg: Stored = {
      ...curCfg,
      provider,
      model,
      customBaseUrl,
      keyEnc: apiKeyEnc,
    };
    await run(
      "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant.ai', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      JSON.stringify(nextCfg),
      now,
      user.id
    );
  }

  await audit({ actor: user }, { action: "settings.ai_model", summary: `${user.name} saved AI model ${name} (${provider}/${model})` });
  return { id };
}

export async function deleteAiModel(user: AppUser, id: string) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can delete AI models.");
  }
  const row = await get<{ name: string; is_default: number }>("SELECT name, is_default FROM ai_models WHERE id = ?", id);
  if (!row) return;

  await run("DELETE FROM ai_models WHERE id = ?", id);
  if (row.is_default) {
    const next = await get<{ id: string }>("SELECT id FROM ai_models WHERE active = 1 LIMIT 1");
    if (next) {
      await run("UPDATE ai_models SET is_default = 1 WHERE id = ?", next.id);
    }
  }

  await audit({ actor: user }, { action: "settings.ai_model.delete", summary: `${user.name} deleted AI model ${row.name}` });
}

export async function setDefaultAiModel(user: AppUser, id: string) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can set default AI model.");
  }
  const row = await get<{ id: string; name: string; provider: string; model: string; api_key_enc: string | null; custom_base_url: string | null }>(
    "SELECT id, name, provider, model, api_key_enc, custom_base_url FROM ai_models WHERE id = ?",
    id
  );
  if (!row) throw new WorkflowError("NOT_FOUND", "AI model not found.");

  await run("UPDATE ai_models SET is_default = 0");
  await run("UPDATE ai_models SET is_default = 1, active = 1 WHERE id = ?", id);

  const curCfg = await stored();
  const nextCfg: Stored = {
    ...curCfg,
    provider: row.provider as AiProvider,
    model: row.model,
    customBaseUrl: row.custom_base_url,
    keyEnc: row.api_key_enc || curCfg.keyEnc,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant.ai', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(nextCfg),
    nowIso(),
    user.id
  );

  await audit({ actor: user }, { action: "settings.ai_model.default", summary: `${user.name} set default AI model to ${row.name}` });
}

export async function testAiModelById(user: AppUser, id: string): Promise<{ ok: boolean; response: string }> {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can test AI models.");
  }
  const row = await get<{ id: string; name: string; provider: string; model: string; api_key_enc: string | null; custom_base_url: string | null }>(
    "SELECT id, name, provider, model, api_key_enc, custom_base_url FROM ai_models WHERE id = ?",
    id
  );
  if (!row) throw new WorkflowError("NOT_FOUND", "AI model not found.");

  let key: string | null = null;
  if (row.api_key_enc) {
    key = await unseal(row.api_key_enc);
  }
  if (!key) {
    if (row.provider === "gemini") key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    else if (row.provider === "openai") key = process.env.OPENAI_API_KEY || null;
    else if (row.provider === "anthropic") key = process.env.ANTHROPIC_API_KEY || null;
  }

  if (!key && !fake()) {
    throw new WorkflowError("INVALID_STATE", `No API key configured for model "${row.name}". Enter an API key.`);
  }

  if (fake()) {
    return { ok: true, response: `[Fake Test] Model ${row.name} (${row.provider}/${row.model}) connected successfully.` };
  }

  try {
    if (row.provider === "gemini") {
      const model = row.model.startsWith("gemini") ? row.model : "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello, reply in one sentence confirming you are online." }] }],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Connected successfully.";
      return { ok: true, response: text.trim() };
    } else if (row.provider === "openai" || row.provider === "custom") {
      const endpoint = row.custom_base_url
        ? `${row.custom_base_url.replace(/\/+$/, "")}/chat/completions`
        : "https://api.openai.com/v1/chat/completions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: row.model,
          messages: [{ role: "user", content: "Hello, reply in one sentence confirming you are online." }],
          max_tokens: 50,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "Connected successfully.";
      return { ok: true, response: content };
    } else {
      const client = new Anthropic({ apiKey: key!, timeout: 30_000 });
      const res = await client.messages.create({
        model: row.model,
        max_tokens: 50,
        messages: [{ role: "user", content: "Hello, reply in one sentence confirming you are online." }],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      return { ok: true, response: text || "Connected successfully." };
    }
  } catch (err: any) {
    throw new WorkflowError("INVALID_STATE", `Model test failed: ${err?.message || err}`);
  }
}

// Whether this person gets the AI (the client hides it otherwise).
export async function aiAvailable(user: AppUser & { activeRole: string }) {
  const c = await stored();
  if (!c.on || c.offRoles.includes(user.activeRole)) return false;
  if (!(await roleOptions(user.activeRole)).ai) return false;
  return fake() || !!(c.keyEnc || process.env.ANTHROPIC_API_KEY);
}

// Whether this person may switch to Agent mode (Admin's switch, their role's option, and actions allowed at all).
export async function agentAvailable(user: AppUser & { activeRole: string }) {
  if (!(await aiAvailable(user))) return false;
  const c = await stored();
  if (!c.agent || !c.actions) return false;
  const ro = await roleOptions(user.activeRole);
  return ro.agent && (await allowedOps(user as Viewer, c)).length > 0;
}

// ---------------------------------------------------------------------------
// The tools: reads with the person's own permissions, and proposals
// ---------------------------------------------------------------------------

type Viewer = AppUser & { activeRole: string };
export type AgentStep = { kind: string; title: string; lines: string[]; ok: boolean; result: string; href: string | null };
type Out = { text: string; proposals: Proposal[]; links: { label: string; href: string }[]; show: string | null; done: AgentStep[]; conversationId: string | null };
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
  my_approvals: {
    description: "What waits for the person's decision: leave requests, expense claims and attendance corrections, with their ids (for decide_leave, decide_claim, decide_correction).",
    input: z.object({}),
  },
  my_notifications: {
    description: "The person's latest unread notifications (title, when, link).",
    input: z.object({}),
  },
  list_routines: {
    description: "The person's routines (recorded ways of doing something in the app) and the ones shared with them, with their ids (for run_routine).",
    input: z.object({}),
  },
  search_everything: {
    description: "Search across the app at once: production parts, department tasks the person may see (any department), people and help pages. Use when the person names something and you do not know where it is.",
    input: z.object({ text: z.string() }),
  },
  my_scorecard: {
    description: "The person's KPI scorecard for this month (or a month YYYY-MM): score, rating, each KRA and KPI with target and actual, and the trend of the last six months. With person (a name), a team member's scorecard if the person leads them.",
    input: z.object({ period: z.string().optional(), person: z.string().optional() }),
  },
  team_insights: {
    description: "For leads: how work flows in one of their departments over the last weeks. Throughput, cycle time, where work waits (bottleneck), each member's load, pace and on-time rate, and the risks (overdue, stuck, blocked, urgent without an owner). Use for 'how is my team doing', 'who is overloaded', 'what is stuck'.",
    input: z.object({ department: z.string(), weeks: z.number().optional() }),
  },
  support_tickets: {
    description: "For customer support agents: their open tickets (or the queue's waiting ones with waiting=true), with ids, subjects, priority and status.",
    input: z.object({ waiting: z.boolean().optional() }),
  },
  leaderboard: {
    description: "The recognition leaderboard for this month (when recognition is on): ranks, scores, badges and titles.",
    input: z.object({ period: z.string().optional() }),
  },
  hr_people: {
    description: "HR: employees, found by name, code, job title or department (or all, up to 60): code, name, job, department, manager, employment type, status, start date, probation and contract end, documents due.",
    input: z.object({ text: z.string().optional(), department: z.string().optional() }),
  },
  hr_employee: {
    description: "HR: one employee in full: their record, manager, dates, leave balances this year, and attendance this month. Give a name or code.",
    input: z.object({ employee: z.string() }),
  },
  hr_attendance_day: {
    description: "Attendance for a day (default today): how many present, late, absent, on leave, not in yet, and who is late, absent or not in. HR sees everyone; leads their team.",
    input: z.object({ day: z.string().optional() }),
  },
  hr_leave_queue: {
    description: "HR: leave waiting for HR's decision and with managers (ids for decide_leave), and who is on leave today and this week.",
    input: z.object({}),
  },
  hr_due: {
    description: "HR: what falls due soon: probation ends, contract ends and documents expiring, within the next days (default 60).",
    input: z.object({ days: z.number().optional() }),
  },
  hr_report: {
    description: "HR: the year's people numbers: headcount, joiners and leavers, turnover, leave taken, training and reviews.",
    input: z.object({ year: z.number().optional() }),
  },
  propose: {
    description: `Prepare an action for the person to confirm (nothing happens until they press Confirm). kind and its args: ${OPS.map((o) => `${o.key} {${o.args}}`).join("; ")}. Dates as YYYY-MM-DD, times as HH:MM. Look up ids first with the other tools.`,
    input: z.object({ kind: z.enum(OP_KEYS as [string, ...string[]]), args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }),
  },
  do_action: {
    description: `Agent mode: do an action now for the person, with their own permissions (the same checks as the pages). kind and its args: ${OPS.map((o) => `${o.key} {${o.args}}`).join("; ")}. Dates as YYYY-MM-DD, times as HH:MM. Look up ids first with the other tools. Each call is logged and shown to the person.`,
    input: z.object({ kind: z.enum(OP_KEYS as [string, ...string[]]), args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }),
  },
} as const;
type ToolName = keyof typeof T;

function toolDefs(allowed: string[], agent = false, ab?: Abilities): Anthropic.Beta.BetaTool[] {
  return (Object.keys(T) as ToolName[])
    .filter((n) => (n === "propose" ? allowed.length > 0 && !agent : n === "do_action" ? allowed.length > 0 && agent : true))
    .filter((n) => !ab || !TOOL_NEEDS[n] || TOOL_NEEDS[n]!(ab))
    .map((name) => {
      const schema = z.toJSONSchema(T[name].input) as { properties?: Record<string, unknown>; required?: string[] };
      return { name, description: T[name].description, input_schema: { type: "object" as const, properties: schema.properties ?? {}, required: schema.required ?? [] } };
    });
}

// The actions this person may have prepared: Admin's switch, then their role's list.
// What this person's role can do, worked out once per question: the assistant offers only these.
export type Abilities = { lead: boolean; approver: boolean; attendance: boolean; attendanceHr: boolean; hr: boolean; cases: boolean; announce: boolean; support: boolean; recognition: boolean; finance: boolean; admin: boolean };
export async function abilities(user: Viewer): Promise<Abilities> {
  const ds = await depts(user).catch(() => []);
  const lead = user.leads.length > 0 || ds.some((d) => d.position === "head" || d.position === "lead" || d.manage) || can(user, "team.view");
  const reports = !!(await get("SELECT 1 AS x FROM employees e JOIN employees m ON m.id = e.manager_id WHERE m.user_id = ? LIMIT 1", user.id).catch(() => null));
  const attendanceHr = can(user, "attendance.manage");
  const hr = can(user, "hr.access");
  const t = await (await import("./announcements")).announceTargets(user).catch(() => ({ all: false, departments: [] as string[] }));
  return {
    lead,
    approver: lead || reports || attendanceHr || can(user, "hr.manage") || can(user, "corrections.approve") || can(user, "finance.access"),
    attendance: attendanceHr || lead || reports,
    attendanceHr,
    hr,
    cases: can(user, "hr.cases"),
    announce: t.all || t.departments.length > 0,
    support: await (await import("./support-desk")).isAgent(user).catch(() => false),
    recognition: (await (await import("./recognition")).recognitionConfig().catch(() => ({ enabled: false }))).enabled,
    finance: can(user, "finance.access"),
    admin: can(user, "users.manage"),
  };
}

const WHO_OK: Record<string, (a: Abilities) => boolean> = {
  leads: (a) => a.lead,
  managers: (a) => a.approver,
  attendance: (a) => a.attendance,
  attendanceHr: (a) => a.attendanceHr,
  hr: (a) => a.hr,
  cases: (a) => a.cases,
  announce: (a) => a.announce,
};

async function allowedOps(user: Viewer, cfg: Stored, ab?: Abilities) {
  if (!cfg.actions) return [];
  const o = await roleOptions(user.activeRole);
  const a = ab ?? (await abilities(user));
  // Admin's list for the role, then only what the person's rights allow.
  return (o.actions ? OP_KEYS.filter((k) => o.actions!.includes(k)) : OP_KEYS).filter((k) => {
    const who = OPS.find((x) => x.key === k)?.who;
    return !who || (WHO_OK[who]?.(a) ?? true);
  });
}

// The reading tools this person gets (HR's only for HR, the analyzer for leads, tickets for agents...).
const TOOL_NEEDS: Partial<Record<string, (a: Abilities) => boolean>> = {
  team_insights: (a) => a.lead,
  support_tickets: (a) => a.support,
  leaderboard: (a) => a.recognition,
  hr_people: (a) => a.hr,
  hr_employee: (a) => a.hr,
  hr_attendance_day: (a) => a.attendance,
  hr_leave_queue: (a) => a.hr,
  hr_due: (a) => a.hr,
  hr_report: (a) => a.hr,
};

// A proposal, sealed with what to run and for whom; Confirm runs it with the page's own function and checks.
export async function proposeOp(user: Viewer, kind: string, args: Record<string, unknown>): Promise<Proposal> {
  const pr = await prepareOp(user, kind, (args ?? {}) as Record<string, string>);
  const token = await seal(JSON.stringify({ u: user.id, exp: Date.now() + 30 * 60e3, p: pr.params }));
  return { token, title: pr.title, lines: pr.lines };
}

export async function confirmProposal(user: Viewer, token: string) {
  const raw = await unseal(token);
  const v = raw ? parseJson<{ u: string; exp: number; p: Record<string, unknown> }>(raw, null as never) : null;
  if (!v || v.u !== user.id) throw new WorkflowError("FORBIDDEN", "This proposal is not yours.");
  if (v.exp < Date.now()) throw new WorkflowError("VALIDATION", "This proposal is too old; ask again.");
  const r = await executeOp(user, v.p);
  await logAi(user, `confirm:${String(v.p.kind)}`);
  return r;
}

async function runTool(user: Viewer, name: string, input: unknown, out: Out, allowed: string[], agent: { on: boolean; max: number } = { on: false, max: 0 }): Promise<unknown> {
  const tool = T[name as ToolName];
  if (!tool || ((name === "propose" || name === "do_action") && !allowed.length) || (name === "do_action" && !agent.on)) return { error: "Unknown tool." };
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
        ...(l.showBalances
          ? { balances: l.balances.map((b) => ({ type: b.type.label, key: b.type.key, available: b.available, used: b.used, pending: b.pending })) }
          : { balances: "HR keeps leave balances. Do not guess them; tell the person to ask HR on Profile, Leave (Ask HR)." }),
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
      const hidden = await (await import("./profiles")).hiddenFrom(user);
      const rows = (await all<{ id: string; name: string; title: string | null }>("SELECT id, name, title FROM users WHERE active = 1 AND deleted_at IS NULL AND (name ILIKE ? OR title ILIKE ?) ORDER BY name LIMIT 20", q, q)).filter((r) => !hidden.has(r.id)).slice(0, 10);
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
      if (!(await (await import("./page-access")).canOpenPath(user, href))) return { error: `This person cannot open ${href} with their role. Do not offer it; tell them who can help (their lead, HR or Admin).` };
      out.links.push({ href, label: String(a.label).slice(0, 60) });
      return { ok: true, note: "A button to open it is shown under your answer." };
    }
    case "show_me": {
      const ctx = await assistantContext(user);
      const f = ctx.flows.find((x) => x.key === a.flow && (x.kind === "show" || x.kind === "guide"));
      if (!f) return { error: `No such walk-through for this person. Open to them: ${ctx.flows.filter((x) => x.kind === "show" || x.kind === "guide").map((x) => x.key).join(", ")}` };
      out.show = f.key;
      return { ok: true, note: "A Show me button is shown under your answer." };
    }
    case "my_approvals":
      return await myApprovals(user);
    case "my_notifications":
      return await all("SELECT title, created_at AS at, link FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 10", user.id);
    case "list_routines":
      return (await routinesOpen(user)) ? (await listRoutines(user)).map((r) => ({ id: r.id, name: r.name, description: r.description, steps: r.steps.length, owner: r.ownerName })) : { note: "Routines are not on for this person." };
    case "hr_people": {
      const { listEmployees } = await import("./hr");
      const q = String(a.text ?? "").toLowerCase().trim();
      const dq = String(a.department ?? "").toLowerCase().trim();
      const list = (await listEmployees(user)).filter((e) => (!q || `${e.name} ${e.code} ${e.jobTitle ?? ""}`.toLowerCase().includes(q)) && (!dq || (e.department ?? "").toLowerCase().includes(dq)));
      return { total: list.length, employees: list.slice(0, 60).map((e) => ({ code: e.code, name: e.name, job: e.jobTitle, department: e.department, manager: e.managerName, type: e.employmentType, status: e.status, start: e.startDate, probation_end: e.probationEnd, contract_end: e.contractEnd, documents_due: e.docsDue })) };
    }
    case "hr_employee": {
      const { findEmployee } = await import("./assistant-ops");
      const e = await findEmployee(user, a.employee);
      const { balancesFor } = await import("./leave");
      const bal = await balancesFor(user, e.id).catch(() => []);
      const month = nowIso().slice(0, 7);
      const att = await all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM att_marks WHERE employee_id = ? AND day LIKE ? GROUP BY status", e.id, `${month}%`).catch(() => []);
      return {
        code: e.code,
        name: e.name,
        job: e.jobTitle,
        department: e.department,
        manager: e.managerName,
        type: e.employmentType,
        status: e.status,
        start: e.startDate,
        probation_end: e.probationEnd,
        contract_end: e.contractEnd,
        email: e.email,
        phone: e.phone,
        leave_balances: (Array.isArray(bal) ? bal : []).map((b: { type: { label: string }; available: number | null; used: number }) => ({ type: b.type.label, available: b.available, used: b.used })),
        attendance_marks_this_month: att,
        open_page: `/hr/${e.id}`,
      };
    }
    case "hr_attendance_day": {
      const { dailyBoard } = await import("./attendance");
      const d = typeof a.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.day) ? a.day : nowIso().slice(0, 10);
      const b = await dailyBoard(user, d);
      const list = (st: string) => b.rows.filter((r) => r.result.status === st).map((r) => r.name);
      return { day: d, counts: b.counts, late: list("late"), absent: list("absent"), not_in: list("not_in"), on_leave: list("leave"), half_day: list("half_day") };
    }
    case "hr_leave_queue": {
      const { hrLeave } = await import("./leave");
      const l = await hrLeave(user);
      const today = nowIso().slice(0, 10);
      const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const on = await all<{ name: string; start_date: string; end_date: string }>("SELECT e.full_name AS name, r.start_date, r.end_date FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'approved' AND r.start_date <= ? AND r.end_date >= ? ORDER BY r.start_date", week, today);
      const row = (r: { id: string; employeeName?: string; typeLabel?: string; startDate?: string; endDate?: string; days?: number }) => ({ id: r.id, who: r.employeeName, type: r.typeLabel, from: r.startDate, to: r.endDate, days: r.days });
      return { waiting_for_hr: l.waiting.map(row), with_managers: l.withManagers.map(row), on_leave_now_or_this_week: on.map((x) => ({ who: x.name, from: x.start_date, to: x.end_date })) };
    }
    case "hr_due": {
      const { hrUpcoming } = await import("./hr");
      return await hrUpcoming(user, typeof a.days === "number" ? Math.max(1, Math.min(365, a.days)) : 60);
    }
    case "hr_report": {
      const { hrReport } = await import("./hr-growth");
      return await hrReport(user, typeof a.year === "number" ? a.year : undefined);
    }
    case "search_everything": {
      const term = String(a.text).trim();
      if (term.length < 2) return { error: "Give at least two letters." };
      const like = `%${term}%`;
      const sc = scopeSql(user, "i");
      const parts = await all(`SELECT i.code, i.title, i.stage, i.stage_status FROM items i WHERE ${sc.sql} AND (i.code ILIKE ? OR i.title ILIKE ? OR i.teacher ILIKE ?) ORDER BY i.updated_at DESC LIMIT 8`, ...sc.params, like, like, like);
      const tasks: unknown[] = [];
      for (const d of await depts(user)) {
        try {
          const r = await listTasks(user, d.dept, { q: term, open: false, sort: "updated", dir: "desc" });
          for (const t of r.tasks.slice(0, 6)) tasks.push({ department: d.title, dept: d.dept, id: t.id, code: t.code, title: t.title, status: t.status, assignee: t.assignee_name });
        } catch {
          // Departments without tasks.
        }
      }
      const people = await all<{ name: string; title: string | null }>("SELECT name, title FROM users WHERE active = 1 AND deleted_at IS NULL AND (name ILIKE ? OR title ILIKE ?) ORDER BY name LIMIT 6", like, like);
      const help = (await runTool(user, "search_help", { text: term }, out, allowed)) as unknown[];
      return { production_parts: parts, tasks: tasks.slice(0, 20), people, help: Array.isArray(help) ? help.slice(0, 3) : [] };
    }
    case "my_scorecard": {
      const pf = await import("./performance");
      let who = user.id;
      if (a.person) {
        const q = `%${String(a.person).trim()}%`;
        const p = await get<{ id: string }>("SELECT id FROM users WHERE active = 1 AND name ILIKE ? ORDER BY name LIMIT 1", q);
        if (!p) return { error: `Nobody called "${a.person}".` };
        who = p.id;
      }
      try {
        const r = await pf.myScorecard(user, who, (a.period as string) || null);
        return {
          name: r.card.name,
          period: r.card.period,
          score: r.card.score,
          rating: r.card.rating,
          kras: r.card.kras.map((k) => ({ kra: k.name, weight: k.weight, score: k.score, kpis: k.kpis.map((x) => ({ kpi: x.name, unit: x.unit, target: x.target, actual: x.value, score: x.score })) })),
          trend: r.trend,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "team_insights": {
      const d = await needDept(user, String(a.department));
      const ti = await import("./team-insights");
      try {
        const r = await ti.teamInsights(user, d.dept, { weeks: typeof a.weeks === "number" ? a.weeks : undefined });
        out.links.push({ href: `${d.dept === "dev" || d.dept === "marketing" ? `/${d.dept}` : `/d/${d.dept}`}/analyze`, label: `${d.title} analyzer` });
        return { department: r.title, weeks: r.weeks, totals: r.totals, cycle_days: r.cycle, lead_days: r.lead, statuses: r.statuses, bottleneck: r.bottleneck, members: r.members, insights: r.insights, risks: { overdue: r.risks.overdue.slice(0, 8), stuck: r.risks.stuck.slice(0, 8), blocked: r.risks.blocked.slice(0, 8), unowned: r.risks.unowned.slice(0, 8) } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "support_tickets": {
      const sd = await import("./support-desk");
      if (!(await sd.isAgent(user))) return { note: "This person is not a customer support agent." };
      const rows = a.waiting
        ? await all("SELECT id, number, subject, priority, status, created_at FROM sup_tickets WHERE assignee_id IS NULL AND status IN ('new','open') ORDER BY created_at LIMIT 20")
        : await all("SELECT id, number, subject, priority, status, created_at FROM sup_tickets WHERE assignee_id = ? AND status NOT IN ('solved','closed') ORDER BY created_at LIMIT 20", user.id);
      out.links.push({ href: "/support", label: "Customer support" });
      return rows;
    }
    case "leaderboard": {
      const rc = await import("./recognition");
      try {
        const r = await rc.leaderboard(user, (a.period as string) || undefined);
        return r;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "do_action": {
      const d = parsed.data as { kind: string; args?: Record<string, unknown> };
      if (!allowed.includes(d.kind)) return { error: `This person may not have "${d.kind}" done by the assistant. Tell them to do it on the page, or ask Admin.` };
      if (out.done.length >= agent.max) return { error: `The limit of ${agent.max} actions for one request is reached. Tell the person what is left.` };
      let pr: Awaited<ReturnType<typeof prepareOp>> | null = null;
      try {
        pr = await prepareOp(user, d.kind, (d.args ?? {}) as Record<string, string>);
        const r = await executeOp(user, pr.params);
        const step: AgentStep = { kind: d.kind, title: pr.title, lines: pr.lines, ok: true, result: r.done, href: r.href };
        out.done.push(step);
        await agentLog(user, out.conversationId, step);
        if (r.routine) out.links.push({ href: "/routines", label: "Routines" });
        return { ok: true, done: r.done };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const step: AgentStep = { kind: d.kind, title: pr?.title ?? d.kind, lines: pr?.lines ?? [], ok: false, result: msg, href: null };
        out.done.push(step);
        await agentLog(user, out.conversationId, step);
        return { error: msg };
      }
    }
    case "propose": {
      const d = parsed.data as { kind: string; args?: Record<string, unknown> };
      if (!allowed.includes(d.kind)) return { error: `This person may not have "${d.kind}" prepared. Tell them to do it on the page, or ask Admin.` };
      try {
        const pr = await proposeOp(user, d.kind, d.args ?? {});
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
- To do something (leave, attendance corrections, claims, tasks in any department, requests to other departments, approvals, running one of their routines), look up what you need, then call propose. Nothing happens until they press Confirm, so say what will happen and ask them to confirm. Never claim it is done. If the propose tool is missing or refuses the kind, tell them to do it on the page (offer open_page or show_me).
- When they ask where something is or to go somewhere, call open_page. When they want to be shown how, call show_me if a walk-through fits, else explain the steps and open the page.
- If something is outside the app or you are unsure, say so briefly and offer the Help search.

Pages: each question comes with the list of pages this person can open; offer only those (open_page refuses others). {home} is the person's own department page. Never suggest pages, actions or data outside what they may use; if they ask for something their role cannot do, say so plainly and name who can (their lead, HR, Finance or Admin).

Working well:
- For a request with several parts, plan the steps, read what you need first (ids, names, dates), then act or propose, and end with a short summary of what was done and what is left.
- Ask one short question when a detail is missing (which person, which day); otherwise use sensible defaults (today, this month).
- Prefer facts from the tools over guesses, and say when something has no data.

HR work (only for people with HR rights; the tools tell you): look people up (hr_people, hr_employee), see today's attendance (hr_attendance_day), the leave queue (hr_leave_queue), what falls due (probation, contracts, documents: hr_due) and the year's people numbers (hr_report). Then record a day or a missed check-in, approve or reject leave, adjust leave balances, open a case, record a one-to-one, assign training, open a job, or post an announcement. Always name the person and the day back to the user, and give a reason when the action asks for one.

Walk-throughs for show_me (pointing on the page): ${FLOWS.filter((f) => f.kind === "show").map((f) => `${f.key} (${f.title})`).join("; ")}.
Step-by-step tutorials for show_me: ${FLOWS.filter((f) => f.kind === "guide").map((f) => `${f.key} (${f.title})`).join("; ")}.

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
export async function askAi(user: Viewer, input: { history: Turn[]; text: string; page?: string | null; mode?: "ask" | "agent"; conversationId?: string | null }): Promise<Out> {
  const cfg = await stored();
  if (!(await aiAvailable(user))) throw new WorkflowError("FORBIDDEN", "The AI assistant is not on for you.");
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!text) throw new WorkflowError("VALIDATION", "Ask something.");
  const ro = await roleOptions(user.activeRole);
  const limit = ro.dailyLimit ?? cfg.dailyLimit;
  if (limit && (await usedToday(user.id)) >= limit) throw new WorkflowError("VALIDATION", `You reached today's ${limit} questions. The buttons and Help still work.`);
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
  const ab = await abilities(user);
  const allowed = await allowedOps(user, cfg, ab);
  // What this person can open and do, so the assistant never offers anything else.
  const { placesFor } = await import("./page-access");
  const pages = await placesFor(user, ctx.home?.base ?? null);
  const canDo = OPS.filter((o) => allowed.includes(o.key)).map((o) => o.label);
  messages[messages.length - 1] = {
    role: "user",
    content: `${who}\nPages this person can open (offer only these): ${pages.map((p) => `${p.name} ${p.href}`).join("; ")}.\nActions you may ${input.mode === "agent" ? "do" : "prepare"} for them: ${canDo.length ? canDo.join("; ") : "none (answer and point to pages only)"}.\nTheir rights: ${[ab.hr && "HR", ab.attendanceHr && "attendance for everyone", ab.attendance && !ab.attendanceHr && "their team's attendance", ab.cases && "HR cases", ab.lead && "leads a team", ab.approver && "approves requests", ab.finance && "finance", ab.support && "customer support agent", ab.admin && "Admin"].filter(Boolean).join(", ") || "a team member (their own work, leave and attendance)"}.\n\n${text}`,
  };
  const agentOn = input.mode === "agent" && (await agentAvailable(user));
  if (input.mode === "agent" && !agentOn) throw new WorkflowError("FORBIDDEN", "Agent mode is not on for you. Ask Admin, or use Ask mode.");
  const conversationId = await ensureConversation(user, input.conversationId ?? null, text, agentOn ? "agent" : "ask");
  const out: Out = { text: "", proposals: [], links: [], show: null, done: [], conversationId };
  const tools = toolDefs(allowed, agentOn, ab);
  const system = agentOn ? `${SYSTEM}\n\n${AGENT}` : SYSTEM;
  const call = fake() ? fakeModel : await realModel(cfg);
  const finish = async () => {
    await appendConversation(user, conversationId, text, out);
    return out;
  };
  for (let i = 0; i < (agentOn ? 16 : 8); i++) {
    let res: Awaited<ReturnType<ModelCall>>;
    try {
      res = await call({ system, tools, messages });
    } catch (e) {
      if (e instanceof WorkflowError) throw e;
      console.error("assistant", e);
      void import("./ops").then(({ recordError }) => recordError({ source: "action", message: `Assistant: ${e instanceof Error ? e.message : String(e)}`, stack: e instanceof Error ? e.stack : undefined }));
      out.text = "I could not finish that one. Try again, or ask in smaller steps.";
      return await finish();
    }
    if (res.stop_reason === "refusal") {
      out.text = "I cannot help with that one. Try the Help search, or ask your lead.";
      return await finish();
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
      return await finish();
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      let content: string;
      let isError = false;
      try {
        // Only the tools given to this person run, whatever the model asks for.
        content = tools.some((t) => t.name === u.name) ? JSON.stringify(await runTool(user, u.name, u.input, out, allowed, { on: agentOn, max: cfg.agentMax })).slice(0, 20000) : JSON.stringify({ error: "That is not available to this person's role. Tell them who can help." });
      } catch (e) {
        content = e instanceof Error ? e.message : String(e);
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  out.text = out.text || "That took too many steps. Try asking in smaller parts.";
  return await finish();
}

// The extra instructions in Agent mode.
const AGENT = `Agent mode is on: the person asked you to do things for them. Use do_action to do each step yourself, with their own permissions, instead of proposing. Before acting, look up what you need (ids, statuses, people). Do only what they asked; when a request is unclear or would change other people's work in a way they did not ask for, ask first. After acting, say in one or two lines what you did and anything that failed. Never claim something was done when do_action returned an error.`;

// ---------------------------------------------------------------------------
// Conversations (the side panel's history) and the agent's log
// ---------------------------------------------------------------------------

type SavedMsg = { from: "me" | "bot"; text: string; done?: AgentStep[]; at: string };

async function ensureConversation(user: Viewer, id: string | null, first: string, mode: string) {
  if (id) {
    const c = await get<{ id: string }>("SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?", id, user.id);
    if (c) {
      await run("UPDATE ai_conversations SET mode = ? WHERE id = ?", mode, id);
      return c.id;
    }
  }
  const nid = uid("aic_");
  await run("INSERT INTO ai_conversations (id, user_id, title, mode, messages, created_at, updated_at) VALUES (?, ?, ?, ?, '[]', ?, ?)", nid, user.id, first.replace(/\s+/g, " ").slice(0, 80), mode, nowIso(), nowIso());
  return nid;
}

async function appendConversation(user: Viewer, id: string, asked: string, out: Out) {
  const c = await get<{ messages: string }>("SELECT messages FROM ai_conversations WHERE id = ? AND user_id = ?", id, user.id);
  if (!c) return;
  const msgs = parseJson<SavedMsg[]>(c.messages, []);
  msgs.push({ from: "me", text: asked.slice(0, 2000), at: nowIso() }, { from: "bot", text: out.text.slice(0, 6000), ...(out.done.length ? { done: out.done } : {}), at: nowIso() });
  await run("UPDATE ai_conversations SET messages = ?, updated_at = ? WHERE id = ?", JSON.stringify(msgs.slice(-80)), nowIso(), id);
  // Each person keeps their 40 latest conversations.
  await run("DELETE FROM ai_conversations WHERE user_id = ? AND id NOT IN (SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40)", user.id, user.id);
}

export async function listConversations(user: AppUser) {
  return (await all<{ id: string; title: string; mode: string; updated_at: string; messages: string }>("SELECT id, title, mode, updated_at, messages FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40", user.id)).map((c) => ({
    id: c.id,
    title: c.title,
    mode: c.mode,
    updatedAt: c.updated_at,
    count: parseJson<SavedMsg[]>(c.messages, []).length,
  }));
}

export async function loadConversation(user: AppUser, id: string) {
  const c = await get<{ id: string; title: string; mode: string; messages: string }>("SELECT id, title, mode, messages FROM ai_conversations WHERE id = ? AND user_id = ?", id, user.id);
  if (!c) throw new WorkflowError("NOT_FOUND", "That conversation is gone.");
  return { id: c.id, title: c.title, mode: c.mode, messages: parseJson<SavedMsg[]>(c.messages, []) };
}

export async function deleteConversation(user: AppUser, id: string) {
  await run("DELETE FROM ai_conversations WHERE id = ? AND user_id = ?", id, user.id);
}

async function agentLog(user: Viewer, conversationId: string | null, s: AgentStep) {
  await run("INSERT INTO ai_agent_log (id, user_id, conversation_id, kind, title, result, ok, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("aal_"), user.id, conversationId, s.kind, s.title.slice(0, 300), s.result.slice(0, 500), s.ok ? 1 : 0, nowIso());
  await logAi(user, `confirm:${s.kind}`);
  if (s.ok) await audit({ actor: user }, { action: "assistant.agent", summary: `The assistant (Agent mode) did for ${user.name}: ${s.title}` });
}

// What the agent did, for the person (their own) and Admin (everyone).
export async function agentActivity(user: AppUser, opts: { everyone?: boolean; limit?: number } = {}) {
  const everyone = !!opts.everyone && can(user, "users.manage");
  return await all<{ id: string; user_name: string; kind: string; title: string; result: string | null; ok: number; at: string }>(
    `SELECT l.id, u.name AS user_name, l.kind, l.title, l.result, l.ok, l.at FROM ai_agent_log l JOIN users u ON u.id = l.user_id ${everyone ? "" : "WHERE l.user_id = ?"} ORDER BY l.at DESC LIMIT ${Math.max(1, Math.min(200, opts.limit ?? 50))}`,
    ...(everyone ? [] : [user.id]),
  );
}

// One write-up from data the app worked out (the team analyzer, an import check, an M&E report): no tools, the
// person's own data only. Counts as one question. Without the AI, null (the page shows its own summary).
export async function askAnalysis(user: Viewer, input: { task: string; data: unknown; question?: string | null }): Promise<string | null> {
  if (!(await aiAvailable(user))) return null;
  const cfg = await stored();
  const ro = await roleOptions(user.activeRole);
  const limit = ro.dailyLimit ?? cfg.dailyLimit;
  if (limit && (await usedToday(user.id)) >= limit) throw new WorkflowError("VALIDATION", `You reached today's ${limit} questions.`);
  await logAi(user, `analysis: ${input.task}`.slice(0, 200));
  const prompt = `${input.task}\n\n${input.question ? `The person asks: ${String(input.question).slice(0, 1000)}\n\n` : ""}The data (worked out by the app):\n${JSON.stringify(input.data).slice(0, 40000)}`;
  if (fake() && /JSON only/.test(input.task)) return "[]";
  if (fake()) return `Analysis: ${input.task.slice(0, 60)}. ${input.question ? `On "${input.question}": ` : ""}the data has ${Object.keys((input.data ?? {}) as object).length} parts.`;
  const call = await realModel(cfg);
  const res = await call({ system: SYSTEM, tools: [], messages: [{ role: "user", content: prompt }] });
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

type ModelCall = (r: { system: string; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<{ stop_reason: string | null; content: Anthropic.Beta.BetaContentBlock[] }>;

async function realModel(cfg: Stored): Promise<ModelCall> {
  const key = await apiKey();
  if (!key) throw new WorkflowError("INVALID_STATE", "No API key is set (Admin, Assistant, AI).");

  if (cfg.provider === "gemini") {
    const model = cfg.model.startsWith("gemini") ? cfg.model : "gemini-2.5-flash";
    return async ({ system, messages }) => {
      try {
        const contents = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
        }));
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
          }),
        });
        if (!res.ok) {
          throw new WorkflowError("INVALID_STATE", `Gemini API returned status ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received";
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text } as Anthropic.Beta.BetaTextBlock],
        };
      } catch (e: any) {
        throw new WorkflowError("INVALID_STATE", `Gemini error: ${e?.message || e}`);
      }
    };
  }

  if (cfg.provider === "openai" || cfg.provider === "custom") {
    const baseUrl = (cfg.customBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = cfg.provider === "custom" ? (cfg.model || "custom-model") : (cfg.model.startsWith("gpt") || cfg.model.startsWith("o") ? cfg.model : "gpt-4o-mini");
    return async ({ system, messages }) => {
      try {
        const formattedMessages = [
          { role: "system", content: system },
          ...messages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
        ];
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
          }),
        });
        if (!res.ok) {
          throw new WorkflowError("INVALID_STATE", `OpenAI API returned status ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "No response received";
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text } as Anthropic.Beta.BetaTextBlock],
        };
      } catch (e: any) {
        throw new WorkflowError("INVALID_STATE", `OpenAI/Custom API error: ${e?.message || e}`);
      }
    };
  }

  const client = new Anthropic({ apiKey: key, timeout: 90_000, maxRetries: 2 });
  return async ({ system, tools, messages }) => {
    try {
      const res = await client.beta.messages.create({
        model: cfg.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: cfg.effort },
        system: system === SYSTEM ? [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }] : [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: system.slice(SYSTEM.length).trim() }],
        tools,
        messages,
      });
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
const fakeModel: ModelCall = async ({ messages, tools }) => {
  const last = messages[messages.length - 1]!;
  const block = (b: Record<string, unknown>) => b as unknown as Anthropic.Beta.BetaContentBlock;
  if (Array.isArray(last.content) && (last.content as { type: string }[]).some((b) => b.type === "tool_result")) {
    const r = (last.content as { content: string }[]).map((b) => b.content).join("\n");
    return { stop_reason: "end_turn", content: [block({ type: "text", text: `Here is what I found: ${r.slice(0, 400)}`, citations: null })] };
  }
  const said = String(typeof last.content === "string" ? last.content : "").split("\n\n").pop()!;
  const q = said.toLowerCase();
  const use = (name: string, input: object) => ({ stop_reason: "tool_use", content: [block({ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2, 10)}`, name, input, caller: { type: "direct" } })] });
  // Tests: "tool:<name> {json}" calls that tool directly.
  const forced = said.match(/^tool:(\w+)\s*(\{.*\})?\s*$/);
  if (forced) return use(forced[1]!, forced[2] ? JSON.parse(forced[2]) : {});
  if (/leave|balance/.test(q) && !/ask for/.test(q)) return use("my_leave", {});
  const agent = tools.some((t) => t.name === "do_action");
  const create = said.match(/create (?:a )?task (.+?) in (\w+)/i);
  if (create) return use(agent ? "do_action" : "propose", { kind: "create_task", args: { department: create[2], title: create[1] } });
  const team = said.match(/how is (?:my )?team (?:in )?(\w+)/i);
  if (team) return use("team_insights", { department: team[1] });
  if (/scorecard|my kpi/.test(q)) return use("my_scorecard", {});
  const look = said.match(/^search (.+)$/i);
  if (look) return use("search_everything", { text: look[1] });
  if (/waiting for my (approval|decision)|to approve/.test(q)) return use("my_approvals", {});
  const runIt = said.match(/^run (?:my )?routine (rtn_\w+)/i);
  if (runIt) return use("propose", { kind: "run_routine", args: { routine_id: runIt[1] } });
  if (/my work|my tasks|what should i do/.test(q)) return use("my_work", {});
  if (/where|open|go to/.test(q)) return use("open_page", { href: "/attendance", label: "Attendance" });
  if (/who is|find/.test(q)) return use("find_people", { text: q.replace(/.*(who is|find)\s*/, "") });
  return { stop_reason: "end_turn", content: [block({ type: "text", text: "I can look at your work, leave and attendance, find people and pages, and prepare actions for you to confirm.", citations: null })] };
};
