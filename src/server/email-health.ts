import crypto from "node:crypto";
import dns from "node:dns/promises";
import { all, get, nowIso, run, uid } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { recordIncoming } from "./call-monitor";
import { smtpSettings, type CheckStep } from "./email";

// Email setup and health (Update 1.0, phase 7): the setup steps with a check each, the domain's SPF, DKIM and DMARC,
// and bounces and complaints reported back by the relay (Resend or Brevo) to /api/integrations/email/events.

export async function emailEventsToken() {
  let t = (await getMeta("email.eventsToken")) ?? "";
  if (t.length < 16) {
    t = crypto.randomBytes(18).toString("base64url");
    await setMeta("email.eventsToken", t);
  }
  return t;
}

export async function newEmailEventsToken(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes the email events address.");
  const t = crypto.randomBytes(18).toString("base64url");
  await setMeta("email.eventsToken", t);
  await audit({ actor: user }, { action: "settings.email", summary: `${user.name} made a new address for email bounce reports` });
  return t;
}

type Event = { address: string; kind: "hard" | "soft" | "complaint"; reason: string | null; messageId: string | null; provider: string };

// Resend: { type: "email.bounced" | "email.complained", data: { email_id, to: [..], bounce?: { type, message } } }
// Brevo: { event: "hard_bounce" | "soft_bounce" | "spam" | "complaint", email, "message-id", reason }
export function parseEmailEvent(p: unknown): Event[] {
  if (!p || typeof p !== "object") return [];
  const o = p as Record<string, unknown>;
  if (typeof o.type === "string" && o.data && typeof o.data === "object") {
    const d = o.data as Record<string, unknown>;
    const kind = o.type === "email.bounced" ? (/soft|transient/i.test(String((d.bounce as Record<string, unknown> | undefined)?.type ?? "")) ? "soft" : "hard") : o.type === "email.complained" ? "complaint" : null;
    if (!kind) return [];
    const to = Array.isArray(d.to) ? d.to.map(String) : typeof d.to === "string" ? [d.to] : [];
    const reason = String((d.bounce as Record<string, unknown> | undefined)?.message ?? (kind === "complaint" ? "Marked as spam" : "")) || null;
    return to.map((address) => ({ address: address.toLowerCase(), kind, reason, messageId: d.email_id ? String(d.email_id) : null, provider: "resend" }));
  }
  if (typeof o.event === "string" && typeof o.email === "string") {
    const kind = o.event === "hard_bounce" || o.event === "blocked" || o.event === "invalid_email" ? "hard" : o.event === "soft_bounce" ? "soft" : o.event === "spam" || o.event === "complaint" ? "complaint" : null;
    if (!kind) return [];
    return [{ address: o.email.toLowerCase(), kind, reason: o.reason ? String(o.reason) : null, messageId: o["message-id"] ? String(o["message-id"]) : null, provider: "brevo" }];
  }
  return [];
}

export async function handleEmailEvent(token: string | null, payload: unknown): Promise<{ ok: boolean; status: number; recorded?: number }> {
  const want = await emailEventsToken();
  if (!token || token.length !== want.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(want))) {
    await recordIncoming("email", { ok: false, status: 401, summary: "Email event with a wrong address", error: "Wrong token" });
    return { ok: false, status: 401 };
  }
  const events = (Array.isArray(payload) ? payload : [payload]).flatMap(parseEmailEvent).slice(0, 200);
  for (const e of events) {
    await run("INSERT INTO email_bounces (id, address, kind, reason, message_id, provider, at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("ebn_"), e.address.slice(0, 200), e.kind, e.reason?.slice(0, 300) ?? null, e.messageId?.slice(0, 200) ?? null, e.provider, nowIso());
    const status = e.kind === "complaint" ? "complained" : "bounced";
    if (e.messageId) await run("UPDATE email_log_recipients SET status = ?, error = ? WHERE message_id = ? AND lower(address) = ?", status, e.reason?.slice(0, 300) ?? null, e.messageId, e.address);
    else await run("UPDATE email_log_recipients SET status = ?, error = ? WHERE lower(address) = ? AND status = 'sent' AND sent_at >= ?", status, e.reason?.slice(0, 300) ?? null, e.address, new Date(Date.now() - 3 * 86400e3).toISOString());
  }
  await recordIncoming("email", { ok: true, status: 200, summary: events.length ? `${events.length} bounce or complaint report${events.length === 1 ? "" : "s"} (${events[0].provider})` : "Email event (nothing to record)", ref: events[0]?.messageId ?? null });
  return { ok: true, status: 200, recorded: events.length };
}

export type Bounce = { id: string; address: string; kind: string; reason: string | null; provider: string | null; at: string };

export async function listBounces(user: AppUser, days = 30): Promise<Bounce[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees bounces.");
  return all<Bounce>("SELECT id, address, kind, reason, provider, at FROM email_bounces WHERE at >= ? ORDER BY at DESC LIMIT 200", new Date(Date.now() - days * 86400e3).toISOString());
}

