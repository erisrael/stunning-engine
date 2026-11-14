// What we already know about a support customer by their phone number (shared from Telegram, the widget or typed by
// an agent): the academy's student and parent records (only when the academy API is connected; never sample data),
// Chapa payments, Noor invoice reviews, and the same person on other support channels. Kept on the customer as short
// lines agents see on the ticket, and a note on their open conversations.
import { all, get, nowIso, parseJson, run, uid } from "./db";
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// The last nine digits: +251 911 22 33 44, 0911223344 and 911223344 are the same number.
export function phoneKey(phone: string | null | undefined) {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}
export function normalPhone(phone: string) {
  const d = String(phone).replace(/[^\d+]/g, "");
  if (/^\+/.test(d)) return d;
  if (/^251\d{9}$/.test(d)) return `+${d}`;
  if (/^0\d{9}$/.test(d)) return `+251${d.slice(1)}`;
  if (/^[79]\d{8}$/.test(d)) return `+251${d}`;
  return d.length >= 7 ? `+${d}` : d;
}
const SQL_KEY = (col: string) => `RIGHT(regexp_replace(COALESCE(${col}, ''), '[^0-9]', '', 'g'), 9)`;

export type RecordMatch = {
  students: { studentId: string; studentName: string; grade: string; parentName: string; status: string }[];
  payments: { count: number; paid: number; currency: string; lastAt: string | null; lastAmount: number | null; name: string | null } | null;
  invoices: { count: number; student: string | null; grade: string | null; plan: string | null; lastDate: string | null } | null;
  customers: { id: string; name: string; channel: string; app: string | null }[];
};

