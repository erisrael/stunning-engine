// Development tools and integrations for a work department (Phase 12b.5), set up in Configure, Tools by its head:
// - an API key for other tools to report to the app: CI/CD deployments per environment, incidents (Sentry or any
//   monitoring), test runs, and GitLab merge requests (linked to tasks by their code, e.g. WEB-12, in the title or
//   branch; a merged one moves the task on, as GitHub's do);
// - webhooks out (task created, status changed, release shipped, deployment, incident) signed with a secret, and
//   short notices to a Slack channel or a Telegram chat;
// - releases with versions (1.4.0) and their deployments; test cases linked to requirements, with runs (pass, fail,
//   blocked; a failed run files a bug with the steps); incidents with severity and a timeline, time to restore for
//   DORA; a traceability matrix from requirements to tasks, pull requests, tests and the release;
// - import from Jira (CSV), Trello (JSON) and Asana (CSV), and export to Jira's CSV.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { loadUser, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { deptManagers } from "./departments";
import { getDeptConfig } from "./dept-config";
import { importTasks, listTasks, saveTask } from "./work";
import { workAccess } from "./dept-config";
import { deptPeople } from "./departments";
import { cachedPrsByCode } from "./github";

type ToolsConfig = { keyHash: string | null; keyHint: string | null; webhooks: { id: string; url: string; events: string[]; secretEnc: string }[]; slack: string | null; telegram: { tokenEnc: string; chatId: string } | null; notify: string[] };
const DEFAULT: ToolsConfig = { keyHash: null, keyHint: null, webhooks: [], slack: null, telegram: null, notify: ["release", "deploy", "incident"] };
export const EVENTS = ["task.created", "task.status", "release", "deploy", "incident", "test.failed"] as const;

const key = (d: string) => `cfg.devtools.${d}`;
async function toolsConfig(d: string): Promise<ToolsConfig> {
  return { ...DEFAULT, ...parseJson<Partial<ToolsConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key(d)))?.value, {}) };
}
async function saveTools(user: AppUser, d: string, c: ToolsConfig) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key(d),
    JSON.stringify(c),
    nowIso(),
    user.id,
  );
}
async function needConfigure(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  if (!a.rights.configure) throw new WorkflowError("FORBIDDEN", "Only the department's head sets up its tools.");
  return a;
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// The view for Configure, Tools (no secrets).
export async function toolsView(user: AppUser, d: string) {
  await needConfigure(user, d);
  const c = await toolsConfig(d);
  return { keyHint: c.keyHint, webhooks: c.webhooks.map((w) => ({ id: w.id, url: w.url, events: w.events })), slack: !!c.slack, telegram: c.telegram ? { chatId: c.telegram.chatId } : null, notify: c.notify };
}

// A new API key, shown once; the old one stops working.
export async function newApiKey(user: AppUser, d: string) {
  const a = await needConfigure(user, d);
  const k = `msk_${a.dept}_${crypto.randomBytes(24).toString("base64url")}`;
  const c = await toolsConfig(a.dept);
  await saveTools(user, a.dept, { ...c, keyHash: sha(k), keyHint: `${k.slice(0, 10)}…${k.slice(-4)}` });
  await audit({ actor: user }, { action: `${a.dept}.tools`, summary: `${user.name} made a new API key for ${a.config.title}` });
  return k;
}

export async function saveToolsSettings(user: AppUser, d: string, input: { webhooks?: { url: string; events: string[] }[]; slack?: string | null; telegram?: { token?: string | null; chatId: string } | null; notify?: string[] }) {
  const a = await needConfigure(user, d);
  const c = await toolsConfig(a.dept);
  const webhooks = [];
  for (const w of (input.webhooks ?? c.webhooks).slice(0, 10)) {
    const url = String(w.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) continue;
    const old = c.webhooks.find((x) => x.url === url);
    webhooks.push({ id: old?.id ?? uid("whk_"), url, events: (w.events ?? []).filter((e) => (EVENTS as readonly string[]).includes(e)), secretEnc: old?.secretEnc ?? (await seal(crypto.randomBytes(24).toString("hex"))) });
  }
  const slack = input.slack === undefined ? c.slack : input.slack && /^https:\/\/hooks\.slack\.com\//.test(input.slack) ? input.slack : null;
  let telegram = c.telegram;
  if (input.telegram === null) telegram = null;
  else if (input.telegram) telegram = { tokenEnc: input.telegram.token ? await seal(input.telegram.token) : (c.telegram?.tokenEnc ?? ""), chatId: String(input.telegram.chatId ?? "").trim() };
  if (telegram && (!telegram.tokenEnc || !telegram.chatId)) throw new WorkflowError("VALIDATION", "Telegram needs the bot token and the chat ID.");
  await saveTools(user, a.dept, { ...c, webhooks, slack, telegram, notify: (input.notify ?? c.notify).filter((e) => (EVENTS as readonly string[]).includes(e) || ["release", "deploy", "incident"].includes(e)) });
}

// The secret of a webhook, to check our signatures on the other side (shown to the head on request).
export async function webhookSecret(user: AppUser, d: string, id: string) {
  const a = await needConfigure(user, d);
  const w = (await toolsConfig(a.dept)).webhooks.find((x) => x.id === id);
  if (!w) throw new WorkflowError("NOT_FOUND", "Webhook not found.");
  return await unseal(w.secretEnc);
}

// ---------------------------------------------------------------------------
// Out: webhooks, Slack and Telegram
// ---------------------------------------------------------------------------

type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<void>;
let poster: Poster = async (url, body, headers) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    await fetch(url, { method: "POST", body, headers, signal: ctl.signal });
  } catch {
    // The other side is down: it is not the app's job to retry forever.
  } finally {
    clearTimeout(t);
  }
};
// Tests replace the network.
export function setPoster(p: Poster) {
  poster = p;
}

