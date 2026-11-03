// The presentation studio (Phase 12c): the slides of a department (any work department, with Dev's releases and
// DORA measures) and of the company (production, departments, people and attendance, money, customer support,
// recognition), decks saved for a team, meetings whose actions become tasks, read-only share links that expire,
// and a weekly summary by email. Every sentence on a slide is written from the numbers by fixed rules.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { getSettings } from "./settings";
import { can, loadUser, type AppUser } from "./users";
import { canSeeCompany } from "./company";
import { DEFAULT_THEME, type DeckTheme, type MeetingAction, type SavedDeck, type Slide } from "@/lib/deck";
import { localParts } from "@/lib/attendance";

const DAY = 864e5;
const n = (v: unknown) => Number(v ?? 0);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Slides of a department
// ---------------------------------------------------------------------------

export async function deptSlides(user: AppUser, d: string, opts: { since?: string | null } = {}): Promise<{ title: string; slides: Slide[] }> {
  const { presentData } = await import("./present");
  const p = await presentData(user, d, { since: opts.since });
  const slides: Slide[] = [];
  const g = p.title;
  slides.push({
    key: "numbers",
    group: g,
    title: `${p.title} this week`,
    body: {
      kind: "numbers",
      items: [
        { label: "Open", value: p.counts.open },
        { label: "Finished this week", value: p.counts.done7, tone: "good" },
        { label: "Overdue", value: p.counts.overdue, tone: "bad" },
        { label: "New this week", value: p.counts.created7 },
        { label: "In review", value: p.counts.review },
        { label: "Nobody on it", value: p.counts.unassigned, tone: "bad" },
      ],
    },
    say: p.say.numbers,
    why: p.say.numbersWhy,
    next: p.say.numbersNext,
    note: "Start with the week in numbers; ask who can take the overdue and unassigned work.",
  });
  if (p.glance && p.say.flow)
    slides.push({
      key: "flow",
      group: g,
      title: "The flow",
      body: { kind: "stages", items: p.glance.map((x) => ({ label: x.label, value: x.total, late: x.late, color: x.color })) },
      say: p.say.flow.text,
      why: p.say.flow.why,
      next: p.say.flow.next,
      note: "Walk the stages left to right; the one holding the most is the bottleneck.",
    });
  slides.push({
    key: "throughput",
    group: g,
    title: "Finished and new, week by week",
    body: { kind: "bars", data: p.weeks, x: "week", series: [{ key: "done", label: "Finished" }, { key: "created", label: "New" }] },
    say: p.say.throughput,
    note: "When the new bars stay above the finished ones, the backlog grows.",
  });
  if (p.sprint && p.say.sprint)
    slides.push({
      key: "sprint",
      group: g,
      title: p.sprint.name,
      body: { kind: "lines", data: p.sprint.burn.days.map((day, i) => ({ day: day.slice(5), left: p.sprint!.burn.remaining[i] ?? null, ideal: p.sprint!.burn.ideal[i] ?? null })), x: "day", series: [{ key: "left", label: "Left" }, { key: "ideal", label: "Even pace" }] },
      say: p.say.sprint,
      why: p.sprint.goal ? `Goal: ${p.sprint.goal}` : undefined,
      note: "Above the even line means behind; talk about what blocks it.",
    });
  if (p.projects.length && p.say.projects)
    slides.push({
      key: "projects",
      group: g,
      title: "Projects",
      body: { kind: "progress", items: p.projects.map((x) => ({ label: x.name, value: x.progress, tag: x.health === "late" ? "Late" : x.health === "at_risk" ? "At risk" : "On track", tone: x.health === "late" ? "bad" : x.health === "at_risk" ? "neutral" : "good" })) },
      say: p.say.projects,
      next: p.projects.some((x) => x.health !== "on_track") ? "Next: for each late or at-risk project, a new date, more people, or less scope." : undefined,
      note: "Projects with their progress and health.",
    });
  // Dev and any department with releases: the latest releases and the DORA measures.
  const rel = await (await import("./dev-tools")).releasesWithDeploys(user, d).catch(() => null);
  if (rel?.releases.length) {
    const { doraMeasures } = await import("./dev-studio");
    const dora = await doraMeasures(user, d).catch(() => null);
    slides.push({
      key: "releases",
      group: g,
      title: "Releases",
      body: { kind: "list", items: rel.releases.slice(0, 6).map((r) => ({ text: `${r.version ? `${r.version} ` : ""}${r.name}`, meta: `${r.task_count} tasks · ${r.created_at.slice(0, 10)}${r.deployments[0] ? ` · ${r.deployments[0].environment} ${r.deployments[0].status}` : ""}` })) },
      say: `${plural(rel.releases.length, "release")} so far; the latest is ${rel.releases[0]!.version ?? rel.releases[0]!.name}.`,
      note: "What shipped, and where it is deployed.",
    });
    if (dora)
      slides.push({
        key: "dora",
        group: g,
        title: "Delivery measures (DORA, last 90 days)",
        body: {
          kind: "numbers",
          items: [
            { label: "Releases a week", value: dora.deploysPerWeek },
            { label: "Lead time (hours)", value: dora.leadTimeHours ?? 0 },
            { label: "Change failure rate", value: dora.changeFailureRate ?? 0, unit: "%", tone: (dora.changeFailureRate ?? 0) > 15 ? "bad" : "good" },
            { label: "Time to restore (hours)", value: dora.timeToRestoreHours ?? 0 },
          ],
        },
        say: `${dora.deploysPerWeek} releases a week${dora.changeFailureRate !== null ? `, and ${dora.changeFailureRate}% of them were followed by a bug within a week` : ""}.`,
        why: (dora.changeFailureRate ?? 0) > 15 ? "More than 15% of releases cause a failure: the industry's high performers stay under 15%." : undefined,
        next: (dora.changeFailureRate ?? 0) > 15 ? "Next: more tests before release, smaller releases." : undefined,
        note: "Deployment frequency, lead time, change failure rate and time to restore.",
      });
  }
  slides.push({
    key: "recent",
    group: g,
    title: opts.since ? "Since the last meeting" : "Since last time",
    body: { kind: "list", items: p.recent.map((r) => ({ text: `${r.code} ${r.title}`, meta: r.who ?? undefined })), empty: "Nothing finished." },
    say: p.recent.length ? `${plural(p.recent.length, "piece")} of work finished${opts.since ? " since the last meeting" : " in the last seven days"}.` : `Nothing was finished${opts.since ? " since the last meeting" : " in the last seven days"}.`,
    note: "Thank the people who finished work.",
  });
  return { title: p.title, slides };
}

