// Official letters: drafts, issuing, delivery, voiding, and the registry of every letter in and out.
//
// Rules kept here (and tested in tests/server/correspondence.test.ts):
//  - every document has a permanent UUIDv7 from the moment it is created;
//  - the official reference number is given only when the letter is issued, inside one locked transaction;
//  - an issued letter is frozen: its exact content, recipients, letterhead and sender are stored as a snapshot with
//    a SHA-256 hash, so later changes to templates, the directory or people never change what was issued;
//  - an issued letter is never edited: an amendment is a new letter that replaces it;
//  - a voided letter stays in the registry with its number and the reason; the number is never reused;
//  - every step is written to the hash-chained audit log.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "../db";
import { cleanDesign, type Design } from "@/lib/design";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, canonical, canSeeDoc, CLASSIFICATIONS, corrCan, lockDoc, needCorr, sha256, uuidv7, visibleSql, auditTrail, type Classification } from "./core";
import { allocateRef } from "./numbering";
import { ensureSetup, getCategory, getEntity } from "./setup";

export const STATUSES = ["draft", "under_review", "pending_approval", "approved", "pending_signature", "signed", "issued", "dispatched", "delivered", "acknowledged", "archived", "void"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  under_review: "Under review",
  pending_approval: "Pending approval",
  approved: "Approved",
  pending_signature: "Pending signature",
  signed: "Signed",
  issued: "Issued",
  dispatched: "Dispatched",
  delivered: "Delivered",
  acknowledged: "Acknowledged",
  archived: "Archived",
  void: "Void",
};
const EDITABLE: Status[] = ["draft"];
const AFTER_ISSUE: Status[] = ["issued", "dispatched", "delivered", "acknowledged", "archived"];
const IN_WORKFLOW: Status[] = ["under_review", "pending_approval", "pending_signature"];
export const DELIVERY_METHODS = ["email", "hand", "courier", "post", "fax", "portal", "other"] as const;
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type Recipient = { kind: "to" | "cc" | "bcc"; orgId?: string | null; contactId?: string | null; name?: string | null; title?: string | null; organisation?: string | null; address?: string | null; email?: string | null; phone?: string | null; fax?: string | null };
export type LetterData = {
  date?: string;
  salutation?: string;
  blocks?: unknown[];
  closing?: string;
  signName?: string;
  signTitle?: string;
  enclosures?: string;
  // Incoming letters: who sent it, when it arrived, and the scan or file.
  sender?: string;
  receivedAt?: string;
  summary?: string;
  // Values for the template's own fields ({{field}}).
  fields?: Record<string, string>;
  // A letter laid out in the design editor (Canva style); when present it is what the letter looks like.
  design?: Design | null;
  // The library template the letter started from.
  libraryKey?: string;
};

type DocRow = {
  id: string; ref_number: string | null; direction: string; entity_id: string | null; category_id: string | null; department: string | null; status: string; classification: string; priority: string; subject: string; data: string; version: number;
  issued_snapshot: string | null; content_hash: string | null; replaces_id: string | null; in_reply_to: string | null; external_ref: string | null; delivery_method: string | null; void_reason: string | null;
  created_by: string | null; issued_by: string | null; created_at: string; updated_at: string; issued_at: string | null; dispatched_at: string | null; delivered_at: string | null; acknowledged_at: string | null; archived_at: string | null; voided_at: string | null; due_at: string | null;
  template_id: string | null; template_version: number | null; financial_value: number | null; recipient_type: string | null; risk: string | null; signature: string | null; verify_code: string | null; scheduled_at: string | null; legal_hold: number; retain_until: string | null;
};

const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const opt = (v: unknown, n: number) => {
  const x = String(v ?? "").trim().slice(0, n);
  return x || null;
};

