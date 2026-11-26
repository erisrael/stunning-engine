// Correspondence core: document IDs, the append-only audit chain, and who may do what.

import crypto from "node:crypto";
import { all, get, nowIso, run, tx } from "../db";
import { WorkflowError } from "../workflow";
import { can, type AppUser } from "../users";
import type { Capability } from "@/lib/domain";

// UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then random bits. Sortable by creation time, collision-resistant,
// never reused. Generated on the server only.
export function uuidv7(now = Date.now()) {
  const b = crypto.randomBytes(16);
  b.writeUIntBE(now, 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// JSON with keys in a fixed order, so the same content always hashes the same.
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

// ---------------------------------------------------------------------------
// Audit: one chain per document (and one for setup changes). Each record's hash covers the previous record's hash,
// so a changed, removed or reordered record breaks the chain; the table also refuses UPDATE and DELETE.
// ---------------------------------------------------------------------------

const chainKey = (docId: string | null) => `corr:${docId ?? "setup"}`;
const recordHash = (prev: string | null, r: { document_id: string | null; actor_id: string | null; action: string; detail: string; at: string }) =>
  sha256(`${prev ?? ""}|${canonical([r.document_id, r.actor_id, r.action, r.detail, r.at])}`);

export async function audit(user: AppUser | null, docId: string | null, action: string, detail: Record<string, unknown> = {}, ip: string | null = null) {
  await tx(async () => {
    // One writer per chain at a time, so two events never take the same previous hash.
    await get("SELECT pg_advisory_xact_lock(hashtext(?)) AS x", chainKey(docId));
    const prev = await get<{ hash: string }>(`SELECT hash FROM corr_audit WHERE ${docId ? "document_id = ?" : "document_id IS NULL"} ORDER BY seq DESC LIMIT 1`, ...(docId ? [docId] : []));
    const row = { document_id: docId, actor_id: user?.id ?? null, action, detail: canonical(detail), at: nowIso() };
    await run(
      "INSERT INTO corr_audit (document_id, actor_id, actor_name, action, detail, ip, at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.document_id,
      row.actor_id,
      user?.name ?? "System",
      row.action,
      row.detail,
      ip,
      row.at,
      prev?.hash ?? null,
      recordHash(prev?.hash ?? null, row),
    );
  });
}

export type AuditEvent = { seq: number; action: string; actorName: string | null; at: string; detail: Record<string, unknown> };

export async function auditTrail(docId: string | null): Promise<{ events: AuditEvent[]; intact: boolean; brokenAt: number | null }> {
  const rows = await all<{ seq: number; document_id: string | null; actor_id: string | null; actor_name: string | null; action: string; detail: string; at: string; prev_hash: string | null; hash: string }>(
    `SELECT seq, document_id, actor_id, actor_name, action, detail, at, prev_hash, hash FROM corr_audit WHERE ${docId ? "document_id = ?" : "document_id IS NULL"} ORDER BY seq`,
    ...(docId ? [docId] : []),
  );
  let prev: string | null = null;
  let brokenAt: number | null = null;
  for (const r of rows) {
    if (brokenAt === null && (r.prev_hash !== prev || recordHash(prev, r) !== r.hash)) brokenAt = Number(r.seq);
    prev = r.hash;
  }
  return {
    events: rows.map((r) => ({ seq: Number(r.seq), action: r.action, actorName: r.actor_name, at: r.at, detail: JSON.parse(r.detail || "{}") as Record<string, unknown> })),
    intact: brokenAt === null,
    brokenAt,
  };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export function corrCan(user: AppUser, cap: "create" | "issue" | "view_all" | "directory" | "admin" | "audit") {
  return can(user, `corr.${cap}` as Capability) || can(user, "users.manage");
}
export function hasCorrespondence(user: AppUser) {
  return (["create", "issue", "view_all", "directory", "admin", "audit"] as const).some((c) => corrCan(user, c));
}
export function needCorr(user: AppUser, cap: Parameters<typeof corrCan>[1], message: string) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy && cap !== "view_all" && cap !== "audit") throw new WorkflowError("FORBIDDEN", "View as is read only.");
  if (!corrCan(user, cap)) throw new WorkflowError("FORBIDDEN", message);
}

// Who sees a letter: its writer; people who see every letter (restricted ones only with setup or audit rights);
// and, for anything but restricted, people allowed to issue letters.
export function canSeeDoc(user: AppUser, d: { created_by: string | null; classification: string }) {
  if (d.created_by === user.id) return true;
  if (d.classification === "restricted") return corrCan(user, "admin") || corrCan(user, "audit");
  return corrCan(user, "view_all") || corrCan(user, "issue") || corrCan(user, "audit");
}
// The same rule as SQL, for lists.
export function visibleSql(user: AppUser, alias = "d") {
  if (corrCan(user, "admin") || corrCan(user, "audit")) return { sql: "1=1", params: [] as string[] };
  if (corrCan(user, "view_all") || corrCan(user, "issue")) return { sql: `(${alias}.classification <> 'restricted' OR ${alias}.created_by = ?)`, params: [user.id] };
  return { sql: `${alias}.created_by = ?`, params: [user.id] };
}

// Locks a document row for the rest of the transaction (two people issuing at once wait for each other).
export async function lockDoc(id: string) {
  const d = await get<Record<string, unknown>>("SELECT * FROM corr_documents WHERE id = ? FOR UPDATE", id);
  if (!d) throw new WorkflowError("NOT_FOUND", "Letter not found.");
  return d;
}
