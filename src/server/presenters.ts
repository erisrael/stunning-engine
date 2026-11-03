// Presenters, releases and fees (Phase 16.1).
// - Presenters (teachers, guests, students) with contact, subjects, the names they appear under on parts and
//   sessions (the part's Teacher and the session's Presenter), and a fee: per session, per part or per hour.
// - Releases: the signed consent to be filmed and for the videos to be used (where, until when), with the scanned
//   form. With "Releases required" on (Presenters, Settings), a part cannot leave Recording without a valid release
//   for its presenter (a requirement like the others). Releases about to expire warn HR and the Recording leads.
// - Fees: a monthly statement per presenter from the recorded sessions and parts; sent to Finance, who make it a
//   bill for the presenter (a vendor) with one press.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, isLeadOf, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { listParties, saveParty, saveBill } from "./finance";

export type PresenterConfig = { requireRelease: boolean; warnDays: number };
export type Presenter = {
  id: string;
  name: string;
  kind: "teacher" | "guest" | "student";
  phone: string | null;
  email: string | null;
  subjects: string | null;
  aliases: string[];
  rateKind: "session" | "part" | "hour" | null;
  rate: number | null;
  active: boolean;
  release: { id: string; signedOn: string; expiresOn: string | null; scope: string | null; fileName: string | null } | null;
  releaseState: "valid" | "expiring" | "expired" | "none";
};

export const canPresenters = (u: AppUser) => can(u, "users.manage") || can(u, "hr.access") || can(u, "items.plan") || isLeadOf(u, "recording");
const canFinance = (u: AppUser) => can(u, "finance.access");
function need(u: AppUser) {
  if (!canPresenters(u)) throw new WorkflowError("FORBIDDEN", "Only HR, managers and the Recording lead manage presenters.");
}

export async function presenterConfig(): Promise<PresenterConfig> {
  const v = parseJson<Partial<PresenterConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.presenters'"))?.value, {});
  return { requireRelease: !!v.requireRelease, warnDays: Number(v.warnDays ?? 30) };
}
export async function savePresenterConfig(user: AppUser, input: Partial<PresenterConfig>) {
  need(user);
  const cur = await presenterConfig();
  const next = { requireRelease: input.requireRelease ?? cur.requireRelease, warnDays: Math.max(1, Math.min(180, Math.round(Number(input.warnDays ?? cur.warnDays)))) };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.presenters', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.presenters", summary: `${user.name} ${next.requireRelease ? "required" : "stopped requiring"} presenter releases before parts leave Recording` });
}

const today = () => nowIso().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

type Row = { id: string; name: string; kind: string; phone: string | null; email: string | null; subjects: string | null; aliases: string | null; rate_kind: string | null; rate: number | null; active: number };

async function latestRelease(presenterId: string) {
  return await get<{ id: string; signed_on: string; expires_on: string | null; scope: string | null; file_name: string | null }>(
    "SELECT id, signed_on, expires_on, scope, file_name FROM presenter_releases WHERE presenter_id = ? ORDER BY COALESCE(expires_on, '9999-12-31') DESC, signed_on DESC LIMIT 1",
    presenterId,
  );
}
function stateOf(r: { expires_on: string | null } | undefined | null, warnDays: number): Presenter["releaseState"] {
  if (!r) return "none";
  if (!r.expires_on) return "valid";
  if (r.expires_on < today()) return "expired";
  return r.expires_on <= plusDays(today(), warnDays) ? "expiring" : "valid";
}

export async function listPresenters(user: AppUser): Promise<Presenter[]> {
  need(user);
  const cfg = await presenterConfig();
  const rows = await all<Row>("SELECT * FROM presenters ORDER BY active DESC, name");
  const out: Presenter[] = [];
  for (const r of rows) {
    const rel = await latestRelease(r.id);
    out.push({
      id: r.id,
      name: r.name,
      kind: r.kind as Presenter["kind"],
      phone: r.phone,
      email: r.email,
      subjects: r.subjects,
      aliases: parseJson<string[]>(r.aliases, []),
      rateKind: (r.rate_kind as Presenter["rateKind"]) ?? null,
      rate: r.rate === null ? null : Number(r.rate),
      active: !!Number(r.active),
      release: rel ? { id: rel.id, signedOn: rel.signed_on, expiresOn: rel.expires_on, scope: rel.scope, fileName: rel.file_name } : null,
      releaseState: stateOf(rel, cfg.warnDays),
    });
  }
  return out;
}