function cleanData(d: unknown): LetterData {
  const x = (d ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(x.blocks) ? x.blocks.slice(0, 500) : [];
  if (JSON.stringify(blocks).length > 2_000_000) throw new WorkflowError("VALIDATION", "The letter is too long.");
  return {
    date: opt(x.date, 10) ?? undefined,
    salutation: str(x.salutation, 200),
    blocks,
    closing: str(x.closing, 200),
    signName: str(x.signName, 160),
    signTitle: str(x.signTitle, 160),
    enclosures: str(x.enclosures, 400),
    sender: opt(x.sender, 300) ?? undefined,
    receivedAt: opt(x.receivedAt, 30) ?? undefined,
    summary: opt(x.summary, 4000) ?? undefined,
    design: x.design && typeof x.design === "object" ? (() => {
      const dz = cleanDesign(x.design, 20);
      if (JSON.stringify(dz).length > 6_000_000) throw new WorkflowError("VALIDATION", "The design is too large (use smaller pictures).");
      return dz;
    })() : null,
    libraryKey: typeof x.libraryKey === "string" && /^[a-z0-9_]{2,40}$/.test(x.libraryKey) ? x.libraryKey : undefined,
    fields: x.fields && typeof x.fields === "object" ? Object.fromEntries(Object.entries(x.fields as Record<string, unknown>).slice(0, 40).filter(([k]) => /^[a-z0-9_]{1,40}$/.test(k)).map(([k, v]) => [k, String(v ?? "").slice(0, 1000)])) : undefined,
  };
}

function cleanRecipients(list: unknown): Recipient[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((r) => {
    const x = (r ?? {}) as Record<string, unknown>;
    return {
      kind: x.kind === "cc" || x.kind === "bcc" ? x.kind : "to",
      orgId: opt(x.orgId, 40),
      contactId: opt(x.contactId, 40),
      name: opt(x.name, 160),
      title: opt(x.title, 160),
      organisation: opt(x.organisation, 200),
      address: opt(x.address, 400),
      email: opt(x.email, 160),
      phone: opt(x.phone, 60),
      fax: opt(x.fax, 60),
    };
  });
}

export type DocView = ReturnType<typeof view>;
function view(r: DocRow, extra: { recipients?: Recipient[]; creatorName?: string | null; categoryName?: string | null; issuerName?: string | null } = {}) {
  return {
    id: r.id,
    ref: r.ref_number,
    direction: r.direction as "outgoing" | "incoming",
    entityId: r.entity_id,
    categoryId: r.category_id,
    categoryName: extra.categoryName ?? null,
    department: r.department,
    status: r.status as Status,
    classification: r.classification as Classification,
    priority: r.priority,
    subject: r.subject,
    data: parseJson<LetterData>(r.data, {}),
    version: Number(r.version),
    contentHash: r.content_hash,
    replacesId: r.replaces_id,
    inReplyTo: r.in_reply_to,
    externalRef: r.external_ref,
    deliveryMethod: r.delivery_method,
    voidReason: r.void_reason,
    createdBy: r.created_by,
    creatorName: extra.creatorName ?? null,
    issuerName: extra.issuerName ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    issuedAt: r.issued_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    acknowledgedAt: r.acknowledged_at,
    archivedAt: r.archived_at,
    voidedAt: r.voided_at,
    dueAt: r.due_at,
    templateId: r.template_id,
    templateVersion: r.template_version == null ? null : Number(r.template_version),
    financialValue: r.financial_value == null ? null : Number(r.financial_value),
    recipientType: r.recipient_type,
    risk: r.risk,
    verifyCode: r.verify_code,
    signed: !!r.signature,
    scheduledAt: r.scheduled_at,
    legalHold: !!r.legal_hold,
    retainUntil: r.retain_until,
    recipients: extra.recipients ?? [],
  };
}

async function recipientsOf(id: string): Promise<Recipient[]> {
  return (await all<{ kind: string; org_id: string | null; contact_id: string | null; name: string | null; title: string | null; organisation: string | null; address: string | null; email: string | null; phone: string | null; fax: string | null }>("SELECT * FROM corr_recipients WHERE document_id = ? ORDER BY sort", id)).map((r) => ({
    kind: (r.kind === "cc" || r.kind === "bcc" ? r.kind : "to") as Recipient["kind"],
    orgId: r.org_id,
    contactId: r.contact_id,
    name: r.name,
    title: r.title,
    organisation: r.organisation,
    address: r.address,
    email: r.email,
    phone: r.phone,
    fax: r.fax,
  }));
}

async function setRecipients(id: string, list: Recipient[]) {
  await run("DELETE FROM corr_recipients WHERE document_id = ?", id);
  let i = 0;
  for (const r of list) await run("INSERT INTO corr_recipients (id, document_id, kind, org_id, contact_id, name, title, organisation, address, email, phone, fax, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("cr_"), id, r.kind, r.orgId ?? null, r.contactId ?? null, r.name ?? null, r.title ?? null, r.organisation ?? null, r.address ?? null, r.email ?? null, r.phone ?? null, r.fax ?? null, i++);
}

async function mustSeeRow(user: AppUser, id: string) {
  const r = await get<DocRow>("SELECT * FROM corr_documents WHERE id = ?", id);
  if (!r || !canSeeDoc(user, r)) throw new WorkflowError("NOT_FOUND", "Letter not found.");
  return r;
}

export async function getDoc(user: AppUser, id: string) {
  const r = await mustSeeRow(user, id);
  const [recipients, people, cat, versions, trail, replacedBy] = await Promise.all([
    recipientsOf(id),
    all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${placeholders(2)})`, r.created_by ?? "", r.issued_by ?? ""),
    r.category_id ? getCategory(r.category_id) : Promise.resolve(null),
    all<{ version: number; subject: string; saved_by: string | null; saved_at: string }>("SELECT version, subject, saved_by, saved_at FROM corr_versions WHERE document_id = ? ORDER BY version DESC", id),
    corrCan(user, "audit") || r.created_by === user.id || corrCan(user, "issue") ? auditTrail(id) : Promise.resolve(null),
    get<{ id: string; ref_number: string | null }>("SELECT id, ref_number FROM corr_documents WHERE replaces_id = ? ORDER BY created_at DESC LIMIT 1", id),
  ]);
  const name = (u: string | null) => people.find((p) => p.id === u)?.name ?? null;
  const W = await import("./workflow");
  const Dl = await import("./delivery");
  const [wf, readiness, plan, attachments, dispatches, layout, verifications] = await Promise.all([
    W.workflowState(id),
    r.status === "draft" || r.status === "approved" || r.status === "signed" ? W.issueReadiness(id) : Promise.resolve(null),
    r.status === "draft" ? W.planFor(id) : Promise.resolve(null),
    Dl.listAttachments(id),
    corrCan(user, "issue") || r.created_by === user.id ? Dl.listDispatches(id) : Promise.resolve([]),
    r.issued_snapshot ? Promise.resolve(null) : (await import("./templates")).publishedLayout(r.template_id),
    (await import("./signing")).verificationLog(user, id),
  ]);
  const creator = r.created_by ? await get<{ name: string; title: string | null }>("SELECT name, title FROM users WHERE id = ?", r.created_by) : null;
  const signatures = r.issued_snapshot ? null : await W.signatureBlocks(id, creator ? { name: creator.name, title: creator.title } : null);
  // Bcc recipients are shown only to the writer and to people who issue letters.
  const showBcc = r.created_by === user.id || corrCan(user, "issue") || corrCan(user, "audit");
  return {
    ...view(r, { recipients: recipients.filter((x) => showBcc || x.kind !== "bcc"), creatorName: name(r.created_by), issuerName: name(r.issued_by), categoryName: cat?.name ?? null }),
    snapshot: r.issued_snapshot ? (JSON.parse(r.issued_snapshot) as IssuedSnapshot) : null,
    versions: versions.map((v) => ({ ...v, version: Number(v.version) })),
    trail,
    replacedBy: replacedBy ? { id: replacedBy.id, ref: replacedBy.ref_number } : null,
    workflow: wf,
    readiness,
    plan: plan ? { stages: plan.def.stages.map((st) => ({ name: st.name, type: st.type, action: st.action, targets: st.targets.map((t) => t.label ?? t.kind) })), workflow: plan.workflow?.name ?? null, rules: plan.rules.map((x) => x.name) } : null,
    attachments,
    dispatches,
    layout: layout?.layout ?? null,
    signatures,
    verifications,
    can: {
      edit: EDITABLE.includes(r.status as Status) && (r.created_by === user.id || corrCan(user, "admin")),
      submit: r.status === "draft" && (r.created_by === user.id || corrCan(user, "admin")) && !!plan?.def.stages.length,
      withdraw: (IN_WORKFLOW.includes(r.status as Status) || r.status === "approved" || r.status === "signed") && (r.created_by === user.id || corrCan(user, "admin")),
      issue: (r.status === "draft" || r.status === "approved" || r.status === "signed") && corrCan(user, "issue") && !!readiness?.ok && r.direction === "outgoing",
      deliver: AFTER_ISSUE.includes(r.status as Status) && r.status !== "archived" && corrCan(user, "issue"),
      void: r.status !== "void" && (corrCan(user, "issue") || (r.status === "draft" && r.created_by === user.id)),
      amend: AFTER_ISSUE.includes(r.status as Status) && corrCan(user, "create"),
      attach: (EDITABLE.includes(r.status as Status) && (r.created_by === user.id || corrCan(user, "admin"))) || (r.direction === "incoming" && corrCan(user, "create")),
      hold: corrCan(user, "admin"),
    },
  };
}

export type ListFilter = { q?: string; status?: string[]; direction?: "outgoing" | "incoming"; category?: string; classification?: string; from?: string; until?: string; mine?: boolean; page?: number };

export async function listDocs(user: AppUser, f: ListFilter = {}) {
  if (!corrCan(user, "create") && !corrCan(user, "view_all") && !corrCan(user, "issue") && !corrCan(user, "audit") && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "You do not have Correspondence.");
  await ensureSetup();
  const vis = visibleSql(user, "d");
  const where = [vis.sql];
  const params: (string | number)[] = [...vis.params];
  if (f.q?.trim()) {
    const like = `%${f.q.trim().slice(0, 80)}%`;
    where.push("(d.subject ILIKE ? OR COALESCE(d.ref_number,'') ILIKE ? OR d.id ILIKE ? OR COALESCE(d.external_ref,'') ILIKE ? OR EXISTS (SELECT 1 FROM corr_recipients r WHERE r.document_id = d.id AND r.kind <> 'bcc' AND (COALESCE(r.organisation,'') ILIKE ? OR COALESCE(r.name,'') ILIKE ?)) OR EXISTS (SELECT 1 FROM corr_attachments a WHERE a.document_id = d.id AND a.removed_at IS NULL AND COALESCE(a.ocr_text,'') ILIKE ?))");
    params.push(like, like, like, like, like, like, like);
  }
  const statuses = (f.status ?? []).filter((s) => (STATUSES as readonly string[]).includes(s));
  if (statuses.length) {
    where.push(`d.status IN (${placeholders(statuses.length)})`);
    params.push(...statuses);
  }
  if (f.direction) {
    where.push("d.direction = ?");
    params.push(f.direction);
  }
  if (f.category) {
    where.push("d.category_id = ?");
    params.push(f.category);
  }
  if (f.classification && (CLASSIFICATIONS as readonly string[]).includes(f.classification)) {
    where.push("d.classification = ?");
    params.push(f.classification);
  }
  if (f.from) {
    where.push("COALESCE(d.issued_at, d.created_at) >= ?");
    params.push(f.from);
  }
  if (f.until) {
    where.push("COALESCE(d.issued_at, d.created_at) < ?");
    params.push(new Date(Date.parse(f.until) + 864e5).toISOString());
  }
  if (f.mine) {
    where.push("d.created_by = ?");
    params.push(user.id);
  }
  const page = Math.max(0, Number(f.page) || 0);
  const sql = where.join(" AND ");
  const [rows, total, counts] = await Promise.all([
    all<DocRow & { category_name: string | null; creator_name: string | null; to_line: string | null }>(
      `SELECT d.*, c.name AS category_name, u.name AS creator_name,
        (SELECT STRING_AGG(COALESCE(r.organisation, r.name), '; ' ORDER BY r.sort) FROM corr_recipients r WHERE r.document_id = d.id AND r.kind = 'to') AS to_line
       FROM corr_documents d LEFT JOIN corr_categories c ON c.id = d.category_id LEFT JOIN users u ON u.id = d.created_by
       WHERE ${sql} ORDER BY d.updated_at DESC LIMIT 50 OFFSET ?`,
      ...params,
      page * 50,
    ),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM corr_documents d WHERE ${sql}`, ...params),
    all<{ status: string; n: number }>(`SELECT d.status, COUNT(*) AS n FROM corr_documents d WHERE ${vis.sql} GROUP BY d.status`, ...vis.params),
  ]);
  return {
    rows: rows.map((r) => ({ ...view(r, { categoryName: r.category_name, creatorName: r.creator_name }), toLine: r.to_line, data: undefined })),
    total: Number(total?.n ?? 0),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<Status, number>>,
  };
}

