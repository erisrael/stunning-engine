// Signatures, stamps, the server's signing key, and public verification of issued letters.
//
//  - A signature picture (uploaded or drawn) is what a signed letter shows. It is not proof by itself: proof is the
//    record of who signed, in what capacity, on which content fingerprint, plus the server's signature below.
//  - The server signs every issued letter: an Ed25519 signature over the letter's SHA-256 fingerprint, document ID,
//    reference and time. The key is created once, kept sealed with the workspace key, and never leaves the server;
//    the public key is published so anyone can check a signature.
//  - Certificate-based PDF signatures (PAdES) need a certificate from a certificate authority; Admin can record the
//    certificate details, but letters are not called "PAdES-signed" until a signing service is connected.
//  - Verification shows only what is safe to show publicly (never the letter's text), and every check is logged.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { seal, unseal } from "../secrets";
import { audit, auditTrail, corrCan, needCorr, sha256 } from "./core";
import { positionsOf, resolveAuthority } from "./org";

const MAX_IMG = 600_000;
const IMG = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

// ---------------------------------------------------------------------------
// Where and when signatures and stamps are used (set by correspondence administrators)
// ---------------------------------------------------------------------------

export type SignPolicy = {
  // How signers register their signature.
  allowUpload: boolean;
  allowDrawn: boolean;
  // Stamps from an uploaded picture of the real seal (besides those drawn here).
  allowStampUpload: boolean;
  // Where the stamp sits on the signature block, its size, strength and tilt.
  stampPlacement: "over-signature" | "beside-signature" | "below-signature";
  stampSize: number;
  stampOpacity: number;
  stampRotate: number;
  signatureHeight: number;
  // Drafts show the places waiting to be signed; issued letters only what was signed.
  showAwaiting: boolean;
  // Where the signature pictures appear (the record of signing is kept either way).
  showOn: { pdf: boolean; word: boolean; link: boolean; image: boolean };
  // Categories (codes) whose letters must carry a stamp before they are issued, beyond each category's own setting.
  stampRequired: string[];
  // A line under each signature, such as "Signed electronically".
  note: string;
};
export const DEFAULT_SIGN_POLICY: SignPolicy = { allowUpload: true, allowDrawn: true, allowStampUpload: true, stampPlacement: "over-signature", stampSize: 22, stampOpacity: 0.85, stampRotate: -8, signatureHeight: 16, showAwaiting: true, showOn: { pdf: true, word: true, link: true, image: true }, stampRequired: [], note: "" };

export async function signPolicy(): Promise<SignPolicy> {
  const raw = parseJson<Partial<SignPolicy>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.corr_sign_policy'"))?.value, {});
  return cleanSignPolicy({ ...DEFAULT_SIGN_POLICY, ...raw });
}
function cleanSignPolicy(x: Partial<SignPolicy>): SignPolicy {
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const d = DEFAULT_SIGN_POLICY;
  return {
    allowUpload: x.allowUpload !== false,
    allowDrawn: x.allowDrawn !== false,
    allowStampUpload: x.allowStampUpload !== false,
    stampPlacement: x.stampPlacement === "beside-signature" || x.stampPlacement === "below-signature" ? x.stampPlacement : "over-signature",
    stampSize: n(x.stampSize, d.stampSize, 12, 50),
    stampOpacity: n(x.stampOpacity, d.stampOpacity, 0.3, 1),
    stampRotate: n(x.stampRotate, d.stampRotate, -45, 45),
    signatureHeight: n(x.signatureHeight, d.signatureHeight, 8, 40),
    showAwaiting: x.showAwaiting !== false,
    showOn: { pdf: x.showOn?.pdf !== false, word: x.showOn?.word !== false, link: x.showOn?.link !== false, image: x.showOn?.image !== false },
    stampRequired: (Array.isArray(x.stampRequired) ? x.stampRequired : []).filter((c) => typeof c === "string" && /^[A-Z0-9_-]{1,12}$/i.test(c)).slice(0, 100),
    note: String(x.note ?? "").slice(0, 120),
  };
}
export async function saveSignPolicy(user: AppUser, input: Partial<SignPolicy>) {
  needCorr(user, "admin", "Only correspondence administrators set how signatures and stamps are used.");
  if (!input.allowUpload && !input.allowDrawn) throw new WorkflowError("VALIDATION", "Allow at least one way to register a signature.");
  const v = cleanSignPolicy(input);
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.corr_sign_policy', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", JSON.stringify(v), nowIso(), user.id);
  await audit(user, null, "sign.policy", v);
  return v;
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export async function mySignatures(user: AppUser) {
  return all<{ id: string; image: string; kind: string; active: number; valid_from: string | null; valid_to: string | null; revoked_at: string | null; created_at: string }>("SELECT * FROM corr_signatures WHERE user_id = ? ORDER BY created_at DESC", user.id);
}

// Registers a signature picture; it replaces the person's active one. Only for oneself.
export async function registerSignature(user: AppUser, input: { image: string; kind?: "upload" | "drawn"; validFrom?: string | null; validTo?: string | null }) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "View as is read only.");
  const img = String(input.image ?? "");
  if (!IMG.test(img) || img.includes("svg+xml")) throw new WorkflowError("VALIDATION", "Use a PNG, JPEG or WebP picture (a transparent PNG looks best).");
  if (img.length > MAX_IMG) throw new WorkflowError("VALIDATION", "The picture is too large (keep it under about 400 KB).");
  const policy = await signPolicy();
  if (input.kind === "drawn" ? !policy.allowDrawn : !policy.allowUpload) throw new WorkflowError("FORBIDDEN", input.kind === "drawn" ? "Drawing a signature is switched off; upload a picture of it." : "Uploading a signature is switched off; draw it instead.");
  const now = nowIso();
  await run("UPDATE corr_signatures SET active = 0 WHERE user_id = ? AND active = 1", user.id);
  const id = uid("sg_");
  await run("INSERT INTO corr_signatures (id, user_id, image, kind, active, valid_from, valid_to, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)", id, user.id, img, input.kind === "drawn" ? "drawn" : "upload", input.validFrom || null, input.validTo || null, now);
  await audit(user, null, "signature.registered", { id, kind: input.kind ?? "upload" });
  return id;
}

