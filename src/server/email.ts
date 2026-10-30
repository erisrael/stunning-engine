// Email from the app over SMTP. One SMTP account (Gmail with an app password, Google Workspace, Zoho, Outlook or
// any provider) is set in Email settings or in SMTP_* environment variables. Each employee can have their own
// sender address: a mailbox created at the provider, registered here with its own login or as an alias the
// shared account may send as. Every email is logged with the outcome per recipient.

import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import { Marked } from "marked";
import { all, get, nowIso, placeholders, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { ROLE_LABELS, ROLES, STAGES, type Role, type Stage } from "@/lib/domain";

// ---------------------------------------------------------------------------
// SMTP settings
// ---------------------------------------------------------------------------

// Sending can go through an HTTPS email API instead of SMTP, for hosting that blocks the SMTP ports (Render's free
// plan blocks 25, 465 and 587). The mailbox itself stays where it is (for example cPanel).
export const RELAY_PROVIDERS = ["brevo", "resend"] as const;
export type RelayProvider = (typeof RELAY_PROVIDERS)[number];
export const RELAY_LABELS: Record<RelayProvider, string> = { brevo: "Brevo (free: 300 emails a day)", resend: "Resend (free: 3,000 emails a month)" };

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  source: "env" | "app" | "none";
  relay: RelayProvider | null;
  hasRelayKey: boolean;
};
type StoredSmtp = { host: string; port: number; secure: boolean; user: string; passEnc: string | null; fromName: string; fromAddress: string; replyTo: string; relay?: RelayProvider | null; relayKeyEnc?: string | null };

export const SMTP_PRESETS = [
  { key: "cpanel", label: "Your own domain (cPanel hosting)", host: "", port: 465, secure: true, hint: "In cPanel, open Email Accounts, then Connect Devices for the mailbox. The outgoing server is usually mail.yourdomain, port 465 with SSL, and the sign-in name is the full email address." },
  { key: "gmail", label: "Gmail (app password)", host: "smtp.gmail.com", port: 465, secure: true, hint: "Turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords. Gmail sends up to about 500 emails a day." },
  { key: "workspace", label: "Google Workspace", host: "smtp.gmail.com", port: 465, secure: true, hint: "Use a Workspace mailbox and an app password. Employee addresses can be added as aliases (Send mail as) or as their own logins." },
  { key: "zoho", label: "Zoho Mail", host: "smtp.zoho.com", port: 465, secure: true, hint: "Free for small teams on your own domain. Use an app-specific password if two-factor sign-in is on." },
  { key: "outlook", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, secure: false, hint: "SMTP AUTH must be allowed for the mailbox in the Microsoft 365 admin center." },
  { key: "custom", label: "Other provider", host: "", port: 587, secure: false, hint: "Use the SMTP details from your provider." },
] as const;

async function storedSmtp(): Promise<StoredSmtp | null> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.smtp'");
  return row ? (JSON.parse(row.value) as StoredSmtp) : null;
}

function envSmtp() {
  if (!process.env.SMTP_HOST) return null;
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "1" || process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    fromAddress: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
    fromName: process.env.SMTP_FROM_NAME ?? "Myseed",
  };
}

// EMAIL_API_PROVIDER (brevo or resend) and EMAIL_API_KEY in the hosting settings switch sending to the web API.
function envRelay(): { provider: RelayProvider; key: string } | null {
  const p = process.env.EMAIL_API_PROVIDER as RelayProvider | undefined;
  return p && RELAY_PROVIDERS.includes(p) && process.env.EMAIL_API_KEY ? { provider: p, key: process.env.EMAIL_API_KEY } : null;
}

export async function smtpSettings(): Promise<SmtpSettings> {
  const env = envSmtp();
  const er = envRelay();
  if (env)
    return { host: env.host, port: env.port, secure: env.secure, user: env.user, hasPassword: !!env.pass, fromName: env.fromName, fromAddress: env.fromAddress, replyTo: "", source: "env", relay: er?.provider ?? null, hasRelayKey: !!er };
  const s = await storedSmtp();
  if (!s) return { host: "", port: 587, secure: false, user: "", hasPassword: false, fromName: "Myseed", fromAddress: "", replyTo: "", source: "none", relay: er?.provider ?? null, hasRelayKey: !!er };
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    user: s.user,
    hasPassword: !!s.passEnc,
    fromName: s.fromName,
    fromAddress: s.fromAddress,
    replyTo: s.replyTo,
    source: "app",
    relay: er?.provider ?? s.relay ?? null,
    hasRelayKey: !!er || !!s.relayKeyEnc,
  };
}

