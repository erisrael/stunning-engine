// Correspondence setup: the entities that send letters (the company, subsidiaries, branches) and the letter
// categories, each with its numbering rule. On first use the company and the usual categories are created from the
// site's identity and the Tools letterhead, so letters can be written at once; Admin changes everything later.

import { all, get, nowIso, parseJson, run, tx, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, CLASSIFICATIONS, needCorr, type Classification } from "./core";

export type Entity = {
  id: string;
  parentId: string | null;
  kind: "company" | "subsidiary" | "branch";
  code: string;
  legalName: string;
  tradingName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  active: boolean;
  // Its own letterhead (logo, colours, tagline, footer, signatory); empty parts use the company letterhead.
  letterhead: EntityLetterhead;
};
export type EntityLetterhead = { logo?: string | null; primary?: string; accent?: string; tagline?: string; footer?: string; signName?: string; signTitle?: string };
// What a category needs before a letter is issued (later stages add approval workflows and signatures).
export type CategoryConfig = { requiresApproval?: boolean; fyStartMonth?: number; description?: string; workflowId?: string | null; templateId?: string | null; retentionYears?: number | null; stampRequired?: boolean };
export type Category = {
  id: string;
  entityId: string | null;
  code: string;
  name: string;
  pattern: string;
  scope: "category" | "department" | "entity";
  reset: "yearly" | "fiscal" | "never";
  padding: number;
  classification: Classification;
  config: CategoryConfig;
  active: boolean;
};

type EntityRow = { id: string; parent_id: string | null; kind: string; code: string; legal_name: string; trading_name: string | null; registration_no: string | null; tax_id: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; active: number; letterhead: string };
type CategoryRow = { id: string; entity_id: string | null; code: string; name: string; pattern: string; scope: string; reset: string; padding: number; classification: string; config: string; active: number };

const toEntity = (r: EntityRow): Entity => ({ id: r.id, parentId: r.parent_id, kind: (["subsidiary", "branch"].includes(r.kind) ? r.kind : "company") as Entity["kind"], code: r.code, legalName: r.legal_name, tradingName: r.trading_name, registrationNo: r.registration_no, taxId: r.tax_id, address: r.address, phone: r.phone, email: r.email, website: r.website, active: !!r.active, letterhead: parseJson<EntityLetterhead>(r.letterhead, {}) });
const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  entityId: r.entity_id,
  code: r.code,
  name: r.name,
  pattern: r.pattern,
  scope: (["department", "entity"].includes(r.scope) ? r.scope : "category") as Category["scope"],
  reset: (["fiscal", "never"].includes(r.reset) ? r.reset : "yearly") as Category["reset"],
  padding: Number(r.padding),
  classification: ((CLASSIFICATIONS as readonly string[]).includes(r.classification) ? r.classification : "internal") as Classification,
  config: parseJson<CategoryConfig>(r.config, {}),
  active: !!r.active,
});

export const DEFAULT_PATTERN = "{ENTITY}/{CAT}/{YYYY}/{SEQ}";
// The usual categories (spec 2.3). Incoming letters get their own internal tracking numbers.
const DEFAULT_CATEGORIES: [string, string, Classification][] = [
  ["GEN", "General correspondence", "internal"],
  ["MGT", "Official management letter", "internal"],
  ["FIN", "Financial and accounting", "confidential"],
  ["HR", "Human resources", "confidential"],
  ["EMP", "Employment and appointment", "confidential"],
  ["CTR", "Contracts and agreements", "confidential"],
  ["PRC", "Procurement", "internal"],
  ["SAL", "Sales and commercial", "internal"],
  ["CUS", "Customer communication", "internal"],
  ["GOV", "Government and regulatory", "confidential"],
  ["MEMO", "Internal memorandum", "internal"],
  ["DIS", "Warning and disciplinary", "restricted"],
  ["INV", "Invitation", "public"],
  ["REC", "Recommendation", "internal"],
  ["CRT", "Certificate and confirmation", "public"],
  ["IN", "Incoming correspondence", "internal"],
];

// Creates the company and the usual categories the first time Correspondence is opened.
export async function ensureSetup() {
  if (await get("SELECT 1 AS x FROM corr_entities LIMIT 1")) return;
  const { identity } = await import("../identity");
  const { toolsConfig } = await import("../tools");
  const [id, lh] = await Promise.all([identity(), toolsConfig().then((c) => c.letterhead)]);
  const now = nowIso();
  const code = (lh.refPrefix || id.shortName || id.name).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "CO";
  await tx(async () => {
    if (await get("SELECT 1 AS x FROM corr_entities LIMIT 1")) return;
    const entityId = uid("ce_");
    await run(
      "INSERT INTO corr_entities (id, kind, code, legal_name, address, phone, email, website, created_at, updated_at) VALUES (?, 'company', ?, ?, ?, ?, ?, ?, ?, ?)",
      entityId,
      code,
      lh.company || id.name,
      lh.address || null,
      lh.phone || null,
      lh.email || null,
      lh.website || null,
      now,
      now,
    );
    let sort = 0;
    for (const [c, name, cls] of DEFAULT_CATEGORIES)
      await run(
        "INSERT INTO corr_categories (id, entity_id, code, name, pattern, classification, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        uid("cc_"),
        entityId,
        c,
        name,
        c === "IN" ? "{ENTITY}/IN/{YYYY}/{SEQ}" : DEFAULT_PATTERN,
        cls,
        sort++,
        now,
        now,
      );
  });
}

