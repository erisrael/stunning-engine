// The IVR engine (Update 1.2, Phase 9, spec part F). Admin builds call flows as graphs of nodes (src/lib/support-ivr.ts),
// saves drafts, publishes numbered versions and switches a flow on. A caller who taps Call in the Mini App or widget
// goes through the active flow first: the server decides every step, the caller's screen speaks or plays each prompt
// and shows the choices as a keypad (Telegram calls are browser calls, not phone-network calls, so there are no real
// DTMF tones). The flow ends by routing the caller to a queue or agent, taking a voice message, asking for a call-back
// or ending. Channel adapters: "web" (Mini App and widget) works today; a phone line (SIP) would be a second adapter
// reading the same screens, and is listed as not connected.
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import * as Q from "./support-queues";
import { getSettings } from "./settings";
import { openAt } from "@/lib/support-queues";
import { OPEN_REQUEST_STATUSES } from "@/lib/support-requests";
import {
  DEFAULT_IVR_SETTINGS,
  INPUT_NODES,
  IVR_NODE_LABELS,
  defaultIvrGraph,
  portsOf,
  textOf,
  validateIvr,
  type IvrGraph,
  type IvrLang,
  type IvrNode,
  type IvrNodeType,
  type IvrScreen,
} from "@/lib/support-ivr";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export const IVR_CHANNELS = [
  { key: "web", label: "Mini App and website widget (browser calls)", connected: true },
  { key: "sip", label: "Phone line (SIP or a telephony provider)", connected: false },
];

// ---------------------------------------------------------------------------
// Flows: draft, publish, versions, activate
// ---------------------------------------------------------------------------

type FlowRow = { id: string; name: string; app_id: string | null; lang: string | null; category: string | null; draft: string; published_version: number | null; active: number; updated_by: string | null; created_at: string; updated_at: string };

async function needLead(user: AppUser) {
  if (!(await sd.isLead(user)) && !can(user, "support.ivr")) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to edit the phone menu change it.");
}

// Cleans a graph from the builder: known node types only, bounded sizes, text trimmed.
export function sanitizeGraph(raw: unknown): IvrGraph {
  const g = (raw && typeof raw === "object" ? raw : {}) as Partial<IvrGraph>;
  const types = Object.keys(IVR_NODE_LABELS) as IvrNodeType[];
  const txt = (t: unknown) => {
    const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return { en: clean(o.en, 1000), am: clean(o.am, 1000) };
  };
  const nodes: IvrNode[] = (Array.isArray(g.nodes) ? g.nodes : []).slice(0, 200).flatMap((n): IvrNode[] => {
    if (!n || typeof n !== "object" || !types.includes(n.type) || !/^[A-Za-z0-9_-]{1,40}$/.test(String(n.id))) return [];
    const next: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(n.next ?? {})) if (/^[a-z]+(:[0-9*#])?$/.test(k)) next[k] = v ? clean(v, 40) : null;
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.config ?? {}).slice(0, 20)) if (/^[A-Za-z]{1,30}$/.test(k)) config[k] = Array.isArray(v) ? v.slice(0, 60).map((x) => (typeof x === "number" ? x : clean(x, 40))) : typeof v === "number" || typeof v === "boolean" || v === null ? v : clean(v, 200);
    return [
      {
        id: String(n.id),
        type: n.type,
        x: Math.max(0, Math.min(6000, Math.round(Number(n.x) || 0))),
        y: Math.max(0, Math.min(6000, Math.round(Number(n.y) || 0))),
        ...(n.name ? { name: clean(n.name, 60) } : {}),
        ...(n.text ? { text: txt(n.text) } : {}),
        ...(n.audioUrl ? { audioUrl: clean(n.audioUrl, 500) } : {}),
        ...(Array.isArray(n.options)
          ? {
              options: n.options.slice(0, 12).map((o) => ({
                key: clean(o.key, 1),
                label: txt(o.label),
                ...(o.lang === "am" || o.lang === "en" ? { lang: o.lang } : {}),
                ...(o.category ? { category: clean(o.category, 40).toLowerCase() } : {}),
              })),
            }
          : {}),
        next,
        config,
      },
    ];
  });
  const s = (g.settings ?? {}) as Partial<IvrGraph["settings"]>;
  return {
    start: g.start && nodes.some((n) => n.id === g.start) ? g.start : (nodes[0]?.id ?? null),
    nodes,
    settings: {
      timeoutSec: Math.max(3, Math.min(60, Math.round(Number(s.timeoutSec) || DEFAULT_IVR_SETTINGS.timeoutSec))),
      maxRetries: Math.max(0, Math.min(5, Math.round(Number(s.maxRetries ?? DEFAULT_IVR_SETTINGS.maxRetries)))),
      invalid: s.invalid ? txt(s.invalid) : DEFAULT_IVR_SETTINGS.invalid,
      noInput: s.noInput ? txt(s.noInput) : DEFAULT_IVR_SETTINGS.noInput,
      announcement: { on: !!s.announcement?.on, text: txt(s.announcement?.text) },
    },
  };
}

