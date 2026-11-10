import { all, get, nowIso, parseJson, run, tx, uid, type Param } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { cleanAmount, cleanPhone, getStudentParentRelations, requireCmsCategories, type StudentParentRelation } from "./legacy-cms";
import { cmsField } from "@/lib/cms-filters";
import { INVOICE_STATE_LABEL, UNABLE_REASON_LABEL, UNABLE_REASONS, type InvoiceReview, type InvoiceReviewLog, type InvoiceState } from "@/lib/cms-invoices";

// Finance's three invoice states: Unverified (default), Verified, and Unable to verify with a required reason.
// They live in cms_invoice_reviews, never in the mirrored Noor record, and every change is logged with who,
// when, from and to state and the reason. Unable-to-verify invoices carry the contact Support needs.

export function canReviewInvoices(user: AppUser) {
  return can(user, "finance.access") || can(user, "users.manage");
}
async function requireReviewer(user: AppUser) {
  if (!canReviewInvoices(user)) throw new WorkflowError("FORBIDDEN", "Only Finance or Admin can verify invoices.");
  await requireCmsCategories(user, ["invoices"]);
}

export const invoiceIdOf = (r: Record<string, unknown>) => String(r._recordId || cmsField(r, ["id", "invoice id", "invoice", "invoice #", "#"]) || "").trim();

// Invoice → student → parent: the name and phone Support calls, plus grade, plan, amount and date.
export function extractInvoiceContact(inv: Record<string, unknown>, relations: StudentParentRelation[] = []) {
  const student = cmsField(inv, ["student", "student name", "name", "user", "customer"]);
  const rel = student ? relations.find((r) => r.studentName.toLowerCase() === student.toLowerCase()) : undefined;
  const directPhone = cleanPhone(cmsField(inv, ["phone", "parent phone", "phone number", "mobile", "contact"]));
  return {
    student,
    contactName: rel && rel.parentName !== "Unassigned" ? rel.parentName : cmsField(inv, ["parent", "parent name", "payer"]) || student,
    phone: directPhone || rel?.parentPhone || "",
    grade: cmsField(inv, ["grade", "grades"]) || (rel && rel.grade !== "Unknown" ? rel.grade : ""),
    plan: cmsField(inv, ["plan", "subscription plan", "package"]) || rel?.planName || "",
    amount: cleanAmount(cmsField(inv, ["amount", "total", "price"])),
    method: cmsField(inv, ["payment method", "method", "payment channel"]),
    invoiceDate: cmsField(inv, ["date", "created at", "created", "invoice date", "payment date"]),
  };
}

type Row = {
  invoice_id: string;
  state: string;
  reason: string | null;
  note: string | null;
  student: string | null;
  contact_name: string | null;
  phone: string | null;
  grade: string | null;
  plan: string | null;
  amount: number | null;
  method: string | null;
  invoice_date: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};
const toReview = (r: Row): InvoiceReview => ({
  invoiceId: r.invoice_id,
  state: r.state as InvoiceState,
  reason: r.reason,
  note: r.note,
  student: r.student ?? "",
  contactName: r.contact_name ?? "",
  phone: r.phone ?? "",
  grade: r.grade ?? "",
  plan: r.plan ?? "",
  amount: Number(r.amount ?? 0),
  method: r.method ?? "",
  invoiceDate: r.invoice_date ?? "",
  updatedBy: r.updated_by,
  updatedByName: r.updated_by_name,
  updatedAt: r.updated_at,
});
const SELECT = "SELECT r.*, u.name AS updated_by_name FROM cms_invoice_reviews r LEFT JOIN users u ON u.id = r.updated_by";