export async function createDraft(user: AppUser, input: { categoryId: string; direction?: "outgoing" | "incoming"; department?: string | null; copyOf?: string | null }) {
  needCorr(user, "create", "You cannot write official letters.");
  await ensureSetup();
  const cat = await getCategory(input.categoryId);
  if (!cat || !cat.active) throw new WorkflowError("VALIDATION", "Choose a letter category.");
  const id = uuidv7();
  const now = nowIso();
  const lh = (await (await import("../tools")).toolsConfig()).letterhead;
  const data: LetterData = { date: now.slice(0, 10), salutation: "Dear Sir/Madam,", blocks: [], closing: "Sincerely,", signName: lh.signName || user.name, signTitle: lh.signTitle || user.title || "" };
  const templateId = (cat.config as { templateId?: string }).templateId ?? null;
  await run(
    "INSERT INTO corr_documents (id, direction, entity_id, category_id, department, status, classification, subject, data, created_by, created_at, updated_at, template_id) VALUES (?, ?, ?, ?, ?, 'draft', ?, '', ?, ?, ?, ?, ?)",
    id,
    input.direction === "incoming" ? "incoming" : "outgoing",
    cat.entityId,
    cat.id,
    opt(input.department, 80),
    cat.classification,
    JSON.stringify(data),
    user.id,
    now,
    now,
    templateId,
  );
  await run("INSERT INTO corr_versions (document_id, version, data, subject, saved_by, saved_at) VALUES (?, 1, ?, '', ?, ?)", id, JSON.stringify(data), user.name, now);
  await audit(user, id, "created", { category: cat.code, direction: input.direction ?? "outgoing" });
  return id;
}