// The spec's example flow is made once, switched off, for Admin to adjust and publish.
async function ensureDefaultFlow() {
  if (await get("SELECT 1 AS x FROM sup_ivr_flows LIMIT 1")) return;
  const now = nowIso();
  await run("INSERT INTO sup_ivr_flows (id, name, draft, active, created_at, updated_at) VALUES (?, 'Main line', ?, 0, ?, ?)", uid("ivr_"), JSON.stringify(defaultIvrGraph()), now, now);
}

const flowOut = (f: FlowRow) => ({ id: f.id, name: f.name, appId: f.app_id, lang: f.lang, category: f.category, publishedVersion: f.published_version, active: !!Number(f.active), updatedAt: f.updated_at });
export type IvrFlowSummary = ReturnType<typeof flowOut>;

export async function listFlows(user: AppUser) {
  await needLead(user);
  await ensureDefaultFlow();
  return (await all<FlowRow>("SELECT * FROM sup_ivr_flows ORDER BY created_at")).map(flowOut);
}

export async function flowDetail(user: AppUser, id: string) {
  await needLead(user);
  const f = await get<FlowRow>("SELECT * FROM sup_ivr_flows WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Flow not found.");
  const versions = await all<{ version: number; note: string | null; published_at: string; by: string | null }>(
    "SELECT v.version, v.note, v.published_at, u.name AS by FROM sup_ivr_versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.flow_id = ? ORDER BY v.version DESC",
    id,
  );
  const graph = sanitizeGraph(parseJson(f.draft, {}));
  return { flow: flowOut(f), graph, check: validateIvr(graph), versions };
}

export async function saveFlowDraft(user: AppUser, input: { id?: string | null; name: string; appId?: string | null; lang?: string | null; category?: string | null; graph: unknown }) {
  await needLead(user);
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the flow, for example \"Main line\".");
  const graph = sanitizeGraph(input.graph);
  const lang = input.lang === "en" || input.lang === "am" ? input.lang : null;
  const category = clean(input.category, 40).toLowerCase() || null;
  const appId = input.appId && (await get("SELECT 1 AS x FROM sup_apps WHERE id = ?", input.appId)) ? input.appId : null;
  const now = nowIso();
  let id = input.id ?? null;
  if (id) {
    const done = await get<{ id: string }>("UPDATE sup_ivr_flows SET name = ?, app_id = ?, lang = ?, category = ?, draft = ?, updated_by = ?, updated_at = ? WHERE id = ? RETURNING id", name, appId, lang, category, JSON.stringify(graph), user.id, now, id);
    if (!done) throw new WorkflowError("NOT_FOUND", "Flow not found.");
  } else {
    id = uid("ivr_");
    await run("INSERT INTO sup_ivr_flows (id, name, app_id, lang, category, draft, active, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)", id, name, appId, lang, category, JSON.stringify(graph), user.id, now, now);
  }
  return { id, check: validateIvr(graph) };
}

