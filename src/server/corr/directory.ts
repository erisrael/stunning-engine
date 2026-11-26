// The company directory for letters: organisations and their contact people. Letters copy the recipient's details
// when they are written, so changing the directory later never changes a letter already sent.
//
// Sources are kept apart: "internal" (entered here), "external" (found in an outside directory, not yet checked) and
// "verified" (checked against an authoritative source by a named person). Nothing is marked verified automatically.

import { all, get, nowIso, run, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, hasCorrespondence, needCorr } from "./core";

export type Org = {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  kind: string | null;
  industry: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  postalAddress: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  website: string | null;
  channel: string | null;
  status: string;
  source: "internal" | "external" | "verified";
  verifiedBy: string | null;
  verifiedAt: string | null;
  favorite: boolean;
  notes: string | null;
  letters?: number;
  lastLetterAt?: string | null;
  contacts?: Contact[];
};
export type Contact = { id: string; orgId: string; name: string; title: string | null; department: string | null; email: string | null; phone: string | null; fax: string | null; primary: boolean };

type OrgRow = { id: string; legal_name: string; trading_name: string | null; registration_no: string | null; tax_id: string | null; kind: string | null; industry: string | null; country: string | null; region: string | null; city: string | null; address: string | null; postal_address: string | null; phone: string | null; email: string | null; fax: string | null; website: string | null; channel: string | null; status: string; source: string; verified_by: string | null; verified_at: string | null; favorite: number; notes: string | null; letters?: number; last_at?: string | null };
type ContactRow = { id: string; org_id: string; name: string; title: string | null; department: string | null; email: string | null; phone: string | null; fax: string | null; is_primary: number };

const toOrg = (r: OrgRow): Org => ({
  id: r.id, legalName: r.legal_name, tradingName: r.trading_name, registrationNo: r.registration_no, taxId: r.tax_id, kind: r.kind, industry: r.industry, country: r.country, region: r.region, city: r.city, address: r.address, postalAddress: r.postal_address, phone: r.phone, email: r.email, fax: r.fax, website: r.website, channel: r.channel, status: r.status,
  source: (["external", "verified"].includes(r.source) ? r.source : "internal") as Org["source"], verifiedBy: r.verified_by, verifiedAt: r.verified_at, favorite: !!r.favorite, notes: r.notes, letters: r.letters != null ? Number(r.letters) : undefined, lastLetterAt: r.last_at ?? null,
});
const toContact = (r: ContactRow): Contact => ({ id: r.id, orgId: r.org_id, name: r.name, title: r.title, department: r.department, email: r.email, phone: r.phone, fax: r.fax, primary: !!r.is_primary });

function mustSee(user: AppUser) {
  if (!hasCorrespondence(user)) throw new WorkflowError("FORBIDDEN", "You do not have Correspondence.");
}

// Search by name (any part), registration or tax number, contact person, email, phone, city or industry.
// Empty search: favourites first, then the organisations written to most often and most recently.
export async function searchOrgs(user: AppUser, q: string, limit = 20) {
  mustSee(user);
  const term = q.trim().slice(0, 80);
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, "");
  const rows = await all<OrgRow>(
    `SELECT o.*, (SELECT COUNT(*) FROM corr_recipients r WHERE r.org_id = o.id) AS letters, (SELECT MAX(d.created_at) FROM corr_recipients r JOIN corr_documents d ON d.id = r.document_id WHERE r.org_id = o.id) AS last_at
     FROM corr_orgs o
     WHERE o.status <> 'archived' AND (? = '' OR o.legal_name ILIKE ? OR COALESCE(o.trading_name,'') ILIKE ? OR COALESCE(o.registration_no,'') ILIKE ? OR COALESCE(o.tax_id,'') ILIKE ?
       OR COALESCE(o.email,'') ILIKE ? OR COALESCE(o.city,'') ILIKE ? OR COALESCE(o.industry,'') ILIKE ?
       OR (? <> '' AND REGEXP_REPLACE(COALESCE(o.phone,''), '[^0-9]', '', 'g') LIKE ?)
       OR EXISTS (SELECT 1 FROM corr_contacts c WHERE c.org_id = o.id AND (c.name ILIKE ? OR COALESCE(c.email,'') ILIKE ? OR (? <> '' AND REGEXP_REPLACE(COALESCE(c.phone,''), '[^0-9]', '', 'g') LIKE ?))))
     ORDER BY o.favorite DESC, CASE WHEN o.legal_name ILIKE ? THEN 0 ELSE 1 END, letters DESC, last_at DESC NULLS LAST, o.legal_name
     LIMIT ?`,
    term, like, like, like, like, like, like, like, digits, `%${digits}%`, like, like, digits, `%${digits}%`, `${term}%`, Math.min(100, limit),
  );
  const orgs = rows.map(toOrg);
  if (orgs.length) {
    const contacts = await all<ContactRow>(`SELECT * FROM corr_contacts WHERE org_id IN (${orgs.map(() => "?").join(",")}) ORDER BY is_primary DESC, name`, ...orgs.map((o) => o.id));
    for (const o of orgs) o.contacts = contacts.filter((c) => c.org_id === o.id).map(toContact);
  }
  return orgs;
}