export async function emitDev(d: string, event: (typeof EVENTS)[number], payload: Record<string, unknown>, text: string) {
  const c = await toolsConfig(d).catch(() => null);
  if (!c) return;
  const body = JSON.stringify({ event, department: d, at: nowIso(), ...payload });
  const sends: Promise<void>[] = [];
  for (const w of c.webhooks.filter((x) => x.events.includes(event))) {
    const secret = (await unseal(w.secretEnc)) ?? "";
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    sends.push(poster(w.url, body, { "Content-Type": "application/json", "X-Myseed-Event": event, "X-Myseed-Signature": `sha256=${sig}` }));
  }
  const short = event.split(".")[0]!;
  if (c.notify.includes(short) || c.notify.includes(event)) {
    if (c.slack) sends.push(poster(c.slack, JSON.stringify({ text }), { "Content-Type": "application/json" }));
    if (c.telegram) {
      const token = await unseal(c.telegram.tokenEnc);
      if (token) sends.push(poster(`https://api.telegram.org/bot${token}/sendMessage`, JSON.stringify({ chat_id: c.telegram.chatId, text }), { "Content-Type": "application/json" }));
    }
  }
  await Promise.all(sends);
}

// ---------------------------------------------------------------------------
// In: the API key and the events other tools send
// ---------------------------------------------------------------------------

export async function checkApiKey(d: string, k: string | null | undefined) {
  if (!k) return false;
  const c = await toolsConfig(d);
  return !!c.keyHash && crypto.timingSafeEqual(Buffer.from(c.keyHash), Buffer.from(sha(k)));
}

// The department's first head or lead acts for tools (tasks they file say so).
async function actorFor(d: string) {
  const id = (await deptManagers(d))[0];
  const u = id ? await loadUser(id) : null;
  if (!u) throw new WorkflowError("INVALID_STATE", "The department has no head or lead to act for the tool.");
  return u;
}

const codesIn = (s: string) => [...new Set((s.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) ?? []))];