// ---------------------------------------------------------------------------
// Slides of the company
// ---------------------------------------------------------------------------

export function seesCompanyDeck(user: AppUser) {
  return canSeeCompany(user) || can(user, "users.manage") || can(user, "hr.access") || can(user, "finance.view");
}

export async function companySlides(user: AppUser): Promise<{ title: string; slides: Slide[] }> {
  if (!seesCompanyDeck(user)) throw new WorkflowError("FORBIDDEN", "The company deck is for owners, Admin, HR and Finance.");
  const ws = (await getSettings()).workspace;
  const today = localParts(nowIso(), ws.timezone).date;
  const month = today.slice(0, 7);
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const slides: Slide[] = [];
  const whole = canSeeCompany(user) || can(user, "users.manage");

  // Production.
  if (whole) {
    const stages = await all<{ stage: string; open: number; late: number }>(
      "SELECT stage, COUNT(*) AS open, SUM(CASE WHEN current_due_at < ? THEN 1 ELSE 0 END) AS late FROM items WHERE lifecycle = 'in_production' AND stage IS NOT NULL GROUP BY stage",
      nowIso(),
    );
    const { STAGES, STAGE_LABELS } = await import("@/lib/domain");
    const items = STAGES.map((s) => ({ label: STAGE_LABELS[s], value: n(stages.find((x) => x.stage === s)?.open), late: n(stages.find((x) => x.stage === s)?.late) }));
    const worst = [...items].sort((a, b) => b.late - a.late || b.value - a.value)[0];
    const published = n((await get<{ c: number }>("SELECT COUNT(*) AS c FROM audit_events WHERE action LIKE '%publish%' AND occurred_at >= ?", weekAgo))?.c);
    if (items.some((i) => i.value))
      slides.push({
        key: "production",
        group: "Company",
        title: "Production",
        body: { kind: "stages", items },
        say: worst && worst.value ? `${worst.label} holds the most: ${plural(worst.value, "part")}${worst.late ? `, ${worst.late} past their date` : ""}.` : "Nothing is waiting in production.",
        why: published ? `${plural(published, "release")} to the app this week.` : undefined,
        next: worst?.late ? `Next: clear ${worst.label} first.` : undefined,
        note: "Parts in each stage of the content workflow.",
      });
    // Every work department side by side.
    const { myDepartments } = await import("./departments");
    const rows: (string | number)[][] = [];
    for (const d of await myDepartments(user)) {
      const c = await get<{ open: number; overdue: number; done7: number }>(
        "SELECT SUM(CASE WHEN status_category IN ('open','active','review') THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status_category IN ('open','active','review') AND due_date < ? THEN 1 ELSE 0 END) AS overdue, SUM(CASE WHEN status_category = 'done' AND completed_at >= ? THEN 1 ELSE 0 END) AS done7 FROM dept_tasks WHERE dept = ?",
        today,
        weekAgo,
        d.dept,
      );
      if (n(c?.open) + n(c?.done7)) rows.push([d.title, n(c?.open), n(c?.done7), n(c?.overdue)]);
    }
    if (rows.length) {
      const late = [...rows].sort((a, b) => Number(b[3]) - Number(a[3]))[0]!;
      slides.push({
        key: "departments",
        group: "Company",
        title: "Departments",
        body: { kind: "table", columns: ["Department", "Open", "Finished this week", "Overdue"], rows },
        say: `${rows.reduce((a, r) => a + Number(r[2]), 0)} tasks finished this week across ${plural(rows.length, "department")}.`,
        why: Number(late[3]) ? `${late[0]} has the most overdue: ${late[3]}.` : "Nothing is overdue.",
        note: "Each department's open, finished and overdue work.",
      });
    }
  }

  // People and attendance.
  if (whole || can(user, "hr.access")) {
    const head = await all<{ department: string | null; c: number }>("SELECT department, COUNT(*) AS c FROM employees WHERE status <> 'left' GROUP BY department ORDER BY c DESC");
    const total = head.reduce((a, x) => a + n(x.c), 0);
    if (total) {
      const joined = n((await get<{ c: number }>("SELECT COUNT(*) AS c FROM employees WHERE start_date >= ?", `${month}-01`))?.c);
      const left = n((await get<{ c: number }>("SELECT COUNT(*) AS c FROM employees WHERE end_date >= ?", `${month}-01`))?.c);
      slides.push({
        key: "people",
        group: "People",
        title: "People",
        body: { kind: "bars", data: head.slice(0, 10).map((h) => ({ department: h.department ?? "No department", people: n(h.c) })), x: "department", series: [{ key: "people", label: "People" }] },
        say: `${plural(total, "person", "people")} work here${joined ? `; ${joined} joined this month` : ""}${left ? `; ${left} left` : ""}.`,
        note: "Headcount by department.",
      });
      const { monthSheet } = await import("./attendance");
      const emps = await all<{ id: string }>("SELECT id FROM employees WHERE status <> 'left'");
      const sheet = await monthSheet(emps.map((e) => e.id), month);
      const t = sheet.reduce((a, r) => ({ present: a.present + r.totals.present, late: a.late + r.totals.late, absent: a.absent + r.totals.absent, leave: a.leave + r.totals.leave }), { present: 0, late: 0, absent: 0, leave: 0 });
      const days = t.present + t.late + t.absent;
      if (days) {
        const onTime = Math.round((t.present / days) * 100);
        slides.push({
          key: "attendance",
          group: "People",
          title: "Attendance this month",
          body: {
            kind: "numbers",
            items: [
              { label: "On time", value: onTime, unit: "%", tone: onTime >= 90 ? "good" : "bad" },
              { label: "Late days", value: t.late, tone: "bad" },
              { label: "Absent days", value: t.absent, tone: "bad" },
              { label: "Days on leave", value: t.leave },
            ],
          },
          say: `${onTime}% of working days started on time this month.`,
          why: t.absent ? `${plural(t.absent, "day")} absent without leave and ${plural(t.late, "late day")}.` : t.late ? `${plural(t.late, "late day")}.` : "No absences.",
          next: onTime < 90 ? "Next: talk to the people late most often (Attendance, Timesheets)." : undefined,
          note: "From the check-ins, approved leave and day records.",
        });
      }
    }
  }

  // Money.
  if (whole || can(user, "finance.view")) {
    const { summary } = await import("./finance");
    const y = today.slice(0, 4);
    const s = await summary({ from: `${y}-01-01`, to: today }).catch(() => null);
    if (s && (s.revenue || s.expenses)) {
      const thisM = s.byMonth.find((m) => m.month === month);
      slides.push({
        key: "money",
        group: "Money",
        title: `Money in ${y}`,
        body: { kind: "bars", data: s.byMonth.map((m) => ({ month: m.month.slice(5), revenue: m.revenue, expenses: m.expenses })), x: "month", series: [{ key: "revenue", label: "Money in" }, { key: "expenses", label: "Money out" }] },
        say: `${Math.round(s.revenue).toLocaleString()} in and ${Math.round(s.expenses).toLocaleString()} out this year, payroll ${Math.round(s.payroll).toLocaleString()}.`,
        why: thisM ? `This month: ${Math.round(thisM.revenue).toLocaleString()} in, ${Math.round(thisM.expenses).toLocaleString()} out.` : undefined,
        next: s.expenses > s.revenue ? "Next: spending is above income this year; review the biggest costs." : undefined,
        note: "From Finance: posted transactions and paid payroll.",
      });
    }
  }

  // Customer support.
  const sup = await (await import("./support-desk")).supportConfig();
  if (sup.enabled && whole) {
    const c = await get<{ opened: number; solved: number; waiting: number; late: number; csat: number | null }>(
      `SELECT (SELECT COUNT(*) FROM sup_tickets WHERE created_at >= ?) AS opened, (SELECT COUNT(*) FROM sup_tickets WHERE solved_at >= ?) AS solved,
              (SELECT COUNT(*) FROM sup_tickets WHERE assignee_id IS NULL AND status IN ('new','open')) AS waiting,
              (SELECT COUNT(*) FROM sup_tickets WHERE breached = 1 AND status NOT IN ('solved','closed')) AS late,
              (SELECT AVG(rating) FROM sup_tickets WHERE rating IS NOT NULL AND solved_at >= ?) AS csat`,
      weekAgo,
      weekAgo,
      weekAgo,
    );
    const csat = c?.csat === null || c?.csat === undefined ? null : Math.round(Number(c.csat) * 10) / 10;
    slides.push({
      key: "support",
      group: "Customers",
      title: "Customer support this week",
      body: { kind: "numbers", items: [{ label: "Opened", value: n(c?.opened) }, { label: "Solved", value: n(c?.solved), tone: "good" }, { label: "Waiting for an agent", value: n(c?.waiting), tone: "bad" }, { label: "Late", value: n(c?.late), tone: "bad" }, { label: "Customer rating", value: csat ?? 0, unit: "/5" }] },
      say: `${n(c?.opened)} questions came in and ${n(c?.solved)} were solved this week${csat !== null ? `; customers rated the help ${csat} of 5` : ""}.`,
      why: n(c?.late) ? `${plural(n(c?.late), "ticket")} missed its target.` : undefined,
      next: n(c?.waiting) ? "Next: more agents online at busy times." : undefined,
      note: "From the help desk.",
    });
  }

  // Recognition.
  const rc = await (await import("./recognition")).recognitionConfig();
  if (rc.enabled) {
    const { computeScores } = await import("./recognition");
    const top = (await computeScores(month, rc)).slice(0, 5);
    if (top.length)
      slides.push({
        key: "recognition",
        group: "People",
        title: "Doing well this month",
        body: { kind: "progress", items: top.map((r) => ({ label: `${r.name}${r.department ? ` · ${r.department}` : ""}`, value: Math.round(r.score), tone: "good" })) },
        say: `${top[0]!.name} leads this month with ${top[0]!.score}.`,
        note: "From Recognition: attendance, work on time, quality and kudos.",
      });
  }

  // Scorecards and objectives (Phase 17).
  slides.push(...(await (await import("./performance")).companyPerformanceSlides(user).catch(() => [])));

  if (!slides.length) slides.push({ key: "empty", group: "Company", title: ws.name, body: { kind: "text", text: "Nothing to show yet." }, say: "There are no numbers to show yet." });
  return { title: ws.name, slides };
}

