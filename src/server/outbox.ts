// Email that goes out later: copies of notifications people asked for by email, and messages scheduled in Email.
// Both wait in a table and are sent in the background, so no action waits for the email server.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { getSettings } from "./settings";
import { loadUser } from "./users";
import { WorkflowError } from "./workflow";
import { sendEmail, sendSystemEmail, type SendInput } from "./email";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Notification copies: one email per notification, to the people who chose that type.
export async function queueNotificationEmails(userIds: string[], input: { type: string; title: string; body?: string; link?: string }) {
  if (!userIds.length) return;
  const rows = await all<{ id: string; email: string; prefs: string; active: number }>(`SELECT id, email, prefs, active FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`, ...userIds);
  const wanted = rows.filter((r) => r.active && r.email && (parseJson<{ emailNotificationTypes?: string[] }>(r.prefs, {}).emailNotificationTypes ?? []).includes(input.type));
  if (!wanted.length) return;
  const s = await getSettings();
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const url = input.link ? (base ? `${base}${input.link}` : input.link) : null;
  const text = `${input.title}\n\n${input.body ?? ""}${url ? `\n\nOpen: ${url}` : ""}\n\nYou get this because you chose email copies in ${s.workspace.name}, Notifications.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Segoe UI,Arial,sans-serif;color:#1f2328">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px">
<p style="margin:0 0 8px;font-size:16px;font-weight:600">${esc(input.title)}</p>
${input.body ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${esc(input.body)}</p>` : ""}
${url ? `<p style="margin:0"><a href="${esc(url)}" style="color:#4f46e5">Open in ${esc(s.workspace.name)}</a></p>` : ""}
</div><p style="max-width:560px;margin:10px auto 0;font-size:12px;color:#6b7280">You chose email copies of these in Notifications. Change it there.</p></body></html>`;
  const now = nowIso();
  for (const r of wanted)
    await run(
      "INSERT INTO email_outbox (id, kind, user_id, to_address, subject, text, html, status, attempts, send_after, created_at) VALUES (?, 'notification', ?, ?, ?, ?, ?, 'queued', 0, ?, ?)",
      uid("obx_"),
      r.id,
      r.email,
      `${input.title} · ${s.workspace.name}`.slice(0, 200),
      text,
      html,
      now,
      now,
    );
  void flushOutbox().catch((e) => console.error("Outbox", e));
}

let flushing = false;

// Sends what is due: notification copies (up to three tries) and scheduled messages.
export async function flushOutbox(limit = 50) {
  if (flushing) return { sent: 0 };
  flushing = true;
  let sent = 0;
  try {
    const now = nowIso();
    const due = await all<{ id: string; kind: string; to_address: string | null; subject: string | null; text: string | null; html: string | null; attempts: number; payload: string | null; user_id: string | null }>(
      "SELECT id, kind, to_address, subject, text, html, attempts, payload, user_id FROM email_outbox WHERE status = 'queued' AND send_after <= ? ORDER BY send_after LIMIT ?",
      now,
      limit,
    );
    for (const m of due) {
      // Claim it, so two flushes never send the same message.
      const claimed = await run("UPDATE email_outbox SET status = 'sending' WHERE id = ? AND status = 'queued'", m.id);
      if (!claimed) continue;
      try {
        if (m.kind === "scheduled") {
          const user = m.user_id ? await loadUser(m.user_id) : null;
          if (!user?.active) throw new WorkflowError("FORBIDDEN", "The person who scheduled it can no longer send email.");
          const p = parseJson<{ input: SendInput; workspace: string }>(m.payload, { input: null as never, workspace: "" });
          const r = await sendEmail(user, p.input, p.workspace);
          await run("UPDATE email_outbox SET status = ?, log_id = ?, sent_at = ? WHERE id = ?", r.status === "failed" ? "failed" : "sent", r.logId, nowIso(), m.id);
        } else {
          await sendSystemEmail(m.to_address!, m.subject ?? "", m.text ?? "", m.html ?? undefined);
          await run("UPDATE email_outbox SET status = 'sent', sent_at = ? WHERE id = ?", nowIso(), m.id);
        }
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempts = Number(m.attempts) + 1;
        // Notification copies try again later (5, then 30 minutes); a scheduled message reports its error once.
        const retry = m.kind === "notification" && attempts < 3;
        await run(
          "UPDATE email_outbox SET status = ?, attempts = ?, error = ?, send_after = ? WHERE id = ?",
          retry ? "queued" : "failed",
          attempts,
          msg.slice(0, 500),
          new Date(Date.now() + (attempts === 1 ? 5 : 30) * 60e3).toISOString(),
          m.id,
        );
      }
    }
  } finally {
    flushing = false;
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Scheduled sending (Email, Compose, Send later)
// ---------------------------------------------------------------------------

export async function scheduleEmail(user: import("./users").AppUser, input: SendInput, workspace: string, sendAt: string) {
  const t = Date.parse(sendAt);
  if (!Number.isFinite(t)) throw new WorkflowError("VALIDATION", "Choose when to send it.");
  if (t < Date.now() + 60e3) throw new WorkflowError("VALIDATION", "Choose a time at least a minute from now, or send it now.");
  if (t > Date.now() + 180 * 864e5) throw new WorkflowError("VALIDATION", "Messages can be scheduled up to six months ahead.");
  if (!input.subject.trim() || !input.body.trim()) throw new WorkflowError("VALIDATION", "Add a subject and a message.");
  const id = uid("obx_");
  await run(
    "INSERT INTO email_outbox (id, kind, user_id, subject, payload, status, attempts, send_after, created_at) VALUES (?, 'scheduled', ?, ?, ?, 'queued', 0, ?, ?)",
    id,
    user.id,
    input.subject.trim().slice(0, 200),
    JSON.stringify({ input, workspace }),
    new Date(t).toISOString(),
    nowIso(),
  );
  return id;
}

export async function scheduledEmails(user: import("./users").AppUser) {
  return all<{ id: string; subject: string | null; send_after: string; status: string; error: string | null; log_id: string | null; created_at: string }>(
    "SELECT id, subject, send_after, status, error, log_id, created_at FROM email_outbox WHERE kind = 'scheduled' AND user_id = ? ORDER BY send_after DESC LIMIT 50",
    user.id,
  );
}

export async function cancelScheduled(user: import("./users").AppUser, id: string) {
  const row = await get<{ user_id: string; status: string }>("SELECT user_id, status FROM email_outbox WHERE id = ? AND kind = 'scheduled'", id);
  if (!row || row.user_id !== user.id) throw new WorkflowError("NOT_FOUND", "Scheduled message not found.");
  if (row.status !== "queued") throw new WorkflowError("INVALID_STATE", "It was already sent.");
  await run("UPDATE email_outbox SET status = 'cancelled' WHERE id = ?", id);
}