export async function revokeSignature(user: AppUser, id: string) {
  const s = await get<{ user_id: string }>("SELECT user_id FROM corr_signatures WHERE id = ?", id);
  if (!s) throw new WorkflowError("NOT_FOUND", "Signature not found.");
  if (s.user_id !== user.id && !corrCan(user, "admin")) throw new WorkflowError("FORBIDDEN", "Only the signer or an administrator revokes a signature.");
  await run("UPDATE corr_signatures SET active = 0, revoked_at = ? WHERE id = ?", nowIso(), id);
  await audit(user, null, "signature.revoked", { id, of: s.user_id });
}

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

export const STAMP_KINDS = ["circular", "rectangular", "department", "received", "approved", "paid", "confidential", "copy", "custom"] as const;
export type StampKind = (typeof STAMP_KINDS)[number];
export type StampDesign = { text: string; inner?: string; centre?: string; color: string; border: number; size: number; rotation: number; opacity: number; showDate: boolean };
export type StampAllowed = { users?: string[]; roles?: string[]; positions?: string[] };

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The stamp drawn as SVG: a ring with the text around it (circular kinds) or a framed box (rectangular kinds).
export function stampSvg(kind: StampKind, d: StampDesign) {
  const c = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#1d4ed8";
  const b = Math.min(6, Math.max(1, d.border || 2));
  const op = Math.min(1, Math.max(0.2, d.opacity ?? 0.9));
  const date = d.showDate ? "{{date}}" : "";
  const round = kind === "circular" || kind === "department" || kind === "custom";
  if (round) {
    const t = x(d.text.slice(0, 60));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><g opacity="${op}" transform="rotate(${d.rotation || 0} 100 100)" fill="none" stroke="${c}"><circle cx="100" cy="100" r="94" stroke-width="${b}"/><circle cx="100" cy="100" r="66" stroke-width="${Math.max(1, b - 1)}"/>
<defs><path id="r" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs>
<text fill="${c}" stroke="none" font-family="Arial, 'Noto Sans Ethiopic', sans-serif" font-size="15" font-weight="700" letter-spacing="1.5"><textPath href="#r" startOffset="0">${t} ★ </textPath></text>
<text x="100" y="${d.centre ? 92 : 106}" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="${d.centre ? 13 : 16}" font-weight="700">${x((d.inner ?? "").slice(0, 24))}</text>
${d.centre ? `<text x="100" y="112" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="11">${x(d.centre.slice(0, 28))}</text>` : ""}
${date ? `<text x="100" y="130" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="10">${date}</text>` : ""}</g></svg>`;
  }
  const label = x((d.inner || { received: "RECEIVED", approved: "APPROVED", paid: "PAID", confidential: "CONFIDENTIAL", copy: "COPY", rectangular: "" }[kind as string] || "").slice(0, 24));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 120" width="260" height="120"><g opacity="${op}" transform="rotate(${d.rotation || 0} 130 60)" fill="none" stroke="${c}"><rect x="4" y="4" width="252" height="112" rx="8" stroke-width="${b}"/><rect x="11" y="11" width="238" height="98" rx="5" stroke-width="1"/>
<text x="130" y="${label ? 52 : 66}" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="${label ? 30 : 18}" font-weight="800" letter-spacing="2">${label || x(d.text.slice(0, 30))}</text>
${label ? `<text x="130" y="76" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="12" font-weight="700">${x(d.text.slice(0, 40))}</text>` : ""}
${date ? `<text x="130" y="98" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial, sans-serif" font-size="11">${date}</text>` : ""}</g></svg>`;
}
const svgData = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

export async function listStamps() {
  return (await all<{ id: string; entity_id: string | null; name: string; kind: string; design: string; image: string; allowed: string; active: number; updated_at: string }>("SELECT * FROM corr_stamps ORDER BY name")).map((s) => ({ id: s.id, entityId: s.entity_id, name: s.name, kind: s.kind as StampKind, design: parseJson<StampDesign>(s.design, { text: "", color: "#1d4ed8", border: 2, size: 38, rotation: 0, opacity: 0.9, showDate: true }), image: s.image, allowed: parseJson<StampAllowed>(s.allowed, {}), active: !!s.active, updatedAt: s.updated_at }));
}

export async function saveStamp(user: AppUser, input: { id?: string; name: string; kind: StampKind; design: StampDesign; allowed: StampAllowed; active?: boolean; entityId?: string | null; upload?: string | null }) {
  needCorr(user, "admin", "Only correspondence administrators design stamps.");
  const kind = (STAMP_KINDS as readonly string[]).includes(input.kind) ? input.kind : "circular";
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the stamp.");
  const design: StampDesign = { text: String(input.design?.text ?? "").slice(0, 60), inner: String(input.design?.inner ?? "").slice(0, 24), centre: String(input.design?.centre ?? "").slice(0, 28), color: /^#[0-9a-f]{6}$/i.test(input.design?.color) ? input.design.color : "#1d4ed8", border: Number(input.design?.border) || 2, size: Math.min(80, Math.max(15, Number(input.design?.size) || 38)), rotation: Math.min(45, Math.max(-45, Number(input.design?.rotation) || 0)), opacity: Number(input.design?.opacity) || 0.9, showDate: input.design?.showDate !== false };
  // An uploaded picture of the real seal (transparent PNG best) is used as it is; the drawn kinds need their text.
  const upload = input.upload ? String(input.upload) : null;
  if (upload) {
    if (!(await signPolicy()).allowStampUpload) throw new WorkflowError("FORBIDDEN", "Uploading stamps is switched off.");
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(upload) || upload.length > MAX_IMG) throw new WorkflowError("VALIDATION", "Upload the stamp as a PNG, JPEG or WebP picture under about 400 KB.");
  } else if (!design.text) throw new WorkflowError("VALIDATION", "Write the stamp's text (usually the company name).");
  const allowed: StampAllowed = { users: (input.allowed?.users ?? []).slice(0, 200), roles: (input.allowed?.roles ?? []).slice(0, 50), positions: (input.allowed?.positions ?? []).slice(0, 100) };
  const image = upload ?? svgData(stampSvg(kind, design));
  const now = nowIso();
  let id = input.id ?? null;
  if (id) {
    const r = await run("UPDATE corr_stamps SET name = ?, kind = ?, design = ?, image = ?, allowed = ?, active = ?, entity_id = ?, updated_at = ? WHERE id = ?", name, kind, JSON.stringify(design), image, JSON.stringify(allowed), input.active === false ? 0 : 1, input.entityId ?? null, now, id);
    if (!r.changes) throw new WorkflowError("NOT_FOUND", "Stamp not found.");
  } else {
    id = uid("st_");
    await run("INSERT INTO corr_stamps (id, entity_id, name, kind, design, image, allowed, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, input.entityId ?? null, name, kind, JSON.stringify(design), image, JSON.stringify(allowed), input.active === false ? 0 : 1, user.id, now, now);
  }
  await audit(user, null, "stamp.saved", { id, name, kind, allowed });
  return id;
}

// Whether the person may use this stamp now: it is in use, they have the stamp right (or the stamp authority), and
// the stamp lists them, one of their roles or one of their positions. Returns the stamp's picture with today's date.
export async function stampAllowed(user: AppUser, stampId: string) {
  const s = (await listStamps()).find((x) => x.id === stampId && x.active);
  if (!s) throw new WorkflowError("NOT_FOUND", "That stamp is not available.");
  const may = (user.perms as string[]).includes("corr.stamp") || corrCan(user, "admin") || (await resolveAuthority(user.id, "stamp", {})).length > 0;
  if (!may) throw new WorkflowError("FORBIDDEN", "You may not apply official stamps.");
  const positions = (await positionsOf(user.id)).map((p) => p.position_id);
  const listed = !s.allowed.users?.length && !s.allowed.roles?.length && !s.allowed.positions?.length ? corrCan(user, "admin") : s.allowed.users?.includes(user.id) || user.roles.some((r) => s.allowed.roles?.includes(r)) || positions.some((p) => s.allowed.positions?.includes(p));
  if (!listed) throw new WorkflowError("FORBIDDEN", "You are not allowed to use this stamp.");
  // A drawn stamp carries today's date; an uploaded one is used as it is.
  const dated = s.image.startsWith("data:image/svg+xml") ? svgData(stampSvg(s.kind, s.design).replace("{{date}}", new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }))) : s.image;
  return { id: s.id, image: dated };
}