export async function publishFlow(user: AppUser, id: string, note?: string | null) {
  await needLead(user);
  const f = await get<FlowRow>("SELECT * FROM sup_ivr_flows WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Flow not found.");
  const graph = sanitizeGraph(parseJson(f.draft, {}));
  const { errors } = validateIvr(graph);
  if (errors.length) throw new WorkflowError("VALIDATION", `Fix the flow first: ${errors[0]!.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`);
  const version = await tx(async () => {
    const v = Number((await get<{ m: number | null }>("SELECT MAX(version) AS m FROM sup_ivr_versions WHERE flow_id = ?", id))?.m ?? 0) + 1;
    await run("INSERT INTO sup_ivr_versions (id, flow_id, version, graph, note, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("ivv_"), id, v, JSON.stringify(graph), clean(note, 300) || null, user.id, nowIso());
    await run("UPDATE sup_ivr_flows SET published_version = ?, updated_at = ? WHERE id = ?", v, nowIso(), id);
    return v;
  });
  await audit({ actor: user }, { action: "support.ivr", summary: `${user.name} published version ${version} of the phone menu ${f.name}` });
  return version;
}

export async function restoreFlowVersion(user: AppUser, id: string, version: number) {
  await needLead(user);
  const v = await get<{ graph: string }>("SELECT graph FROM sup_ivr_versions WHERE flow_id = ? AND version = ?", id, version);
  if (!v) throw new WorkflowError("NOT_FOUND", "Version not found.");
  await run("UPDATE sup_ivr_flows SET draft = ?, updated_by = ?, updated_at = ? WHERE id = ?", v.graph, user.id, nowIso(), id);
}

export async function setFlowActive(user: AppUser, id: string, on: boolean) {
  await needLead(user);
  const f = await get<FlowRow>("SELECT * FROM sup_ivr_flows WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Flow not found.");
  if (on && !f.published_version) throw new WorkflowError("INVALID_STATE", "Publish the flow before switching it on.");
  await run("UPDATE sup_ivr_flows SET active = ?, updated_at = ? WHERE id = ?", on ? 1 : 0, nowIso(), id);
  await audit({ actor: user }, { action: "support.ivr", summary: `${user.name} switched the phone menu ${f.name} ${on ? "on" : "off"}` });
}

export async function deleteFlow(user: AppUser, id: string) {
  await needLead(user);
  const f = await get<FlowRow>("SELECT * FROM sup_ivr_flows WHERE id = ?", id);
  if (!f) return;
  if (Number(f.active)) throw new WorkflowError("INVALID_STATE", "Switch the flow off before deleting it.");
  await run("DELETE FROM sup_ivr_flows WHERE id = ?", id);
  await audit({ actor: user }, { action: "support.ivr", summary: `${user.name} deleted the phone menu ${f.name}` });
}

// The flow a caller hears: active flows for their app first, then for every app; a flow set to a language or topic
// is used only when the caller's language or topic matches.
export async function activeFlowFor(appId: string | null, lang: IvrLang | null, category: string | null) {
  const flows = await all<FlowRow>("SELECT * FROM sup_ivr_flows WHERE active = 1 AND published_version IS NOT NULL");
  const fits = flows.filter((f) => (!f.app_id || f.app_id === appId) && (!f.lang || f.lang === lang) && (!f.category || f.category === category));
  const score = (f: FlowRow) => (f.app_id ? 4 : 0) + (f.category ? 2 : 0) + (f.lang ? 1 : 0);
  const f = fits.sort((a, b) => score(b) - score(a))[0];
  if (!f) return null;
  const v = await get<{ graph: string }>("SELECT graph FROM sup_ivr_versions WHERE flow_id = ? AND version = ?", f.id, f.published_version);
  return v ? { flow: f, version: Number(f.published_version), graph: sanitizeGraph(parseJson(v.graph, {})) } : null;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

type State = { nodeId: string | null; lang: IvrLang; vars: Record<string, string>; retries: number; category: string | null; lastMenu: string | null };
type Ctx = { customerId: string | null; appId: string | null; now: string; log?: (kind: string, nodeId: string | null, input?: string | null) => Promise<void> };
type Step = { state: State; screen: Omit<IvrScreen, "sessionId">; outcome: string | null; queueId: string | null; agentId: string | null };

async function customerFacts(customerId: string | null) {
  if (!customerId) return { verified: false, known: false, phone: null as string | null, email: null as string | null, tags: [] as string[] };
  const c = await get<{ verified: number; phone: string | null; email: string | null; external_id: string | null; meta: string }>("SELECT verified, phone, email, external_id, meta FROM sup_customers WHERE id = ?", customerId);
  return { verified: !!Number(c?.verified), known: !!(c && (Number(c.verified) || c.phone || c.email || c.external_id)), phone: c?.phone ?? null, email: c?.email ?? null, tags: (parseJson<{ tags?: string[] }>(c?.meta, {}).tags ?? []).map((t) => String(t).toLowerCase()) };
}

async function resolveQueue(cfg: Record<string, unknown>, category: string | null) {
  if (cfg.queueId && (await get("SELECT 1 AS x FROM sup_queues WHERE id = ? AND active = 1", String(cfg.queueId)))) return String(cfg.queueId);
  const want = String(cfg.category ?? category ?? "").toLowerCase();
  const qs = (await sd.listQueues()).filter((q) => q.active);
  if (want) {
    const hit = qs.find((q) => q.name.toLowerCase().includes(want) || q.keywords.includes(want));
    if (hit) return hit.id;
  }
  return qs[0]?.id ?? null;
}

// Runs the flow from the caller's current node until it needs a key press or ends. input is the key (or digits) the
// caller pressed, or "#timeout" when they pressed nothing in time.
export async function runIvr(g: IvrGraph, st: State, input: string | null, ctx: Ctx): Promise<Step> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const state = { ...st, vars: { ...st.vars } };
  const say: IvrScreen["say"] = [];
  const speak = (n: IvrNode) => {
    const text = textOf(n.text, state.lang);
    if (text || n.audioUrl) say.push({ text, audioUrl: n.audioUrl ?? null });
  };
  const log = ctx.log ?? (async () => {});
  const done = (action: NonNullable<IvrScreen["done"]>["action"], extra: Partial<NonNullable<IvrScreen["done"]>> = {}, queueId: string | null = null, agentId: string | null = null): Step => ({
    state: { ...state, nodeId: null },
    screen: { lang: state.lang, say, ask: null, done: { action, category: state.category, ...extra } },
    outcome: action,
    queueId,
    agentId,
  });
  let cur: string | null = state.nodeId ?? g.start;
  if (!state.nodeId && g.settings.announcement.on && textOf(g.settings.announcement.text, state.lang)) say.push({ text: textOf(g.settings.announcement.text, state.lang), audioUrl: null });
  let pending = input;
  const facts = await customerFacts(ctx.customerId);
  for (let steps = 0; steps < 80; steps++) {
    const n = cur ? byId.get(cur) : undefined;
    if (!n) {
      await log("end", cur, null);
      return done("end");
    }
    const go = (port: string) => {
      cur = n.next[port] ?? null;
    };
    const c = n.config ?? {};
    if (INPUT_NODES.includes(n.type)) {
      if (pending === null) {
        state.nodeId = n.id;
        if (n.type === "menu") state.lastMenu = n.id;
        speak(n);
        const options = (n.options ?? []).map((o) => ({ key: o.key, label: textOf(o.label, state.lang) }));
        return {
          state,
          screen: { lang: state.lang, say, ask: n.type === "dtmf" ? { kind: "digits", options: [], maxDigits: Math.max(1, Math.min(20, Number(c.maxDigits) || 10)), timeoutSec: g.settings.timeoutSec } : { kind: "choice", options, timeoutSec: g.settings.timeoutSec }, done: null },
          outcome: null,
          queueId: null,
          agentId: null,
        };
      }
      const key = pending;
      pending = null;
      const opt = n.type === "dtmf" ? null : (n.options ?? []).find((o) => o.key === key);
      const digitsOk = n.type === "dtmf" && /^\d{1,20}$/.test(key) && key.length <= (Number(c.maxDigits) || 10);
      if (opt || digitsOk) {
        await log("choice", n.id, key);
        state.retries = 0;
        if (opt?.lang) state.lang = opt.lang;
        if (opt?.category) state.category = opt.category;
        if (digitsOk) {
          state.vars[String(c.variable || "value")] = key;
          go("next");
        } else go(`opt:${key}`);
        continue;
      }
      state.retries += 1;
      await log(key === "#timeout" ? "timeout" : "invalid", n.id, key === "#timeout" ? null : key.slice(0, 20));
      if (state.retries > g.settings.maxRetries) {
        state.retries = 0;
        go("fail");
        if (!cur) return done("end", {}, null);
        continue;
      }
      say.push({ text: textOf(key === "#timeout" ? g.settings.noInput : g.settings.invalid, state.lang), audioUrl: null });
      continue; // asks again at the same node
    }
    await log("enter", n.id, null);
    switch (n.type) {
      case "welcome":
      case "tts":
      case "audio":
        speak(n);
        go("next");
        break;
      case "hours": {
        const open = openAt({ days: (Array.isArray(c.days) ? c.days : []).map(Number), from: String(c.from ?? "00:00"), to: String(c.to ?? "23:59") }, ctx.now);
        go(open ? "open" : "closed");
        break;
      }
      case "holiday": {
        const today = new Date(Date.parse(ctx.now) + 3 * 3600e3).toISOString().slice(0, 10);
        const own = (Array.isArray(c.dates) ? c.dates : []).map(String);
        const workspace = c.useCompany === false ? [] : (await getSettings()).calendar.holidays.map((h) => h.date);
        go(own.includes(today) || workspace.includes(today) ? "holiday" : "normal");
        break;
      }
      case "condition": {
        const v = String(c.value ?? "").toLowerCase();
        let yes = false;
        if (c.field === "verified") yes = facts.verified;
        else if (c.field === "lang") yes = state.lang === v;
        else if (c.field === "category") yes = (state.category ?? "") === v;
        else if (c.field === "tag") yes = facts.tags.includes(v);
        else if (c.field === "var") yes = (state.vars[String(c.variable ?? "")] ?? "") === String(c.value ?? "");
        else if (c.field === "has_open_ticket") yes = !!ctx.customerId && !!(await get("SELECT 1 AS x FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed')", ctx.customerId));
        else if (c.field === "has_open_request") yes = !!ctx.customerId && !!(await get(`SELECT 1 AS x FROM sup_requests WHERE customer_id = ? AND status IN (${OPEN_REQUEST_STATUSES.map(() => "?").join(",")})`, ctx.customerId, ...OPEN_REQUEST_STATUSES));
        go(yes ? "yes" : "no");
        break;
      }
      case "identify": {
        let known = facts.known;
        // A phone number typed earlier (a keypad node collecting "phone") can identify a caller who is not signed in.
        if (!known && state.vars.phone) known = !!(await get("SELECT 1 AS x FROM sup_customers WHERE phone LIKE ?", `%${state.vars.phone.slice(-9)}`));
        go(known ? "known" : "unknown");
        break;
      }
      case "payment": {
        const days = Math.max(1, Math.min(180, Number(c.days) || 30));
        const since = new Date(Date.parse(ctx.now) - days * 864e5).toISOString();
        const phone = (facts.phone ?? state.vars.phone ?? "").replace(/\D/g, "").slice(-9);
        const rows = phone || facts.email ? await all<{ status: string }>(`SELECT status FROM chapa_transactions WHERE created_at >= ? AND (${[phone ? "phone LIKE ?" : null, facts.email ? "LOWER(email) = ?" : null].filter(Boolean).join(" OR ")}) ORDER BY created_at DESC LIMIT 20`, since, ...(phone ? [`%${phone}`] : []), ...(facts.email ? [facts.email.toLowerCase()] : [])) : [];
        go(rows.some((r) => /success/i.test(r.status)) ? "paid" : rows.length ? "failed" : "none");
        break;
      }
      case "repeat":
        cur = state.lastMenu ?? g.start;
        state.retries = 0;
        break;
      case "department":
      case "queue":
      case "transfer": {
        let queueId: string | null = null;
        if (n.type === "department") queueId = (await all<{ id: string }>("SELECT id FROM sup_queues WHERE active = 1 AND department = ? ORDER BY sort", String(c.department ?? "")))[0]?.id ?? null;
        else if (n.type === "transfer" && c.agentId) {
          if ((await sd.availableAgents(null, undefined, { ignoreLimit: true })).some((a) => a.userId === c.agentId)) {
            speak(n);
            await log("routed", n.id, `agent:${c.agentId}`);
            return done("agent", { agentId: String(c.agentId) }, null, String(c.agentId));
          }
        } else queueId = await resolveQueue(c, state.category);
        const admitted = queueId ? await Q.admitCall(queueId) : null;
        if (queueId && admitted && !admitted.refused) {
          speak(n);
          await log("routed", n.id, `queue:${admitted.queueId}`);
          return done("queue", { queueId: admitted.queueId }, admitted.queueId);
        }
        await log("full", n.id, admitted?.refused ?? "none");
        go("full");
        if (!cur) {
          say.push({ text: state.lang === "am" ? "ሁሉም ወኪሎቻችን ተይዘዋል። እባክዎ መልእክት ይተዉ ወይም መልሰን እንድንደውል ይጠይቁ።" : "All our agents are busy. Please leave a message or ask us to call you back.", audioUrl: null });
          return done("callback");
        }
        break;
      }
      case "agent": {
        const id = String(c.agentId ?? "");
        if ((await sd.availableAgents(null, undefined, { ignoreLimit: true })).some((a) => a.userId === id)) {
          speak(n);
          await log("routed", n.id, `agent:${id}`);
          return done("agent", { agentId: id }, null, id);
        }
        go("unavailable");
        if (!cur) return done("callback");
        break;
      }
      case "voicemail":
        speak(n);
        await log("routed", n.id, "voicemail");
        return done("voicemail", { maxSec: Math.max(10, Math.min(300, Number(c.maxSec) || 120)) });
      case "callback":
        speak(n);
        await log("routed", n.id, "callback");
        return done("callback");
      case "end":
        speak(n);
        await log("end", n.id, null);
        return done("end");
      default:
        go("next");
    }
  }
  throw new WorkflowError("INVALID_STATE", "The phone menu went round in a loop. Tell the support team.");
}

const fresh = (lang: IvrLang): State => ({ nodeId: null, lang, vars: {}, retries: 0, category: null, lastMenu: null });

type SessionRow = { id: string; flow_id: string; version: number; customer_id: string | null; app_id: string | null; node_id: string | null; lang: string; vars: string; retries: number; status: string; category: string | null };

async function persist(s: { id: string; flowId: string }, step: Step) {
  const st = step.state;
  const status = step.outcome ? (["queue", "agent"].includes(step.outcome) ? "routed" : "ended") : "active";
  await run(
    "UPDATE sup_ivr_sessions SET node_id = ?, lang = ?, vars = ?, retries = ?, category = ?, status = ?, outcome = COALESCE(?, outcome), queue_id = COALESCE(?, queue_id), agent_id = COALESCE(?, agent_id), updated_at = ?, ended_at = CASE WHEN ? = 'active' THEN NULL ELSE ? END WHERE id = ?",
    st.nodeId,
    st.lang,
    JSON.stringify({ ...st.vars, __lastMenu: st.lastMenu ?? "" }),
    st.retries,
    st.category,
    status,
    step.outcome,
    step.queueId,
    step.agentId,
    nowIso(),
    status,
    nowIso(),
    s.id,
  );
}

const logger = (sessionId: string, flowId: string) => async (kind: string, nodeId: string | null, input?: string | null) => {
  await run("INSERT INTO sup_ivr_events (id, session_id, flow_id, node_id, kind, input, at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("ive_"), sessionId, flowId, nodeId, kind, input ?? null, nowIso());
};

// A caller taps Call: the active flow starts, or null when there is none (the call then goes straight to the queue).
export async function customerStartIvr(app: sd.AppFull, token: string, input: { lang?: string | null; topic?: string | null }) {
  const c = await sd.customerByToken(app, token);
  // Nobody online: say so before the menu, not after it (Admin, Support: check for an online agent first).
  const cfg = await sd.supportConfig();
  if (cfg.callsEnabled === false) throw new WorkflowError("INVALID_STATE", "Calls are switched off right now. Write to us here and we will answer.");
  if (cfg.checkAgentsFirst !== false && !(await sd.availableAgents(null, cfg, { ignoreLimit: true })).length) throw new WorkflowError("INVALID_STATE", cfg.awayMessage || "No agent is online right now. Leave a message or ask us to call you back.");
  const lang: IvrLang = input.lang === "am" ? "am" : "en";
  const topic = clean(input.topic, 40).toLowerCase() || null;
  const f = await activeFlowFor(app.id, lang, topic);
  if (!f) return null;
  const id = uid("ivs_");
  const now = nowIso();
  await run("INSERT INTO sup_ivr_sessions (id, flow_id, version, customer_id, app_id, channel, lang, category, started_at, updated_at) VALUES (?, ?, ?, ?, ?, 'web', ?, ?, ?, ?)", id, f.flow.id, f.version, c.id, app.id, lang, topic, now, now);
  const step = await runIvr(f.graph, { ...fresh(lang), category: topic }, null, { customerId: c.id, appId: app.id, now, log: logger(id, f.flow.id) });
  await persist({ id, flowId: f.flow.id }, step);
  return { sessionId: id, ...step.screen } satisfies IvrScreen;
}

export async function customerIvrInput(app: sd.AppFull, token: string, sessionId: string, key: string) {
  const c = await sd.customerByToken(app, token);
  const s = await get<SessionRow>("SELECT * FROM sup_ivr_sessions WHERE id = ? AND customer_id = ?", sessionId, c.id);
  if (!s) throw new WorkflowError("NOT_FOUND", "The phone menu has ended. Call again.");
  if (s.status !== "active") throw new WorkflowError("INVALID_STATE", "The phone menu has ended. Call again.");
  const v = await get<{ graph: string }>("SELECT graph FROM sup_ivr_versions WHERE flow_id = ? AND version = ?", s.flow_id, s.version);
  if (!v) throw new WorkflowError("NOT_FOUND", "The phone menu has changed. Call again.");
  const vars = parseJson<Record<string, string>>(s.vars, {});
  const lastMenu = vars.__lastMenu || null;
  delete vars.__lastMenu;
  const k = clean(key, 24);
  const step = await runIvr(sanitizeGraph(parseJson(v.graph, {})), { nodeId: s.node_id, lang: s.lang === "am" ? "am" : "en", vars, retries: Number(s.retries), category: s.category, lastMenu }, k || "#timeout", { customerId: c.id, appId: app.id, now: nowIso(), log: logger(s.id, s.flow_id) });
  await persist({ id: s.id, flowId: s.flow_id }, step);
  return { sessionId: s.id, ...step.screen } satisfies IvrScreen;
}

export async function customerLeaveIvr(app: sd.AppFull, token: string, sessionId: string) {
  const c = await sd.customerByToken(app, token);
  await run("UPDATE sup_ivr_sessions SET status = 'ended', outcome = COALESCE(outcome, 'hung_up'), ended_at = ?, updated_at = ? WHERE id = ? AND customer_id = ? AND status = 'active'", nowIso(), nowIso(), sessionId, c.id);
}

// A voice message from the menu: kept on the caller's open conversation (or a new one) as an audio file.
export async function customerVoicemail(app: sd.AppFull, token: string, input: { sessionId?: string | null; mime?: string; data?: string }) {
  const c = await sd.customerByToken(app, token);
  const mime = clean(input.mime, 100).split(";")[0] || "audio/webm";
  if (!/^audio\//.test(mime)) throw new WorkflowError("VALIDATION", "A voice message is an audio recording.");
  const s = input.sessionId ? await get<{ category: string | null }>("SELECT category FROM sup_ivr_sessions WHERE id = ? AND customer_id = ?", input.sessionId, c.id) : null;
  const open = await get<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed') ORDER BY updated_at DESC LIMIT 1", c.id);
  const ticketId = open?.id ?? (await sd.customerCreateTicket(app, token, { subject: "Voice message", message: "Left a voice message from the phone menu.", topic: s?.category ?? null }));
  const r = await sd.customerUpload(app, token, ticketId, { name: "voice-message.webm", mime, data: input.data, caption: "Voice message from the phone menu" });
  if (input.sessionId) await run("UPDATE sup_ivr_sessions SET outcome = 'voicemail_left', updated_at = ? WHERE id = ? AND customer_id = ?", nowIso(), input.sessionId, c.id);
  await sd.activity(null, ticketId, "voicemail", "Voice message from the phone menu");
  return { ticketId, fileId: r.id };
}

// Admin's test call: runs the draft (or any graph) with the keys given, without a session, and shows each screen.
export async function testIvr(user: AppUser, graph: unknown, keys: string[], opts: { lang?: IvrLang; now?: string } = {}) {
  await needLead(user);
  const g = sanitizeGraph(graph);
  const check = validateIvr(g);
  if (!g.start) return { check, steps: [] };
  const steps: { input: string | null; screen: Omit<IvrScreen, "sessionId">; at: string | null }[] = [];
  let st = fresh(opts.lang ?? "en");
  let step = await runIvr(g, st, null, { customerId: null, appId: null, now: opts.now ?? nowIso() });
  steps.push({ input: null, screen: step.screen, at: step.state.nodeId });
  for (const k of keys.slice(0, 30)) {
    if (step.outcome) break;
    st = step.state;
    step = await runIvr(g, st, clean(k, 24) || "#timeout", { customerId: null, appId: null, now: opts.now ?? nowIso() });
    steps.push({ input: k, screen: step.screen, at: step.state.nodeId });
  }
  return { check, steps };
}

// IVR use for the reports: sessions, how they ended, and which choices callers pressed at each menu.
export async function ivrStats(user: AppUser, range: { from: string; to: string }) {
  await needLead(user);
  const from = `${range.from}T00:00:00.000Z`;
  const to = `${range.to}T23:59:59.999Z`;
  const outcomes = await all<{ outcome: string | null; n: number }>("SELECT outcome, COUNT(*) AS n FROM sup_ivr_sessions WHERE test = 0 AND started_at BETWEEN ? AND ? GROUP BY outcome", from, to);
  const choices = await all<{ flow_id: string; node_id: string; input: string; n: number }>("SELECT flow_id, node_id, input, COUNT(*) AS n FROM sup_ivr_events WHERE kind = 'choice' AND at BETWEEN ? AND ? GROUP BY flow_id, node_id, input ORDER BY n DESC", from, to);
  const errs = await all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM sup_ivr_events WHERE kind IN ('invalid','timeout','full') AND at BETWEEN ? AND ? GROUP BY kind", from, to);
  // Name each choice from the flow's published graph.
  const graphs = new Map<string, IvrGraph>();
  for (const f of await all<{ id: string; graph: string }>("SELECT f.id, v.graph FROM sup_ivr_flows f JOIN sup_ivr_versions v ON v.flow_id = f.id AND v.version = f.published_version")) graphs.set(f.id, sanitizeGraph(parseJson(f.graph, {})));
  const label = (flowId: string, nodeId: string, key: string) => {
    const n = graphs.get(flowId)?.nodes.find((x) => x.id === nodeId);
    const o = n?.options?.find((x) => x.key === key);
    return { menu: n ? n.name || IVR_NODE_LABELS[n.type] : nodeId, choice: o ? `${key}: ${textOf(o.label, "en")}` : key };
  };
  return {
    sessions: outcomes.reduce((a, r) => a + Number(r.n), 0),
    outcomes: outcomes.map((r) => ({ outcome: r.outcome ?? "in progress", n: Number(r.n) })),
    choices: choices.slice(0, 40).map((c) => ({ ...label(c.flow_id, c.node_id, c.input), n: Number(c.n) })),
    invalid: Number(errs.find((e) => e.kind === "invalid")?.n ?? 0),
    timeouts: Number(errs.find((e) => e.kind === "timeout")?.n ?? 0),
    full: Number(errs.find((e) => e.kind === "full")?.n ?? 0),
  };
}

export { portsOf };
