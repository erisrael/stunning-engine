import { all, get, nowIso, parseJson, run } from "./db";
import { getMeta, setMeta } from "./settings";
import { loadUser, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { allowedCategoriesForUser, canManageCmsData } from "./legacy-cms";
import { addisDay, daysBetween, fetchCmsRange } from "./cms-range";
import { cmsAmount } from "@/lib/cms-report";
import { cmsField } from "@/lib/cms-filters";
import type { LegacyCmsCategory } from "@/lib/legacy-cms";

// Daily Noor figures (Update 1.0): every night the day's invoices, revenue, new students and parents,
// subscriptions started and feedback are counted and kept in cms_daily_metrics, one row per Addis day. The
// rows behind them stay in the day cache. The Reports dashboard reads these for daily, weekly, monthly, yearly
// and overall trends; Admin can build earlier days on demand.

export type DayMetrics = {
  invoices: number;
  paid: number;
  paidAmount: number;
  pending: number;
  pendingAmount: number;
  failed: number;
  methods: Record<string, number>;
  newStudents: number;
  newParents: number;
  subscriptionsStarted: number;
  plans: Record<string, number>;
  feedback: number;
  grades: Record<string, number>;
};
export const blankMetrics = (): DayMetrics => ({ invoices: 0, paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0, failed: 0, methods: {}, newStudents: 0, newParents: 0, subscriptionsStarted: 0, plans: {}, feedback: 0, grades: {} });

// What each table contributes, and the date it is counted by.
const SOURCES: { category: LegacyCmsCategory; dateField?: string }[] = [
  { category: "invoices" },
  { category: "students" },
  { category: "parents" },
  { category: "subscriptions", dateField: "start_date" },
  { category: "feedback" },
];

function add(m: DayMetrics, category: LegacyCmsCategory, r: Record<string, string>) {
  const inc = (o: Record<string, number>, k: string, v = 1) => (o[k || "Not set"] = (o[k || "Not set"] ?? 0) + v);
  if (category === "invoices") {
    const status = (cmsField(r, ["status"]) || "").toLowerCase();
    const amount = cmsAmount(cmsField(r, ["amount", "total"]));
    m.invoices++;
    if (/paid|success/.test(status)) {
      m.paid++;
      m.paidAmount += amount;
      inc(m.methods, (cmsField(r, ["payment method", "method"]) || "unknown").toLowerCase(), amount);
    } else if (/pending|review/.test(status)) {
      m.pending++;
      m.pendingAmount += amount;
    } else m.failed++;
  }
  if (category === "students") {
    m.newStudents++;
    inc(m.grades, cmsField(r, ["grade", "primary grade"]));
  }
  if (category === "parents") m.newParents++;
  if (category === "subscriptions") {
    m.subscriptionsStarted++;
    inc(m.plans, cmsField(r, ["plan"]));
  }
  if (category === "feedback") m.feedback++;
}

// Build (or rebuild) the figures for a range of days from Noor (closed days come from the day cache).
export async function buildCmsMetrics(user: AppUser, from: string, until: string, progress: (m: string) => Promise<void> = async () => {}, now = Date.now()) {
  if (!(await canManageCmsData(user))) throw new WorkflowError("FORBIDDEN", "Building the daily figures is for Admin, or the people Admin allows.");
  const days = daysBetween(from, until);
  const byDay = new Map(days.map((d) => [d, blankMetrics()]));
  const errors: string[] = [];
  for (const s of SOURCES) {
    await progress(`Counting ${s.category}…`);
    try {
      const r = await fetchCmsRange(user, { category: s.category, from, until, dateField: s.dateField }, progress, now);
      for (const row of r.records) {
        if (!row._date) continue;
        const m = byDay.get(addisDay(Date.parse(row._date)));
        if (m) add(m, s.category, row);
      }
    } catch (e) {
      errors.push(`${s.category}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // A table that failed leaves earlier figures for it in place rather than writing zeros.
  const failed = new Set(errors.map((e) => e.split(":")[0]));
  for (const [day, m] of byDay) {
    let out = m;
    if (failed.size) {
      const prev = await get<{ metrics_json: string }>("SELECT metrics_json FROM cms_daily_metrics WHERE day = ?", day);
      const old = parseJson<DayMetrics>(prev?.metrics_json ?? "null", blankMetrics());
      out = {
        ...m,
        ...(failed.has("invoices") ? { invoices: old.invoices, paid: old.paid, paidAmount: old.paidAmount, pending: old.pending, pendingAmount: old.pendingAmount, failed: old.failed, methods: old.methods } : {}),
        ...(failed.has("students") ? { newStudents: old.newStudents, grades: old.grades } : {}),
        ...(failed.has("parents") ? { newParents: old.newParents } : {}),
        ...(failed.has("subscriptions") ? { subscriptionsStarted: old.subscriptionsStarted, plans: old.plans } : {}),
        ...(failed.has("feedback") ? { feedback: old.feedback } : {}),
      };
    }
    await run(
      "INSERT INTO cms_daily_metrics (day, metrics_json, updated_at) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET metrics_json = excluded.metrics_json, updated_at = excluded.updated_at",
      day,
      JSON.stringify(out),
      nowIso(),
    );
  }
  return { days: days.length, errors };
}

export async function cmsMetrics(user: AppUser, from?: string, until?: string) {
  const allowed = (await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat();
  if (!allowed.length) throw new WorkflowError("FORBIDDEN", "No Noor tables are open to you.");
  const rows = await all<{ day: string; metrics_json: string; updated_at: string }>(
    `SELECT day, metrics_json, updated_at FROM cms_daily_metrics ${from ? "WHERE day >= ? AND day <= ?" : ""} ORDER BY day`,
    ...(from ? [from, until ?? addisDay(Date.now())] : []),
  );
  // Revenue figures only for people who see invoices.
  const seesInvoices = allowed.includes("invoices");
  return rows.map((r) => {
    const m = { ...blankMetrics(), ...parseJson<DayMetrics>(r.metrics_json, blankMetrics()) };
    if (!seesInvoices) Object.assign(m, { invoices: 0, paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0, failed: 0, methods: {} });
    return { day: r.day, ...m, updatedAt: r.updated_at };
  });
}

// Every night after 01:00 Addis time: yesterday (now closed) and today so far, as the first active admin.
export async function scheduledCmsMetrics(now = Date.now()) {
  if (!(await get("SELECT key FROM settings WHERE key = 'cfg.legacy_cms'"))) return;
  const local = new Date(now + 3 * 3600e3);
  if (local.getUTCHours() < 1) return;
  const today = addisDay(now);
  if ((await getMeta("cmsMetricsDay")) === today) return;
  const { acquireLease, releaseLease } = await import("./ops");
  if (!(await acquireLease("cms-metrics", 60 * 60e3))) return;
  try {
    if ((await getMeta("cmsMetricsDay")) === today) return;
    const row = await get<{ id: string }>("SELECT u.id FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE u.active = 1 AND r.role = 'admin' ORDER BY u.id LIMIT 1");
    const actor = row && (await loadUser(row.id));
    if (!actor) return;
    await setMeta("cmsMetricsDay", today);
    const yesterday = addisDay(now - 86400e3);
    await buildCmsMetrics(actor, yesterday, today, async () => {}, now).catch((e) => console.error("Daily Noor figures failed", e));
  } finally {
    await releaseLease("cms-metrics");
  }
}