// ---------------------------------------------------------------------------
// Decks saved for a team
// ---------------------------------------------------------------------------

async function scopeRights(user: AppUser, scope: string) {
  if (scope === "company") {
    if (!seesCompanyDeck(user)) throw new WorkflowError("FORBIDDEN", "The company deck is for owners, Admin, HR and Finance.");
    return { share: canSeeCompany(user) || can(user, "users.manage") };
  }
  if (!scope.startsWith("dept:")) throw new WorkflowError("VALIDATION", "Unknown deck.");
  const { workAccess } = await import("./dept-config");
  const a = await workAccess(user, scope.slice(5));
  return { share: a.rights.projects || a.rights.configure || a.rights.seeAll };
}

export async function slidesFor(user: AppUser, scope: string, opts: { since?: string | null } = {}) {
  await scopeRights(user, scope);
  return scope === "company" ? companySlides(user) : deptSlides(user, scope.slice(5), opts);
}

type DeckRow = { id: string; name: string; scope: string; slides: string; minutes: string; theme: string; shared: number; email_to: string; email_day: number | null; last_meeting_at: string | null; owner_id: string; owner_name: string | null };
const deckOf = (r: DeckRow): SavedDeck => ({
  id: r.id,
  name: r.name,
  scope: r.scope,
  slides: parseJson<string[]>(r.slides, []),
  minutes: parseJson<Record<string, number>>(r.minutes, {}),
  theme: { ...DEFAULT_THEME, ...parseJson<Partial<DeckTheme>>(r.theme, {}) },
  shared: !!Number(r.shared),
  emailTo: parseJson<string[]>(r.email_to, []),
  emailDay: r.email_day === null ? null : Number(r.email_day),
  lastMeetingAt: r.last_meeting_at,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
});