export async function saveSmtp(
  user: AppUser,
  input: { host: string; port: number; secure: boolean; user: string; password?: string | null; fromName: string; fromAddress: string; replyTo?: string; relay?: RelayProvider | null; relayKey?: string | null },
) {
  if (envSmtp()) throw new WorkflowError("INVALID_STATE", "SMTP is set in the hosting environment variables (SMTP_HOST). Change it there.");
  const relay = input.relay && RELAY_PROVIDERS.includes(input.relay) ? input.relay : null;
  const host = input.host.trim();
  // With a web API the SMTP server is optional (kept for when the hosting allows SMTP again).
  if ((!relay || host) && (!host || !/^[a-z0-9.-]+$/i.test(host))) throw new WorkflowError("VALIDATION", "Enter the SMTP server, for example smtp.gmail.com.");
  if ((!relay || host) && !(input.port > 0 && input.port < 65536)) throw new WorkflowError("VALIDATION", "Enter the port, usually 465 or 587.");
  if (!isEmail(input.fromAddress)) throw new WorkflowError("VALIDATION", "Enter the default sender address.");
  if (input.replyTo && !isEmail(input.replyTo)) throw new WorkflowError("VALIDATION", "The reply-to address is not valid.");
  const old = await storedSmtp();
  const next: StoredSmtp = {
    host,
    port: Math.round(input.port),
    secure: !!input.secure,
    user: input.user.trim(),
    // An empty password field keeps the saved one.
    passEnc: input.password ? await seal(input.password) : (old?.passEnc ?? null),
    fromName: input.fromName.trim() || "Myseed",
    fromAddress: input.fromAddress.trim().toLowerCase(),
    replyTo: input.replyTo?.trim().toLowerCase() ?? "",
    relay,
    // An empty key field keeps the saved one.
    relayKeyEnc: input.relayKey?.trim() ? await seal(input.relayKey.trim()) : (old?.relayKeyEnc ?? null),
  };
  if (relay && !next.relayKeyEnc) throw new WorkflowError("VALIDATION", "Paste the API key from the email service.");
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.smtp', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "email.settings", summary: `${user.name} changed the email (SMTP) settings`, newValue: { host: next.host, port: next.port, user: next.user, fromAddress: next.fromAddress, relay: next.relay } });
}

// ---------------------------------------------------------------------------
// Web API sending (Brevo, Resend) as a nodemailer transport, so every send path works unchanged
// ---------------------------------------------------------------------------

type Addr = { name?: string; address: string };
const RELAY_HOST: Record<RelayProvider, string> = { brevo: "api.brevo.com", resend: "api.resend.com" };

function toBase64(a: { content?: unknown; encoding?: string }) {
  const c = a.content;
  if (Buffer.isBuffer(c)) return c.toString("base64");
  if (typeof c === "string") return a.encoding === "base64" ? c : Buffer.from(c, (a.encoding as BufferEncoding) || "utf8").toString("base64");
  throw new Error("Attachments sent through the email API must be in memory.");
}
const str = (v: unknown) => (v === undefined || v === null ? undefined : Buffer.isBuffer(v) ? v.toString("utf8") : String(v));