export async function getOrg(user: AppUser, id: string) {
  mustSee(user);
  const r = await get<OrgRow>("SELECT * FROM corr_orgs WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Organisation not found.");
  const o = toOrg(r);
  o.contacts = (await all<ContactRow>("SELECT * FROM corr_contacts WHERE org_id = ? ORDER BY is_primary DESC, name", id)).map(toContact);
  return o;
}

const s = (v: unknown, n: number) => {
  const x = String(v ?? "").trim().slice(0, n);
  return x || null;
};

export async function saveOrg(user: AppUser, input: Partial<Org> & { legalName: string }) {
  needCorr(user, "directory", "You cannot change the directory.");
  const name = String(input.legalName ?? "").trim();
  if (!name) throw new WorkflowError("VALIDATION", "Enter the organisation's legal name.");
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new WorkflowError("VALIDATION", "That email does not look right.");
  const reg = s(input.registrationNo, 80);
  if (reg) {
    const dup = await get<{ id: string; legal_name: string }>("SELECT id, legal_name FROM corr_orgs WHERE registration_no = ?", reg);
    if (dup && dup.id !== input.id) throw new WorkflowError("VALIDATION", `${dup.legal_name} already has registration number ${reg}.`);
  }
  // "verified" can only be set by a person, with their name and the time recorded.
  const source = input.source === "external" ? "external" : input.source === "verified" ? "verified" : "internal";
  const now = nowIso();
  const vals = [name.slice(0, 200), s(input.tradingName, 200), reg, s(input.taxId, 80), s(input.kind, 60), s(input.industry, 80), s(input.country, 80), s(input.region, 80), s(input.city, 80), s(input.address, 400), s(input.postalAddress, 200), s(input.phone, 60), s(input.email, 160), s(input.fax, 60), s(input.website, 160), s(input.channel, 30), input.status === "archived" ? "archived" : "active", source, input.favorite ? 1 : 0, s(input.notes, 2000)] as const;
  let id = input.id ?? null;
  if (id) {
    const before = await get<{ source: string }>("SELECT source FROM corr_orgs WHERE id = ?", id);
    if (!before) throw new WorkflowError("NOT_FOUND", "Organisation not found.");
    await run(
      `UPDATE corr_orgs SET legal_name = ?, trading_name = ?, registration_no = ?, tax_id = ?, kind = ?, industry = ?, country = ?, region = ?, city = ?, address = ?, postal_address = ?, phone = ?, email = ?, fax = ?, website = ?, channel = ?, status = ?, source = ?, favorite = ?, notes = ?, updated_at = ?,
         verified_by = CASE WHEN ? = 'verified' AND source <> 'verified' THEN ? WHEN ? <> 'verified' THEN NULL ELSE verified_by END,
         verified_at = CASE WHEN ? = 'verified' AND source <> 'verified' THEN ? WHEN ? <> 'verified' THEN NULL ELSE verified_at END
       WHERE id = ?`,
      ...vals, now, source, user.name, source, source, now, source, id,
    );
    if (before.source !== source) await audit(user, null, "directory.source", { org: id, from: before.source, to: source });
  } else {
    id = uid("co_");
    await run(
      `INSERT INTO corr_orgs (legal_name, trading_name, registration_no, tax_id, kind, industry, country, region, city, address, postal_address, phone, email, fax, website, channel, status, source, favorite, notes, id, created_by, created_at, updated_at, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...vals, id, user.id, now, now, source === "verified" ? user.name : null, source === "verified" ? now : null,
    );
  }
  return id;
}

export async function saveContact(user: AppUser, input: Partial<Contact> & { orgId: string; name: string }) {
  needCorr(user, "directory", "You cannot change the directory.");
  if (!(await get("SELECT 1 AS x FROM corr_orgs WHERE id = ?", input.orgId))) throw new WorkflowError("NOT_FOUND", "Organisation not found.");
  const name = String(input.name ?? "").trim();
  if (!name) throw new WorkflowError("VALIDATION", "Enter the contact's name.");
  const vals = [name.slice(0, 160), s(input.title, 120), s(input.department, 120), s(input.email, 160), s(input.phone, 60), s(input.fax, 60), input.primary ? 1 : 0] as const;
  if (input.primary) await run("UPDATE corr_contacts SET is_primary = 0 WHERE org_id = ?", input.orgId);
  if (input.id) {
    const r = await run("UPDATE corr_contacts SET name = ?, title = ?, department = ?, email = ?, phone = ?, fax = ?, is_primary = ? WHERE id = ? AND org_id = ?", ...vals, input.id, input.orgId);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Contact not found.");
    return input.id;
  }
  const id = uid("cp_");
  await run("INSERT INTO corr_contacts (name, title, department, email, phone, fax, is_primary, id, org_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ...vals, id, input.orgId, nowIso());
  return id;
}

export async function deleteContact(user: AppUser, id: string) {
  needCorr(user, "directory", "You cannot change the directory.");
  await run("DELETE FROM corr_contacts WHERE id = ?", id);
}