export async function listDecks(user: AppUser, scope: string) {
  await scopeRights(user, scope);
  return (await all<DeckRow>("SELECT d.*, u.name AS owner_name FROM pres_decks d LEFT JOIN users u ON u.id = d.owner_id WHERE d.scope = ? AND (d.shared = 1 OR d.owner_id = ?) ORDER BY d.name", scope, user.id)).map(deckOf);
}

export async function getDeck(user: AppUser, id: string) {
  const r = await get<DeckRow>("SELECT d.*, u.name AS owner_name FROM pres_decks d LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = ?", id);
  if (!r || (!Number(r.shared) && r.owner_id !== user.id)) throw new WorkflowError("NOT_FOUND", "Deck not found.");
  await scopeRights(user, r.scope);
  return deckOf(r);
}

export async function saveDeck(user: AppUser, input: { id?: string | null; name: string; scope: string; slides: string[]; minutes?: Record<string, number>; theme?: Partial<DeckTheme>; shared?: boolean; emailTo?: string[]; emailDay?: number | null }) {
  const rights = await scopeRights(user, input.scope);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the deck, for example \"Weekly team meeting\".");
  const slides = [...new Set((input.slides ?? []).map(String))].slice(0, 60);
  if (!slides.length) throw new WorkflowError("VALIDATION", "Choose at least one slide.");
  if (input.shared && !rights.share) throw new WorkflowError("FORBIDDEN", "Only heads and leads save a deck for the team.");
  const minutes = Object.fromEntries(Object.entries(input.minutes ?? {}).filter(([k]) => slides.includes(k)).map(([k, v]) => [k, Math.max(0, Math.min(120, Number(v) || 0))]));
  const theme: DeckTheme = { ...DEFAULT_THEME, ...(input.theme ?? {}) };
  theme.seconds = Math.max(5, Math.min(600, Number(theme.seconds) || 15));
  if (!["fade", "slide", "zoom", "none"].includes(theme.transition)) theme.transition = "fade";
  theme.bigText = !!theme.bigText;
  const emailTo = [...new Set((input.emailTo ?? []).map(String))].slice(0, 50);
  const emailDay = input.emailDay === null || input.emailDay === undefined || !emailTo.length ? null : Math.max(0, Math.min(6, Math.round(Number(input.emailDay))));
  const now = nowIso();
  if (input.id) {
    const cur = await get<{ owner_id: string; shared: number; scope: string }>("SELECT owner_id, shared, scope FROM pres_decks WHERE id = ?", input.id);
    if (!cur) throw new WorkflowError("NOT_FOUND", "Deck not found.");
    if (cur.owner_id !== user.id && !(Number(cur.shared) && rights.share)) throw new WorkflowError("FORBIDDEN", "Only its owner or a lead changes this deck.");
    await run(
      "UPDATE pres_decks SET name = ?, slides = ?, minutes = ?, theme = ?, shared = ?, email_to = ?, email_day = ?, updated_at = ? WHERE id = ?",
      name,
      JSON.stringify(slides),
      JSON.stringify(minutes),
      JSON.stringify(theme),
      input.shared ? 1 : 0,
      JSON.stringify(emailTo),
      emailDay,
      now,
      input.id,
    );
    return input.id;
  }
  const id = uid("dck_");
  await run(
    "INSERT INTO pres_decks (id, name, scope, slides, minutes, theme, shared, email_to, email_day, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    name,
    input.scope,
    JSON.stringify(slides),
    JSON.stringify(minutes),
    JSON.stringify(theme),
    input.shared ? 1 : 0,
    JSON.stringify(emailTo),
    emailDay,
    user.id,
    now,
    now,
  );
  return id;
}