export async function saveDraft(
  user: AppUser,
  id: string,
  input: { subject: string; data: unknown; recipients: unknown; classification?: string; priority?: string; department?: string | null; categoryId?: string; inReplyTo?: string | null; externalRef?: string | null; dueAt?: string | null; baseVersion?: number; templateId?: string | null; financialValue?: number | null; recipientType?: string | null; risk?: string | null },
) {
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    if (d.created_by !== user.id && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only the writer edits this draft.");
    if (!EDITABLE.includes(d.status as Status)) throw new WorkflowError("INVALID_STATE", "Only drafts can be changed. Amend an issued letter instead.");
    if (input.baseVersion && Number(input.baseVersion) !== Number(d.version)) throw new WorkflowError("CONFLICT", "Someone saved this letter after you opened it. Reload to see their changes.");
    const data = cleanData(input.data);
    const recipients = cleanRecipients(input.recipients);
    const cls = (CLASSIFICATIONS as readonly string[]).includes(String(input.classification)) ? String(input.classification) : d.classification;
    const prio = (PRIORITIES as readonly string[]).includes(String(input.priority)) ? String(input.priority) : d.priority;
    let category = d.category_id;
    if (input.categoryId && input.categoryId !== d.category_id) {
      const c = await getCategory(input.categoryId);
      if (!c || !c.active) throw new WorkflowError("VALIDATION", "Unknown category.");
      category = c.id;
    }
    if (input.inReplyTo && !(await get("SELECT 1 AS x FROM corr_documents WHERE id = ?", input.inReplyTo))) throw new WorkflowError("VALIDATION", "The letter it answers was not found.");
    const version = Number(d.version) + 1;
    const subject = str(input.subject, 300).trim();
    const now = nowIso();
    let templateId = d.template_id;
    if (input.templateId !== undefined && input.templateId !== d.template_id) {
      if (input.templateId && !(await get("SELECT 1 AS x FROM corr_templates WHERE id = ? AND active = 1 AND current_version IS NOT NULL", input.templateId))) throw new WorkflowError("VALIDATION", "That template is not published.");
      templateId = input.templateId || null;
    }
    const value = input.financialValue === undefined ? d.financial_value : input.financialValue === null || (input.financialValue as unknown) === "" ? null : Number(input.financialValue);
    if (value != null && (!Number.isFinite(value) || value < 0)) throw new WorkflowError("VALIDATION", "The amount must be a positive number.");
    await run(
      "UPDATE corr_documents SET subject = ?, data = ?, classification = ?, priority = ?, department = ?, category_id = ?, in_reply_to = ?, external_ref = ?, due_at = ?, version = ?, updated_at = ?, template_id = ?, financial_value = ?, recipient_type = ?, risk = ? WHERE id = ?",
      subject, JSON.stringify(data), cls, prio, opt(input.department, 80), category, input.inReplyTo || null, opt(input.externalRef, 120), input.dueAt ? new Date(input.dueAt).toISOString() : null, version, now,
      templateId, value, input.recipientType === undefined ? d.recipient_type : opt(input.recipientType, 40), input.risk === undefined ? d.risk : opt(input.risk, 40), id,
    );
    await setRecipients(id, recipients);
    await run("INSERT INTO corr_versions (document_id, version, data, subject, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?)", id, version, JSON.stringify({ ...data, recipients }), subject, user.name, now);
    await audit(user, id, "saved", { version, subject, recipients: recipients.length });
    return { version };
  });
}