const txt = async (name: string) => (await dns.resolveTxt(name).catch(() => [] as string[][])).map((r) => r.join(""));
const DKIM_SELECTORS = ["resend", "brevo1", "brevo2", "mail", "default", "google", "selector1", "selector2", "k1", "s1"];

// SPF, DKIM (common selectors) and DMARC for a domain.
export async function checkEmailDns(domainOrAddress: string): Promise<{ domain: string; steps: CheckStep[] }> {
  const domain = (domainOrAddress.includes("@") ? domainOrAddress.split("@")[1] : domainOrAddress)?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new WorkflowError("VALIDATION", "Enter a domain such as myseed.com.et.");
  const steps: CheckStep[] = [];
  const spf = (await txt(domain)).filter((r) => /^v=spf1/i.test(r));
  steps.push(
    spf.length === 1
      ? { label: "SPF", status: "ok", detail: spf[0] }
      : spf.length > 1
        ? { label: "SPF", status: "fail", detail: `${spf.length} SPF records; only one is allowed. Merge them into one.` }
        : { label: "SPF", status: "fail", detail: `No SPF record. Add a TXT record on ${domain}, such as v=spf1 include:<your relay> ~all.` },
  );
  const found: string[] = [];
  for (const s of DKIM_SELECTORS) if ((await txt(`${s}._domainkey.${domain}`)).some((r) => /p=/i.test(r))) found.push(s);
  steps.push(found.length ? { label: "DKIM", status: "ok", detail: `Signing key found (selector ${found.join(", ")}).` } : { label: "DKIM", status: "warn", detail: `No DKIM key found at the usual selectors (${DKIM_SELECTORS.slice(0, 4).join(", ")}…). Add the record your relay gives you.` });
  const dmarc = (await txt(`_dmarc.${domain}`)).find((r) => /^v=DMARC1/i.test(r));
  steps.push(dmarc ? { label: "DMARC", status: "ok", detail: dmarc } : { label: "DMARC", status: "warn", detail: `No DMARC record. Add a TXT record named _dmarc.${domain} with v=DMARC1; p=none` });
  return { domain, steps };
}

export type SetupStep = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; href?: string };

// The steps to set up email, each with a check that runs without sending anything.
export async function emailSetupSteps(user: AppUser): Promise<{ steps: SetupStep[]; eventsPath: string; domain: string | null }> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up email.");
  const s = await smtpSettings();
  const domain = s.fromAddress.split("@")[1]?.toLowerCase() || null;
  const lastTest = await get<{ ok: number; at: string }>("SELECT ok, at FROM int_calls WHERE COALESCE(source, capability) = 'email' AND direction = 'out' ORDER BY at DESC LIMIT 1");
  const bounces = await get<{ n: number }>("SELECT COUNT(*) AS n FROM email_bounces WHERE at >= ?", new Date(Date.now() - 7 * 86400e3).toISOString());
  const lastEvent = await get<{ at: string }>("SELECT at FROM int_calls WHERE COALESCE(source, capability) = 'email' AND direction = 'in' AND ok = 1 ORDER BY at DESC LIMIT 1");
  const steps: SetupStep[] = [
    { key: "server", label: "1. Choose how email leaves", status: s.source === "none" ? "fail" : "ok", detail: s.source === "none" ? "No mail server or relay is set." : s.relay ? `Relay: ${s.relay}${s.hasRelayKey ? " (key saved)" : " (key missing)"}` : `Mail server ${s.host}:${s.port}`, href: "/email?tab=settings" },
    { key: "sender", label: "2. Set the sender", status: s.fromAddress ? "ok" : "fail", detail: s.fromAddress ? `${s.fromName || "MySeed"} <${s.fromAddress}>` : "No sender address.", href: "/email?tab=settings" },
    { key: "dns", label: "3. Check the domain (SPF, DKIM, DMARC)", status: domain ? "warn" : "fail", detail: domain ? `Run the check for ${domain} below.` : "Set the sender first." },
    { key: "test", label: "4. Send a test", status: !lastTest ? "warn" : lastTest.ok ? "ok" : "fail", detail: !lastTest ? "No email sent yet." : `${lastTest.ok ? "Last email went out" : "Last email failed"} ${lastTest.at.slice(0, 16).replace("T", " ")}` },
    { key: "events", label: "5. Get bounce reports", status: lastEvent ? "ok" : "warn", detail: lastEvent ? `Last report ${lastEvent.at.slice(0, 16).replace("T", " ")}. ${Number(bounces?.n ?? 0)} bounces in 7 days.` : "Add the address below as a webhook in Resend or Brevo (bounced, complained)." },
  ];
  return { steps, eventsPath: `/api/integrations/email/events?t=${await emailEventsToken()}`, domain };
}