export async function deleteDeck(user: AppUser, id: string) {
  const cur = await get<{ owner_id: string; scope: string; shared: number }>("SELECT owner_id, scope, shared FROM pres_decks WHERE id = ?", id);
  if (!cur) return;
  const rights = await scopeRights(user, cur.scope);
  if (cur.owner_id !== user.id && !(Number(cur.shared) && rights.share)) throw new WorkflowError("FORBIDDEN", "Only its owner or a lead removes this deck.");
  await run("DELETE FROM pres_decks WHERE id = ?", id);
}

// Ready decks for every scope (the user can save their own version).
export function readyDecks(scope: string, keys: string[]) {
  const pick = (want: string[]) => want.filter((k) => keys.includes(k));
  if (scope === "company")
    return [
      { name: "Monthly owners' review", slides: pick(["production", "departments", "money", "people", "attendance", "support", "recognition", "kpis", "okrs"]) },
      { name: "People and attendance", slides: pick(["people", "attendance", "recognition"]) },
    ].filter((d) => d.slides.length);
  return [
    { name: "Weekly team meeting", slides: pick(["numbers", "flow", "throughput", "recent"]) },
    { name: "Sprint review", slides: pick(["sprint", "throughput", "recent", "releases"]) },
    { name: "Projects and delivery", slides: pick(["projects", "releases", "dora", "numbers"]) },
  ].filter((d) => d.slides.length);
}