// Everything the issued letter showed, frozen: later changes to the letterhead, the category, the directory or the
// people involved never change it.
export type IssuedSnapshot = {
  documentId: string;
  ref: string;
  issuedAt: string;
  issuedBy: { id: string; name: string; title: string | null };
  writer: { id: string | null; name: string | null };
  subject: string;
  classification: string;
  category: { id: string; code: string; name: string };
  entity: { id: string; code: string; legalName: string; address: string | null; phone: string | null; email: string | null; website: string | null; registrationNo: string | null; taxId: string | null };
  letterhead: Record<string, unknown>;
  data: LetterData;
  recipients: Recipient[];
  inReplyTo: string | null;
  externalRef: string | null;
  replaces: string | null;
  template: { id: string | null; version: number | null };
  layout: unknown;
  signatures: { label: string; name: string; position: string; capacity: string | null; date: string | null; status: string; image: string | null; stamp: string | null }[];
  attachments: { n: number; name: string; sha256: string; size: number }[];
  approvals: { stage: string; action: string; name: string | null; capacity: string | null; at: string | null; delegatedBy: string | null }[];
  verifyCode: string;
};

export async function issueDoc(user: AppUser, id: string) {
  needCorr(user, "issue", "You cannot issue official letters.");
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    if (!["draft", "approved", "signed"].includes(d.status)) throw new WorkflowError("INVALID_STATE", d.status === "void" ? "This letter was voided." : IN_WORKFLOW.includes(d.status as Status) ? "Approvals or signatures are still missing." : "This letter has already been issued.");
    if (d.direction !== "outgoing") throw new WorkflowError("INVALID_STATE", "Incoming letters are registered, not issued.");
    const cat = d.category_id ? await getCategory(d.category_id) : null;
    if (!cat) throw new WorkflowError("VALIDATION", "Choose the letter's category first.");
    const W = await import("./workflow");
    const ready = await W.issueReadiness(id);
    if (!ready.ok) throw new WorkflowError("INVALID_STATE", ready.reason);
    const recipients = await recipientsOf(id);
    if (!d.subject.trim()) throw new WorkflowError("VALIDATION", "Write the subject first.");
    if (d.direction === "outgoing" && !recipients.some((r) => r.kind === "to")) throw new WorkflowError("VALIDATION", "Add at least one recipient.");
    const entity = await getEntity(d.entity_id ?? cat.entityId);
    if (!entity) throw new WorkflowError("INVALID_STATE", "Set up the company first (Correspondence, Setup).");
    const parent = entity.parentId ? await getEntity(entity.parentId) : null;
    const { ref } = await allocateRef({ category: cat, entity, parent, department: d.department, documentId: id, userId: user.id });
    const lh = await (await import("./setup")).letterheadFor(entity.id);
    const now = nowIso();
    const writer = d.created_by ? await get<{ name: string; title: string | null }>("SELECT name, title FROM users WHERE id = ?", d.created_by) : null;
    const tpl = await (await import("./templates")).publishedLayout(d.template_id);
    const signatures = await W.signatureBlocks(id, writer ? { name: writer.name, title: writer.title } : null);
    const state = await W.workflowState(id);
    const attachments = (await (await import("./delivery")).listAttachments(id)).map((a) => ({ n: a.n, name: a.name, sha256: a.sha256, size: a.size }));
    const S = await import("./signing");
    const verifyCode = await S.verifyCodeFor(id);
    const snapshot: IssuedSnapshot = {
      documentId: id,
      ref,
      issuedAt: now,
      issuedBy: { id: user.id, name: user.name, title: user.title },
      writer: { id: d.created_by, name: writer?.name ?? null },
      subject: d.subject,
      classification: d.classification,
      category: { id: cat.id, code: cat.code, name: cat.name },
      entity: { id: entity.id, code: entity.code, legalName: entity.legalName, address: entity.address, phone: entity.phone, email: entity.email, website: entity.website, registrationNo: entity.registrationNo, taxId: entity.taxId },
      letterhead: { ...lh },
      data: parseJson<LetterData>(d.data, {}),
      recipients,
      inReplyTo: d.in_reply_to,
      externalRef: d.external_ref,
      replaces: d.replaces_id,
      template: { id: tpl.templateId, version: tpl.version },
      layout: tpl.layout,
      signatures,
      attachments,
      approvals: (state?.run.status === "completed" ? state.steps : []).filter((x) => x.status === "approved" || x.status === "signed").map((x) => ({ stage: x.stageName, action: x.action, name: x.userName, capacity: x.capacity, at: x.actedAt, delegatedBy: x.delegatedBy })),
      verifyCode,
    };
    const body = canonical(snapshot);
    const hash = sha256(body);
    const sig = await S.signIssued({ id, ref, hash, issuedAt: now });
    await run(
      "UPDATE corr_documents SET status = 'issued', ref_number = ?, issued_snapshot = ?, content_hash = ?, issued_by = ?, issued_at = ?, entity_id = ?, template_version = ?, signature = ?, verify_code = ?, updated_at = ? WHERE id = ?",
      ref, body, hash, user.id, now, entity.id, tpl.version, sig.signature, verifyCode, now, id,
    );
    // The letter it replaces is marked as replaced (it keeps its number and stays in the registry).
    if (d.replaces_id) await audit(user, d.replaces_id, "replaced", { by: id, ref });
    await audit(user, id, "issued", { ref, hash, key: sig.keyFingerprint, template: tpl.templateId ? `${tpl.templateId} v${tpl.version}` : "default" });
    return { ref, hash, verifyCode };
  });
}