export async function handleEvent(d: string, body: Record<string, unknown>, headers: { gitlab?: string | null; sentry?: string | null }) {
  // GitLab merge request hooks.
  if (headers.gitlab === "Merge Request Hook" || body.object_kind === "merge_request") {
    const mr = (body.object_attributes ?? {}) as Record<string, unknown>;
    const project = String((body.project as Record<string, unknown> | undefined)?.path_with_namespace ?? "gitlab");
    const title = String(mr.title ?? "");
    const branch = String(mr.source_branch ?? "");
    const state = mr.state === "merged" ? "merged" : mr.draft || mr.work_in_progress ? "draft" : "open";
    for (const code of codesIn(`${title} ${branch}`))
      await run(
        `INSERT INTO dev_merge_requests (dept, repo, number, code, title, url, branch, state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (dept, repo, number, code) DO UPDATE SET title = excluded.title, url = excluded.url, branch = excluded.branch, state = excluded.state, updated_at = excluded.updated_at`,
        d,
        project,
        Number(mr.iid ?? 0),
        code,
        title.slice(0, 300),
        String(mr.url ?? ""),
        branch.slice(0, 200),
        state,
        nowIso(),
      );
    if (state === "merged") {
      const { applyMergedPullRequests } = await import("./dept-flow");
      await applyMergedPullRequests();
    }
    return { ok: true, kind: "merge_request" };
  }
  // Sentry issue alerts.
  if (headers.sentry || (body.data && (body.data as Record<string, unknown>).issue)) {
    const issue = ((body.data as Record<string, unknown>)?.issue ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? "created");
    if (action === "resolved") return await resolveIncidentBy(d, String(issue.id ?? ""));
    return await openIncident(d, { title: String(issue.title ?? "Error in production"), severity: issue.level === "fatal" ? "sev1" : issue.level === "error" ? "sev2" : "sev3", externalId: String(issue.id ?? ""), url: String(issue.permalink ?? issue.web_url ?? ""), source: "sentry" });
  }
  switch (body.type) {
    case "deploy":
      return await recordDeployment(d, { environment: String(body.environment ?? "production"), version: body.version ? String(body.version) : null, status: body.status === "failed" ? "failed" : "ok", commit: body.commit ? String(body.commit) : null, url: body.url ? String(body.url) : null, source: String(body.source ?? "ci") });
    case "incident":
      return await openIncident(d, { title: String(body.title ?? "Incident"), severity: String(body.severity ?? "sev3"), externalId: body.id ? String(body.id) : null, url: body.url ? String(body.url) : null, source: String(body.source ?? "monitoring") });
    case "incident_resolved":
      return await resolveIncidentBy(d, String(body.id ?? ""));
    case "test_run":
      return await recordRunFromTool(d, body);
  }
  throw new WorkflowError("VALIDATION", "Unknown event; send type deploy, incident, incident_resolved or test_run, a GitLab merge request hook or a Sentry alert.");
}

// GitLab merge requests next to GitHub's pull requests, by task code (for the task card and the merge rule).
export async function gitlabPrsByCode(d: string) {
  const rows = await all<{ code: string; repo: string; number: number; title: string; url: string; branch: string; state: string }>("SELECT code, repo, number, title, url, branch, state FROM dev_merge_requests WHERE dept = ?", d);
  const out = new Map<string, { number: number; title: string; url: string; branch: string; state: "open" | "draft" | "merged"; checks: null; repo: string }[]>();
  for (const r of rows) out.set(r.code, [...(out.get(r.code) ?? []), { number: Number(r.number), title: r.title, url: r.url, branch: r.branch, state: r.state as "open", checks: null, repo: r.repo }]);
  return out;
}

// ---------------------------------------------------------------------------
// Releases and deployments
// ---------------------------------------------------------------------------

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][\w.]+)?$/;