// ---------------------------------------------------------------------------
// Meetings: actions become tasks
// ---------------------------------------------------------------------------

export async function endMeeting(user: AppUser, input: { scope: string; deckId?: string | null; actions: MeetingAction[] }) {
  await scopeRights(user, input.scope);
  const actions = (input.actions ?? []).filter((a) => String(a.text ?? "").trim()).slice(0, 40);
  const { saveTask } = await import("./work");
  const made: string[] = [];
  for (const a of actions) {
    const dept = input.scope === "company" ? a.dept : input.scope.slice(5);
    if (!dept) throw new WorkflowError("VALIDATION", `Choose the department for "${a.text}".`);
    const r = await saveTask(user, dept, { title: String(a.text).trim().slice(0, 200), description: `Agreed in the meeting of ${new Date().toISOString().slice(0, 10)}.`, assigneeId: a.assigneeId || null, dueDate: a.due && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null });
    made.push(typeof r === "string" ? r : ((r as { id?: string })?.id ?? ""));
  }
  if (input.deckId) await run("UPDATE pres_decks SET last_meeting_at = ? WHERE id = ?", nowIso(), input.deckId);
  await audit({ actor: user }, { action: "present.meeting", summary: `${user.name} ended a meeting (${input.scope === "company" ? "company deck" : input.scope.slice(5)}) with ${plural(made.length, "action")}` });
  return made.length;
}