// Dispatch, delivery, acknowledgement and archiving after issue (in order; archiving at any point after issue).
export async function advanceDoc(user: AppUser, id: string, to: "dispatched" | "delivered" | "acknowledged" | "archived", input: { method?: string; note?: string } = {}) {
  needCorr(user, "issue", "You cannot record dispatch or delivery.");
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    const now = nowIso();
    if (to === "archived") {
      if (!AFTER_ISSUE.includes(d.status as Status) || d.status === "archived") throw new WorkflowError("INVALID_STATE", "Only issued letters are archived.");
      await run("UPDATE corr_documents SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?", now, now, id);
      await audit(user, id, "archived", { note: str(input.note, 500) || undefined });
      return;
    }
    // Steps can be skipped forwards (a hand-delivered letter is dispatched and delivered at once), never backwards.
    const order: Status[] = ["issued", "dispatched", "delivered", "acknowledged"];
    const from = order.indexOf(d.status as Status);
    const target = order.indexOf(to);
    if (from < 0 || target <= from) throw new WorkflowError("INVALID_STATE", `This letter is ${STATUS_LABEL[d.status as Status] ?? d.status}; it cannot be marked ${to}.`);
    const method = input.method && (DELIVERY_METHODS as readonly string[]).includes(input.method) ? input.method : d.delivery_method;
    if (to === "dispatched" && method === "fax") throw new WorkflowError("INVALID_STATE", "Fax dispatch is recorded by the fax service once it confirms sending (not by hand).");
    const COL: Record<string, string> = { dispatched: "dispatched_at", delivered: "delivered_at", acknowledged: "acknowledged_at" };
    const sets = order.slice(from + 1, target + 1).map((st) => COL[st]!);
    await run(`UPDATE corr_documents SET status = ?, delivery_method = ?, ${sets.map((c) => `${c} = COALESCE(${c}, ?)`).join(", ")}, updated_at = ? WHERE id = ?`, to, method ?? null, ...sets.map(() => now), now, id);
    await audit(user, id, to, { method, note: str(input.note, 500) || undefined, skipped: sets.length > 1 ? order.slice(from + 1, target) : undefined });
  });
}