export async function recordDeployment(d: string, input: { environment: string; version: string | null; status: "ok" | "failed"; commit: string | null; url: string | null; source: string }) {
  const env = input.environment.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "production";
  const version = input.version?.trim().slice(0, 40) || null;
  const rel = version ? await get<{ id: string; name: string }>("SELECT id, name FROM dept_releases WHERE dept = ? AND (version = ? OR name = ?) ORDER BY created_at DESC LIMIT 1", d, version.replace(/^v/, ""), version) : null;
  const id = uid("dep_");
  await run("INSERT INTO dev_deployments (id, dept, environment, version, release_id, status, commit_sha, url, source, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, d, env, version, rel?.id ?? null, input.status, input.commit?.slice(0, 64) ?? null, input.url?.slice(0, 300) ?? null, input.source.slice(0, 30), nowIso());
  await emitDev(d, "deploy", { environment: env, version, status: input.status, release: rel?.name ?? null }, `${input.status === "ok" ? "Deployed" : "Deployment failed:"} ${version ?? "a build"} to ${env}`);
  return { ok: true, id, release: rel?.id ?? null };
}

export async function setReleaseVersion(user: AppUser, d: string, releaseId: string, version: string) {
  const a = await workAccess(user, d, "write");
  if (!a.rights.seeAll) throw new WorkflowError("FORBIDDEN", "Only leads and heads name releases.");
  const m = version.trim().match(SEMVER);
  if (!m) throw new WorkflowError("VALIDATION", "Use a version like 1.4.0.");
  await run("UPDATE dept_releases SET version = ? WHERE id = ? AND dept = ?", `${m[1]}.${m[2]}.${m[3]}`, releaseId, a.dept);
}

// The next version after the latest (patch, minor or major).
export async function nextVersion(d: string, bump: "major" | "minor" | "patch" = "minor") {
  const rows = await all<{ version: string | null }>("SELECT version FROM dept_releases WHERE dept = ? AND version IS NOT NULL", d);
  const best = rows
    .map((r) => r.version!.match(SEMVER))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const)
    .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0] ?? [0, 0, 0];
  return bump === "major" ? `${best[0] + 1}.0.0` : bump === "minor" ? `${best[0]}.${best[1] + 1}.0` : `${best[0]}.${best[1]}.${best[2] + 1}`;
}

