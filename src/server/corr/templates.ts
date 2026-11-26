// Letter templates: versioned layouts that a designer drafts and submits, and a correspondence administrator
// approves and publishes. Letters always use the published version, and an issued letter stores the exact layout it
// was issued with, so publishing a new version never changes a letter already sent.

import { all, get, nowIso, parseJson, run, tx, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, corrCan, needCorr } from "./core";
import { cleanLayout, defaultLayout, eid, type TemplateLayout } from "@/lib/corr-template";

export type TemplateStatus = "draft" | "pending" | "published" | "rejected" | "superseded";
export type TemplateSummary = { id: string; name: string; description: string | null; entityId: string | null; currentVersion: number | null; latestVersion: number; latestStatus: TemplateStatus; active: boolean; updatedAt: string };
export type TemplateVersion = { version: number; status: TemplateStatus; note: string | null; createdBy: string | null; createdAt: string; submittedAt: string | null; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null };

function canDesign(user: AppUser) {
  return corrCan(user, "admin") || (user.perms as string[]).includes("corr.template");
}
function needDesign(user: AppUser) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "View as is read only.");
  if (!canDesign(user)) throw new WorkflowError("FORBIDDEN", "Only template designers and administrators change templates.");
}

export async function listTemplates(user: AppUser, opts: { publishedOnly?: boolean } = {}): Promise<TemplateSummary[]> {
  const rows = await all<{ id: string; name: string; description: string | null; entity_id: string | null; current_version: number | null; active: number; updated_at: string; latest: number; latest_status: string }>(
    `SELECT t.*, v.version AS latest, v.status AS latest_status FROM corr_templates t
     JOIN corr_template_versions v ON v.template_id = t.id AND v.version = (SELECT MAX(version) FROM corr_template_versions WHERE template_id = t.id)
     ${opts.publishedOnly || !canDesign(user) ? "WHERE t.current_version IS NOT NULL AND t.active = 1" : ""}
     ORDER BY t.name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, entityId: r.entity_id, currentVersion: r.current_version == null ? null : Number(r.current_version), latestVersion: Number(r.latest), latestStatus: r.latest_status as TemplateStatus, active: !!r.active, updatedAt: r.updated_at }));
}

export async function getTemplate(user: AppUser, id: string) {
  const t = await get<{ id: string; name: string; description: string | null; entity_id: string | null; current_version: number | null; active: number }>("SELECT * FROM corr_templates WHERE id = ?", id);
  if (!t) throw new WorkflowError("NOT_FOUND", "Template not found.");
  const versions = await all<{ version: number; status: string; note: string | null; created_by: string | null; created_at: string; submitted_at: string | null; decided_by: string | null; decided_at: string | null; decision_note: string | null; layout: string }>("SELECT * FROM corr_template_versions WHERE template_id = ? ORDER BY version DESC", id);
  if (!canDesign(user) && t.current_version == null) throw new WorkflowError("NOT_FOUND", "Template not found.");
  const ids = [...new Set(versions.map((v) => v.created_by).filter(Boolean))] as string[];
  const names = ids.length ? await all<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
  const nameOf = (id: string | null) => names.find((n) => n.id === id)?.name ?? id;
  const latest = versions[0]!;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    entityId: t.entity_id,
    active: !!t.active,
    currentVersion: t.current_version == null ? null : Number(t.current_version),
    // Designers see the latest version (their draft); everyone else the published one.
    layout: cleanLayout(parseJson(canDesign(user) ? latest.layout : (versions.find((v) => Number(v.version) === Number(t.current_version))?.layout ?? "{}"), {})),
    versions: versions.map(
      (v): TemplateVersion => ({ version: Number(v.version), status: v.status as TemplateStatus, note: v.note, createdBy: nameOf(v.created_by), createdAt: v.created_at, submittedAt: v.submitted_at, decidedBy: v.decided_by, decidedAt: v.decided_at, decisionNote: v.decision_note }),
    ),
    canDesign: canDesign(user),
    canApprove: corrCan(user, "admin"),
  };
}

// The published layout of a template, for writing and issuing letters (a fresh default when none is set).
export async function publishedLayout(templateId: string | null | undefined): Promise<{ templateId: string | null; version: number | null; layout: TemplateLayout }> {
  if (templateId) {
    const r = await get<{ current_version: number | null; layout: string }>(
      "SELECT t.current_version, v.layout FROM corr_templates t JOIN corr_template_versions v ON v.template_id = t.id AND v.version = t.current_version WHERE t.id = ? AND t.active = 1",
      templateId,
    );
    if (r) return { templateId, version: Number(r.current_version), layout: cleanLayout(parseJson(r.layout, {})) };
  }
  return { templateId: null, version: null, layout: defaultLayout() };
}

export async function createTemplate(user: AppUser, input: { name: string; description?: string; copyOf?: string | null; size?: string; entityId?: string | null }) {
  needDesign(user);
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Name the template.");
  let layout = defaultLayout(input.size ?? "A4");
  if (input.copyOf) {
    const src = await get<{ layout: string }>("SELECT layout FROM corr_template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1", input.copyOf);
    if (!src) throw new WorkflowError("NOT_FOUND", "The template to copy was not found.");
    layout = cleanLayout(parseJson(src.layout, {}));
    layout.elements = layout.elements.map((e) => ({ ...e, id: eid() }));
  } else {
    // A new template starts from the company letterhead (Tools, Letters): its colours, logo and texts.
    const lh = (await (await import("../tools")).toolsConfig()).letterhead;
    layout.colors = { primary: lh.primary, accent: lh.accent };
    layout.elements = layout.elements.map((e) => (e.kind === "line" && e.zone.endsWith("first") ? { ...e, stroke: lh.primary } : e.kind === "image" && e.src === "logo" && lh.logo ? { ...e, src: lh.logo } : e.text === "" && lh.tagline ? { ...e, text: lh.tagline } : e));
  }
  const id = uid("ct_");
  const now = nowIso();
  await tx(async () => {
    await run("INSERT INTO corr_templates (id, entity_id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, input.entityId ?? null, name, String(input.description ?? "").slice(0, 400) || null, user.id, now, now);
    await run("INSERT INTO corr_template_versions (template_id, version, layout, status, note, created_by, created_at) VALUES (?, 1, ?, 'draft', ?, ?, ?)", id, JSON.stringify(layout), input.copyOf ? "Copied" : "Created", user.id, now);
  });
  await audit(user, null, "template.created", { id, name, copyOf: input.copyOf ?? undefined });
  return id;
}

// Saves the designer's work into the open draft version (a new draft after a published or rejected one).
export async function saveTemplateDraft(user: AppUser, id: string, input: { layout: unknown; name?: string; description?: string }) {
  needDesign(user);
  const layout = cleanLayout(input.layout);
  const body = JSON.stringify(layout);
  if (body.length > 6_000_000) throw new WorkflowError("VALIDATION", "The template is too large (pictures make it big; use smaller ones).");
  return tx(async () => {
    const latest = await get<{ version: number; status: string }>("SELECT version, status FROM corr_template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1 FOR UPDATE", id);
    if (!latest) throw new WorkflowError("NOT_FOUND", "Template not found.");
    const now = nowIso();
    let version = Number(latest.version);
    if (latest.status === "draft") await run("UPDATE corr_template_versions SET layout = ?, created_at = ? WHERE template_id = ? AND version = ?", body, now, id, version);
    else if (latest.status === "pending") throw new WorkflowError("INVALID_STATE", "This version is waiting for approval. Withdraw it to keep changing it.");
    else {
      version += 1;
      await run("INSERT INTO corr_template_versions (template_id, version, layout, status, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, ?)", id, version, body, user.id, now);
    }
    if (input.name?.trim()) await run("UPDATE corr_templates SET name = ?, description = COALESCE(?, description), updated_at = ? WHERE id = ?", input.name.trim().slice(0, 120), input.description?.slice(0, 400) ?? null, now, id);
    else await run("UPDATE corr_templates SET updated_at = ? WHERE id = ?", now, id);
    return { version };
  });
}

export async function submitTemplate(user: AppUser, id: string, note: string) {
  needDesign(user);
  const r = await run("UPDATE corr_template_versions SET status = 'pending', note = ?, submitted_at = ? WHERE template_id = ? AND status = 'draft'", String(note ?? "").slice(0, 400) || null, nowIso(), id);
  if (!r.changes) throw new WorkflowError("INVALID_STATE", "There is no draft to submit.");
  await audit(user, null, "template.submitted", { id });
}

export async function withdrawTemplate(user: AppUser, id: string) {
  needDesign(user);
  await run("UPDATE corr_template_versions SET status = 'draft', submitted_at = NULL WHERE template_id = ? AND status = 'pending'", id);
}

// Approving publishes the version: letters written from now on use it; the version before becomes superseded.
// The person who drafted it does not approve it (unless they are the only administrator, and then it is recorded).
export async function decideTemplate(user: AppUser, id: string, approve: boolean, note: string) {
  needCorr(user, "admin", "Only correspondence administrators approve templates.");
  return tx(async () => {
    const v = await get<{ version: number; created_by: string | null }>("SELECT version, created_by FROM corr_template_versions WHERE template_id = ? AND status = 'pending' ORDER BY version DESC LIMIT 1 FOR UPDATE", id);
    if (!v) throw new WorkflowError("INVALID_STATE", "Nothing is waiting for approval.");
    const own = v.created_by === user.id;
    const otherAdmins = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM role_assignments WHERE role = 'admin' AND user_id <> ?", user.id))?.n ?? 0);
    if (approve && own && otherAdmins > 0) throw new WorkflowError("FORBIDDEN", "Someone other than the designer approves a template.");
    const now = nowIso();
    if (approve) {
      await run("UPDATE corr_template_versions SET status = 'superseded' WHERE template_id = ? AND status = 'published'", id);
      await run("UPDATE corr_template_versions SET status = 'published', decided_by = ?, decided_at = ?, decision_note = ? WHERE template_id = ? AND version = ?", user.name, now, String(note ?? "").slice(0, 400) || null, id, v.version);
      await run("UPDATE corr_templates SET current_version = ?, updated_at = ? WHERE id = ?", v.version, now, id);
    } else await run("UPDATE corr_template_versions SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE template_id = ? AND version = ?", user.name, now, String(note ?? "").slice(0, 400) || null, id, v.version);
    await audit(user, null, approve ? "template.published" : "template.rejected", { id, version: Number(v.version), note: note || undefined, ownWork: own || undefined });
  });
}

export async function setTemplateActive(user: AppUser, id: string, active: boolean) {
  needCorr(user, "admin", "Only correspondence administrators retire templates.");
  await run("UPDATE corr_templates SET active = ?, updated_at = ? WHERE id = ?", active, nowIso(), id);
  await audit(user, null, active ? "template.restored" : "template.retired", { id });
}

// A version's layout, as it was (for comparing versions).
export async function templateVersion(user: AppUser, id: string, version: number) {
  if (!canDesign(user) && !corrCan(user, "audit")) throw new WorkflowError("FORBIDDEN", "Only designers, administrators and auditors open old versions.");
  const r = await get<{ layout: string }>("SELECT layout FROM corr_template_versions WHERE template_id = ? AND version = ?", id, version);
  if (!r) throw new WorkflowError("NOT_FOUND", "Version not found.");
  return cleanLayout(parseJson(r.layout, {}));
}