export async function savePresenter(user: AppUser, input: { id?: string | null; name: string; kind?: string; phone?: string | null; email?: string | null; subjects?: string | null; aliases?: string[]; rateKind?: string | null; rate?: number | null; active?: boolean }) {
  need(user);
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Give the presenter's name.");
  const kind = ["teacher", "guest", "student"].includes(String(input.kind)) ? input.kind! : "teacher";
  const rateKind = ["session", "part", "hour"].includes(String(input.rateKind)) ? input.rateKind! : null;
  const rate = rateKind && Number(input.rate) > 0 ? Math.round(Number(input.rate) * 100) / 100 : null;
  const aliases = (input.aliases ?? []).map((a) => String(a).trim().slice(0, 120)).filter(Boolean).slice(0, 10);
  const now = nowIso();
  const vals = [name, kind, input.phone?.trim().slice(0, 40) || null, input.email?.trim().slice(0, 120) || null, input.subjects?.trim().slice(0, 300) || null, JSON.stringify(aliases), rateKind, rate, input.active === false ? 0 : 1];
  if (input.id) {
    await run("UPDATE presenters SET name = ?, kind = ?, phone = ?, email = ?, subjects = ?, aliases = ?, rate_kind = ?, rate = ?, active = ?, updated_at = ? WHERE id = ?", ...vals, now, input.id);
    return input.id;
  }
  const id = uid("prs_");
  await run("INSERT INTO presenters (id, name, kind, phone, email, subjects, aliases, rate_kind, rate, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, ...vals, now, now);
  await audit({ actor: user }, { action: "presenter.created", summary: `${user.name} added the presenter ${name}` });
  return id;
}

export async function addRelease(user: AppUser, presenterId: string, input: { signedOn: string; expiresOn?: string | null; scope?: string | null; file?: { name: string; mime: string; base64: string } | null }) {
  need(user);
  if (!(await get("SELECT 1 AS x FROM presenters WHERE id = ?", presenterId))) throw new WorkflowError("NOT_FOUND", "Presenter not found.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.signedOn ?? "")) throw new WorkflowError("VALIDATION", "Give the date it was signed.");
  const exp = input.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) ? input.expiresOn : null;
  if (exp && exp < input.signedOn) throw new WorkflowError("VALIDATION", "It cannot end before it was signed.");
  if (input.file && input.file.base64.length > 11_000_000) throw new WorkflowError("VALIDATION", "The scanned form is limited to 8 MB.");
  if (input.file && !/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.file.mime)) throw new WorkflowError("VALIDATION", "Attach a PDF or a photo of the signed form.");
  const id = uid("rel_");
  await run(
    "INSERT INTO presenter_releases (id, presenter_id, signed_on, expires_on, scope, file_name, file_mime, file_data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    presenterId,
    input.signedOn,
    exp,
    input.scope?.trim().slice(0, 300) || null,
    input.file?.name.slice(0, 160) ?? null,
    input.file?.mime ?? null,
    input.file?.base64 ?? null,
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { action: "presenter.release", summary: `${user.name} recorded a signed release (${input.signedOn}${exp ? ` to ${exp}` : ""})` });
  return id;
}

export async function readRelease(user: AppUser, id: string) {
  need(user);
  const r = await get<{ file_name: string | null; file_mime: string | null; file_data: string | null }>("SELECT file_name, file_mime, file_data FROM presenter_releases WHERE id = ?", id);
  if (!r?.file_data) return null;
  return { name: r.file_name ?? "release", mime: r.file_mime ?? "application/octet-stream", data: Buffer.from(r.file_data, "base64") };
}