// ---------------------------------------------------------------------------
// The server's signing key
// ---------------------------------------------------------------------------

type KeyCfg = { publicKey: string; privateEnc: string; codeSecretEnc: string; createdAt: string; fingerprint: string };
let keyCache: { pub: string; priv: crypto.KeyObject; secret: string; fingerprint: string } | null = null;

async function signingKey() {
  if (keyCache) return keyCache;
  let cfg = parseJson<KeyCfg | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.corr_signing'"))?.value, null);
  if (!cfg) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    cfg = { publicKey: pub, privateEnc: await seal(privateKey.export({ type: "pkcs8", format: "pem" }).toString()), codeSecretEnc: await seal(crypto.randomBytes(32).toString("hex")), createdAt: nowIso(), fingerprint: sha256(pub).slice(0, 16) };
    await run("INSERT INTO settings (key, value, updated_at) VALUES ('cfg.corr_signing', ?, ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(cfg), nowIso());
    cfg = parseJson<KeyCfg>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.corr_signing'"))!.value, cfg);
  }
  const privPem = await unseal(cfg.privateEnc);
  const secret = await unseal(cfg.codeSecretEnc);
  if (!privPem || !secret) throw new WorkflowError("INVALID_STATE", "The signing key cannot be opened (the workspace key changed).");
  keyCache = { pub: cfg.publicKey, priv: crypto.createPrivateKey(privPem), secret, fingerprint: cfg.fingerprint };
  return keyCache;
}