export async function voidDoc(user: AppUser, id: string, reason: string) {
  const why = str(reason, 500).trim();
  if (why.length < 3) throw new WorkflowError("VALIDATION", "Say why the letter is voided.");
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    if (d.status === "void") throw new WorkflowError("INVALID_STATE", "Already void.");
    const own = d.status === "draft" && d.created_by === user.id;
    if (!own) needCorr(user, "issue", "Only people who issue letters void them.");
    const now = nowIso();
    await run("UPDATE corr_documents SET status = 'void', void_reason = ?, voided_at = ?, updated_at = ? WHERE id = ?", why, now, now, id);
    await run("UPDATE corr_runs SET status = 'cancelled', finished_at = ? WHERE document_id = ? AND status = 'running'", now, id);
    await run("UPDATE corr_steps SET status = 'cancelled' WHERE document_id = ? AND status IN ('pending','waiting')", id);
    // The number stays taken.
    if (d.ref_number) await run("UPDATE corr_numbers SET state = 'void', note = ? WHERE ref_number = ?", why, d.ref_number);
    await audit(user, id, "voided", { reason: why, ref: d.ref_number });
  });
}

// A new draft with the same content (a new document ID; a new number when it is issued).
export async function duplicateDoc(user: AppUser, id: string, as: "copy" | "amend" = "copy") {
  needCorr(user, "create", "You cannot write official letters.");
  const src = await mustSeeRow(user, id);
  if (as === "amend" && !AFTER_ISSUE.includes(src.status as Status)) throw new WorkflowError("INVALID_STATE", "Only issued letters are amended; edit the draft itself.");
  const nid = uuidv7();
  const now = nowIso();
  await tx(async () => {
    await run(
      "INSERT INTO corr_documents (id, direction, entity_id, category_id, department, status, classification, priority, subject, data, replaces_id, in_reply_to, external_ref, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      nid, src.direction, src.entity_id, src.category_id, src.department, src.classification, src.priority, src.subject, src.data, as === "amend" ? id : null, src.in_reply_to, src.external_ref, user.id, now, now,
    );
    await setRecipients(nid, await recipientsOf(id));
    await run("INSERT INTO corr_versions (document_id, version, data, subject, saved_by, saved_at) VALUES (?, 1, ?, ?, ?, ?)", nid, src.data, src.subject, user.name, now);
  });
  await audit(user, nid, as === "amend" ? "amendment.created" : "duplicated", { from: id, fromRef: src.ref_number });
  if (as === "amend") await audit(user, id, "amendment.started", { draft: nid });
  return nid;
}