// The presenter of a part, by the name on the part (Teacher) or a session (Presenter).
export async function presenterByName(name: string | null | undefined) {
  const n = norm(name);
  if (!n) return null;
  const rows = await all<Row>("SELECT * FROM presenters WHERE active = 1");
  return rows.find((r) => norm(r.name) === n || parseJson<string[]>(r.aliases, []).some((a) => norm(a) === n)) ?? null;
}

// The Recording requirement (workflow.ts): a valid release for the part's presenter, when Admin requires it.
export async function releaseRequirement(item: { teacher: string | null }, presenterOnSession: string | null) {
  const cfg = await presenterConfig();
  if (!cfg.requireRelease) return null;
  const who = presenterOnSession || item.teacher;
  if (!who) return { key: "release", label: "The presenter's name on the part (Teacher), with a signed release", met: false };
  const p = await presenterByName(who);
  if (!p) return { key: "release", label: `A signed release for ${who} (add them in Presenters)`, met: false };
  const st = stateOf(await latestRelease(p.id), cfg.warnDays);
  return { key: "release", label: `A valid signed release for ${p.name}${st === "expired" ? " (it has expired)" : ""}`, met: st === "valid" || st === "expiring" };
}

// Daily: releases ending soon or ended, to HR and the Recording leads (once per release and state).
export async function releaseChecks() {
  const cfg = await presenterConfig();
  const rows = await all<{ id: string; name: string }>("SELECT id, name FROM presenters WHERE active = 1");
  const to = [
    ...(await all<{ user_id: string }>("SELECT DISTINCT user_id FROM role_assignments WHERE role IN ('hr_manager','hr_officer')")).map((r) => r.user_id),
    ...(await all<{ user_id: string }>("SELECT user_id FROM team_leads WHERE stage = 'recording'").catch(() => [])).map((r) => r.user_id),
  ];
  let n = 0;
  for (const p of rows) {
    const rel = await latestRelease(p.id);
    const st = stateOf(rel, cfg.warnDays);
    if (st !== "expiring" && st !== "expired") continue;
    await notify(
      to,
      { type: "hr", title: st === "expired" ? `${p.name}'s release has expired` : `${p.name}'s release ends on ${rel!.expires_on}`, body: "Renew it in Presenters; parts cannot leave Recording without a valid release when that is required.", link: "/presenters", dedupeKey: `release:${rel!.id}:${st}` },
      nowIso(),
    );
    n++;
  }
  return { warned: n };
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export type Statement = { presenterId: string; name: string; month: string; rateKind: string | null; rate: number | null; sessions: number; parts: number; hours: number; amount: number; status: "open" | "sent" | "billed"; billId: string | null };

const monthRange = (m: string) => ({ from: `${m}-01`, to: plusDays(`${m}-01`, 31).slice(0, 7) + "-01" });

export async function statements(user: AppUser, month: string): Promise<Statement[]> {
  if (!canPresenters(user) && !canFinance(user)) throw new WorkflowError("FORBIDDEN", "Only HR, managers, the Recording lead and Finance see fees.");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new WorkflowError("VALIDATION", "Choose a month.");
  const { from, to } = monthRange(month);
  const ps = await all<Row>("SELECT * FROM presenters ORDER BY name");
  const sessions = await all<{ presenter: string | null; teacher: string | null; duration_min: number; item_id: string }>(
    `SELECT s.presenter, i.teacher, s.duration_min, s.item_id FROM recording_sessions s JOIN items i ON i.id = s.item_id
     WHERE s.status IN ('done','completed','recorded') AND s.scheduled_start >= ? AND s.scheduled_start < ?`,
    from,
    to,
  );
  const saved = new Map((await all<{ presenter_id: string; status: string; bill_id: string | null }>("SELECT presenter_id, status, bill_id FROM presenter_statements WHERE month = ?", month)).map((r) => [r.presenter_id, r]));
  const out: Statement[] = [];
  for (const p of ps) {
    const names = new Set([norm(p.name), ...parseJson<string[]>(p.aliases, []).map(norm)]);
    const mine = sessions.filter((s) => names.has(norm(s.presenter || s.teacher)));
    if (!mine.length && !saved.has(p.id)) continue;
    const parts = new Set(mine.map((s) => s.item_id)).size;
    const hours = Math.round((mine.reduce((n, s) => n + Number(s.duration_min || 0), 0) / 60) * 100) / 100;
    const rate = p.rate === null ? null : Number(p.rate);
    const amount = !rate ? 0 : p.rate_kind === "session" ? rate * mine.length : p.rate_kind === "part" ? rate * parts : p.rate_kind === "hour" ? Math.round(rate * hours * 100) / 100 : 0;
    const s = saved.get(p.id);
    out.push({ presenterId: p.id, name: p.name, month, rateKind: p.rate_kind, rate, sessions: mine.length, parts, hours, amount, status: (s?.status as Statement["status"]) ?? "open", billId: s?.bill_id ?? null });
  }
  return out;
}

// HR or the Recording lead sends a statement to Finance; Finance makes it a bill.
export async function sendStatement(user: AppUser, presenterId: string, month: string) {
  need(user);
  const st = (await statements(user, month)).find((s) => s.presenterId === presenterId);
  if (!st) throw new WorkflowError("NOT_FOUND", "Nothing recorded for this presenter that month.");
  if (!st.amount) throw new WorkflowError("VALIDATION", "Set the presenter's fee first.");
  if (st.status !== "open") throw new WorkflowError("INVALID_STATE", "Already sent.");
  await run(
    "INSERT INTO presenter_statements (presenter_id, month, amount, status, sent_by, sent_at) VALUES (?, ?, ?, 'sent', ?, ?) ON CONFLICT (presenter_id, month) DO UPDATE SET amount = excluded.amount, status = 'sent', sent_by = excluded.sent_by, sent_at = excluded.sent_at",
    presenterId,
    month,
    st.amount,
    user.id,
    nowIso(),
  );
  const finance = (await all<{ user_id: string }>("SELECT DISTINCT user_id FROM role_assignments WHERE role IN ('finance_manager','accountant')")).map((r) => r.user_id);
  await notify(finance, { type: "hr", title: `Presenter fees to pay: ${st.name}, ${month}`, body: `${st.amount.toLocaleString()} for ${st.sessions} sessions. Make it a bill in Presenters.`, link: "/presenters?tab=fees" }, nowIso());
}

export async function billStatement(user: AppUser, presenterId: string, month: string) {
  if (!canFinance(user)) throw new WorkflowError("FORBIDDEN", "Only Finance makes bills.");
  const s = await get<{ amount: number; status: string }>("SELECT amount, status FROM presenter_statements WHERE presenter_id = ? AND month = ?", presenterId, month);
  if (!s || s.status !== "sent") throw new WorkflowError("INVALID_STATE", "Only statements sent to Finance are billed.");
  const p = (await get<Row>("SELECT * FROM presenters WHERE id = ?", presenterId))!;
  // The presenter as a vendor (found by name, else added).
  const find = async () => (await listParties(user)).find((x) => norm(x.name) === norm(p.name) && x.kind !== "customer");
  let vendor = await find();
  if (!vendor) {
    await saveParty(user, { kind: "vendor", name: p.name, phone: p.phone ?? undefined, email: p.email ?? undefined });
    vendor = await find();
  }
  const vendorId = vendor!.id;
  const billId = await saveBill(user, { vendorId, number: `FEE-${month}-${p.name.slice(0, 12).toUpperCase().replace(/\W+/g, "")}`, date: nowIso().slice(0, 10), amount: Number(s.amount), description: `Presenter fees ${month}: ${p.name}`, department: "Production" });
  await run("UPDATE presenter_statements SET status = 'billed', bill_id = ? WHERE presenter_id = ? AND month = ?", billId, presenterId, month);
  return billId;
}