export async function matchByPhone(phone: string, exceptCustomer?: string | null): Promise<RecordMatch> {
  const key = phoneKey(phone);
  const out: RecordMatch = { students: [], payments: null, invoices: null, customers: [] };
  if (!key) return out;
  // The academy's records, only from the real API.
  try {
    const ext = await import("./external-api");
    const cfg = await ext.getExternalApiConfig();
    if (cfg.academy.enabled && cfg.academy.baseUrl) {
      const list = await ext.searchStudentParent({ id: "system", name: "Support" } as never, key);
      out.students = list
        .filter((s) => [s.parentPhone, s.secondaryPhone].some((p) => phoneKey(p) === key))
        .slice(0, 5)
        .map((s) => ({ studentId: s.studentId, studentName: s.studentName, grade: s.grade, parentName: s.parentName, status: s.enrollmentStatus }));
    }
  } catch {
    /* the academy is not reachable: the other sources still count */
  }
  const pay = await get<{ n: number; paid: number | null; cur: string | null; last: string | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) AS paid, MAX(currency) AS cur, MAX(CASE WHEN status = 'success' THEN created_at END) AS last FROM chapa_transactions WHERE ${SQL_KEY("phone")} = ?`,
    key,
  ).catch(() => null);
  if (pay && Number(pay.n)) {
    const last = pay.last ? await get<{ amount: number; first_name: string | null; last_name: string | null }>(`SELECT amount, first_name, last_name FROM chapa_transactions WHERE ${SQL_KEY("phone")} = ? AND status = 'success' ORDER BY created_at DESC LIMIT 1`, key).catch(() => null) : null;
    out.payments = { count: Number(pay.n), paid: Number(pay.paid ?? 0), currency: pay.cur ?? "ETB", lastAt: pay.last, lastAmount: last ? Number(last.amount) : null, name: last ? [last.first_name, last.last_name].filter(Boolean).join(" ") || null : null };
  }
  const inv = await all<{ student: string | null; grade: string | null; plan: string | null; invoice_date: string | null }>(`SELECT student, grade, plan, invoice_date FROM cms_invoice_reviews WHERE ${SQL_KEY("phone")} = ? ORDER BY invoice_date DESC LIMIT 20`, key).catch(() => []);
  if (inv.length) out.invoices = { count: inv.length, student: inv[0]!.student, grade: inv[0]!.grade, plan: inv[0]!.plan, lastDate: inv[0]!.invoice_date };
  out.customers = await all<{ id: string; name: string; channel: string; app: string | null }>(
    `SELECT c.id, c.name, CASE WHEN c.external_id LIKE 'tg:%' THEN 'Telegram' WHEN c.email IS NOT NULL AND c.app_id IS NULL THEN 'Email' ELSE 'App' END AS channel, a.name AS app
     FROM sup_customers c LEFT JOIN sup_apps a ON a.id = c.app_id WHERE ${SQL_KEY("c.phone")} = ? AND c.id <> ? ORDER BY c.last_seen_at DESC NULLS LAST LIMIT 5`,
    key,
    exceptCustomer ?? "",
  ).catch(() => []);
  return out;
}

const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// The match as the short lines shown on the customer card (meta keys).
export function matchLines(m: RecordMatch): Record<string, string | null> {
  return {
    "Student records": m.students.length ? m.students.map((s) => `${s.studentName} (${[s.grade, s.studentId, s.status !== "active" ? s.status : null].filter(Boolean).join(", ")}), parent ${s.parentName}`).join("; ") : null,
    "Chapa payments": m.payments ? `${m.payments.count} payment${m.payments.count === 1 ? "" : "s"}, ${money(m.payments.paid, m.payments.currency)} paid${m.payments.lastAt ? `, last ${m.payments.lastAmount !== null ? money(m.payments.lastAmount, m.payments.currency) : ""} on ${m.payments.lastAt.slice(0, 10)}` : ""}${m.payments.name ? ` (${m.payments.name})` : ""}` : null,
    "Noor invoices": m.invoices ? `${m.invoices.count} invoice${m.invoices.count === 1 ? "" : "s"}${m.invoices.student ? `, ${m.invoices.student}` : ""}${m.invoices.grade ? `, ${m.invoices.grade}` : ""}${m.invoices.plan ? `, ${m.invoices.plan}` : ""}${m.invoices.lastDate ? `, last ${m.invoices.lastDate.slice(0, 10)}` : ""}` : null,
    "Also contacted us": m.customers.length ? m.customers.map((c) => `${c.name} by ${c.channel}${c.app ? ` (${c.app})` : ""}`).join("; ") : null,
  };
}

// The customer's own number: kept, matched, and noted on their open conversations for the agent.
export async function recordPhone(customerId: string, rawPhone: string, source: "telegram" | "widget" | "agent") {
  const phone = normalPhone(clean(rawPhone, 40));
  if (!phoneKey(phone)) return null;
  const c = await get<{ meta: string; phone: string | null }>("SELECT meta, phone FROM sup_customers WHERE id = ?", customerId);
  if (!c) return null;
  const m = await matchByPhone(phone, customerId);
  const lines = matchLines(m);
  const meta = parseJson<Record<string, string>>(c.meta, {});
  for (const [k, v] of Object.entries(lines)) if (v) meta[k] = v.slice(0, 400);
  else delete meta[k];
  meta["Phone shared"] = `${source === "telegram" ? "on Telegram" : source === "widget" ? "in the app" : "by an agent"}, ${nowIso().slice(0, 10)}`;
  await run("UPDATE sup_customers SET phone = ?, meta = ? WHERE id = ?", phone, JSON.stringify(meta), customerId);
  const found = Object.entries(lines).filter(([, v]) => v);
  const note = `The customer shared their phone number ${phone}${source === "telegram" ? " on Telegram" : ""}. ${found.length ? `Found: ${found.map(([k, v]) => `${k}: ${v}`).join(". ")}.` : "Nothing else on record for this number yet."}`;
  const now = nowIso();
  for (const t of await all<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed')", customerId))
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, note.slice(0, 2000), now);
  return { phone, match: m, lines };
}