// An incoming letter: registered with the sender, its own reference and the date it arrived, and given an internal
// tracking number at once (from the "IN" category, or the one chosen).
export async function registerIncoming(user: AppUser, input: { categoryId?: string | null; subject: string; sender: string; senderOrgId?: string | null; externalRef?: string | null; receivedAt?: string | null; department?: string | null; dueAt?: string | null; summary?: string; classification?: string; priority?: string }) {
  needCorr(user, "create", "You cannot register correspondence.");
  await ensureSetup();
  const catId = input.categoryId || (await get<{ id: string }>("SELECT id FROM corr_categories WHERE code = 'IN' AND active = 1 ORDER BY sort LIMIT 1"))?.id;
  if (!catId) throw new WorkflowError("INVALID_STATE", "Add a category for incoming letters (Correspondence, Setup).");
  if (!String(input.subject ?? "").trim() || !String(input.sender ?? "").trim()) throw new WorkflowError("VALIDATION", "Enter the sender and the subject.");
  const id = await createDraft(user, { categoryId: catId, direction: "incoming", department: input.department });
  const org = input.senderOrgId ? await get<{ legal_name: string; address: string | null; email: string | null; phone: string | null }>("SELECT legal_name, address, email, phone FROM corr_orgs WHERE id = ?", input.senderOrgId) : null;
  await saveDraft(user, id, {
    subject: input.subject,
    data: { sender: input.sender, receivedAt: input.receivedAt || nowIso(), summary: input.summary },
    recipients: org ? [{ kind: "to", orgId: input.senderOrgId, organisation: org.legal_name, address: org.address, email: org.email, phone: org.phone }] : [{ kind: "to", organisation: input.sender }],
    classification: input.classification,
    priority: input.priority,
    department: input.department,
    externalRef: input.externalRef,
    dueAt: input.dueAt,
  });
  // Registering is issuing an internal tracking number; anyone who may register incoming mail may do it.
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    const cat = (await getCategory(d.category_id!))!;
    const entity = (await getEntity(cat.entityId))!;
    const { ref } = await allocateRef({ category: cat, entity, parent: null, department: d.department, documentId: id, userId: user.id });
    const now = nowIso();
    const snapshot = { documentId: id, ref, registeredAt: now, registeredBy: user.name, subject: d.subject, data: parseJson(d.data, {}), externalRef: d.external_ref };
    const body = canonical(snapshot);
    await run("UPDATE corr_documents SET status = 'delivered', ref_number = ?, issued_snapshot = ?, content_hash = ?, issued_by = ?, issued_at = ?, delivered_at = ?, updated_at = ? WHERE id = ?", ref, body, sha256(body), user.id, now, input.receivedAt || now, now, id);
    await audit(user, id, "registered", { ref, sender: input.sender, externalRef: input.externalRef ?? undefined });
    return { id, ref };
  });
}

// The number register: every number ever given, with its state.
export async function numberRegister(user: AppUser, q = "") {
  needCorr(user, "audit", "Only auditors and administrators read the number register.");
  return all<{ ref_number: string; value: number; state: string; allocated_at: string; note: string | null; document_id: string | null; subject: string | null; by: string | null }>(
    `SELECT n.ref_number, n.value, n.state, n.allocated_at, n.note, n.document_id, d.subject, u.name AS by FROM corr_numbers n LEFT JOIN corr_documents d ON d.id = n.document_id LEFT JOIN users u ON u.id = n.allocated_by
     WHERE (? = '' OR n.ref_number ILIKE ?) ORDER BY n.allocated_at DESC LIMIT 500`,
    q,
    `%${q}%`,
  );
}

// Takes a submitted letter back to draft (the run is cancelled; its approvals stay in the history marked
// invalidated, and a new submission asks everyone again).
export async function withdrawDoc(user: AppUser, id: string) {
  return tx(async () => {
    const d = (await lockDoc(id)) as unknown as DocRow;
    if (d.created_by !== user.id && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only the writer withdraws this letter.");
    if (!IN_WORKFLOW.includes(d.status as Status) && d.status !== "approved" && d.status !== "signed") throw new WorkflowError("INVALID_STATE", "Only letters in approval are withdrawn.");
    const now = nowIso();
    const runs = (await all<{ id: string }>("SELECT id FROM corr_runs WHERE document_id = ? AND status IN ('running','completed')", id)).map((r) => r.id);
    for (const rid of runs) {
      await run("UPDATE corr_steps SET status = CASE WHEN status IN ('approved','signed') THEN 'invalidated' ELSE 'cancelled' END WHERE run_id = ? AND status IN ('pending','waiting','approved','signed')", rid);
      await run("UPDATE corr_runs SET status = 'cancelled', finished_at = ? WHERE id = ?", now, rid);
    }
    await run("UPDATE corr_documents SET status = 'draft', updated_at = ? WHERE id = ?", now, id);
    await audit(user, id, "withdrawn", { runs: runs.length });
  });
}

// Legal hold: the letter is kept whatever its retention says.
export async function setLegalHold(user: AppUser, id: string, on: boolean, reason: string) {
  needCorr(user, "admin", "Only correspondence administrators place legal holds.");
  if (on && String(reason ?? "").trim().length < 3) throw new WorkflowError("VALIDATION", "Give the reason for the hold.");
  await run("UPDATE corr_documents SET legal_hold = ?, updated_at = ? WHERE id = ?", on, nowIso(), id);
  await audit(user, id, on ? "legal_hold.on" : "legal_hold.off", { reason: String(reason ?? "").slice(0, 300) || undefined });
}

// Records that a letter was printed or exported (the audit shows every copy made).
export async function recordExport(user: AppUser, id: string, kind: "pdf" | "docx" | "print" | "png" | "fax_pdf") {
  await mustSeeRow(user, id);
  await audit(user, id, "exported", { kind });
}