async function relaySend(provider: RelayProvider, key: string, mail: { data: Record<string, unknown>; message: { getAddresses(): Record<string, Addr[] | undefined> } }) {
  const a = mail.message.getAddresses();
  const from = a.from?.[0];
  if (!from) throw new Error("No sender address.");
  const d = mail.data as { subject?: string; text?: unknown; html?: unknown; attachments?: { filename?: string; content?: unknown; encoding?: string; contentType?: string }[] };
  const files = (d.attachments ?? []).map((x) => ({ name: x.filename || "attachment", content: toBase64(x) }));
  const body =
    provider === "brevo"
      ? {
          sender: { name: from.name || undefined, email: from.address },
          to: (a.to ?? []).map((x) => ({ email: x.address, name: x.name || undefined })),
          cc: a.cc?.length ? a.cc.map((x) => ({ email: x.address, name: x.name || undefined })) : undefined,
          bcc: a.bcc?.length ? a.bcc.map((x) => ({ email: x.address, name: x.name || undefined })) : undefined,
          replyTo: a["reply-to"]?.[0] ? { email: a["reply-to"][0].address } : undefined,
          subject: d.subject ?? "",
          htmlContent: str(d.html),
          textContent: str(d.text) ?? (d.html ? undefined : " "),
          attachment: files.length ? files : undefined,
        }
      : {
          from: from.name ? `${from.name.replace(/[<>"]/g, "")} <${from.address}>` : from.address,
          to: (a.to ?? []).map((x) => x.address),
          cc: a.cc?.length ? a.cc.map((x) => x.address) : undefined,
          bcc: a.bcc?.length ? a.bcc.map((x) => x.address) : undefined,
          reply_to: a["reply-to"]?.[0]?.address,
          subject: d.subject ?? "",
          html: str(d.html),
          text: str(d.text),
          attachments: files.length ? files.map((f) => ({ filename: f.name, content: f.content })) : undefined,
        };
  // Brevo and Resend both refuse a message with no "to"; Bcc-only sends go to the sender, the rest in Bcc.
  if (provider === "brevo" && !(body as { to: unknown[] }).to.length) (body as { to: unknown[] }).to = [{ email: from.address }];
  if (provider === "resend" && !(body as { to: unknown[] }).to.length) (body as { to: unknown[] }).to = [from.address];
  const res = await fetch(provider === "brevo" ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(provider === "brevo" ? { "api-key": key } : { authorization: `Bearer ${key}` }) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { messageId?: string; id?: string; message?: string; name?: string };
  if (!res.ok) {
    const err = new Error(json.message || `${provider} answered ${res.status}`) as Error & { responseCode?: number; code?: string };
    err.responseCode = res.status;
    if (res.status === 401 || res.status === 403) err.code = "EAUTH";
    throw err;
  }
  return json.messageId ?? json.id ?? "";
}

async function relayCheckKey(provider: RelayProvider, key: string) {
  const res = await fetch(provider === "brevo" ? "https://api.brevo.com/v3/account" : "https://api.resend.com/domains", {
    headers: provider === "brevo" ? { "api-key": key, accept: "application/json" } : { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  // Resend's "sending access" keys cannot list domains but are valid for sending.
  if (provider === "resend" && res.status === 401) {
    const j = (await res.json().catch(() => ({}))) as { name?: string };
    if (j.name === "restricted_api_key") return;
  }
  if (!res.ok) {
    const err = new Error(`The ${provider === "brevo" ? "Brevo" : "Resend"} API key was not accepted (${res.status}).`) as Error & { code?: string };
    err.code = "EAUTH";
    throw err;
  }
}

// Whether the sender's domain is verified with the provider, so mail is accepted and lands in inboxes.
async function relayDomainStatus(provider: RelayProvider, key: string, domain: string): Promise<"verified" | "pending" | "missing" | "unknown"> {
  try {
    if (provider === "brevo") {
      const res = await fetch("https://api.brevo.com/v3/senders/domains", { headers: { "api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return "unknown";
      const j = (await res.json()) as { domains?: { domain_name: string; authenticated?: boolean; verified?: boolean }[] };
      const d = j.domains?.find((x) => x.domain_name.toLowerCase() === domain);
      return !d ? "missing" : d.authenticated ? "verified" : "pending";
    }
    const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return "unknown";
    const j = (await res.json()) as { data?: { name: string; status: string }[] };
    const d = j.data?.find((x) => x.name.toLowerCase() === domain);
    return !d ? "missing" : d.status === "verified" ? "verified" : "pending";
  } catch {
    return "unknown";
  }
}

function relayTransport(provider: RelayProvider, key: string) {
  return nodemailer.createTransport({
    name: provider,
    version: "1",
    send(mail: Parameters<typeof relaySend>[2], callback: (err: Error | null, info?: unknown) => void) {
      relaySend(provider, key, mail).then(
        (messageId) => callback(null, { messageId, envelope: { from: mail.message.getAddresses().from?.[0]?.address, to: [] }, accepted: [], rejected: [], response: "accepted" }),
        (err) => callback(err as Error),
      );
    },
    // Called with a callback, or without one (then it returns a promise, as nodemailer's own transports do).
    verify(callback?: (err: Error | null, ok?: boolean) => void) {
      const p = relayCheckKey(provider, key).then(() => true);
      if (!callback) return p;
      p.then(() => callback(null, true), (err) => callback(err as Error));
    },
  } as unknown as nodemailer.Transport);
}

async function activeRelay(): Promise<{ provider: RelayProvider; key: string } | null> {
  const er = envRelay();
  if (er) return er;
  const s = await storedSmtp();
  if (!s?.relay || !s.relayKeyEnc) return null;
  const key = await unseal(s.relayKeyEnc);
  if (key === null) throw new WorkflowError("INVALID_STATE", "The saved API key cannot be read (the encryption key changed). Enter it again in Email, Settings.");
  return { provider: s.relay, key };
}

export function isEmail(v: string) {
  return /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(v.trim());
}

type Transport = { transporter: nodemailer.Transporter; host: string; port: number; authUser: string; fromAddress: string; fromName: string; replyTo: string };

// The connection for a sender: its own login when it has one, otherwise the shared account.
async function transportFor(sender: SenderRow | null): Promise<Transport> {
  const env = envSmtp();
  const s = env ? null : await storedSmtp();
  const relay = await activeRelay();
  if (relay) {
    // Through the web API every sender address goes out on the one key; the domain must be verified there.
    return {
      transporter: relayTransport(relay.provider, relay.key),
      host: RELAY_HOST[relay.provider],
      port: 443,
      authUser: relay.provider === "brevo" ? "Brevo API key" : "Resend API key",
      fromAddress: sender?.address ?? env?.fromAddress ?? s?.fromAddress ?? "",
      fromName: sender?.display_name ?? env?.fromName ?? s?.fromName ?? "Myseed",
      replyTo: env ? "" : (s?.replyTo ?? ""),
    };
  }
  if (!env && !s) throw new WorkflowError("INVALID_STATE", "Email is not set up yet. An administrator adds the SMTP account in Email, Settings.");
  const host = env?.host ?? s!.host;
  const port = env?.port ?? s!.port;
  const secure = env?.secure ?? s!.secure;
  let authUser = env?.user ?? s!.user;
  let authPass = env ? env.pass : s!.passEnc ? await unseal(s!.passEnc) : "";
  if (sender?.smtp_user && sender.smtp_pass_enc) {
    authUser = sender.smtp_user;
    authPass = await unseal(sender.smtp_pass_enc);
  }
  if (authPass === null) throw new WorkflowError("INVALID_STATE", "The saved email password cannot be read (the encryption key changed). Enter it again in Email, Settings.");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: authUser ? { user: authUser, pass: authPass ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  });
  return {
    transporter,
    host,
    port,
    authUser,
    fromAddress: sender?.address ?? env?.fromAddress ?? s!.fromAddress,
    fromName: sender?.display_name ?? env?.fromName ?? s!.fromName,
    replyTo: env ? "" : (s!.replyTo ?? ""),
  };
}

export async function testSmtp(user: AppUser, senderId: string | null, to: string) {
  const sender = senderId ? await senderRow(senderId) : null;
  const t = await transportFor(sender);
  try {
    await t.transporter.verify();
    await t.transporter.sendMail({
      from: { name: t.fromName, address: t.fromAddress },
      to,
      subject: "Myseed email test",
      text: `This is a test from Myseed Content Manager, sent by ${user.name} as ${t.fromAddress}. Email is working.`,
    });
  } catch (err) {
    throw new WorkflowError("INVALID_STATE", explainSmtpError(err, t.host, t.port));
  } finally {
    t.transporter.close();
  }
}

// What a failed connection means and what to do about it, instead of the bare server message.
function explainSmtpError(err: unknown, host: string, port: number) {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const said = e?.message ?? String(err);
  // Web API sending (port 443): the service's own message is already plain.
  if (port === 443) return e?.code === "EAUTH" ? `The API key was not accepted. Create a new key and paste it in Email, Settings. (${said})` : `The email service said: ${said}`;
  if (e?.code === "EAUTH" || e?.responseCode === 535)
    return `The server rejected the sign-in. Use the full email address as the sign-in name and the mailbox password (reset it in cPanel, Email Accounts, if unsure). The server said: ${said}`;
  if (/ENOTFOUND|EAI_AGAIN/.test(said)) return `The server name ${host} was not found. Check the outgoing server in cPanel, Email Accounts, Connect Devices.`;
  if (e?.code === "ETIMEDOUT" || /timeout/i.test(said))
    return `No answer from ${host} on port ${port}. Usually the app's hosting blocks outgoing email ports (Render's free plan blocks 25, 465 and 587). Switch "Send through" to a web API (Brevo or Resend) in Email, Settings; it works over HTTPS.`;
  if (/certificate|self.signed|altnames/i.test(said))
    return `The server's certificate does not match ${host}. Use the server name shown in cPanel's Connect Devices (sometimes your host's server name instead of mail.yourdomain). The server said: ${said}`;
  if (/wrong version number|ssl3_get_record/i.test(said)) return `Encryption mismatch: port 465 needs "Encrypted connection from the start" on, port 587 needs it off.`;
  return `The email server said: ${said}`;
}

export type CheckStep = { label: string; status: "ok" | "warn" | "fail"; detail: string };

function probePort(host: string, port: number, ms = 8000) {
  return new Promise<"open" | "timeout" | "refused">((resolve) => {
    const sock = net.connect({ host, port });
    const done = (r: "open" | "timeout" | "refused") => (sock.destroy(), resolve(r));
    sock.setTimeout(ms, () => done("timeout"));
    sock.once("connect", () => done("open"));
    sock.once("error", () => done("refused"));
  });
}

// Setup step 3, run from the app's server: find the mail server, reach its port, then sign in. Sends nothing.
export async function checkSmtpLogin(senderId: string | null): Promise<CheckStep[]> {
  const sender = senderId ? await senderRow(senderId) : null;
  const relay = await activeRelay();
  if (relay) {
    const t = await transportFor(sender);
    const name = relay.provider === "brevo" ? "Brevo" : "Resend";
    const steps: CheckStep[] = [];
    try {
      await relayCheckKey(relay.provider, relay.key);
      steps.push({ label: `${name} API`, status: "ok", detail: `The app's server reaches ${name} over HTTPS and the API key is accepted.` });
    } catch (err) {
      steps.push({ label: `${name} API`, status: "fail", detail: err instanceof Error ? err.message : String(err) });
      return steps;
    }
    const domain = t.fromAddress.split("@")[1]?.toLowerCase() ?? "";
    const st = domain ? await relayDomainStatus(relay.provider, relay.key, domain) : "unknown";
    steps.push(
      st === "verified"
        ? { label: "Sender domain", status: "ok", detail: `${domain} is verified with ${name}. Now send a test email to yourself.` }
        : st === "pending"
          ? { label: "Sender domain", status: "warn", detail: `${domain} is added in ${name} but not verified yet. Add the DNS records ${name} shows to cPanel, Zone Editor, then press Verify in ${name}.` }
          : st === "missing"
            ? { label: "Sender domain", status: "fail", detail: `${domain} is not added in ${name}. Add it under Domains (${relay.provider === "brevo" ? "Senders, Domains and Dedicated IPs" : "Domains"}), then put the DNS records it shows into cPanel, Zone Editor.` }
            : { label: "Sender domain", status: "warn", detail: `Could not read ${name}'s domain list with this key. Make sure ${domain} is verified there, then send a test.` },
    );
    return steps;
  }
  const t = await transportFor(sender);
  const steps: CheckStep[] = [];
  try {
    try {
      const a = await dns.lookup(t.host);
      steps.push({ label: "Server name", status: "ok", detail: `${t.host} is at ${a.address}.` });
    } catch {
      steps.push({ label: "Server name", status: "fail", detail: `${t.host} was not found. Check the outgoing server in cPanel, Email Accounts, Connect Devices.` });
      return steps;
    }
    const other = t.port === 465 ? 587 : 465;
    const [mine, alt] = await Promise.all([probePort(t.host, t.port), probePort(t.host, other)]);
    if (mine !== "open") {
      steps.push({
        label: `Port ${t.port}`,
        status: "fail",
        detail:
          alt === "open"
            ? `Port ${t.port} is ${mine === "timeout" ? "blocked or not answering" : "refused"}, but port ${other} answers. Switch to port ${other} (${other === 465 ? "with" : "without"} "Encrypted connection from the start").`
            : `Neither port ${t.port} nor ${other} answers from the app's server, so the hosting blocks outgoing email. Switch "Send through" to a web API (Brevo or Resend, both free to start), or move the app to a plan that allows SMTP.`,
      });
      return steps;
    }
    steps.push({ label: `Port ${t.port}`, status: "ok", detail: `The app's server can reach ${t.host} on port ${t.port}.` });
    try {
      await t.transporter.verify();
      steps.push({ label: "Sign-in", status: "ok", detail: `Signed in as ${t.authUser || "(no sign-in)"}. Now send a test email to yourself.` });
    } catch (err) {
      steps.push({ label: "Sign-in", status: "fail", detail: explainSmtpError(err, t.host, t.port) });
    }
    return steps;
  } finally {
    t.transporter.close();
  }
}

async function txt(name: string) {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

// Setup step 4: the DNS records that keep the domain's mail out of spam. DKIM uses cPanel's "default" selector.
export async function checkInboxDelivery(address: string): Promise<{ domain: string; steps: CheckStep[] }> {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  if (!domain) throw new WorkflowError("VALIDATION", "Set the default sender address first.");
  const steps: CheckStep[] = [];
  const spf = (await txt(domain)).filter((r) => /^v=spf1/i.test(r));
  if (spf.length === 1) steps.push({ label: "SPF", status: "ok", detail: spf[0] });
  else if (spf.length > 1) steps.push({ label: "SPF", status: "fail", detail: `${spf.length} SPF records found; only one is allowed. In cPanel, Email Deliverability, click Repair next to SPF.` });
  else steps.push({ label: "SPF", status: "fail", detail: "No SPF record. In cPanel, open Email Deliverability and click Repair next to SPF." });
  const dkim = (await txt(`default._domainkey.${domain}`)).find((r) => /p=/i.test(r));
  steps.push(
    dkim
      ? { label: "DKIM", status: "ok", detail: "Signing key found (selector default)." }
      : { label: "DKIM", status: "fail", detail: "No DKIM key at default._domainkey. In cPanel, open Email Deliverability and click Install the suggested record next to DKIM." },
  );
  const dmarc = (await txt(`_dmarc.${domain}`)).find((r) => /^v=DMARC1/i.test(r));
  steps.push(
    dmarc
      ? { label: "DMARC", status: "ok", detail: dmarc }
      : { label: "DMARC", status: "warn", detail: `No DMARC record. In cPanel, Zone Editor, add a TXT record named _dmarc.${domain} with the value v=DMARC1; p=none` },
  );
  const mx = await dns.resolveMx(domain).catch(() => []);
  steps.push(
    mx.length
      ? { label: "MX", status: "ok", detail: `Replies are delivered to ${mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange).join(", ")}.` }
      : { label: "MX", status: "warn", detail: "No MX record, so replies to this address cannot be delivered." },
  );
  return { domain, steps };
}

// ---------------------------------------------------------------------------
// Sender addresses
// ---------------------------------------------------------------------------

type SenderRow = { id: string; address: string; display_name: string | null; user_id: string | null; smtp_user: string | null; smtp_pass_enc: string | null; is_default: number; active: number };
export type Sender = { id: string; address: string; displayName: string | null; userId: string | null; userName: string | null; ownLogin: boolean; smtpUser: string | null; isDefault: boolean; active: boolean };

async function senderRow(id: string) {
  const r = await get<SenderRow>("SELECT * FROM email_senders WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Sender address not found.");
  return r;
}

export async function listSenders(): Promise<Sender[]> {
  const rows = await all<SenderRow & { user_name: string | null }>(
    "SELECT s.*, u.name AS user_name FROM email_senders s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.is_default DESC, s.address",
  );
  return rows.map((r) => ({
    id: r.id,
    address: r.address,
    displayName: r.display_name,
    userId: r.user_id,
    userName: r.user_name,
    ownLogin: !!(r.smtp_user && r.smtp_pass_enc),
    smtpUser: r.smtp_user,
    isDefault: !!r.is_default,
    active: !!r.active,
  }));
}

export async function saveSender(user: AppUser, input: { id?: string; address: string; displayName?: string | null; userId?: string | null; smtpUser?: string | null; password?: string | null; clearLogin?: boolean; isDefault?: boolean; active?: boolean }) {
  const address = input.address.trim().toLowerCase();
  if (!isEmail(address)) throw new WorkflowError("VALIDATION", "Enter a valid email address.");
  const clash = await get<{ id: string }>("SELECT id FROM email_senders WHERE address = ?", address);
  if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `${address} is already registered.`);
  if (input.userId) {
    const other = await get<{ id: string }>("SELECT id FROM email_senders WHERE user_id = ? AND active = 1", input.userId);
    if (other && other.id !== input.id) throw new WorkflowError("VALIDATION", "That person already has a sender address. Edit it instead.");
  }
  const now = nowIso();
  const old = input.id ? await senderRow(input.id) : null;
  const passEnc = input.clearLogin ? null : input.password ? await seal(input.password) : (old?.smtp_pass_enc ?? null);
  const smtpUser = input.clearLogin ? null : input.smtpUser?.trim() || (input.password ? address : (old?.smtp_user ?? null));
  if (input.isDefault) await run("UPDATE email_senders SET is_default = 0");
  if (old)
    await run(
      "UPDATE email_senders SET address = ?, display_name = ?, user_id = ?, smtp_user = ?, smtp_pass_enc = ?, is_default = ?, active = ?, updated_at = ? WHERE id = ?",
      address,
      input.displayName?.trim() || null,
      input.userId || null,
      smtpUser,
      passEnc,
      input.isDefault ? 1 : old.is_default,
      input.active === false ? 0 : 1,
      now,
      old.id,
    );
  else
    await run(
      "INSERT INTO email_senders (id, address, display_name, user_id, smtp_user, smtp_pass_enc, is_default, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      uid("snd_"),
      address,
      input.displayName?.trim() || null,
      input.userId || null,
      smtpUser,
      passEnc,
      input.isDefault ? 1 : 0,
      input.active === false ? 0 : 1,
      now,
      now,
    );
  await audit({ actor: user }, { action: "email.sender", summary: `${user.name} saved sender address ${address}` });
}

export async function deleteSender(user: AppUser, id: string) {
  const s = await senderRow(id);
  await run("DELETE FROM email_senders WHERE id = ?", id);
  await audit({ actor: user }, { action: "email.sender", summary: `${user.name} removed sender address ${s.address}` });
}

// Senders a person may use: all for email managers; otherwise their own, else the default.
export async function sendersFor(user: AppUser): Promise<Sender[]> {
  const list = (await listSenders()).filter((s) => s.active);
  if (can(user, "email.manage")) return list;
  const own = list.filter((s) => s.userId === user.id);
  return own.length ? own : list.filter((s) => s.isDefault);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type EmailTemplate = { id: string; name: string; subject: string; body: string; shared: boolean; createdBy: string | null; createdByName: string | null; updatedAt: string };

export async function listTemplates(user: AppUser): Promise<EmailTemplate[]> {
  const rows = await all<{ id: string; name: string; subject: string; body: string; shared: number; created_by: string | null; created_by_name: string | null; updated_at: string }>(
    "SELECT t.*, u.name AS created_by_name FROM email_templates t LEFT JOIN users u ON u.id = t.created_by WHERE t.shared = 1 OR t.created_by = ? ORDER BY t.name",
    user.id,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject, body: r.body, shared: !!r.shared, createdBy: r.created_by, createdByName: r.created_by_name, updatedAt: r.updated_at }));
}

export async function saveTemplate(user: AppUser, input: { id?: string; name: string; subject: string; body: string; shared: boolean }) {
  if (!input.name.trim() || !input.subject.trim() || !input.body.trim()) throw new WorkflowError("VALIDATION", "A template needs a name, a subject and a message.");
  const now = nowIso();
  if (input.id) {
    const t = await get<{ created_by: string | null }>("SELECT created_by FROM email_templates WHERE id = ?", input.id);
    if (!t) throw new WorkflowError("NOT_FOUND", "Template not found.");
    if (t.created_by !== user.id && !can(user, "email.manage")) throw new WorkflowError("FORBIDDEN", "Only its author or an email manager can change this template.");
    await run("UPDATE email_templates SET name = ?, subject = ?, body = ?, shared = ?, updated_at = ? WHERE id = ?", input.name.trim(), input.subject.trim(), input.body, input.shared, now, input.id);
    return input.id;
  }
  const id = uid("etp_");
  await run("INSERT INTO email_templates (id, name, subject, body, shared, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, input.name.trim(), input.subject.trim(), input.body, input.shared, user.id, now, now);
  return id;
}

export async function deleteTemplate(user: AppUser, id: string) {
  const t = await get<{ created_by: string | null }>("SELECT created_by FROM email_templates WHERE id = ?", id);
  if (!t) return;
  if (t.created_by !== user.id && !can(user, "email.manage")) throw new WorkflowError("FORBIDDEN", "Only its author or an email manager can delete this template.");
  await run("DELETE FROM email_templates WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export type RecipientInput = { userIds?: string[]; roles?: string[]; leads?: string[]; groupIds?: string[]; emails?: string[] };
export type Recipient = { address: string; name: string | null; userId: string | null; firstName: string; role: string };

export async function resolveRecipients(input: RecipientInput): Promise<{ list: Recipient[]; invalid: string[] }> {
  const ids = new Set(input.userIds ?? []);
  const roles = (input.roles ?? []).filter((r) => (ROLES as readonly string[]).includes(r));
  if (roles.length) for (const r of await all<{ user_id: string }>(`SELECT user_id FROM role_assignments WHERE role IN (${placeholders(roles.length)})`, ...roles)) ids.add(r.user_id);
  const leads = (input.leads ?? []).filter((s) => (STAGES as readonly string[]).includes(s));
  if (leads.length) for (const r of await all<{ user_id: string }>(`SELECT user_id FROM team_leads WHERE stage IN (${placeholders(leads.length)})`, ...leads)) ids.add(r.user_id);
  const groups = input.groupIds ?? [];
  if (groups.length) for (const r of await all<{ user_id: string }>(`SELECT user_id FROM chat_members WHERE group_id IN (${placeholders(groups.length)})`, ...groups)) ids.add(r.user_id);
  const out = new Map<string, Recipient>();
  if (ids.size) {
    const list = [...ids];
    const users = await all<{ id: string; name: string; email: string }>(`SELECT id, name, email FROM users WHERE active = 1 AND id IN (${placeholders(list.length)})`, ...list);
    const roleRows = await all<{ user_id: string; role: Role }>(`SELECT user_id, role FROM role_assignments WHERE user_id IN (${placeholders(list.length)})`, ...list);
    for (const u of users) {
      const address = u.email.trim().toLowerCase();
      if (!isEmail(address)) continue;
      out.set(address, { address, name: u.name, userId: u.id, firstName: u.name.split(/\s+/)[0], role: roleRows.filter((r) => r.user_id === u.id).map((r) => ROLE_LABELS[r.role] ?? r.role).join(", ") });
    }
  }
  const invalid: string[] = [];
  for (const raw of input.emails ?? []) {
    // Either a bare address, or Name <address>.
    const v = raw.trim();
    const angled = v.match(/^"?([^"<]*?)"?\s*<([^<>\s]+)>$/);
    const address = (angled ? angled[2] : v).toLowerCase();
    if (!address || !isEmail(address) || /[<>\s]/.test(address)) {
      if (v) invalid.push(v);
      continue;
    }
    if (!out.has(address)) {
      const known = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE lower(email) = ?", address);
      const name = known?.name ?? (angled?.[1]?.trim() || null);
      out.set(address, { address, name, userId: known?.id ?? null, firstName: name?.split(/\s+/)[0] ?? "", role: "" });
    }
  }
  return { list: [...out.values()], invalid };
}

// ---------------------------------------------------------------------------
// Composing and sending
// ---------------------------------------------------------------------------

// Messages are written in Markdown; raw HTML in the text is dropped.
const md = new Marked({ gfm: true, breaks: true, renderer: { html: () => "" } });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function fillPlaceholders(text: string, r: Partial<Recipient> | null, sender: { name: string }, forHtml = false) {
  const vals: Record<string, string> = {
    name: r?.name ?? "",
    first_name: r?.firstName || r?.name?.split(/\s+/)[0] || "",
    email: r?.address ?? "",
    role: r?.role ?? "",
    sender_name: sender.name,
    date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, k: string) => {
    const v = vals[k.toLowerCase()];
    return v === undefined ? whole : forHtml ? esc(v) : v;
  });
}

export function renderEmail(body: string, r: Partial<Recipient> | null, sender: { name: string }, workspace: string) {
  const text = fillPlaceholders(body, r, sender);
  const inner = md.parse(fillPlaceholders(body, r, sender, true), { async: false }) as string;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Segoe UI,Arial,sans-serif;color:#1f2328">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;font-size:15px;line-height:1.55">${inner}</div>
<p style="max-width:640px;margin:12px auto 0;font-size:12px;color:#6b7280">Sent from ${esc(workspace)} by ${esc(sender.name)}.</p>
</body></html>`;
  return { text, html };
}

export type SendMode = "individual" | "together" | "bcc";
export type Attachment = { name: string; type: string; base64: string };
export type SendInput = { senderId?: string | null; to: RecipientInput; cc?: string[]; bcc?: string[]; subject: string; body: string; mode: SendMode; attachments?: Attachment[] };

const MAX_RECIPIENTS = 300;
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

export async function sendEmail(user: AppUser, input: SendInput, workspace: string, resendOf?: { logId: string; addresses: string[] }) {
  if (!can(user, "email.send")) throw new WorkflowError("FORBIDDEN", "You do not have permission to send email.");
  const subject = input.subject.replace(/\s+/g, " ").trim();
  if (!subject) throw new WorkflowError("VALIDATION", "Add a subject.");
  if (!input.body.trim()) throw new WorkflowError("VALIDATION", "Write the message.");
  const allowed = await sendersFor(user);
  const senderRowId = input.senderId ?? allowed[0]?.id ?? null;
  if (senderRowId && !allowed.some((s) => s.id === senderRowId)) throw new WorkflowError("FORBIDDEN", "You cannot send from that address.");
  const sender = senderRowId ? await senderRow(senderRowId) : null;

  const { list: to, invalid } = await resolveRecipients(input.to);
  if (invalid.length) throw new WorkflowError("VALIDATION", `Not valid email addresses: ${invalid.slice(0, 5).join(", ")}`);
  const cc = (await resolveRecipients({ emails: input.cc ?? [] })).list;
  const bcc = (await resolveRecipients({ emails: input.bcc ?? [] })).list;
  if (!to.length) throw new WorkflowError("VALIDATION", "Choose at least one recipient.");
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) throw new WorkflowError("VALIDATION", `Up to ${MAX_RECIPIENTS} recipients per email. Split the list.`);
  const attachments = (input.attachments ?? []).map((a) => ({ filename: a.name.slice(0, 120), content: Buffer.from(a.base64, "base64"), contentType: a.type || undefined }));
  if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_ATTACH_BYTES) throw new WorkflowError("VALIDATION", "Attachments are limited to 10 MB in total.");

  const t = await transportFor(sender);
  const senderName = sender?.display_name ?? user.name;
  const from = { name: senderName, address: t.fromAddress };
  const replyTo = sender ? sender.address : t.replyTo || undefined;
  const logId = uid("eml_");
  const now = nowIso();
  await run(
    "INSERT INTO email_log (id, sender_id, from_address, sent_by, subject, body, mode, attachments, recipient_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?)",
    logId,
    sender?.id ?? null,
    t.fromAddress,
    user.id,
    subject,
    input.body,
    input.mode,
    JSON.stringify(attachments.map((a) => ({ name: a.filename, size: a.content.length }))),
    to.length + cc.length + bcc.length,
    now,
  );
  const rows = [...to.map((r) => ({ ...r, kind: "to" })), ...cc.map((r) => ({ ...r, kind: "cc" })), ...bcc.map((r) => ({ ...r, kind: "bcc" }))];
  for (const r of rows)
    await run("INSERT INTO email_log_recipients (log_id, address, kind, name, user_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", logId, r.address, r.kind, r.name, r.userId);

  const mark = async (addresses: string[], status: "sent" | "failed", info: { messageId?: string; error?: string }) => {
    for (const a of addresses)
      await run(
        "UPDATE email_log_recipients SET status = ?, message_id = ?, error = ?, sent_at = ? WHERE log_id = ? AND address = ?",
        status,
        info.messageId ?? null,
        info.error?.slice(0, 500) ?? null,
        nowIso(),
        logId,
        a,
      );
  };
  const fmt = (r: Recipient) => (r.name ? { name: r.name, address: r.address } : r.address);
  try {
    if (input.mode === "individual") {
      // One personal email per recipient, a few at a time.
      const queue = [...to];
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          const { text, html } = renderEmail(input.body, r, { name: senderName }, workspace);
          try {
            const info = await t.transporter.sendMail({ from, to: fmt(r), replyTo, subject: fillPlaceholders(subject, r, { name: senderName }), text, html, attachments });
            await mark([r.address], "sent", { messageId: info.messageId });
          } catch (err) {
            await mark([r.address], "failed", { error: err instanceof Error ? err.message : String(err) });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } else {
      const { text, html } = renderEmail(input.body, null, { name: senderName }, workspace);
      const msg =
        input.mode === "bcc"
          ? { from, to: from, bcc: [...to, ...bcc].map(fmt), cc: cc.map(fmt), replyTo, subject: fillPlaceholders(subject, null, { name: senderName }), text, html, attachments }
          : { from, to: to.map(fmt), cc: cc.map(fmt), bcc: bcc.map(fmt), replyTo, subject: fillPlaceholders(subject, null, { name: senderName }), text, html, attachments };
      try {
        const info = await t.transporter.sendMail(msg);
        const rejected = new Set((info.rejected as (string | { address: string })[]).map((x) => (typeof x === "string" ? x : x.address).toLowerCase()));
        await mark(rows.filter((r) => !rejected.has(r.address)).map((r) => r.address), "sent", { messageId: info.messageId });
        if (rejected.size) await mark([...rejected], "failed", { error: "Rejected by the email server" });
      } catch (err) {
        await mark(rows.map((r) => r.address), "failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    t.transporter.close();
  }
  const c = await get<{ sent: number; failed: number }>(
    "SELECT SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM email_log_recipients WHERE log_id = ?",
    logId,
  );
  const sent = Number(c?.sent ?? 0);
  const failed = Number(c?.failed ?? 0);
  const status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  const firstError = failed ? (await get<{ error: string }>("SELECT error FROM email_log_recipients WHERE log_id = ? AND status = 'failed' LIMIT 1", logId))?.error : null;
  await run("UPDATE email_log SET sent_count = ?, failed_count = ?, status = ?, error = ?, finished_at = ? WHERE id = ?", sent, failed, status, firstError ?? null, nowIso(), logId);
  await audit({ actor: user }, { action: "email.sent", summary: `${user.name} emailed "${subject}" to ${rows.length} recipients (${sent} sent${failed ? `, ${failed} failed` : ""})${resendOf ? " (resend)" : ""}` });
  return { logId, sent, failed, status };
}

// ---------------------------------------------------------------------------
// Sent log
// ---------------------------------------------------------------------------

export type EmailLogRow = { id: string; from_address: string; sent_by: string | null; sent_by_name: string | null; subject: string; mode: string; recipient_count: number; sent_count: number; failed_count: number; status: string; error: string | null; created_at: string };
export type LogFilter = { q?: string | null; status?: string | null; sender?: string | null; from?: string | null; to?: string | null; mine?: boolean; sort?: "created" | "subject" | "recipients" | "failed"; dir?: "asc" | "desc" };

export async function listLog(user: AppUser, f: LogFilter): Promise<EmailLogRow[]> {
  const where: string[] = [];
  const params: string[] = [];
  // People without email.manage see only what they sent.
  if (f.mine || !can(user, "email.manage")) {
    where.push("l.sent_by = ?");
    params.push(user.id);
  }
  if (f.status) {
    where.push("l.status = ?");
    params.push(f.status);
  }
  if (f.sender) {
    where.push("l.sent_by = ?");
    params.push(f.sender);
  }
  if (f.from) {
    where.push("l.created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("l.created_at < ?");
    params.push(f.to);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(l.subject) LIKE ? OR lower(l.from_address) LIKE ? OR EXISTS (SELECT 1 FROM email_log_recipients r WHERE r.log_id = l.id AND (lower(r.address) LIKE ? OR lower(COALESCE(r.name, '')) LIKE ?)))");
    params.push(like, like, like, like);
  }
  const col = { created: "l.created_at", subject: "lower(l.subject)", recipients: "l.recipient_count", failed: "l.failed_count" }[f.sort ?? "created"];
  const rows = await all<EmailLogRow>(
    `SELECT l.id, l.from_address, l.sent_by, u.name AS sent_by_name, l.subject, l.mode, l.recipient_count, l.sent_count, l.failed_count, l.status, l.error, l.created_at
     FROM email_log l LEFT JOIN users u ON u.id = l.sent_by ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${col} ${f.dir === "asc" ? "ASC" : "DESC"} LIMIT 500`,
    ...params,
  );
  return rows.map((r) => ({ ...r, recipient_count: Number(r.recipient_count), sent_count: Number(r.sent_count), failed_count: Number(r.failed_count) }));
}

export async function getLog(user: AppUser, id: string) {
  const l = await get<EmailLogRow & { body: string; attachments: string; sender_id: string | null }>(
    "SELECT l.*, u.name AS sent_by_name FROM email_log l LEFT JOIN users u ON u.id = l.sent_by WHERE l.id = ?",
    id,
  );
  if (!l) throw new WorkflowError("NOT_FOUND", "Email not found.");
  if (l.sent_by !== user.id && !can(user, "email.manage")) throw new WorkflowError("FORBIDDEN", "You can only open emails you sent.");
  const recipients = await all<{ address: string; kind: string; name: string | null; status: string; error: string | null; sent_at: string | null }>(
    "SELECT address, kind, name, status, error, sent_at FROM email_log_recipients WHERE log_id = ? ORDER BY kind DESC, status, address",
    id,
  );
  return { ...l, attachments: JSON.parse(l.attachments) as { name: string; size: number }[], recipients };
}

// Sends the same email again to the recipients it failed for (attachments are not kept, so they are not resent).
export async function resendFailed(user: AppUser, id: string, workspace: string) {
  const l = await getLog(user, id);
  const failed = l.recipients.filter((r) => r.status === "failed");
  if (!failed.length) throw new WorkflowError("INVALID_STATE", "Nothing failed in this email.");
  return sendEmail(
    user,
    { senderId: l.sender_id, to: { emails: failed.map((r) => (r.name ? `"${r.name}" <${r.address}>` : r.address)) }, subject: l.subject, body: l.body, mode: "individual" },
    workspace,
    { logId: id, addresses: failed.map((r) => r.address) },
  );
}