export async function reviewInvoices(
  user: AppUser,
  input: { ids: string[]; state: InvoiceState; reason?: string; note?: string; invoices?: Record<string, Record<string, string>> },
): Promise<{ updated: number; missingPhone: string[] }> {
  await requireReviewer(user);
  const ids = [...new Set((input.ids || []).map((i) => String(i).trim()).filter(Boolean))];
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose at least one invoice.");
  if (ids.length > 500) throw new WorkflowError("VALIDATION", "Update at most 500 invoices at a time.");
  if (!INVOICE_STATE_LABEL[input.state]) throw new WorkflowError("VALIDATION", "Choose Unverified, Verified or Unable to verify.");
  const note = (input.note || "").trim().slice(0, 2000) || null;
  let reason: string | null = null;
  if (input.state === "unable") {
    if (!UNABLE_REASONS.some(([k]) => k === input.reason)) throw new WorkflowError("VALIDATION", "Choose why the invoice cannot be verified.");
    if (input.reason === "other" && !note) throw new WorkflowError("VALIDATION", "Explain the reason in the note.");
    reason = input.reason!;
  }
  const relations = (await getStudentParentRelations()).relations;
  const missingPhone: string[] = [];
  const at = nowIso();
  await tx(async () => {
    for (const id of ids) {
      const prev = await get<{ state: string; reason: string | null; invoice_json: string | null }>("SELECT state, reason, invoice_json FROM cms_invoice_reviews WHERE invoice_id = ?", id);
      const mirrored = await get<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'invoices' AND (external_id = ? OR id = ?)", id, id);
      const invoice = input.invoices?.[id] ?? parseJson<Record<string, string>>(prev?.invoice_json ?? mirrored?.data_json ?? "{}", {});
      const c = extractInvoiceContact(invoice, relations);
      if (input.state === "unable" && !c.phone) missingPhone.push(id);
      await run(
        `INSERT INTO cms_invoice_reviews (invoice_id, state, reason, note, student, contact_name, phone, grade, plan, amount, method, invoice_date, invoice_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (invoice_id) DO UPDATE SET state = excluded.state, reason = excluded.reason, note = excluded.note, student = excluded.student, contact_name = excluded.contact_name,
           phone = excluded.phone, grade = excluded.grade, plan = excluded.plan, amount = excluded.amount, method = excluded.method, invoice_date = excluded.invoice_date,
           invoice_json = excluded.invoice_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        id, input.state, reason, note, c.student, c.contactName, c.phone, c.grade, c.plan, c.amount, c.method, c.invoiceDate, JSON.stringify(invoice).slice(0, 20000), user.id, at,
      );
      const from = prev?.state ?? "unverified";
      if (from !== input.state || (prev?.reason ?? null) !== reason || note)
        await run("INSERT INTO cms_invoice_review_log (id, invoice_id, from_state, to_state, reason, note, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("civ_"), id, from, input.state, reason, note, user.id, at);
    }
  });
  const label = INVOICE_STATE_LABEL[input.state];
  await audit(
    { actor: user },
    {
      action: "finance.invoice_review",
      summary: `${user.name} marked ${ids.length === 1 ? `invoice #${ids[0]}` : `${ids.length} invoices`} ${label}${reason ? ` (${UNABLE_REASON_LABEL[reason]})` : ""}`,
      newValue: { ids, state: input.state, reason },
      reason: note,
    },
  );
  return { updated: ids.length, missingPhone };
}

export async function listInvoiceReviews(user: AppUser, f: { state?: string; verifier?: string; search?: string; from?: string; until?: string; ids?: string[] } = {}): Promise<InvoiceReview[]> {
  await requireReviewer(user);
  const where: string[] = [];
  const params: Param[] = [];
  if (f.state && f.state !== "all") where.push("r.state = ?"), params.push(f.state);
  if (f.verifier && f.verifier !== "all") where.push("r.updated_by = ?"), params.push(f.verifier);
  if (f.from) where.push("r.updated_at >= ?"), params.push(`${f.from}T00:00:00.000Z`);
  if (f.until) where.push("r.updated_at <= ?"), params.push(`${f.until}T23:59:59.999Z`);
  if (f.ids?.length) where.push(`r.invoice_id IN (${f.ids.map(() => "?").join(",")})`), params.push(...f.ids.slice(0, 2000));
  if (f.search?.trim()) {
    const q = `%${f.search.trim().toLowerCase()}%`;
    where.push("(LOWER(r.invoice_id) LIKE ? OR LOWER(COALESCE(r.student,'')) LIKE ? OR LOWER(COALESCE(r.contact_name,'')) LIKE ? OR COALESCE(r.phone,'') LIKE ?)");
    params.push(q, q, q, q);
  }
  const rows = await all<Row>(`${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY r.updated_at DESC LIMIT 5000`, ...params);
  return rows.map(toReview);
}

// States for invoices on screen. Invoices with no row are Unverified; an old local approval counts as Verified.
export async function invoiceReviewStates(user: AppUser, ids: string[]): Promise<Record<string, { state: InvoiceState; reason: string | null; by: string | null; at: string }>> {
  await requireReviewer(user);
  const list = [...new Set(ids.filter(Boolean))].slice(0, 2000);
  if (!list.length) return {};
  const rows = await listInvoiceReviews(user, { ids: list });
  return Object.fromEntries(rows.map((r) => [r.invoiceId, { state: r.state, reason: r.reason, by: r.updatedByName, at: r.updatedAt }]));
}

export async function invoiceReviewHistory(user: AppUser, invoiceId: string): Promise<InvoiceReviewLog[]> {
  await requireReviewer(user);
  const rows = await all<{ id: string; invoice_id: string; from_state: string; to_state: string; reason: string | null; note: string | null; actor_name: string | null; at: string }>(
    "SELECT l.*, u.name AS actor_name FROM cms_invoice_review_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.invoice_id = ? ORDER BY l.at DESC LIMIT 100",
    invoiceId,
  );
  return rows.map((r) => ({ id: r.id, invoiceId: r.invoice_id, fromState: r.from_state, toState: r.to_state, reason: r.reason, note: r.note, actorName: r.actor_name, at: r.at }));
}

export async function invoiceVerifiers(user: AppUser): Promise<{ id: string; name: string; count: number }[]> {
  await requireReviewer(user);
  const rows = await all<{ id: string; name: string; c: number }>(
    "SELECT u.id, u.name, COUNT(*) AS c FROM cms_invoice_review_log l JOIN users u ON u.id = l.actor_id GROUP BY u.id, u.name ORDER BY u.name",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.c) }));
}

export async function invoiceReviewCounts(user: AppUser) {
  await requireReviewer(user);
  const rows = await all<{ state: string; c: number; nophone: number }>("SELECT state, COUNT(*) AS c, SUM(CASE WHEN COALESCE(phone,'') = '' THEN 1 ELSE 0 END) AS nophone FROM cms_invoice_reviews GROUP BY state");
  const by = Object.fromEntries(rows.map((r) => [r.state, Number(r.c)]));
  return { verified: by.verified ?? 0, unable: by.unable ?? 0, unverified: by.unverified ?? 0, unableNoPhone: Number(rows.find((r) => r.state === "unable")?.nophone ?? 0) };
}