export async function releasesWithDeploys(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const rel = await all<{ id: string; name: string; version: string | null; task_count: number; created_at: string }>("SELECT id, name, version, task_count, created_at FROM dept_releases WHERE dept = ? ORDER BY created_at DESC LIMIT 30", a.dept);
  const deps = await all<{ id: string; environment: string; version: string | null; release_id: string | null; status: string; at: string; url: string | null }>("SELECT id, environment, version, release_id, status, at, url FROM dev_deployments WHERE dept = ? ORDER BY at DESC LIMIT 200", a.dept);
  const envs = [...new Set(deps.map((x) => x.environment))];
  return {
    environments: envs.map((e) => ({ name: e, latest: deps.find((x) => x.environment === e && x.status === "ok") ?? null })),
    releases: rel.map((r) => ({ ...r, deployments: deps.filter((x) => x.release_id === r.id) })),
    deployments: deps.slice(0, 50),
  };
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export async function openIncident(d: string, input: { title: string; severity: string; externalId: string | null; url: string | null; source: string }, by?: AppUser) {
  const sev = ["sev1", "sev2", "sev3", "sev4"].includes(input.severity) ? input.severity : "sev3";
  if (input.externalId) {
    const cur = await get<{ id: string }>("SELECT id FROM dev_incidents WHERE dept = ? AND external_id = ? AND status = 'open'", d, input.externalId);
    if (cur) return { ok: true, id: cur.id, again: true };
  }
  const actor = by ?? (await actorFor(d));
  const cfg = await getDeptConfig(d);
  const bugType = cfg.types.find((t) => t.key === "bug")?.key;
  const prio = cfg.priorities.find((p) => /urgent|critical|highest/i.test(p.label))?.key ?? cfg.priorities[0]?.key;
  const bug = await saveTask(actor, d, { title: `[${sev.toUpperCase()}] ${input.title}`.slice(0, 200), description: `Opened from ${input.source}${input.url ? `: ${input.url}` : ""}.`, ...(bugType ? { type: bugType } : {}), ...(sev === "sev1" || sev === "sev2" ? { priority: prio } : {}) }, { automations: true });
  const id = uid("inc_");
  const now = nowIso();
  await run(
    "INSERT INTO dev_incidents (id, dept, title, severity, status, started_at, source, external_id, url, bug_task_id, timeline, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)",
    id,
    d,
    input.title.slice(0, 200),
    sev,
    now,
    input.source.slice(0, 30),
    input.externalId,
    input.url,
    bug,
    JSON.stringify([{ at: now, text: `Opened from ${input.source}` }]),
    now,
  );
  await emitDev(d, "incident", { id, title: input.title, severity: sev, status: "open" }, `Incident ${sev.toUpperCase()}: ${input.title}`);
  return { ok: true, id, bugTaskId: bug };
}

async function resolveIncidentBy(d: string, externalId: string) {
  const cur = await get<{ id: string }>("SELECT id FROM dev_incidents WHERE dept = ? AND external_id = ? AND status = 'open'", d, externalId);
  if (!cur) return { ok: true, id: null };
  await closeIncident(cur.id, "Resolved by the monitoring tool");
  return { ok: true, id: cur.id };
}
async function closeIncident(id: string, text: string) {
  const r = await get<{ timeline: string; dept: string; title: string }>("SELECT timeline, dept, title FROM dev_incidents WHERE id = ?", id);
  if (!r) return;
  const now = nowIso();
  await run("UPDATE dev_incidents SET status = 'resolved', resolved_at = ?, timeline = ? WHERE id = ?", now, JSON.stringify([...parseJson<{ at: string; text: string }[]>(r.timeline, []), { at: now, text }]), id);
  await emitDev(r.dept, "incident", { id, title: r.title, status: "resolved" }, `Resolved: ${r.title}`);
}

export async function listIncidents(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const rows = await all<{ id: string; title: string; severity: string; status: string; started_at: string; resolved_at: string | null; source: string; url: string | null; bug_task_id: string | null; postmortem_doc_id: string | null; timeline: string }>(
    "SELECT id, title, severity, status, started_at, resolved_at, source, url, bug_task_id, postmortem_doc_id, timeline FROM dev_incidents WHERE dept = ? ORDER BY started_at DESC LIMIT 100",
    a.dept,
  );
  return rows.map((r) => ({ ...r, timeline: parseJson<{ at: string; text: string }[]>(r.timeline, []) }));
}

export async function incidentAction(user: AppUser, d: string, input: { id?: string; title?: string; severity?: string; note?: string; resolve?: boolean; postmortemDocId?: string | null }) {
  const a = await workAccess(user, d, "write");
  if (!input.id) return await openIncident(a.dept, { title: String(input.title ?? "").trim() || "Incident", severity: input.severity ?? "sev3", externalId: null, url: null, source: "by hand" }, user);
  const r = await get<{ timeline: string }>("SELECT timeline FROM dev_incidents WHERE id = ? AND dept = ?", input.id, a.dept);
  if (!r) throw new WorkflowError("NOT_FOUND", "Incident not found.");
  if (input.note?.trim()) await run("UPDATE dev_incidents SET timeline = ? WHERE id = ?", JSON.stringify([...parseJson<{ at: string; text: string }[]>(r.timeline, []), { at: nowIso(), text: `${user.name}: ${input.note.trim().slice(0, 500)}` }]), input.id);
  if (input.postmortemDocId !== undefined) await run("UPDATE dev_incidents SET postmortem_doc_id = ? WHERE id = ?", input.postmortemDocId, input.id);
  if (input.resolve) await closeIncident(input.id, `Resolved by ${user.name}`);
  return { ok: true, id: input.id };
}

// DORA's fourth measure: the median time from an incident opening to being resolved, over 90 days.
export async function timeToRestoreHours(d: string) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const rows = await all<{ started_at: string; resolved_at: string }>("SELECT started_at, resolved_at FROM dev_incidents WHERE dept = ? AND status = 'resolved' AND started_at >= ?", d, since);
  const h = rows.map((r) => (Date.parse(r.resolved_at) - Date.parse(r.started_at)) / 36e5).sort((x, y) => x - y);
  return h.length ? Math.round(h[Math.floor(h.length / 2)]! * 10) / 10 : null;
}

// ---------------------------------------------------------------------------
// Test cases and runs
// ---------------------------------------------------------------------------