export async function listEntities(): Promise<Entity[]> {
  await ensureSetup();
  return (await all<EntityRow>("SELECT * FROM corr_entities ORDER BY CASE kind WHEN 'company' THEN 0 WHEN 'subsidiary' THEN 1 ELSE 2 END, legal_name")).map(toEntity);
}
export async function listCategories(opts: { includeInactive?: boolean } = {}): Promise<Category[]> {
  await ensureSetup();
  return (await all<CategoryRow>(`SELECT * FROM corr_categories ${opts.includeInactive ? "" : "WHERE active = 1"} ORDER BY sort, name`)).map(toCategory);
}
export async function getCategory(id: string) {
  const r = await get<CategoryRow>("SELECT * FROM corr_categories WHERE id = ?", id);
  return r ? toCategory(r) : null;
}
export async function getEntity(id: string | null) {
  const r = id ? await get<EntityRow>("SELECT * FROM corr_entities WHERE id = ?", id) : await get<EntityRow>("SELECT * FROM corr_entities WHERE kind = 'company' ORDER BY created_at LIMIT 1");
  return r ? toEntity(r) : null;
}

const clean = (v: unknown, n: number) => {
  const s = String(v ?? "").trim().slice(0, n);
  return s || null;
};

// The letterhead for an entity: the company letterhead with the entity's own parts on top (and its parents' for a
// branch), so a subsidiary or branch can carry its own name, logo, colours and footer.
export async function letterheadFor(entityId: string | null | undefined) {
  const base = (await (await import("../tools")).toolsConfig()).letterhead;
  const chain: Entity[] = [];
  let e = entityId ? await getEntity(entityId) : null;
  for (let i = 0; e && i < 5; i++) {
    chain.unshift(e);
    e = e.parentId ? await getEntity(e.parentId) : null;
  }
  let out = { ...base };
  for (const x of chain) {
    const l = x.letterhead ?? {};
    out = { ...out, company: x.legalName || out.company, address: x.address ?? out.address, phone: x.phone ?? out.phone, email: x.email ?? out.email, website: x.website ?? out.website, ...(l.logo ? { logo: l.logo } : {}), ...(l.primary ? { primary: l.primary } : {}), ...(l.accent ? { accent: l.accent } : {}), ...(l.tagline ? { tagline: l.tagline } : {}), ...(l.footer ? { footer: l.footer } : {}), ...(l.signName ? { signName: l.signName } : {}), ...(l.signTitle ? { signTitle: l.signTitle } : {}) };
  }
  return out;
}

export async function saveEntity(user: AppUser, input: Partial<Entity> & { legalName: string; code: string }) {
  needCorr(user, "admin", "Only correspondence administrators change entities.");
  const code = String(input.code ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new WorkflowError("VALIDATION", "The code is 1 to 12 letters, digits or dashes (it goes into reference numbers).");
  if (!String(input.legalName ?? "").trim()) throw new WorkflowError("VALIDATION", "Enter the legal name.");
  const kind = input.kind === "subsidiary" || input.kind === "branch" ? input.kind : "company";
  if (input.parentId && input.parentId === input.id) throw new WorkflowError("VALIDATION", "An entity cannot be its own parent.");
  const clash = await get<{ id: string }>("SELECT id FROM corr_entities WHERE code = ?", code);
  if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `The code ${code} is already used.`);
  const now = nowIso();
  const lhIn = (input.letterhead ?? {}) as EntityLetterhead;
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  if (lhIn.logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(lhIn.logo) || lhIn.logo.length > 400_000)) throw new WorkflowError("VALIDATION", "The logo must be a PNG, JPEG or WebP under 300 KB.");
  const letterhead: EntityLetterhead = { logo: lhIn.logo || null, primary: hex(lhIn.primary), accent: hex(lhIn.accent), tagline: clean(lhIn.tagline, 160) ?? undefined, footer: clean(lhIn.footer, 400) ?? undefined, signName: clean(lhIn.signName, 120) ?? undefined, signTitle: clean(lhIn.signTitle, 120) ?? undefined };
  const fields = [input.parentId || null, kind, code, String(input.legalName).trim().slice(0, 200), clean(input.tradingName, 200), clean(input.registrationNo, 80), clean(input.taxId, 80), clean(input.address, 400), clean(input.phone, 80), clean(input.email, 160), clean(input.website, 160), input.active === false ? 0 : 1] as const;
  let id = input.id ?? null;
  if (id) {
    const r = await run("UPDATE corr_entities SET parent_id = ?, kind = ?, code = ?, legal_name = ?, trading_name = ?, registration_no = ?, tax_id = ?, address = ?, phone = ?, email = ?, website = ?, active = ?, updated_at = ?, letterhead = ? WHERE id = ?", ...fields, now, JSON.stringify(letterhead), id);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Entity not found.");
  } else {
    id = uid("ce_");
    await run("INSERT INTO corr_entities (parent_id, kind, code, legal_name, trading_name, registration_no, tax_id, address, phone, email, website, active, id, created_at, updated_at, letterhead) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...fields, id, now, now, JSON.stringify(letterhead));
  }
  await audit(user, null, "entity.saved", { id, code, legalName: input.legalName });
  return id;
}