export async function publicKey() {
  const k = await signingKey();
  return { pem: k.pub, fingerprint: k.fingerprint, algorithm: "Ed25519" };
}

const signedMessage = (m: { id: string; ref: string; hash: string; issuedAt: string }) => `myseed-correspondence|v1|${m.id}|${m.ref}|${m.hash}|${m.issuedAt}`;

export async function signIssued(m: { id: string; ref: string; hash: string; issuedAt: string }) {
  const k = await signingKey();
  return { signature: crypto.sign(null, Buffer.from(signedMessage(m)), k.priv).toString("base64"), keyFingerprint: k.fingerprint };
}

export async function checkSignature(m: { id: string; ref: string; hash: string; issuedAt: string }, signature: string) {
  const k = await signingKey();
  try {
    return crypto.verify(null, Buffer.from(signedMessage(m)), crypto.createPublicKey(k.pub), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

// The short code printed with the QR code: 12 letters and digits derived from the document ID with a server secret,
// so it cannot be guessed from the reference.
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function verifyCodeFor(docId: string) {
  const k = await signingKey();
  const mac = crypto.createHmac("sha256", k.secret).update(docId).digest();
  let out = "";
  for (let i = 0; i < 12; i++) out += B32[mac[i]! % B32.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

// ---------------------------------------------------------------------------
// Public verification
// ---------------------------------------------------------------------------

export type VerifyResult = {
  found: boolean;
  result: "genuine" | "void" | "replaced" | "tampered" | "not_found" | "not_issued";
  ref?: string;
  issuer?: string;
  issuedAt?: string;
  category?: string;
  status?: string;
  signatories?: { label: string; name: string; position: string; date: string | null }[];
  checks?: { name: string; ok: boolean }[];
  fingerprint?: string;
  subject?: string | null;
  recipient?: string | null;
  replacedBy?: string | null;
  voidReason?: string | null;
};

export async function verifyDocument(query: string, meta: { ip?: string | null; ua?: string | null } = {}): Promise<VerifyResult> {
  const q = String(query ?? "").trim().toUpperCase().slice(0, 80);
  const code = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(q) ? q : null;
  const d = await get<{ id: string; ref_number: string | null; status: string; issued_at: string | null; content_hash: string | null; issued_snapshot: string | null; signature: string | null; classification: string; void_reason: string | null; direction: string }>(
    code ? "SELECT * FROM corr_documents WHERE verify_code = ?" : "SELECT * FROM corr_documents WHERE upper(ref_number) = ?",
    code ?? q,
  );
  const log = async (result: string, id: string | null) => run("INSERT INTO corr_verifications (document_id, query, result, ip, user_agent, at) VALUES (?, ?, ?, ?, ?, ?)", id, q, result, meta.ip ?? null, (meta.ua ?? "").slice(0, 300) || null, nowIso());
  if (!d || d.direction !== "outgoing") {
    await log("not_found", null);
    return { found: false, result: "not_found" };
  }
  if (!d.issued_snapshot || !d.ref_number || !d.content_hash || !d.issued_at) {
    await log("not_issued", d.id);
    return { found: true, result: "not_issued" };
  }
  const snap = JSON.parse(d.issued_snapshot) as { entity?: { legalName?: string }; category?: { name?: string }; subject?: string; recipients?: { kind: string; organisation?: string | null; name?: string | null }[]; signatures?: { label: string; name: string; position: string; date: string | null; status: string }[] };
  const hashOk = sha256(d.issued_snapshot) === d.content_hash;
  const sigOk = !!d.signature && (await checkSignature({ id: d.id, ref: d.ref_number, hash: d.content_hash, issuedAt: d.issued_at }, d.signature));
  const trail = await auditTrail(d.id);
  const replaced = await get<{ ref_number: string | null }>("SELECT ref_number FROM corr_documents WHERE replaces_id = ? AND status NOT IN ('draft','void') ORDER BY issued_at DESC LIMIT 1", d.id);
  const result: VerifyResult["result"] = !hashOk || !sigOk ? "tampered" : d.status === "void" ? "void" : replaced ? "replaced" : "genuine";
  await log(result, d.id);
  // Public letters show their subject and the first recipient's organisation; others only the reference and dates.
  const open = d.classification === "public" || d.classification === "internal";
  return {
    found: true,
    result,
    ref: d.ref_number,
    issuer: snap.entity?.legalName,
    issuedAt: d.issued_at,
    category: snap.category?.name,
    status: d.status,
    signatories: (snap.signatures ?? []).filter((s) => s.status === "signed").map((s) => ({ label: s.label, name: s.name, position: s.position, date: s.date })),
    checks: [
      { name: "The letter's content matches what was issued", ok: hashOk },
      { name: "Signed by the issuing server", ok: sigOk },
      { name: "Its history has not been altered", ok: trail.intact },
      { name: "Not voided", ok: d.status !== "void" },
      { name: "Not replaced by a newer letter", ok: !replaced },
    ],
    fingerprint: d.content_hash.slice(0, 16),
    subject: open ? (snap.subject ?? null) : null,
    recipient: open ? (snap.recipients?.find((r) => r.kind === "to")?.organisation ?? null) : null,
    replacedBy: replaced?.ref_number ?? null,
    voidReason: d.status === "void" ? d.void_reason : null,
  };
}

export async function verificationLog(user: AppUser, docId: string) {
  if (!corrCan(user, "audit") && !corrCan(user, "issue")) return [];
  return all<{ result: string; ip: string | null; at: string }>("SELECT result, ip, at FROM corr_verifications WHERE document_id = ? ORDER BY at DESC LIMIT 100", docId);
}