export async function saveTestCase(user: AppUser, d: string, input: { id?: string | null; title: string; steps: string; expected: string; requirement?: string | null; docId?: string | null }) {
  const a = await workAccess(user, d, "write");
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new WorkflowError("VALIDATION", "Give the test a title.");
  const req = input.requirement?.trim().toUpperCase().slice(0, 20) || null;
  if (input.id) {
    await run("UPDATE dev_test_cases SET title = ?, steps = ?, expected = ?, requirement = ?, doc_id = ? WHERE id = ? AND dept = ?", title, input.steps.slice(0, 4000), input.expected.slice(0, 2000), req, input.docId ?? null, input.id, a.dept);
    return input.id;
  }
  const id = uid("tc_");
  await run("INSERT INTO dev_test_cases (id, dept, title, steps, expected, requirement, doc_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, a.dept, title, input.steps.slice(0, 4000), input.expected.slice(0, 2000), req, input.docId ?? null, user.id, nowIso());
  return id;
}

export async function listTestCases(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const cases = await all<{ id: string; title: string; steps: string; expected: string; requirement: string | null; doc_id: string | null }>("SELECT id, title, steps, expected, requirement, doc_id FROM dev_test_cases WHERE dept = ? ORDER BY requirement NULLS LAST, title", a.dept);
  const runs = await all<{ case_id: string; result: string; at: string; release: string | null; bug_task_id: string | null }>(
    "SELECT r.case_id, r.result, r.at, rl.name AS release, r.bug_task_id FROM dev_test_runs r LEFT JOIN dept_releases rl ON rl.id = r.release_id WHERE r.dept = ? ORDER BY r.at DESC",
    a.dept,
  );
  return cases.map((c) => ({ ...c, last: runs.find((r) => r.case_id === c.id) ?? null, runs: runs.filter((r) => r.case_id === c.id).length }));
}

export async function recordTestRun(user: AppUser, d: string, input: { caseId: string; result: "pass" | "fail" | "blocked"; note?: string | null; releaseId?: string | null }) {
  const a = await workAccess(user, d, "write");
  return await addRun(a.dept, user, input);
}
async function addRun(d: string, user: AppUser, input: { caseId: string; result: "pass" | "fail" | "blocked"; note?: string | null; releaseId?: string | null }) {
  const c = await get<{ title: string; steps: string; expected: string; requirement: string | null }>("SELECT title, steps, expected, requirement FROM dev_test_cases WHERE id = ? AND dept = ?", input.caseId, d);
  if (!c) throw new WorkflowError("NOT_FOUND", "Test case not found.");
  if (!["pass", "fail", "blocked"].includes(input.result)) throw new WorkflowError("VALIDATION", "The result is pass, fail or blocked.");
  let bug: string | null = null;
  if (input.result === "fail") {
    const cfg = await getDeptConfig(d);
    const bugType = cfg.types.find((t) => t.key === "bug")?.key;
    bug = await saveTask(user, d, {
      title: `Test failed: ${c.title}`.slice(0, 200),
      description: `Steps to reproduce:\n${c.steps}\n\nExpected:\n${c.expected}\n\n${input.note ? `What happened:\n${input.note}\n` : ""}${c.requirement ? `\nRequirement: ${c.requirement}` : ""}`,
      ...(bugType ? { type: bugType } : {}),
    });
  }
  const id = uid("tr_");
  await run("INSERT INTO dev_test_runs (id, dept, case_id, release_id, result, note, bug_task_id, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, d, input.caseId, input.releaseId ?? null, input.result, input.note?.slice(0, 2000) ?? null, bug, user.id, nowIso());
  if (input.result === "fail") await emitDev(d, "test.failed", { case: c.title, bug }, `Test failed: ${c.title}`);
  return { ok: true, id, bugTaskId: bug };
}
async function recordRunFromTool(d: string, body: Record<string, unknown>) {
  const actor = await actorFor(d);
  const caseId = body.caseId ? String(body.caseId) : (await get<{ id: string }>("SELECT id FROM dev_test_cases WHERE dept = ? AND lower(title) = lower(?)", d, String(body.caseTitle ?? "")))?.id;
  if (!caseId) throw new WorkflowError("NOT_FOUND", "Unknown test case; send caseId or the exact caseTitle.");
  const rel = body.version ? await get<{ id: string }>("SELECT id FROM dept_releases WHERE dept = ? AND version = ?", d, String(body.version).replace(/^v/, "")) : null;
  return await addRun(d, actor, { caseId, result: (["pass", "fail", "blocked"].includes(String(body.result)) ? body.result : "fail") as "pass", note: body.note ? String(body.note) : null, releaseId: rel?.id ?? null });
}

// ---------------------------------------------------------------------------
// Traceability: each requirement to its tasks, pull requests, tests and release
// ---------------------------------------------------------------------------

export async function traceability(user: AppUser, d: string, docId: string) {
  const a = await workAccess(user, d);
  const doc = await get<{ body: string; title: string }>("SELECT body, title FROM dept_docs WHERE id = ? AND dept = ?", docId, a.dept);
  if (!doc) throw new WorkflowError("NOT_FOUND", "Document not found.");
  const reqs = [...new Set((doc.body.match(/\b(?:FR|NFR|REQ)-\d+\b/g) ?? []))];
  const links = await all<{ req: string; task_id: string }>("SELECT req, task_id FROM dept_doc_links WHERE doc_id = ?", docId);
  const tasks = new Map((await listTasks(user, a.dept, { open: false })).tasks.map((t) => [t.id, t]));
  // GitHub's pull requests and GitLab's merge requests together (cachedPrsByCode includes both).
  const prs = await cachedPrsByCode(a.dept);
  const cases = await all<{ id: string; title: string; requirement: string | null }>("SELECT id, title, requirement FROM dev_test_cases WHERE dept = ? AND (doc_id = ? OR doc_id IS NULL)", a.dept, docId);
  const lastRun = async (caseId: string) => (await get<{ result: string }>("SELECT result FROM dev_test_runs WHERE case_id = ? ORDER BY at DESC LIMIT 1", caseId))?.result ?? null;
  const rels = new Map((await all<{ id: string; name: string; version: string | null }>("SELECT id, name, version FROM dept_releases WHERE dept = ?", a.dept)).map((r) => [r.id, r]));
  const rows = [];
  for (const req of reqs) {
    const ts = links.filter((l) => l.req === req).map((l) => tasks.get(l.task_id)).filter((t): t is NonNullable<typeof t> => !!t);
    const tc = cases.filter((c) => c.requirement === req);
    const results = await Promise.all(tc.map((c) => lastRun(c.id)));
    const release = ts.map((t) => (t as unknown as { release_id?: string | null }).release_id).find((x) => x && rels.has(x));
    rows.push({
      requirement: req,
      tasks: ts.map((t) => ({ code: t.code, title: t.title, done: t.status_category === "done" })),
      pullRequests: ts.flatMap((t) => prs.get(t.code.toUpperCase()) ?? []).map((p) => ({ number: p.number, state: p.state, url: p.url })),
      tests: tc.map((c, i) => ({ title: c.title, result: results[i] })),
      release: release ? (rels.get(release)!.version ?? rels.get(release)!.name) : null,
      covered: ts.length > 0 && tc.length > 0,
    });
  }
  return { title: doc.title, rows, uncovered: rows.filter((r) => !r.covered).map((r) => r.requirement) };
}

// ---------------------------------------------------------------------------
// Import from Jira, Trello and Asana; export to Jira's CSV
// ---------------------------------------------------------------------------

function csv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (f += '"', i++);
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") (cur.push(f), (f = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(f);
      f = "";
      if (cur.some((x) => x !== "")) rows.push(cur);
      cur = [];
    } else f += ch;
  }
  cur.push(f);
  if (cur.some((x) => x !== "")) rows.push(cur);
  const [head, ...rest] = rows;
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// Finished items are left out unless asked for (as most moves between tools do); with includeDone they come in
// finished, under the department's own rules (checklists, subtasks), and any refused are listed.
export async function importFrom(user: AppUser, d: string, source: "jira" | "trello" | "asana", text: string, opts: { includeDone?: boolean } = {}) {
  const a = await workAccess(user, d, "write");
  const cfg = a.config;
  const byCat = (cat: string) => cfg.statuses.find((s) => s.active && s.category === cat)?.key;
  const status = (v: string) => {
    const s = v.trim().toLowerCase();
    const own = cfg.statuses.find((x) => x.key === s || x.label.toLowerCase() === s);
    if (own) return own.key;
    if (/done|closed|resolved|complete/.test(s)) return byCat("done");
    if (/progress|doing|review|testing/.test(s)) return byCat("active");
    return byCat("open");
  };
  const type = (v: string) => cfg.types.find((t) => t.key === v.trim().toLowerCase() || t.label.toLowerCase() === v.trim().toLowerCase())?.key ?? "";
  let rows: Record<string, string>[] = [];
  if (source === "jira")
    rows = csv(text).map((r) => ({ title: r["Summary"] ?? "", description: r["Description"] ?? "", type: type(r["Issue Type"] ?? ""), status: status(r["Status"] ?? "") ?? "", priority: (r["Priority"] ?? "").toLowerCase(), assignee: r["Assignee"] ?? "", due_date: (r["Due Date"] ?? r["Due date"] ?? "").slice(0, 10), labels: r["Labels"] ?? "" }));
  else if (source === "asana")
    rows = csv(text).map((r) => ({ title: r["Name"] ?? "", description: r["Notes"] ?? "", status: status(r["Completed At"] ? "done" : (r["Section/Column"] ?? "")) ?? "", assignee: r["Assignee Email"] || r["Assignee"] || "", due_date: (r["Due Date"] ?? "").slice(0, 10), labels: r["Tags"] ?? "" }));
  else {
    const j = parseJson<{ lists?: { id: string; name: string }[]; cards?: { name: string; desc: string; idList: string; closed: boolean; due: string | null; labels?: { name: string }[] }[] }>(text, {});
    const lists = new Map((j.lists ?? []).map((l) => [l.id, l.name]));
    rows = (j.cards ?? []).filter((c) => !c.closed).map((c) => ({ title: c.name, description: c.desc, status: status(lists.get(c.idList) ?? "") ?? "", due_date: (c.due ?? "").slice(0, 10), labels: (c.labels ?? []).map((l) => l.name).join(";") }));
  }
  // Priorities by label; unknown ones are left to the default.
  for (const r of rows) r.priority = cfg.priorities.find((p) => p.key === r.priority || p.label.toLowerCase() === r.priority)?.key ?? "";
  const doneKeys = new Set(cfg.statuses.filter((x) => x.category === "done").map((x) => x.key));
  const finished = rows.filter((r) => doneKeys.has(r.status ?? ""));
  if (!opts.includeDone) rows = rows.filter((r) => !doneKeys.has(r.status ?? ""));
  // People not in the department are left unassigned rather than failing the row.
  const people = await deptPeople(a.dept);
  const known = (w: string) => !!w && people.some((p) => p.email.toLowerCase() === w.trim().toLowerCase() || p.name.toLowerCase() === w.trim().toLowerCase());
  const res = await importTasks(user, a.dept, rows.filter((r) => r.title?.trim()).map((r) => ({ ...r, assignee: known(r.assignee ?? "") ? r.assignee! : "" })));
  await audit({ actor: user }, { action: `${a.dept}.import`, summary: `${user.name} imported ${res.created} tasks from ${source}` });
  return { ...res, skippedDone: opts.includeDone ? 0 : finished.length };
}

export async function exportJiraCsv(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const ts = (await listTasks(user, a.dept, { open: false })).tasks;
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lab = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;
  const head = ["Issue key", "Summary", "Issue Type", "Status", "Priority", "Assignee", "Reporter", "Created", "Updated", "Due Date", "Labels", "Description", "Parent"];
  const lines = ts.map((t) => [t.code, t.title, lab(a.config.types, t.type), lab(a.config.statuses, t.status), lab(a.config.priorities, t.priority), t.assignee_name, t.reporter_name, t.created_at, t.updated_at, t.due_date, t.labels.join(" "), t.description, t.parent_code].map(cell).join(","));
  return [head.map(cell).join(","), ...lines].join("\r\n");
}