// A pattern must contain {SEQ}, so every number is distinct; only the known tokens are allowed.
export const PATTERN_TOKENS = ["{ENTITY}", "{PARENT}", "{DEPT}", "{CAT}", "{YYYY}", "{YY}", "{FY}", "{MM}", "{SEQ}"] as const;
export function checkPattern(p: string) {
  if (!p.includes("{SEQ}")) throw new WorkflowError("VALIDATION", "The pattern must contain {SEQ} (the running number).");
  const unknown = (p.match(/\{[^}]*\}/g) ?? []).filter((t) => !(PATTERN_TOKENS as readonly string[]).includes(t));
  if (unknown.length) throw new WorkflowError("VALIDATION", `Unknown parts in the pattern: ${unknown.join(", ")}.`);
  if (!/^[A-Za-z0-9{}/._-]{3,80}$/.test(p)) throw new WorkflowError("VALIDATION", "Use letters, digits, the tokens and / . _ - only.");
}

export async function saveCategory(user: AppUser, input: Partial<Category> & { code: string; name: string; pattern: string }) {
  needCorr(user, "admin", "Only correspondence administrators change categories and numbering.");
  const code = String(input.code ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new WorkflowError("VALIDATION", "The code is 1 to 12 letters, digits or dashes.");
  if (!String(input.name ?? "").trim()) throw new WorkflowError("VALIDATION", "Name the category.");
  checkPattern(input.pattern);
  const padding = Math.min(10, Math.max(1, Number(input.padding) || 6));
  const scope = input.scope === "department" || input.scope === "entity" ? input.scope : "category";
  const reset = input.reset === "fiscal" || input.reset === "never" ? input.reset : "yearly";
  const cls = (CLASSIFICATIONS as readonly string[]).includes(String(input.classification)) ? input.classification! : "internal";
  const fy = Math.min(12, Math.max(1, Number(input.config?.fyStartMonth) || 7));
  const wfId = input.config?.workflowId ? String(input.config.workflowId) : null;
  if (wfId && !(await get("SELECT 1 AS x FROM corr_workflows WHERE id = ?", wfId))) throw new WorkflowError("VALIDATION", "That workflow does not exist.");
  const tplId = input.config?.templateId ? String(input.config.templateId) : null;
  if (tplId && !(await get("SELECT 1 AS x FROM corr_templates WHERE id = ?", tplId))) throw new WorkflowError("VALIDATION", "That template does not exist.");
  const years = input.config?.retentionYears == null || (input.config.retentionYears as unknown) === "" ? null : Math.min(100, Math.max(0, Number(input.config.retentionYears) || 0)) || null;
  const config: CategoryConfig = { requiresApproval: !!input.config?.requiresApproval, fyStartMonth: fy, description: String(input.config?.description ?? "").slice(0, 400) || undefined, workflowId: wfId, templateId: tplId, retentionYears: years, stampRequired: !!input.config?.stampRequired };
  const entityId = input.entityId || (await getEntity(null))?.id || null;
  const clash = await get<{ id: string }>("SELECT id FROM corr_categories WHERE code = ? AND entity_id IS NOT DISTINCT FROM ?", code, entityId);
  if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `The code ${code} is already used for this entity.`);
  const now = nowIso();
  let id = input.id ?? null;
  if (id) {
    const before = await getCategory(id);
    if (!before) throw new WorkflowError("NOT_FOUND", "Category not found.");
    await run(
      "UPDATE corr_categories SET entity_id = ?, code = ?, name = ?, pattern = ?, scope = ?, reset = ?, padding = ?, classification = ?, config = ?, active = ?, updated_at = ? WHERE id = ?",
      entityId, code, String(input.name).trim().slice(0, 120), input.pattern, scope, reset, padding, cls, JSON.stringify(config), input.active === false ? 0 : 1, now, id,
    );
    await audit(user, null, "category.saved", { id, code, before: { pattern: before.pattern, scope: before.scope, reset: before.reset, padding: before.padding }, after: { pattern: input.pattern, scope, reset, padding } });
  } else {
    id = uid("cc_");
    const sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM corr_categories"))?.n ?? 0);
    await run(
      "INSERT INTO corr_categories (id, entity_id, code, name, pattern, scope, reset, padding, classification, config, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, entityId, code, String(input.name).trim().slice(0, 120), input.pattern, scope, reset, padding, cls, JSON.stringify(config), sort, now, now,
    );
    await audit(user, null, "category.saved", { id, code, pattern: input.pattern });
  }
  return id;
}
