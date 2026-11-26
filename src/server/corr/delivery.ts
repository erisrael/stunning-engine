// Attachments, delivery (email with a secure link, a secure link alone, fax through a provider), scheduled sending,
// bulk letters, retention and the dashboard figures.
//
//  - Attachments: PDF, Word, Excel, pictures and (if Admin allows) ZIP; the type is checked from the file's first
//    bytes, not its name; each has a SHA-256 fingerprint and is listed in the issued letter. When a ClamAV server is
//    configured (CLAMAV_HOST, CLAMAV_PORT) every file is scanned and infected files are refused; otherwise the file
//    is kept as "not scanned" and shown so.
//  - A secure link opens the issued letter (read only) until it expires; opening it is recorded as delivered.
//  - Fax: through a provider (FAX_PROVIDER=phaxio with PHAXIO_KEY and PHAXIO_SECRET). A letter is recorded as faxed
//    only when the provider confirms it; failures are kept and can be retried. Without a provider, fax is not offered.
//  - Scheduled sending happens in the scheduled checks; approval and validity are checked again at that moment.

import crypto from "node:crypto";
import net from "node:net";
import { all, get, nowIso, parseJson, run, tx, uid } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, corrCan, needCorr, sha256 } from "./core";

const MAX_FILE = 10 * 1024 * 1024;
const SNIFF: [string, (b: Buffer) => boolean][] = [
  ["application/pdf", (b) => b.subarray(0, 5).toString() === "%PDF-"],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
  ["image/tiff", (b) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)],
  ["application/zip", (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04],
];
// Office files are ZIPs; their name tells which.
function detect(name: string, b: Buffer) {
  const kind = SNIFF.find(([, f]) => f(b))?.[0] ?? null;
  if (kind === "application/zip") {
    if (/\.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (/\.xlsx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (/\.pptx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return kind;
}

// ClamAV's INSTREAM over TCP: "clean", "infected: <name>", or null when no scanner is configured or reachable.
export async function scanFile(data: Buffer): Promise<string | null> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return null;
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < data.length; i += 64 * 1024) {
        const chunk = data.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    let out = "";
    sock.setTimeout(30000, () => (sock.destroy(), resolve(null)));
    sock.on("data", (d) => (out += d.toString()));
    sock.on("end", () => resolve(/OK/.test(out) ? "clean" : /FOUND/.test(out) ? `infected: ${out.replace(/^stream:\s*/, "").replace(/\s*FOUND[\s\0]*$/, "")}` : null));
    sock.on("error", () => resolve(null));
  });
}

async function attachPolicy() {
  return parseJson<{ allowZip?: boolean; requireScan?: boolean }>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.corr_attach'"))?.value, {});
}

export async function listAttachments(docId: string) {
  return (await all<{ id: string; n: number; name: string; description: string | null; mime: string; size: number; sha256: string; scan: string; created_at: string; ocr_text: string | null; ocr_at: string | null }>("SELECT id, n, name, description, mime, size, sha256, scan, created_at, ocr_text, ocr_at FROM corr_attachments WHERE document_id = ? AND removed_at IS NULL ORDER BY n", docId)).map((a) => ({ ...a, n: Number(a.n), size: Number(a.size), ocrText: a.ocr_text, ocrAt: a.ocr_at, ocr_text: undefined }));
}

export async function addAttachment(user: AppUser, docId: string, file: { name: string; data: Buffer; description?: string }) {
  const d = await get<{ status: string; created_by: string | null; direction: string; classification: string }>("SELECT status, created_by, direction, classification FROM corr_documents WHERE id = ?", docId);
  if (!d) throw new WorkflowError("NOT_FOUND", "Letter not found.");
  const own = d.created_by === user.id || corrCan(user, "admin");
  if (!(d.status === "draft" && own) && !(d.direction === "incoming" && corrCan(user, "create"))) throw new WorkflowError("FORBIDDEN", "Attachments are added to drafts by their writer (or to registered incoming letters).");
  if (!file.data.length) throw new WorkflowError("VALIDATION", "The file is empty.");
  if (file.data.length > MAX_FILE) throw new WorkflowError("VALIDATION", "Files up to 10 MB.");
  const name = String(file.name ?? "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 160);
  const mime = detect(name, file.data);
  const policy = await attachPolicy();
  if (!mime || (mime === "application/zip" && !policy.allowZip)) throw new WorkflowError("VALIDATION", "Attach PDF, Word, Excel, PowerPoint or picture files" + (policy.allowZip ? " or ZIP" : "") + ".");
  const scan = await scanFile(file.data);
  if (scan?.startsWith("infected")) {
    await audit(user, docId, "attachment.refused", { name, scan });
    throw new WorkflowError("VALIDATION", `The file was refused: ${scan}.`);
  }
  if (!scan && policy.requireScan) throw new WorkflowError("INVALID_STATE", "Files must be scanned for viruses, and the scanner is not reachable. Try again later.");
  const id = uid("ca_");
  const blob = `corr_${id}`;
  const hash = crypto.createHash("sha256").update(file.data).digest("hex");
  await tx(async () => {
    await run("INSERT INTO corr_blobs (id, data) VALUES (?, ?)", blob, file.data.toString("base64"));
    const n = Number((await get<{ n: number }>("SELECT COALESCE(MAX(n), 0) + 1 AS n FROM corr_attachments WHERE document_id = ?", docId))?.n ?? 1);
    await run("INSERT INTO corr_attachments (id, document_id, n, name, description, mime, size, sha256, blob_id, scan, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, docId, n, name, String(file.description ?? "").slice(0, 300) || null, mime, file.data.length, hash, blob, scan ?? "not_scanned", user.id, nowIso());
  });
  await audit(user, docId, "attachment.added", { name, size: file.data.length, sha256: hash, scan: scan ?? "not_scanned" });
  // A scan of an incoming letter is read straight away (in the background) so its text can be searched.
  if (d.direction === "incoming" && (mime === "application/pdf" || mime.startsWith("image/")))
    void (async () => {
      try {
        const { ocrBuffer, ocrStatus } = await import("./ocr");
        if (!(await ocrStatus()).available) return;
        const r = await ocrBuffer(file.data, mime);
        await run("UPDATE corr_attachments SET ocr_text = ?, ocr_at = ?, ocr_lang = ? WHERE id = ?", r.text, nowIso(), r.lang, id);
      } catch {
        /* OCR is a convenience: the file is kept either way */
      }
    })();
  return id;
}

export async function removeAttachment(user: AppUser, id: string) {
  const a = await get<{ document_id: string; name: string }>("SELECT document_id, name FROM corr_attachments WHERE id = ? AND removed_at IS NULL", id);
  if (!a) throw new WorkflowError("NOT_FOUND", "Attachment not found.");
  const d = await get<{ status: string; created_by: string | null }>("SELECT status, created_by FROM corr_documents WHERE id = ?", a.document_id);
  if (d?.status !== "draft" || (d.created_by !== user.id && !corrCan(user, "admin"))) throw new WorkflowError("FORBIDDEN", "Attachments are removed only from drafts, by their writer.");
  await run("UPDATE corr_attachments SET removed_at = ? WHERE id = ?", nowIso(), id);
  await audit(user, a.document_id, "attachment.removed", { name: a.name });
}

export async function readAttachment(id: string) {
  const a = await get<{ document_id: string; name: string; mime: string; blob_id: string }>("SELECT document_id, name, mime, blob_id FROM corr_attachments WHERE id = ? AND removed_at IS NULL", id);
  if (!a) return null;
  const row = await get<{ data: string }>("SELECT data FROM corr_blobs WHERE id = ?", a.blob_id);
  const data = row ? Buffer.from(row.data, "base64") : null;
  return data ? { ...a, data } : null;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export function faxProvider() {
  return process.env.FAX_PROVIDER === "phaxio" && process.env.PHAXIO_KEY && process.env.PHAXIO_SECRET ? "phaxio" : null;
}

export async function listDispatches(docId: string) {
  return all<{ id: string; channel: string; address: string | null; status: string; provider: string | null; attempts: number; error: string | null; scheduled_at: string | null; sent_at: string | null; delivered_at: string | null; opened_at: string | null; expires_at: string | null; created_at: string }>(
    "SELECT id, channel, address, status, provider, attempts, error, scheduled_at, sent_at, delivered_at, opened_at, expires_at, created_at FROM corr_dispatches WHERE document_id = ? ORDER BY created_at DESC",
    docId,
  );
}

const ISSUED = ["issued", "dispatched", "delivered", "acknowledged"];

// Queues delivery of an issued letter: by email (with a secure link), as a link to hand over, or by fax. Sent now,
// or at a time (checked again then).
export async function dispatchDoc(user: AppUser, docId: string, input: { channel: "email" | "link" | "fax"; address?: string; message?: string; scheduledAt?: string | null; linkDays?: number }, origin: string) {
  needCorr(user, "issue", "Only people who issue letters send them.");
  const d = await get<{ status: string; subject: string; ref_number: string | null }>("SELECT status, subject, ref_number FROM corr_documents WHERE id = ?", docId);
  if (!d || !ISSUED.includes(d.status)) throw new WorkflowError("INVALID_STATE", "Only issued letters are sent.");
  const channel = input.channel;
  const address = String(input.address ?? "").trim().slice(0, 200);
  if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new WorkflowError("VALIDATION", "Enter the email address.");
  if (channel === "fax") {
    if (!faxProvider()) throw new WorkflowError("INVALID_STATE", "No fax service is connected. Admin connects one (FAX_PROVIDER on the server).");
    if (!/^\+?[0-9 ()-]{6,20}$/.test(address)) throw new WorkflowError("VALIDATION", "Enter the fax number with its country code.");
  }
  const scheduled = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null;
  if (scheduled && scheduled < new Date(Date.now() - 60e3).toISOString()) throw new WorkflowError("VALIDATION", "Choose a time in the future.");
  const token = crypto.randomBytes(24).toString("base64url");
  const days = Math.min(365, Math.max(1, Number(input.linkDays) || 30));
  const id = uid("cd_");
  await run(
    "INSERT INTO corr_dispatches (id, document_id, channel, address, status, provider, token_hash, scheduled_at, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, docId, channel, address || null, scheduled ? "scheduled" : "queued", channel === "fax" ? faxProvider() : null, sha256(token), scheduled, new Date(Date.now() + days * 864e5).toISOString(), user.id, nowIso(),
  );
  await audit(user, docId, "dispatch.created", { channel, address: address || undefined, scheduled: scheduled ?? undefined });
  const link = `${origin}/letter/${token}`;
  if (!scheduled) await sendDispatch(id, { user, message: input.message, link, origin });
  return { id, link: channel === "link" ? link : null };
}

async function markDocSent(docId: string, method: string, at: string) {
  await run("UPDATE corr_documents SET status = CASE WHEN status = 'issued' THEN 'dispatched' ELSE status END, dispatched_at = COALESCE(dispatched_at, ?), delivery_method = COALESCE(delivery_method, ?), updated_at = ? WHERE id = ?", at, method, at, docId);
}

// Sends one dispatch (now, or when its time comes). The letter must still be issued and not voided or replaced.
export async function sendDispatch(id: string, ctx: { user?: AppUser | null; message?: string; link?: string; origin: string }) {
  const x = await get<{ id: string; document_id: string; channel: string; address: string | null; status: string; attempts: number; created_by: string | null }>("SELECT * FROM corr_dispatches WHERE id = ?", id);
  if (!x || !["queued", "scheduled", "failed"].includes(x.status)) return;
  const d = await get<{ status: string; subject: string; ref_number: string | null; issued_snapshot: string | null }>("SELECT status, subject, ref_number, issued_snapshot FROM corr_documents WHERE id = ?", x.document_id);
  const now = nowIso();
  const fail = async (error: string) => {
    await run("UPDATE corr_dispatches SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?", error.slice(0, 500), id);
    await audit(ctx.user ?? null, x.document_id, "dispatch.failed", { channel: x.channel, error });
    const { notify } = await import("../notifications");
    if (x.created_by) await notify([x.created_by], { type: "approval", title: `Delivery failed: ${d?.subject ?? "letter"}`, body: error, link: `/correspondence/${x.document_id}` }, now).catch(() => {});
    if (x.created_by) await (await import("./notify")).corrSms([x.created_by], `Delivery of ${d?.ref_number ?? "a letter"} failed: ${error.slice(0, 120)}`, "smsDelivery").catch(() => 0);
  };
  if (!d || !ISSUED.includes(d.status)) return fail("The letter is no longer issued (voided or withdrawn), so it was not sent.");
  if (await get("SELECT 1 AS x FROM corr_documents WHERE replaces_id = ? AND status IN ('issued','dispatched','delivered','acknowledged')", x.document_id)) return fail("A newer letter replaces this one, so it was not sent.");
  // A link for this send (scheduled sends get a fresh one).
  let link = ctx.link;
  if (!link) {
    const token = crypto.randomBytes(24).toString("base64url");
    await run("UPDATE corr_dispatches SET token_hash = ? WHERE id = ?", sha256(token), id);
    link = `${ctx.origin}/letter/${token}`;
  }
  try {
    if (x.channel === "link") {
      await run("UPDATE corr_dispatches SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = NULL WHERE id = ?", now, id);
      await markDocSent(x.document_id, "portal", now);
    } else if (x.channel === "email") {
      const sender = ctx.user ?? (x.created_by ? await (await import("../users")).loadUser(x.created_by) : null);
      if (!sender) return fail("The sender's account is gone.");
      const { sendEmail } = await import("../email");
      const { getSettings } = await import("../settings");
      const ws = (await getSettings()).workspace.name;
      const body = `${ctx.message?.trim() ? `${ctx.message.trim()}\n\n` : ""}Please find our letter ${d.ref_number} "${d.subject}" at this secure link:\n${link}\n\nThe link is for you only and expires. You can check the letter is genuine with its QR code.\n\n${ws}`;
      await sendEmail(sender, { to: { emails: [x.address!] }, subject: `${d.ref_number}: ${d.subject}`, body, mode: "individual" }, ws);
      await run("UPDATE corr_dispatches SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = NULL WHERE id = ?", now, id);
      await markDocSent(x.document_id, "email", now);
    } else if (x.channel === "fax") {
      const ref = await sendFax(x.address!, d.issued_snapshot ?? "", link);
      await run("UPDATE corr_dispatches SET status = 'sending', provider_ref = ?, attempts = attempts + 1, error = NULL WHERE id = ?", ref, id);
    }
    await audit(ctx.user ?? null, x.document_id, "dispatch.sent", { channel: x.channel, address: x.address ?? undefined });
  } catch (e) {
    await fail(e instanceof Error ? e.message : "The send failed.");
  }
}

// Phaxio: sends the letter as HTML (the provider renders it to fax pages) and returns its fax id.
async function sendFax(to: string, snapshot: string, link: string) {
  if (faxProvider() !== "phaxio") throw new Error("No fax service is connected.");
  const snap = parseJson<{ ref?: string; subject?: string; entity?: { legalName?: string } }>(snapshot, {});
  const html = `<html><body style="font-family:Arial;font-size:12pt"><h2>${(snap.entity?.legalName ?? "").replace(/</g, "&lt;")}</h2><p>Ref: ${(snap.ref ?? "").replace(/</g, "&lt;")}</p><p>Subject: ${(snap.subject ?? "").replace(/</g, "&lt;")}</p><p>The full letter: ${link}</p></body></html>`;
  const form = new URLSearchParams({ to: to.replace(/[^0-9+]/g, ""), string_data: html, string_data_type: "html" });
  const res = await fetch("https://api.phaxio.com/v2.1/faxes", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.PHAXIO_KEY}:${process.env.PHAXIO_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(30000) });
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: { id?: number } };
  if (!res.ok || !j.success || !j.data?.id) throw new Error(`Fax service: ${j.message ?? res.status}`);
  return String(j.data.id);
}

// Asks the fax service how sending faxes went; a confirmed fax marks the letter dispatched.
async function pollFaxes() {
  if (faxProvider() !== "phaxio") return 0;
  let n = 0;
  for (const x of await all<{ id: string; document_id: string; provider_ref: string }>("SELECT id, document_id, provider_ref FROM corr_dispatches WHERE channel = 'fax' AND status = 'sending' AND provider_ref IS NOT NULL LIMIT 50")) {
    const res = await fetch(`https://api.phaxio.com/v2.1/faxes/${encodeURIComponent(x.provider_ref)}`, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.PHAXIO_KEY}:${process.env.PHAXIO_SECRET}`).toString("base64")}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { data?: { status?: string; error_message?: string } } | undefined;
    const st = j?.data?.status;
    const now = nowIso();
    if (st === "success") {
      await run("UPDATE corr_dispatches SET status = 'delivered', sent_at = COALESCE(sent_at, ?), delivered_at = ? WHERE id = ?", now, now, x.id);
      await markDocSent(x.document_id, "fax", now);
      await audit(null, x.document_id, "fax.confirmed", { ref: x.provider_ref });
      n++;
    } else if (st === "failure") {
      await run("UPDATE corr_dispatches SET status = 'failed', error = ? WHERE id = ?", (j?.data?.error_message ?? "The fax failed").slice(0, 300), x.id);
      await audit(null, x.document_id, "dispatch.failed", { channel: "fax", error: j?.data?.error_message });
    }
  }
  return n;
}

export async function retryDispatch(user: AppUser, id: string, origin: string) {
  needCorr(user, "issue", "Only people who issue letters send them.");
  const x = await get<{ status: string; attempts: number }>("SELECT status, attempts FROM corr_dispatches WHERE id = ?", id);
  if (!x || x.status !== "failed") throw new WorkflowError("INVALID_STATE", "Only failed sends are retried.");
  if (Number(x.attempts) >= 5) throw new WorkflowError("INVALID_STATE", "Tried five times; check the address or the service, then send again as a new delivery.");
  await sendDispatch(id, { user, origin });
}

// The secure link: the issued letter, read only, while the link is valid. The first opening counts as delivered.
export async function openLink(token: string, meta: { ip?: string | null }) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const x = await get<{ id: string; document_id: string; expires_at: string | null; opened_at: string | null; channel: string }>("SELECT id, document_id, expires_at, opened_at, channel FROM corr_dispatches WHERE token_hash = ?", sha256(token));
  if (!x || (x.expires_at && x.expires_at < nowIso())) return null;
  const d = await get<{ status: string; issued_snapshot: string | null; ref_number: string | null; verify_code: string | null }>("SELECT status, issued_snapshot, ref_number, verify_code FROM corr_documents WHERE id = ?", x.document_id);
  if (!d?.issued_snapshot) return null;
  if (!x.opened_at) {
    const now = nowIso();
    await run("UPDATE corr_dispatches SET opened_at = ?, delivered_at = COALESCE(delivered_at, ?), status = 'delivered' WHERE id = ?", now, now, x.id);
    await run("UPDATE corr_documents SET status = CASE WHEN status IN ('issued','dispatched') THEN 'delivered' ELSE status END, delivered_at = COALESCE(delivered_at, ?), updated_at = ? WHERE id = ?", now, now, x.document_id);
    await audit(null, x.document_id, "link.opened", { ip: meta.ip ?? undefined });
  }
  return { documentId: x.document_id, status: d.status, ref: d.ref_number, verifyCode: d.verify_code, snapshot: JSON.parse(d.issued_snapshot) as Record<string, unknown>, attachments: await listAttachments(x.document_id) };
}

// ---------------------------------------------------------------------------
// Bulk letters, retention, scheduled work and the dashboard
// ---------------------------------------------------------------------------

// One draft per row from a model letter: the recipient and the template fields of each row filled in.
export async function bulkFromRows(user: AppUser, modelId: string, rows: { name?: string; title?: string; organisation?: string; address?: string; email?: string; fields?: Record<string, string> }[]) {
  needCorr(user, "create", "You cannot write official letters.");
  if (!Array.isArray(rows) || !rows.length) throw new WorkflowError("VALIDATION", "Add the rows.");
  if (rows.length > 500) throw new WorkflowError("VALIDATION", "Up to 500 letters at a time.");
  const m = await get<{ created_by: string | null; status: string; data: string }>("SELECT created_by, status, data FROM corr_documents WHERE id = ?", modelId);
  if (!m || (m.created_by !== user.id && !corrCan(user, "admin"))) throw new WorkflowError("NOT_FOUND", "The model letter was not found.");
  const { duplicateDoc } = await import("./documents");
  const bulk = uid("cb_");
  const made: string[] = [];
  for (const r of rows) {
    if (!r.name && !r.organisation) continue;
    const id = await duplicateDoc(user, modelId, "copy");
    const data = { ...parseJson<Record<string, unknown>>(m.data, {}), fields: { ...(parseJson<{ fields?: Record<string, string> }>(m.data, {}).fields ?? {}), ...(r.fields ?? {}) } };
    await run("UPDATE corr_documents SET data = ?, bulk_id = ? WHERE id = ?", JSON.stringify(data), bulk, id);
    await run("DELETE FROM corr_recipients WHERE document_id = ? AND kind = 'to'", id);
    await run("INSERT INTO corr_recipients (id, document_id, kind, name, title, organisation, address, email, sort) VALUES (?, ?, 'to', ?, ?, ?, ?, ?, 0)", uid("cr_"), id, r.name?.slice(0, 160) || null, r.title?.slice(0, 160) || null, r.organisation?.slice(0, 200) || null, r.address?.slice(0, 400) || null, r.email?.slice(0, 160) || null);
    made.push(id);
  }
  await audit(user, modelId, "bulk.created", { bulk, letters: made.length });
  return { bulk, ids: made };
}

// Retention: each category may keep letters for a number of years; past that, issued letters are archived (never
// deleted: their number and history stay), unless on legal hold. Drafts left untouched are not affected.
export async function applyRetention() {
  const cats = await all<{ id: string; config: string }>("SELECT id, config FROM corr_categories");
  let n = 0;
  for (const c of cats) {
    const years = Number(parseJson<{ retentionYears?: number }>(c.config, {}).retentionYears ?? 0);
    if (!years) continue;
    const cut = new Date(Date.now() - years * 365.25 * 864e5).toISOString();
    const r = await run("UPDATE corr_documents SET status = 'archived', archived_at = ?, updated_at = ? WHERE category_id = ? AND legal_hold = 0 AND status IN ('issued','dispatched','delivered','acknowledged') AND issued_at < ?", nowIso(), nowIso(), c.id, cut);
    n += r.changes;
  }
  return n;
}

// The scheduled work for Correspondence (called by the scheduled checks).
export async function scheduledCorrespondence(origin: string) {
  const due = await all<{ id: string }>("SELECT id FROM corr_dispatches WHERE status = 'scheduled' AND scheduled_at <= ? LIMIT 100", nowIso());
  for (const x of due) await sendDispatch(x.id, { origin });
  const faxes = await pollFaxes();
  const { remindOverdue } = await import("./workflow");
  const reminded = await remindOverdue();
  const archived = await applyRetention();
  // Incoming letters whose answer is due tomorrow or overdue remind the person who registered them.
  const answers = await all<{ id: string; subject: string; created_by: string | null }>("SELECT id, subject, created_by FROM corr_documents WHERE direction = 'incoming' AND status NOT IN ('acknowledged','archived','void') AND due_at IS NOT NULL AND due_at < ?", new Date(Date.now() + 864e5).toISOString());
  const { notify } = await import("../notifications");
  for (const a of answers) if (a.created_by) await notify([a.created_by], { type: "approval", title: `Answer due: ${a.subject}`, link: `/correspondence/${a.id}`, dedupeKey: `corr-due-${a.id}-${nowIso().slice(0, 10)}` }, nowIso()).catch(() => {});
  return { sent: due.length, faxes, reminded, archived, answers: answers.length };
}

export async function dashboard(user: AppUser, range: { from?: string; until?: string } = {}) {
  const { visibleSql } = await import("./core");
  const v = visibleSql(user, "d");
  const from = range.from ? new Date(range.from).toISOString() : new Date(Date.now() - 365 * 864e5).toISOString();
  const until = range.until ? new Date(Date.parse(range.until) + 864e5).toISOString() : new Date(Date.now() + 864e5).toISOString();
  const inRange = `COALESCE(d.issued_at, d.created_at) >= ? AND COALESCE(d.issued_at, d.created_at) < ?`;
  const [byStatus, monthly, depts, templates, orgs, approvals, overdue, failures, myPending] = await Promise.all([
    all<{ status: string; direction: string; n: number }>(`SELECT d.status, d.direction, COUNT(*) AS n FROM corr_documents d WHERE ${v.sql} AND ${inRange} GROUP BY d.status, d.direction`, ...v.params, from, until),
    all<{ m: string; direction: string; n: number }>(`SELECT substr(COALESCE(d.issued_at, d.created_at), 1, 7) AS m, d.direction, COUNT(*) AS n FROM corr_documents d WHERE ${v.sql} AND ${inRange} AND d.status <> 'draft' GROUP BY 1, 2 ORDER BY 1`, ...v.params, from, until),
    all<{ department: string; n: number }>(`SELECT COALESCE(NULLIF(d.department, ''), '(none)') AS department, COUNT(*) AS n FROM corr_documents d WHERE ${v.sql} AND ${inRange} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, ...v.params, from, until),
    all<{ name: string; n: number }>(`SELECT COALESCE(t.name, 'Default letterhead') AS name, COUNT(*) AS n FROM corr_documents d LEFT JOIN corr_templates t ON t.id = d.template_id WHERE ${v.sql} AND ${inRange} AND d.status <> 'draft' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, ...v.params, from, until),
    all<{ name: string; n: number }>(`SELECT COALESCE(r.organisation, r.name) AS name, COUNT(*) AS n FROM corr_recipients r JOIN corr_documents d ON d.id = r.document_id WHERE ${v.sql} AND ${inRange} AND r.kind = 'to' AND d.status <> 'draft' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, ...v.params, from, until),
    get<{ avg_h: number | null; n: number }>(`SELECT AVG(EXTRACT(EPOCH FROM (r.finished_at::timestamptz - r.started_at::timestamptz)) / 3600) AS avg_h, COUNT(*) AS n FROM corr_runs r JOIN corr_documents d ON d.id = r.document_id WHERE r.status = 'completed' AND ${v.sql} AND r.started_at >= ?`, ...v.params, from),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM corr_documents d WHERE ${v.sql} AND d.direction = 'incoming' AND d.status NOT IN ('acknowledged','archived','void') AND d.due_at < ?`, ...v.params, nowIso()),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM corr_dispatches x JOIN corr_documents d ON d.id = x.document_id WHERE ${v.sql} AND x.status = 'failed'`, ...v.params),
    (await import("./workflow")).myQueue(user).then((q) => q.length),
  ]);
  const count = (pred: (r: { status: string; direction: string }) => boolean) => byStatus.filter(pred).reduce((a, r) => a + Number(r.n), 0);
  return {
    totals: {
      created: count((r) => r.direction === "outgoing"),
      drafts: count((r) => r.status === "draft" && r.direction === "outgoing"),
      pendingApproval: count((r) => r.status === "pending_approval" || r.status === "under_review"),
      awaitingSignature: count((r) => r.status === "pending_signature"),
      issued: count((r) => r.direction === "outgoing" && ["issued", "dispatched", "delivered", "acknowledged", "archived"].includes(r.status)),
      dispatched: count((r) => r.direction === "outgoing" && ["dispatched", "delivered", "acknowledged"].includes(r.status)),
      incoming: count((r) => r.direction === "incoming"),
      voided: count((r) => r.status === "void"),
      overdueAnswers: Number(overdue?.n ?? 0),
      deliveryFailures: Number(failures?.n ?? 0),
      myPending,
    },
    monthly: monthly.map((m) => ({ month: m.m, direction: m.direction, n: Number(m.n) })),
    departments: depts.map((d) => ({ name: d.department, n: Number(d.n) })),
    templates: templates.map((t) => ({ name: t.name, n: Number(t.n) })),
    organisations: orgs.map((o) => ({ name: o.name ?? "(unnamed)", n: Number(o.n) })),
    approval: { avgHours: approvals?.avg_h == null ? null : Math.round(Number(approvals.avg_h) * 10) / 10, completed: Number(approvals?.n ?? 0) },
  };
}

export async function setAttachPolicy(user: AppUser, input: { allowZip: boolean; requireScan: boolean }) {
  needCorr(user, "admin", "Only correspondence administrators set the attachment rules.");
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.corr_attach', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", JSON.stringify({ allowZip: !!input.allowZip, requireScan: !!input.requireScan }), nowIso(), user.id);
  await audit(user, null, "attachments.policy", input);
}
export const attachmentPolicy = attachPolicy;