// ---------------------------------------------------------------------------
// Share links (a copy of the slides, read only, until a date)
// ---------------------------------------------------------------------------

export async function createShare(user: AppUser, input: { scope: string; name: string; slideKeys: string[]; days: number; theme?: Partial<DeckTheme> }) {
  const rights = await scopeRights(user, input.scope);
  if (!rights.share) throw new WorkflowError("FORBIDDEN", "Only heads, leads and owners share a deck outside the app.");
  const all_ = (await slidesFor(user, input.scope)).slides;
  const slides = input.slideKeys.length ? input.slideKeys.map((k) => all_.find((s) => s.key === k)).filter((s): s is Slide => !!s) : all_;
  if (!slides.length) throw new WorkflowError("VALIDATION", "Choose at least one slide.");
  const days = Math.max(1, Math.min(90, Math.round(Number(input.days) || 7)));
  const token = crypto.randomBytes(18).toString("base64url");
  await run(
    "INSERT INTO pres_shares (token, name, slides, theme, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    token,
    String(input.name || "Presentation").slice(0, 80),
    JSON.stringify(slides),
    JSON.stringify({ ...DEFAULT_THEME, ...(input.theme ?? {}) }),
    new Date(Date.now() + days * DAY).toISOString(),
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { action: "present.share", summary: `${user.name} shared "${input.name}" (${plural(slides.length, "slide")}) by link for ${plural(days, "day")}` });
  return { token, expiresAt: new Date(Date.now() + days * DAY).toISOString() };
}

export async function openShare(token: string) {
  const r = await get<{ name: string; slides: string; theme: string; expires_at: string; revoked: number; created_at: string }>("SELECT name, slides, theme, expires_at, revoked, created_at FROM pres_shares WHERE token = ?", token);
  if (!r || Number(r.revoked) || r.expires_at < nowIso()) return null;
  await run("UPDATE pres_shares SET views = views + 1 WHERE token = ?", token);
  return { name: r.name, slides: parseJson<Slide[]>(r.slides, []), theme: { ...DEFAULT_THEME, ...parseJson<Partial<DeckTheme>>(r.theme, {}) }, createdAt: r.created_at, expiresAt: r.expires_at };
}

export async function myShares(user: AppUser) {
  return all<{ token: string; name: string; expires_at: string; views: number; revoked: number; created_at: string }>("SELECT token, name, expires_at, views, revoked, created_at FROM pres_shares WHERE created_by = ? ORDER BY created_at DESC LIMIT 30", user.id);
}

export async function revokeShare(user: AppUser, token: string) {
  const r = await get<{ created_by: string }>("SELECT created_by FROM pres_shares WHERE token = ?", token);
  if (!r) return;
  if (r.created_by !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only who shared it stops the link.");
  await run("UPDATE pres_shares SET revoked = 1 WHERE token = ?", token);
}

// ---------------------------------------------------------------------------
// The weekly summary by email
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function deckText(name: string, slides: Slide[]) {
  const text = [name, "", ...slides.flatMap((s) => [s.title, s.say, ...(s.why ? [s.why] : []), ...(s.next ? [s.next] : []), ""])].join("\n");
  const html = `<h2>${esc(name)}</h2>${slides.map((s) => `<h3 style="margin:16px 0 4px">${esc(s.title)}</h3><p style="margin:0">${esc(s.say)}</p>${s.why ? `<p style="margin:0;color:#5f6368">${esc(s.why)}</p>` : ""}${s.next ? `<p style="margin:0"><b>${esc(s.next)}</b></p>` : ""}`).join("")}`;
  return { text, html };
}

// Decks set to go out by email on this weekday, once a day, as the deck's owner sees them.
export async function weeklyDeckEmails(now = nowIso()) {
  const tz = (await getSettings()).workspace.timezone;
  const p = localParts(now, tz);
  const weekday = new Date(`${p.date}T12:00:00Z`).getUTCDay();
  const due = await all<DeckRow & { last_emailed_on: string | null }>("SELECT d.*, NULL AS owner_name FROM pres_decks d WHERE d.email_day = ? AND (d.last_emailed_on IS NULL OR d.last_emailed_on < ?)", weekday, p.date);
  let sent = 0;
  for (const d of due) {
    const owner = await loadUser(d.owner_id);
    if (!owner) continue;
    const deck = deckOf(d);
    const all_ = (await slidesFor(owner, deck.scope, { since: deck.lastMeetingAt }).catch(() => null))?.slides;
    if (!all_) continue;
    const slides = deck.slides.map((k) => all_.find((s) => s.key === k)).filter((s): s is Slide => !!s);
    const { text, html } = deckText(deck.name, slides);
    const to = await all<{ id: string; email: string }>(`SELECT id, email FROM users WHERE active = 1 AND id IN (${deck.emailTo.map(() => "?").join(",") || "''"})`, ...deck.emailTo);
    for (const u of to) {
      await run(
        "INSERT INTO email_outbox (id, kind, user_id, to_address, subject, text, html, status, attempts, send_after, created_at) VALUES (?, 'notification', ?, ?, ?, ?, ?, 'queued', 0, ?, ?)",
        uid("obx_"),
        u.id,
        u.email,
        `${deck.name}: ${p.date}`,
        text,
        html,
        now,
        now,
      );
      sent++;
    }
    await run("UPDATE pres_decks SET last_emailed_on = ? WHERE id = ?", p.date, d.id);
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// A phone as the remote: the deck shows a QR; the phone's Next and Previous move it (for 4 hours)
// ---------------------------------------------------------------------------

export async function createRemote(user: AppUser) {
  const token = crypto.randomBytes(16).toString("base64url");
  await run("DELETE FROM pres_remotes WHERE expires_at < ?", nowIso());
  await run("INSERT INTO pres_remotes (token, user_id, steps, expires_at, created_at) VALUES (?, ?, 0, ?, ?)", token, user.id, new Date(Date.now() + 4 * 36e5).toISOString(), nowIso());
  return token;
}

async function remoteRow(token: string) {
  const r = await get<{ steps: number; title: string | null; position: string | null; expires_at: string }>("SELECT steps, title, position, expires_at FROM pres_remotes WHERE token = ?", token);
  return r && r.expires_at > nowIso() ? r : null;
}

// The phone: one step forward or back.
export async function remoteMove(token: string, d: 1 | -1) {
  if (!(await remoteRow(token))) throw new WorkflowError("NOT_FOUND", "This remote has ended. Make a new one from the presentation.");
  await run("UPDATE pres_remotes SET steps = steps + ? WHERE token = ?", d === -1 ? -1 : 1, token);
  return remoteState(token);
}

// The deck reads the steps (and tells the phone which slide is showing).
export async function remoteState(token: string, show?: { title: string; position: string } | null) {
  const r = await remoteRow(token);
  if (!r) throw new WorkflowError("NOT_FOUND", "This remote has ended.");
  if (show) await run("UPDATE pres_remotes SET title = ?, position = ? WHERE token = ?", show.title.slice(0, 200), show.position.slice(0, 20), token);
  return { steps: Number(r.steps), title: show?.title ?? r.title, position: show?.position ?? r.position };
}
