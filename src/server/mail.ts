// Phase 14: Mail, each person's company inbox inside the app. Admin (email managers) gives people a mailbox; the
// person only reads and sends from it, with no password, forwarding or filter settings of their own.
//
// - A mailbox is a sender address (email_senders) with its own sign-in and mailbox = 1. Reading is over IMAP, sending
//   through the same account (or the web API relay when the hosting blocks SMTP), with a copy kept in Sent.
// - With the cPanel API set up, Admin creates mailboxes (or takes over existing ones) from the app: the password is
//   generated and sealed, so nobody ever sees it, and the person cannot open webmail or a phone app with it.
// - Mail is private: email managers cannot open someone's mailbox unless Admin turned that on; each opening is then
//   recorded and the person is told.
// - MAIL_FAKE=1 swaps the IMAP server and sending for an in-memory store (tests and demos).

import crypto from "node:crypto";
import dns from "node:dns/promises";
import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import { all, get, nowIso, run } from "./db";
import { isEmail, probePort, senderRow, transportFor, type CheckStep, type SenderRow } from "./email";
import { notify } from "./notifications";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type StoredMail = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  cpanelUrl: string;
  cpanelUser: string;
  cpanelTokenEnc: string | null;
  domain: string;
  quotaMb: number;
  adminOpen: boolean;
};
export type MailConfig = Omit<StoredMail, "cpanelTokenEnc"> & { hasToken: boolean; fake: boolean };

const DEFAULT_MAIL: StoredMail = { imapHost: "", imapPort: 993, imapSecure: true, cpanelUrl: "", cpanelUser: "", cpanelTokenEnc: null, domain: "", quotaMb: 1024, adminOpen: false };
const fake = () => process.env.MAIL_FAKE === "1";

async function storedMail(): Promise<StoredMail> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.mail'");
  return { ...DEFAULT_MAIL, ...(row ? (JSON.parse(row.value) as Partial<StoredMail>) : {}) };
}

export async function mailConfig(): Promise<MailConfig> {
  const { cpanelTokenEnc, ...rest } = await storedMail();
  return { ...rest, hasToken: !!cpanelTokenEnc, fake: fake() };
}

const manager = (u: AppUser) => {
  if (!can(u, "email.manage")) throw new WorkflowError("FORBIDDEN", "Only email managers set up mailboxes.");
};

export async function saveMailConfig(
  user: AppUser,
  input: { imapHost: string; imapPort: number; imapSecure: boolean; cpanelUrl: string; cpanelUser: string; cpanelToken?: string | null; clearToken?: boolean; domain: string; quotaMb: number; adminOpen: boolean },
) {
  manager(user);
  const old = await storedMail();
  let url = input.cpanelUrl.trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url && !/:\d+$/.test(url.replace(/^https?:\/\//i, ""))) url = `${url}:2083`;
  const domain = input.domain.trim().toLowerCase().replace(/^@/, "");
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new WorkflowError("VALIDATION", "Enter the domain like myseed.com.et.");
  const port = Math.round(Number(input.imapPort) || 993);
  if (port < 1 || port > 65535) throw new WorkflowError("VALIDATION", "Enter a port between 1 and 65535.");
  const next: StoredMail = {
    imapHost: input.imapHost.trim().toLowerCase(),
    imapPort: port,
    imapSecure: !!input.imapSecure,
    cpanelUrl: url,
    cpanelUser: input.cpanelUser.trim(),
    cpanelTokenEnc: input.clearToken ? null : input.cpanelToken?.trim() ? await seal(input.cpanelToken.trim()) : old.cpanelTokenEnc,
    domain,
    quotaMb: Math.max(0, Math.round(Number(input.quotaMb) || 0)),
    adminOpen: !!input.adminOpen,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.mail', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit(
    { actor: user },
    {
      action: "mail.settings",
      summary: `${user.name} changed the mailbox settings${old.adminOpen !== next.adminOpen ? (next.adminOpen ? " and allowed email managers to open mailboxes" : " and stopped email managers opening mailboxes") : ""}`,
      newValue: { imapHost: next.imapHost, imapPort: next.imapPort, cpanelUrl: next.cpanelUrl, cpanelUser: next.cpanelUser, domain: next.domain, adminOpen: next.adminOpen },
    },
  );
}

// ---------------------------------------------------------------------------
// cPanel UAPI (Email module), with an API token made in cPanel, Security, Manage API Tokens
// ---------------------------------------------------------------------------

type UapiResult<T> = { status: number; errors: string[] | null; data: T };

async function cpanel<T>(fn: string, params: Record<string, string | number>): Promise<T> {
  const c = await storedMail();
  if (!c.cpanelUrl || !c.cpanelUser || !c.cpanelTokenEnc) throw new WorkflowError("INVALID_STATE", "Set up the cPanel connection first (address, user name and API token).");
  const token = await unseal(c.cpanelTokenEnc);
  if (!token) throw new WorkflowError("INVALID_STATE", "The saved cPanel token cannot be read (the encryption key changed). Paste it again.");
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  let res: Response;
  try {
    res = await fetch(`${c.cpanelUrl}/execute/Email/${fn}?${q}`, { headers: { Authorization: `cpanel ${c.cpanelUser}:${token}` }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new WorkflowError("INVALID_STATE", `cPanel could not be reached at ${c.cpanelUrl} (${e instanceof Error ? e.message : String(e)}). Check the address; the port is usually 2083.`);
  }
  if (res.status === 401 || res.status === 403) throw new WorkflowError("INVALID_STATE", "cPanel refused the user name or API token.");
  const body = (await res.json().catch(() => null)) as UapiResult<T> | null;
  if (!body) throw new WorkflowError("INVALID_STATE", `cPanel answered with something unexpected (HTTP ${res.status}).`);
  if (!body.status) throw new WorkflowError("VALIDATION", `cPanel: ${(body.errors ?? ["the request failed"]).join(" ")}`);
  return body.data;
}

// A long random password that meets cPanel's strength rules; it is sealed and never shown.
function newPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}-Aa9`;
}

export async function cpanelMailboxes(user: AppUser): Promise<{ address: string; quotaMb: number | null; usedMb: number | null; suspended: boolean }[]> {
  manager(user);
  const rows = await cpanel<{ email: string; _diskquota?: string | number; _diskused?: string | number; suspended_login?: number }[]>("list_pops_with_disk", {});
  const mb = (v: unknown) => (v === undefined || v === null || v === "" || v === "unlimited" ? null : Math.round(Number(v) / 1048576));
  return rows
    .filter((r) => r.email.includes("@"))
    .map((r) => ({ address: r.email.toLowerCase(), quotaMb: mb(r._diskquota), usedMb: mb(r._diskused), suspended: !!r.suspended_login }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

export async function checkCpanel(user: AppUser): Promise<CheckStep[]> {
  manager(user);
  const c = await storedMail();
  const steps: CheckStep[] = [];
  if (!c.cpanelUrl) return [{ label: "cPanel", status: "fail", detail: "Enter the cPanel address first." }];
  try {
    const list = await cpanelMailboxes(user);
    steps.push({ label: "cPanel API", status: "ok", detail: `Signed in to ${c.cpanelUrl} as ${c.cpanelUser}; ${list.length} mailbox${list.length === 1 ? "" : "es"} found.` });
    if (c.domain && !list.some((m) => m.address.endsWith(`@${c.domain}`))) steps.push({ label: "Domain", status: "warn", detail: `No mailbox on ${c.domain} yet. New mailboxes will be made there.` });
  } catch (e) {
    steps.push({ label: "cPanel API", status: "fail", detail: e instanceof Error ? e.message : String(e) });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// The store: IMAP, or memory for tests
// ---------------------------------------------------------------------------

export type FolderRole = "inbox" | "drafts" | "sent" | "junk" | "trash" | "archive";
type RawFolder = { path: string; name: string; specialUse?: string; delimiter: string; unread: number; total: number };
type ListRow = { uid: number; seen: boolean; flagged: boolean; answered: boolean; draft: boolean; size: number; date: string; subject: string; from: { name: string; address: string } | null; to: string[]; attachments: boolean; preview?: string };

// The first words of a message for the list (from its start: enough for the text, without loading attachments).
async function previewOf(raw: Buffer | undefined | null) {
  if (!raw) return "";
  try {
    const p = await simpleParser(raw);
    return (p.text ?? "").replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 140);
  } catch {
    return "";
  }
}
type ListOpts = { page: number; size: number; q?: string | null; only?: "unread" | "starred" | null };

interface MailStore {
  folders(): Promise<RawFolder[]>;
  list(path: string, o: ListOpts): Promise<{ total: number; rows: ListRow[] }>;
  raw(path: string, uid: number): Promise<{ raw: Buffer; seen: boolean; flagged: boolean } | null>;
  flags(path: string, uids: number[], add: string[], remove: string[]): Promise<void>;
  move(path: string, uids: number[], to: string): Promise<void>;
  expunge(path: string, uids: number[]): Promise<void>;
  append(path: string, raw: Buffer, flags: string[]): Promise<number | null>;
  create(path: string): Promise<void>;
  inbox(): Promise<{ unread: number; uidNext: number }>;
}

const ROLE_BY_USE: Record<string, FolderRole> = { "\\Inbox": "inbox", "\\Drafts": "drafts", "\\Sent": "sent", "\\Junk": "junk", "\\Trash": "trash", "\\Archive": "archive" };
const ROLE_BY_NAME: [RegExp, FolderRole][] = [
  [/^inbox$/i, "inbox"],
  [/^drafts?$/i, "drafts"],
  [/^sent( items| messages| mail)?$/i, "sent"],
  [/^(junk|spam)( e-?mail)?$/i, "junk"],
  [/^(trash|deleted( items| messages)?|bin)$/i, "trash"],
  [/^archives?$/i, "archive"],
];
function roleOf(f: { path: string; name: string; specialUse?: string }): FolderRole | null {
  if (f.path.toUpperCase() === "INBOX") return "inbox";
  if (f.specialUse && ROLE_BY_USE[f.specialUse]) return ROLE_BY_USE[f.specialUse]!;
  return ROLE_BY_NAME.find(([re]) => re.test(f.name))?.[1] ?? null;
}

function hasAttachment(s: MessageStructureObject | undefined): boolean {
  if (!s) return false;
  if (s.disposition === "attachment") return true;
  if (s.disposition === "inline" && !/^text\//.test(s.type) && s.dispositionParameters?.filename) return true;
  return (s.childNodes ?? []).some(hasAttachment);
}
const addr = (a?: { name?: string; address?: string }) => (a?.address ? { name: a.name ?? "", address: a.address.toLowerCase() } : null);

// One open IMAP connection per mailbox, reused for two minutes; commands for one mailbox run one at a time.
type Conn = { client: ImapFlow; key: string; timer: NodeJS.Timeout | null; queue: Promise<unknown> };
const g = globalThis as unknown as { __mailConns?: Map<string, Conn>; __mailMem?: Map<string, MemBox> };
const conns = (g.__mailConns ??= new Map());

class ImapStore implements MailStore {
  constructor(
    private id: string,
    private opts: { host: string; port: number; secure: boolean; user: string; pass: string },
  ) {}
  private async conn(): Promise<Conn> {
    const key = `${this.opts.host}|${this.opts.user}|${crypto.createHash("sha256").update(this.opts.pass).digest("hex").slice(0, 12)}`;
    let c = conns.get(this.id);
    if (c && (c.key !== key || !c.client.usable)) {
      c.client.close();
      conns.delete(this.id);
      c = undefined;
    }
    if (!c) {
      const client = new ImapFlow({ host: this.opts.host, port: this.opts.port, secure: this.opts.secure, auth: { user: this.opts.user, pass: this.opts.pass }, logger: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 });
      client.on("error", () => conns.delete(this.id));
      try {
        await client.connect();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const auth = /auth|login|credentials/i.test(msg) || (e as { authenticationFailed?: boolean }).authenticationFailed;
        throw new WorkflowError("INVALID_STATE", auth ? "The mail server refused this mailbox's sign-in. Ask an email manager to set a new password for it." : `The mail server (${this.opts.host}:${this.opts.port}) could not be reached: ${msg}`);
      }
      c = { client, key, timer: null, queue: Promise.resolve() };
      conns.set(this.id, c);
    }
    if (c.timer) clearTimeout(c.timer);
    const me = c;
    c.timer = setTimeout(() => {
      conns.delete(this.id);
      me.client.logout().catch(() => me.client.close());
    }, 120_000);
    c.timer.unref?.();
    return c;
  }
  private async run<T>(path: string | null, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    const c = await this.conn();
    const job = c.queue.then(async () => {
      if (!path) return fn(c.client);
      const lock = await c.client.getMailboxLock(path);
      try {
        return await fn(c.client);
      } finally {
        lock.release();
      }
    });
    c.queue = job.catch(() => null);
    return job;
  }
  folders() {
    return this.run(null, async (c) => {
      const list = await c.list({ statusQuery: { messages: true, unseen: true } });
      return list
        .filter((f) => !f.flags.has("\\Noselect") && !f.flags.has("\\NonExistent"))
        .map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse, delimiter: f.delimiter, unread: f.status?.unseen ?? 0, total: f.status?.messages ?? 0 }));
    });
  }
  list(path: string, o: ListOpts) {
    return this.run(path, async (c) => {
      const box = c.mailbox && typeof c.mailbox === "object" ? c.mailbox : null;
      const exists = box?.exists ?? 0;
      if (!exists) return { total: 0, rows: [] };
      let uids: number[] | null = null;
      if (o.q?.trim() || o.only) {
        const q = o.q?.trim();
        const query = { ...(q ? { or: [{ subject: q }, { from: q }, { to: q }, { body: q }] } : {}), ...(o.only === "unread" ? { seen: false } : o.only === "starred" ? { flagged: true } : {}) };
        uids = ((await c.search(query, { uid: true })) || []).sort((a, b) => b - a);
      }
      const total = uids ? uids.length : exists;
      const from = o.page * o.size;
      let fetched: FetchMessageObject[];
      const q = { uid: true, flags: true, envelope: true, size: true, internalDate: true, bodyStructure: true, source: { start: 0, maxLength: 6000 } } as const;
      if (uids) {
        const slice = uids.slice(from, from + o.size);
        fetched = slice.length ? await c.fetchAll(slice.join(","), q, { uid: true }) : [];
      } else {
        const hi = exists - from;
        if (hi < 1) return { total, rows: [] };
        const lo = Math.max(1, hi - o.size + 1);
        fetched = await c.fetchAll(`${lo}:${hi}`, q);
      }
      const previews = await Promise.all(fetched.map((m) => previewOf(m.source)));
      const rows = fetched
        .map((m, i) => ({
          preview: previews[i] ?? "",
          uid: m.uid,
          seen: !!m.flags?.has("\\Seen"),
          flagged: !!m.flags?.has("\\Flagged"),
          answered: !!m.flags?.has("\\Answered"),
          draft: !!m.flags?.has("\\Draft"),
          size: m.size ?? 0,
          date: new Date(m.envelope?.date ?? m.internalDate ?? Date.now()).toISOString(),
          subject: m.envelope?.subject ?? "",
          from: addr(m.envelope?.from?.[0]),
          to: (m.envelope?.to ?? []).map((a) => a.name || a.address || "").filter(Boolean),
          attachments: hasAttachment(m.bodyStructure),
        }))
        .sort((a, b) => b.uid - a.uid);
      return { total, rows };
    });
  }
  raw(path: string, uid: number) {
    return this.run(path, async (c) => {
      const m = await c.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
      return m && m.source ? { raw: m.source, seen: !!m.flags?.has("\\Seen"), flagged: !!m.flags?.has("\\Flagged") } : null;
    });
  }
  flags(path: string, uids: number[], add: string[], remove: string[]) {
    return this.run(path, async (c) => {
      if (add.length) await c.messageFlagsAdd(uids.join(","), add, { uid: true });
      if (remove.length) await c.messageFlagsRemove(uids.join(","), remove, { uid: true });
    });
  }
  move(path: string, uids: number[], to: string) {
    return this.run(path, async (c) => void (await c.messageMove(uids.join(","), to, { uid: true })));
  }
  expunge(path: string, uids: number[]) {
    return this.run(path, async (c) => void (await c.messageDelete(uids.join(","), { uid: true })));
  }
  append(path: string, raw: Buffer, flags: string[]) {
    return this.run(null, async (c) => {
      const r = await c.append(path, raw, flags);
      return r ? (r.uid ?? null) : null;
    });
  }
  create(path: string) {
    return this.run(null, async (c) => void (await c.mailboxCreate(path)));
  }
  inbox() {
    return this.run(null, async (c) => {
      const s = await c.status("INBOX", { unseen: true, uidNext: true });
      return { unread: s ? (s.unseen ?? 0) : 0, uidNext: s ? (s.uidNext ?? 0) : 0 };
    });
  }
}

// In memory (MAIL_FAKE=1): folders like cPanel's (INBOX.Sent and so on), a few starting messages, and mail sent
// between mailboxes in the app is delivered to the other inbox.
type MemMsg = { uid: number; raw: Buffer; flags: Set<string>; date: string; parsed?: ParsedMail };
type MemFolder = { path: string; name: string; specialUse?: string; uidNext: number; msgs: MemMsg[] };
type MemBox = Map<string, MemFolder>;
const mem = (g.__mailMem ??= new Map());

function seedRaw(o: { from: string; to: string; subject: string; text?: string; html?: string; date: Date; attachment?: { filename: string; content: string } }) {
  return new MailComposer({ from: o.from, to: o.to, subject: o.subject, text: o.text, html: o.html, date: o.date, attachments: o.attachment ? [o.attachment] : undefined }).compile().build();
}
async function memBox(address: string): Promise<MemBox> {
  let b = mem.get(address);
  if (b) return b;
  b = new Map();
  const mk = (path: string, name: string, specialUse?: string) => b!.set(path, { path, name, specialUse, uidNext: 1, msgs: [] });
  mk("INBOX", "INBOX");
  mk("INBOX.Drafts", "Drafts", "\\Drafts");
  mk("INBOX.Sent", "Sent", "\\Sent");
  mk("INBOX.Junk", "Junk", "\\Junk");
  mk("INBOX.Trash", "Trash", "\\Trash");
  mem.set(address, b);
  const now = Date.now();
  const put = async (path: string, raw: Buffer, flags: string[] = []) => {
    const f = b!.get(path)!;
    f.msgs.push({ uid: f.uidNext++, raw, flags: new Set(flags), date: new Date().toISOString() });
  };
  await put("INBOX", await seedRaw({ from: "Selam Tesfaye <selam@partner.example>", to: address, subject: "Grade 9 physics videos: schedule", text: "Hello,\n\nCan we meet on Tuesday about the Grade 9 physics videos?\n\nSelam", date: new Date(now - 3 * 36e5) }), ["\\Seen"]);
  await put(
    "INBOX",
    await seedRaw({
      from: "Myseed App <noreply@myseed.example>",
      to: address,
      subject: "Monthly report",
      html: '<h1>Monthly report</h1><p>Downloads went up this month.</p><img src="https://tracker.example/pixel.png" alt="logo"><script>alert(1)</script><p><a href="https://myseed.example/report">Open the report</a></p>',
      date: new Date(now - 2 * 36e5),
      attachment: { filename: "report.csv", content: "month,downloads\nOctober,1200\n" },
    }),
  );
  await put("INBOX", await seedRaw({ from: "Abebe Kebede <abebe@school.example>", to: address, subject: "Question about the maths lessons", text: "Good morning,\n\nWhere can students find the Grade 10 maths lessons offline?\n\nThank you,\nAbebe", date: new Date(now - 36e5) }));
  await put("INBOX.Junk", await seedRaw({ from: "Prize <win@spam.example>", to: address, subject: "You won a phone", text: "Click here.", date: new Date(now - 5 * 36e5) }));
  return b;
}
async function memParsed(m: MemMsg) {
  return (m.parsed ??= await simpleParser(m.raw));
}

class MemStore implements MailStore {
  constructor(private address: string) {}
  private async folder(path: string) {
    const f = (await memBox(this.address)).get(path);
    if (!f) throw new WorkflowError("NOT_FOUND", "That folder does not exist.");
    return f;
  }
  async folders() {
    return [...(await memBox(this.address)).values()].map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse, delimiter: ".", unread: f.msgs.filter((m) => !m.flags.has("\\Seen")).length, total: f.msgs.length }));
  }
  async list(path: string, o: ListOpts) {
    const f = await this.folder(path);
    let msgs = [...f.msgs].sort((a, b) => b.uid - a.uid);
    if (o.only === "unread") msgs = msgs.filter((m) => !m.flags.has("\\Seen"));
    if (o.only === "starred") msgs = msgs.filter((m) => m.flags.has("\\Flagged"));
    const q = o.q?.trim().toLowerCase();
    if (q) {
      const keep: MemMsg[] = [];
      for (const m of msgs) {
        const p = await memParsed(m);
        if ([p.subject, p.from?.text, (p.to as AddressObject | undefined)?.text, p.text].some((v) => v?.toLowerCase().includes(q))) keep.push(m);
      }
      msgs = keep;
    }
    const rows: ListRow[] = [];
    for (const m of msgs.slice(o.page * o.size, o.page * o.size + o.size)) {
      const p = await memParsed(m);
      rows.push({
        uid: m.uid,
        seen: m.flags.has("\\Seen"),
        flagged: m.flags.has("\\Flagged"),
        answered: m.flags.has("\\Answered"),
        draft: m.flags.has("\\Draft"),
        size: m.raw.length,
        date: (p.date ?? new Date(m.date)).toISOString(),
        subject: p.subject ?? "",
        from: addr(p.from?.value[0]),
        to: ((p.to as AddressObject | undefined)?.value ?? []).map((a) => a.name || a.address || ""),
        attachments: p.attachments.some((a) => a.contentDisposition === "attachment"),
        preview: (p.text ?? "").replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 140),
      });
    }
    return { total: msgs.length, rows };
  }
  async raw(path: string, uid: number) {
    const m = (await this.folder(path)).msgs.find((x) => x.uid === uid);
    return m ? { raw: m.raw, seen: m.flags.has("\\Seen"), flagged: m.flags.has("\\Flagged") } : null;
  }
  async flags(path: string, uids: number[], add: string[], remove: string[]) {
    for (const m of (await this.folder(path)).msgs)
      if (uids.includes(m.uid)) {
        add.forEach((f) => m.flags.add(f));
        remove.forEach((f) => m.flags.delete(f));
      }
  }
  async move(path: string, uids: number[], to: string) {
    const from = await this.folder(path);
    const dest = await this.folder(to);
    for (const m of from.msgs.filter((x) => uids.includes(x.uid))) dest.msgs.push({ ...m, uid: dest.uidNext++ });
    from.msgs = from.msgs.filter((x) => !uids.includes(x.uid));
  }
  async expunge(path: string, uids: number[]) {
    const f = await this.folder(path);
    f.msgs = f.msgs.filter((x) => !uids.includes(x.uid));
  }
  async append(path: string, raw: Buffer, flags: string[]) {
    const f = await this.folder(path);
    const uid = f.uidNext++;
    f.msgs.push({ uid, raw, flags: new Set(flags), date: new Date().toISOString() });
    return uid;
  }
  async create(path: string) {
    const b = await memBox(this.address);
    if (!b.has(path)) b.set(path, { path, name: path.split(".").at(-1)!, uidNext: 1, msgs: [] });
  }
  async inbox() {
    const f = await this.folder("INBOX");
    return { unread: f.msgs.filter((m) => !m.flags.has("\\Seen")).length, uidNext: f.uidNext };
  }
}

async function storeFor(row: SenderRow): Promise<MailStore> {
  if (fake()) return new MemStore(row.address);
  if (!row.smtp_user || !row.smtp_pass_enc) throw new WorkflowError("INVALID_STATE", "This mailbox has no sign-in saved. An email manager sets one in Email, Settings, Mailboxes.");
  const pass = await unseal(row.smtp_pass_enc);
  if (pass === null) throw new WorkflowError("INVALID_STATE", "The mailbox password cannot be read (the encryption key changed). An email manager sets a new one.");
  const c = await storedMail();
  const host = c.imapHost || `mail.${row.address.split("@")[1]}`;
  return new ImapStore(row.id, { host, port: c.imapPort, secure: c.imapSecure, user: row.smtp_user, pass });
}

// ---------------------------------------------------------------------------
// Who may open which mailbox
// ---------------------------------------------------------------------------

export async function myMailbox(userId: string) {
  return (await get<SenderRow>("SELECT * FROM email_senders WHERE user_id = ? AND mailbox = 1 AND active = 1", userId)) ?? null;
}

type Box = { row: SenderRow; store: MailStore; other: boolean };
async function open(user: AppUser, boxId?: string | null): Promise<Box> {
  if (!boxId) {
    const row = await myMailbox(user.id);
    if (!row) throw new WorkflowError("NOT_FOUND", "You do not have a mailbox in the app yet. Ask an email manager.");
    return { row, store: await storeFor(row), other: false };
  }
  const row = await senderRow(boxId);
  if (row.user_id === user.id && row.mailbox && row.active) return { row, store: await storeFor(row), other: false };
  if (!can(user, "email.manage") || !(await storedMail()).adminOpen || !row.mailbox) throw new WorkflowError("FORBIDDEN", "Mail is private: you cannot open someone else's mailbox.");
  return { row, store: await storeFor(row), other: true };
}

// An email manager opening someone's mailbox is recorded each time, and the person is told once a day.
async function recordOpening(user: AppUser, row: SenderRow) {
  await audit({ actor: user }, { action: "mail.open_other", summary: `${user.name} opened the mailbox ${row.address}` });
  if (row.user_id) await notify([row.user_id], { type: "mail", title: `${user.name} opened your mailbox`, body: `Email managers may open mailboxes in this workspace. ${user.name} opened ${row.address}.`, link: "/email", dedupeKey: `mail-open:${row.id}:${user.id}:${nowIso().slice(0, 10)}` }, nowIso());
}

const readOnly = (b: Box) => {
  if (b.other) throw new WorkflowError("FORBIDDEN", "Someone else's mailbox opens read-only.");
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type MailFolder = { path: string; name: string; role: FolderRole | null; unread: number; total: number };
const ORDER: FolderRole[] = ["inbox", "drafts", "sent", "archive", "junk", "trash"];
const LABEL: Record<FolderRole, string> = { inbox: "Inbox", drafts: "Drafts", sent: "Sent", archive: "Archive", junk: "Junk", trash: "Trash" };

async function setState(id: string, patch: { unread?: number; lastUid?: number; error?: string | null }) {
  await run(
    `INSERT INTO mail_state (sender_id, unread, last_uid, checked_at, error) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (sender_id) DO UPDATE SET unread = COALESCE(?, mail_state.unread), last_uid = COALESCE(?, mail_state.last_uid), checked_at = excluded.checked_at, error = excluded.error`,
    id,
    patch.unread ?? 0,
    patch.lastUid ?? 0,
    nowIso(),
    patch.error ?? null,
    patch.unread ?? null,
    patch.lastUid ?? null,
  );
}

async function foldersOf(b: Box): Promise<MailFolder[]> {
  const raw = await b.store.folders();
  const seen = new Set<FolderRole>();
  const out: MailFolder[] = [];
  for (const f of raw) {
    let role = roleOf(f);
    if (role && seen.has(role)) role = null;
    if (role) seen.add(role);
    out.push({ path: f.path, name: role ? LABEL[role] : f.name, role, unread: f.unread, total: f.total });
  }
  out.sort((a, b2) => (a.role ? ORDER.indexOf(a.role) : 99) - (b2.role ? ORDER.indexOf(b2.role) : 99) || a.name.localeCompare(b2.name));
  if (!b.other) await setState(b.row.id, { unread: out.find((f) => f.role === "inbox")?.unread ?? 0, error: null });
  return out;
}

export async function mailHome(user: AppUser, boxId?: string | null) {
  const b = await open(user, boxId);
  if (b.other) await recordOpening(user, b.row);
  return { box: { id: b.row.id, address: b.row.address, name: b.row.display_name, other: b.other }, folders: await foldersOf(b) };
}

export async function mailFolders(user: AppUser, boxId?: string | null) {
  return foldersOf(await open(user, boxId));
}

const PAGE = 50;
export async function mailList(user: AppUser, input: { box?: string | null; folder: string; page?: number; q?: string | null; only?: "unread" | "starred" | null }) {
  const b = await open(user, input.box);
  const page = Math.max(0, Math.floor(input.page ?? 0));
  const r = await b.store.list(input.folder, { page, size: PAGE, q: input.q?.slice(0, 200) ?? null, only: input.only ?? null });
  return { ...r, page, pages: Math.max(1, Math.ceil(r.total / PAGE)) };
}

export type MailAddress = { name: string; address: string };
export type MailMessage = {
  uid: number;
  folder: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  replyTo: MailAddress[];
  date: string;
  messageId: string | null;
  references: string[];
  flagged: boolean;
  text: string;
  // A full page for a sandboxed frame: no scripts, no outside pictures unless asked.
  html: string | null;
  remoteImages: boolean;
  attachments: { index: number; name: string; type: string; size: number }[];
};

const list = (a: AddressObject | AddressObject[] | undefined): MailAddress[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).flatMap((v) => (v.address ? [{ name: v.name ?? "", address: v.address.toLowerCase() }] : []));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The message's HTML made safe to show: scripts, frames, forms and event handlers removed (the frame also runs with
// no scripts), inline pictures from the message itself, and outside pictures blocked by the page's rules until
// "Show images". Links open in a new tab.
export function safeHtml(html: string, inline: Map<string, string>, images: boolean) {
  let h = html
    .replace(/<\s*(script|iframe|object|embed|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|iframe|object|embed|frame|frameset|form|base|meta|link|noscript|template)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
  h = h.replace(/cid:([^"'\s)>]+)/gi, (m, id: string) => inline.get(id.replace(/^<|>$/g, "")) ?? m);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${images ? " https: http:" : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:8px;color:#111;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${h}</body></html>`;
}

function textToHtml(text: string) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noreferrer">$1</a>').replace(/\n/g, "<br>");
}

export async function mailMessage(user: AppUser, input: { box?: string | null; folder: string; uid: number; images?: boolean }): Promise<MailMessage> {
  const b = await open(user, input.box);
  const m = await b.store.raw(input.folder, input.uid);
  if (!m) throw new WorkflowError("NOT_FOUND", "That message is no longer there.");
  if (!m.seen && !b.other) {
    await b.store.flags(input.folder, [input.uid], ["\\Seen"], []);
    // The sidebar's count follows at once.
    if (input.folder.toUpperCase() === "INBOX") await run("UPDATE mail_state SET unread = CASE WHEN unread > 0 THEN unread - 1 ELSE 0 END WHERE sender_id = ?", b.row.id);
  }
  const p = await simpleParser(m.raw);
  const inline = new Map<string, string>();
  for (const a of p.attachments) if (a.cid && a.size < 2_000_000 && /^image\//.test(a.contentType)) inline.set(a.cid, `data:${a.contentType};base64,${a.content.toString("base64")}`);
  const body = typeof p.html === "string" && p.html ? p.html : null;
  const remoteImages = !!body && /<img[^>]+src\s*=\s*["']?\s*https?:/i.test(body);
  return {
    uid: input.uid,
    folder: input.folder,
    subject: p.subject ?? "",
    from: list(p.from)[0] ?? null,
    to: list(p.to),
    cc: list(p.cc),
    replyTo: list(p.replyTo),
    date: (p.date ?? new Date()).toISOString(),
    messageId: p.messageId ?? null,
    references: Array.isArray(p.references) ? p.references : p.references ? [p.references] : [],
    flagged: m.flagged,
    text: p.text ?? "",
    html: body ? safeHtml(body, inline, !!input.images) : p.text ? safeHtml(textToHtml(p.text), inline, false) : null,
    remoteImages,
    attachments: p.attachments.map((a, index) => ({ index, name: a.filename || `attachment-${index + 1}`, type: a.contentType, size: a.size })).filter((a) => !p.attachments[a.index]!.related),
  };
}

export async function mailAttachment(user: AppUser, input: { box?: string | null; folder: string; uid: number; index: number }) {
  const b = await open(user, input.box);
  const m = await b.store.raw(input.folder, input.uid);
  if (!m) throw new WorkflowError("NOT_FOUND", "That message is no longer there.");
  const a = (await simpleParser(m.raw)).attachments[input.index];
  if (!a) throw new WorkflowError("NOT_FOUND", "That attachment is not there.");
  return { name: a.filename || `attachment-${input.index + 1}`, type: a.contentType, data: a.content };
}

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

export type MailAction = "read" | "unread" | "star" | "unstar" | "archive" | "junk" | "notjunk" | "trash" | "delete" | "restore" | "move";

async function folderFor(b: Box, role: FolderRole): Promise<string> {
  const f = (await foldersOf(b)).find((x) => x.role === role);
  if (f) return f.path;
  // Missing (cPanel has no Archive at first): made next to the others, as INBOX.Archive or Archive.
  const raw = await b.store.folders();
  const nested = raw.some((x) => x.path.toUpperCase().startsWith("INBOX."));
  const path = nested ? `INBOX.${LABEL[role]}` : LABEL[role];
  await b.store.create(path);
  return path;
}

export async function mailAct(user: AppUser, input: { box?: string | null; folder: string; uids: number[]; action: MailAction; to?: string | null }) {
  const b = await open(user, input.box);
  readOnly(b);
  const uids = [...new Set(input.uids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!uids.length) return { moved: 0 };
  const s = b.store;
  switch (input.action) {
    case "read":
      await s.flags(input.folder, uids, ["\\Seen"], []);
      break;
    case "unread":
      await s.flags(input.folder, uids, [], ["\\Seen"]);
      break;
    case "star":
      await s.flags(input.folder, uids, ["\\Flagged"], []);
      break;
    case "unstar":
      await s.flags(input.folder, uids, [], ["\\Flagged"]);
      break;
    case "archive":
      await s.move(input.folder, uids, await folderFor(b, "archive"));
      break;
    case "junk":
      await s.move(input.folder, uids, await folderFor(b, "junk"));
      break;
    case "notjunk":
    case "restore":
      await s.move(input.folder, uids, "INBOX");
      break;
    case "trash": {
      const trash = await folderFor(b, "trash");
      if (trash === input.folder) await s.expunge(input.folder, uids);
      else await s.move(input.folder, uids, trash);
      break;
    }
    case "delete":
      await s.expunge(input.folder, uids);
      break;
    case "move": {
      if (!input.to) throw new WorkflowError("VALIDATION", "Choose a folder.");
      if (!(await s.folders()).some((f) => f.path === input.to)) throw new WorkflowError("NOT_FOUND", "That folder does not exist.");
      await s.move(input.folder, uids, input.to);
      break;
    }
    default:
      throw new WorkflowError("VALIDATION", "Unknown action.");
  }
  return { moved: uids.length };
}

// ---------------------------------------------------------------------------
// Sending and drafts
// ---------------------------------------------------------------------------

export type MailCompose = {
  box?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: { name: string; type: string; base64: string }[];
  // The draft this was written from, removed once sent or saved again.
  draftUid?: number | null;
  // The message replied to, marked as answered.
  replied?: { folder: string; uid: number } | null;
  // The message forwarded, whose attachments go along.
  forward?: { folder: string; uid: number } | null;
};

async function withForwarded(b: Box, input: MailCompose): Promise<MailCompose> {
  if (!input.forward) return input;
  const m = await b.store.raw(input.forward.folder, input.forward.uid);
  if (!m) return input;
  const extra = (await simpleParser(m.raw)).attachments.filter((a) => !a.related).map((a) => ({ name: a.filename || "attachment", type: a.contentType, base64: a.content.toString("base64") }));
  return { ...input, attachments: [...(input.attachments ?? []), ...extra], forward: null };
}

const MAX_BYTES = 20 * 1024 * 1024;

function cleanList(v: string[] | undefined, label: string) {
  const out = [...new Set((v ?? []).flatMap((x) => x.split(/[,;\s]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const bad = out.filter((x) => !isEmail(x));
  if (bad.length) throw new WorkflowError("VALIDATION", `${label}: ${bad.join(", ")} ${bad.length === 1 ? "is not an email address" : "are not email addresses"}.`);
  return out;
}

function mailOptions(row: SenderRow, input: MailCompose, messageId: string, forDraft = false) {
  const to = cleanList(input.to, "To");
  const cc = cleanList(input.cc, "Cc");
  const bcc = cleanList(input.bcc, "Bcc");
  if (!forDraft && !to.length && !cc.length && !bcc.length) throw new WorkflowError("VALIDATION", "Add at least one recipient.");
  const subject = input.subject.trim().slice(0, 500);
  const attachments = (input.attachments ?? []).map((a) => ({ filename: a.name.slice(0, 200), contentType: a.type || "application/octet-stream", content: Buffer.from(a.base64, "base64") }));
  if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_BYTES) throw new WorkflowError("VALIDATION", "Attachments are limited to 20 MB in total.");
  const refs = [...(input.references ?? []), ...(input.inReplyTo ? [input.inReplyTo] : [])].filter((r, i, a) => r && a.indexOf(r) === i).slice(-20);
  return {
    from: { name: row.display_name ?? "", address: row.address },
    to,
    cc,
    bcc,
    subject,
    text: input.text,
    html: `<div style="font:14px/1.5 system-ui,sans-serif">${textToHtml(input.text)}</div>`,
    attachments,
    messageId,
    date: new Date(),
    inReplyTo: input.inReplyTo || undefined,
    references: refs.length ? refs : undefined,
  };
}

async function build(o: ReturnType<typeof mailOptions>, keepBcc: boolean) {
  const c = new MailComposer(o);
  if (keepBcc) (c as unknown as { mail: { keepBcc?: boolean } }).mail.keepBcc = true;
  return c.compile().build();
}

export async function mailSend(user: AppUser, input: MailCompose) {
  const b = await open(user, input.box);
  readOnly(b);
  const domain = b.row.address.split("@")[1];
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const o = mailOptions(b.row, await withForwarded(b, input), messageId);
  if (fake()) {
    // Delivered straight to the other mailboxes in the app.
    for (const rcpt of [...o.to, ...o.cc, ...o.bcc]) {
      const target = await get<SenderRow>("SELECT * FROM email_senders WHERE address = ? AND mailbox = 1", rcpt);
      if (target) await new MemStore(target.address).append("INBOX", await build(o, false), []);
    }
  } else {
    const t = await transportFor(b.row);
    await t.transporter.sendMail(o);
  }
  // A copy in Sent (cPanel does not keep one for mail sent from outside webmail), with Bcc kept for the sender.
  const sent = await folderFor(b, "sent");
  await b.store.append(sent, await build(o, true), ["\\Seen"]).catch(() => null);
  if (input.draftUid) await b.store.expunge(await folderFor(b, "drafts"), [input.draftUid]).catch(() => null);
  if (input.replied) await b.store.flags(input.replied.folder, [input.replied.uid], ["\\Answered"], []).catch(() => null);
  // Not added to the sent log: mailbox mail is private, and the log is read by email managers.
  return { messageId };
}

export async function mailSaveDraft(user: AppUser, input: MailCompose) {
  const b = await open(user, input.box);
  readOnly(b);
  const o = mailOptions(b.row, await withForwarded(b, input), `<${crypto.randomUUID()}@${b.row.address.split("@")[1]}>`, true);
  const drafts = await folderFor(b, "drafts");
  const uid = await b.store.append(drafts, await build(o, true), ["\\Draft", "\\Seen"]);
  if (input.draftUid) await b.store.expunge(drafts, [input.draftUid]).catch(() => null);
  return { uid, folder: drafts };
}

// A draft opened again: its fields for the compose window.
export async function mailDraft(user: AppUser, input: { box?: string | null; folder: string; uid: number }) {
  const b = await open(user, input.box);
  readOnly(b);
  const m = await b.store.raw(input.folder, input.uid);
  if (!m) throw new WorkflowError("NOT_FOUND", "That draft is no longer there.");
  const p = await simpleParser(m.raw);
  return {
    to: list(p.to).map((a) => a.address),
    cc: list(p.cc).map((a) => a.address),
    bcc: list(p.bcc).map((a) => a.address),
    subject: p.subject ?? "",
    text: p.text ?? "",
    inReplyTo: p.inReplyTo ?? null,
    references: Array.isArray(p.references) ? p.references : p.references ? [p.references] : [],
    attachments: p.attachments.map((a) => ({ name: a.filename || "attachment", type: a.contentType, base64: a.content.toString("base64") })),
  };
}

// ---------------------------------------------------------------------------
// Admin: who has a mailbox
// ---------------------------------------------------------------------------

export type MailboxRow = { id: string; address: string; userId: string | null; userName: string | null; managed: string | null; mailbox: boolean; active: boolean; unread: number; checkedAt: string | null; error: string | null };

export async function mailboxes(user: AppUser): Promise<MailboxRow[]> {
  manager(user);
  const rows = await all<SenderRow & { user_name: string | null; unread: number | null; checked_at: string | null; error: string | null }>(
    `SELECT s.*, u.name AS user_name, m.unread, m.checked_at, m.error FROM email_senders s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN mail_state m ON m.sender_id = s.id
     WHERE s.mailbox = 1 OR (s.user_id IS NOT NULL AND s.smtp_pass_enc IS NOT NULL) ORDER BY u.name, s.address`,
  );
  return rows.map((r) => ({ id: r.id, address: r.address, userId: r.user_id, userName: r.user_name, managed: r.managed ?? null, mailbox: !!r.mailbox, active: !!r.active, unread: Number(r.unread ?? 0), checkedAt: r.checked_at, error: r.error }));
}

async function upsertMailbox(user: AppUser, input: { userId: string; address: string; password: string; managed: "cpanel" | "manual"; displayName?: string | null }) {
  const person = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ?", input.userId);
  if (!person) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const own = await get<{ id: string; address: string }>("SELECT id, address FROM email_senders WHERE user_id = ? AND active = 1", input.userId);
  const same = await get<{ id: string; user_id: string | null }>("SELECT id, user_id FROM email_senders WHERE address = ?", input.address);
  if (same && same.user_id && same.user_id !== input.userId) throw new WorkflowError("VALIDATION", `${input.address} already belongs to someone else.`);
  if (own && own.address !== input.address) throw new WorkflowError("VALIDATION", `${person.name} already has ${own.address}. Remove it first, or give them that mailbox.`);
  const passEnc = await seal(input.password);
  const now = nowIso();
  const id = same?.id ?? own?.id;
  if (id)
    await run(
      "UPDATE email_senders SET user_id = ?, smtp_user = ?, smtp_pass_enc = ?, mailbox = 1, managed = ?, active = 1, display_name = COALESCE(display_name, ?), updated_at = ? WHERE id = ?",
      input.userId,
      input.address,
      passEnc,
      input.managed,
      input.displayName ?? person.name,
      now,
      id,
    );
  else
    await run(
      "INSERT INTO email_senders (id, address, display_name, user_id, smtp_user, smtp_pass_enc, is_default, active, mailbox, managed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?, ?)",
      `snd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      input.address,
      input.displayName ?? person.name,
      input.userId,
      input.address,
      passEnc,
      input.managed,
      now,
      now,
    );
  conns.get(id ?? "")?.client.close();
  return (await get<{ id: string }>("SELECT id FROM email_senders WHERE address = ?", input.address))!.id;
}

// Makes a new mailbox at cPanel for a person, with a password nobody sees.
export async function createMailbox(user: AppUser, input: { userId: string; local: string; displayName?: string | null }) {
  manager(user);
  const c = await storedMail();
  if (!c.domain) throw new WorkflowError("VALIDATION", "Set the email domain first.");
  const local = input.local.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local)) throw new WorkflowError("VALIDATION", "Use letters, numbers, dots, dashes or underscores before the @.");
  const address = `${local}@${c.domain}`;
  if (await get("SELECT 1 AS x FROM email_senders WHERE address = ? AND user_id IS NOT NULL AND user_id <> ?", address, input.userId)) throw new WorkflowError("VALIDATION", `${address} already belongs to someone else.`);
  const password = newPassword();
  await cpanel("add_pop", { email: local, domain: c.domain, password, quota: c.quotaMb, skip_update_db: 0 });
  const id = await upsertMailbox(user, { userId: input.userId, address, password, managed: "cpanel", displayName: input.displayName });
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} created the mailbox ${address} at cPanel` });
  return { id, address };
}

// An existing cPanel mailbox given to a person: its password is changed to a new one nobody sees, so phones and
// webmail signed in with the old one stop working.
export async function takeOverMailbox(user: AppUser, input: { userId: string; address: string }) {
  manager(user);
  const address = input.address.trim().toLowerCase();
  if (!isEmail(address)) throw new WorkflowError("VALIDATION", "Enter a valid email address.");
  const [local, domain] = address.split("@") as [string, string];
  const password = newPassword();
  await cpanel("passwd_pop", { email: local, domain, password });
  const id = await upsertMailbox(user, { userId: input.userId, address, password, managed: "cpanel" });
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} gave the mailbox ${address} to a person and changed its password at cPanel` });
  return { id, address };
}

export async function setMailboxPassword(user: AppUser, input: { id: string; password: string }) {
  manager(user);
  const row = await senderRow(input.id);
  const pass = input.password.trim();
  if (!pass) throw new WorkflowError("VALIDATION", "Enter the mailbox password.");
  const passEnc = await seal(pass);
  await run("UPDATE email_senders SET smtp_user = ?, smtp_pass_enc = ?, managed = 'manual', updated_at = ? WHERE id = ?", row.address, passEnc, nowIso(), row.id);
  await setState(row.id, { error: null });
  conns.get(row.id)?.client.close();
  conns.delete(row.id);
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} set the password for ${row.address}` });
  return { id: row.id, address: row.address };
}

export async function setMyMailboxPassword(user: AppUser, input: { password: string; boxId?: string | null }) {
  const row = input.boxId ? await senderRow(input.boxId) : await myMailbox(user.id);
  if (!row) throw new WorkflowError("NOT_FOUND", "You do not have a mailbox in the app yet.");
  if (row.user_id !== user.id && !can(user, "email.manage")) {
    throw new WorkflowError("FORBIDDEN", "You can only change the password for your own mailbox.");
  }
  const pass = input.password.trim();
  if (!pass) throw new WorkflowError("VALIDATION", "Enter the mailbox password.");
  const passEnc = await seal(pass);
  await run("UPDATE email_senders SET smtp_user = ?, smtp_pass_enc = ?, updated_at = ? WHERE id = ?", row.address, passEnc, nowIso(), row.id);
  await setState(row.id, { error: null });
  conns.get(row.id)?.client.close();
  conns.delete(row.id);
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} updated the password for their mailbox ${row.address}` });
  return { id: row.id, address: row.address };
}

// Without the cPanel API: the mailbox's password typed in by the email manager.
export async function connectMailbox(user: AppUser, input: { userId: string; address: string; password: string }) {
  manager(user);
  const address = input.address.trim().toLowerCase();
  if (!isEmail(address)) throw new WorkflowError("VALIDATION", "Enter a valid email address.");
  if (!input.password) throw new WorkflowError("VALIDATION", "Enter the mailbox password.");
  const id = await upsertMailbox(user, { userId: input.userId, address, password: input.password, managed: "manual" });
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} connected the mailbox ${address} with its password` });
  return { id, address };
}

export async function newMailboxPassword(user: AppUser, id: string) {
  manager(user);
  const row = await senderRow(id);
  if (row.managed !== "cpanel") throw new WorkflowError("INVALID_STATE", "Only mailboxes managed through cPanel get a new password from here.");
  const [local, domain] = row.address.split("@") as [string, string];
  const password = newPassword();
  await cpanel("passwd_pop", { email: local, domain, password });
  await run("UPDATE email_senders SET smtp_user = ?, smtp_pass_enc = ?, updated_at = ? WHERE id = ?", row.address, await seal(password), nowIso(), id);
  conns.get(id)?.client.close();
  conns.delete(id);
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} set a new password for ${row.address}` });
}

export async function setMailboxOn(user: AppUser, id: string, on: boolean) {
  manager(user);
  const row = await senderRow(id);
  if (on && (!row.smtp_user || !row.smtp_pass_enc)) throw new WorkflowError("INVALID_STATE", "Give this address a sign-in first.");
  await run("UPDATE email_senders SET mailbox = ?, updated_at = ? WHERE id = ?", on ? 1 : 0, nowIso(), id);
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} turned the inbox in the app ${on ? "on" : "off"} for ${row.address}` });
}

// Removed from the app; with atHost, the mailbox and its mail are deleted at cPanel too (cannot be undone).
export async function removeMailbox(user: AppUser, id: string, atHost: boolean) {
  manager(user);
  const row = await senderRow(id);
  if (atHost) {
    if (row.managed !== "cpanel") throw new WorkflowError("INVALID_STATE", "Only mailboxes managed through cPanel can be deleted from here.");
    const [local, domain] = row.address.split("@") as [string, string];
    await cpanel("delete_pop", { email: local, domain });
  }
  await run("DELETE FROM mail_state WHERE sender_id = ?", id);
  await run("DELETE FROM email_senders WHERE id = ?", id);
  conns.get(id)?.client.close();
  conns.delete(id);
  await audit({ actor: user }, { action: "mail.mailbox", summary: `${user.name} removed the mailbox ${row.address} from the app${atHost ? " and deleted it at cPanel" : ""}` });
}

// The setup check: the server's name, the IMAP and SMTP ports from the app's server, then a sign-in when a mailbox
// is given.
export async function checkMailServer(user: AppUser, id?: string | null): Promise<CheckStep[]> {
  manager(user);
  if (fake()) return [{ label: "Test mode", status: "ok", detail: "MAIL_FAKE is on: mail is kept in memory, nothing is sent." }];
  const c = await storedMail();
  const row = id ? await senderRow(id) : null;
  const host = c.imapHost || (row ? `mail.${row.address.split("@")[1]}` : c.domain ? `mail.${c.domain}` : "");
  if (!host) return [{ label: "Mail server", status: "fail", detail: "Enter the incoming mail server (for example mail.myseed.com.et)." }];
  const steps: CheckStep[] = [];
  try {
    const a = await dns.lookup(host);
    steps.push({ label: "Server name", status: "ok", detail: `${host} is at ${a.address}.` });
  } catch {
    return [{ label: "Server name", status: "fail", detail: `${host} was not found. Use the incoming server from cPanel, Email Accounts, Connect Devices.` }];
  }
  const [imap, imapPlain, smtp465, smtp587] = await Promise.all([probePort(host, c.imapPort), probePort(host, 143), probePort(host, 465), probePort(host, 587)]);
  steps.push(
    imap === "open"
      ? { label: `Reading (IMAP, port ${c.imapPort})`, status: "ok", detail: "The app's server reaches the mail server for reading." }
      : {
          label: `Reading (IMAP, port ${c.imapPort})`,
          status: "fail",
          detail:
            imapPlain === "open" && c.imapPort !== 143
              ? `Port ${c.imapPort} is ${imap === "timeout" ? "blocked" : "refused"}, but 143 answers. Try port 143 without "encrypted from the start".`
              : "The hosting of the app does not reach the mail server's IMAP ports, so inboxes cannot be shown in the app. Ask the hosting to allow outgoing port 993, or move the app.",
        },
  );
  steps.push(
    smtp465 === "open" || smtp587 === "open"
      ? { label: "Sending (SMTP)", status: "ok", detail: `Port ${smtp465 === "open" ? 465 : 587} answers.` }
      : { label: "Sending (SMTP)", status: "warn", detail: "The SMTP ports are blocked from the app's server. Mail is sent through the web API set in Email account (Brevo or Resend)." },
  );
  if (row && imap === "open") {
    try {
      const s = await storeFor(row);
      const box = await s.inbox();
      steps.push({ label: `Sign-in as ${row.address}`, status: "ok", detail: `Signed in; ${box.unread} unread in the inbox.` });
      await setState(row.id, { unread: box.unread, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      steps.push({ label: `Sign-in as ${row.address}`, status: "fail", detail: msg });
      await setState(row.id, { error: msg });
    }
  }
  return steps;
}

// The scheduled check: unread counts for the sidebar, and a notice for new mail (one entry that counts up).
export async function checkAllMailboxes() {
  const rows = await all<SenderRow & { last_uid: number | null }>(
    "SELECT s.*, m.last_uid FROM email_senders s JOIN users u ON u.id = s.user_id LEFT JOIN mail_state m ON m.sender_id = s.id WHERE s.mailbox = 1 AND s.active = 1 AND u.active = 1",
  );
  let checked = 0;
  for (const r of rows) {
    try {
      const box = await (await storeFor(r)).inbox();
      const last = Number(r.last_uid ?? 0);
      if (last && box.uidNext > last && box.unread > 0)
        await notify([r.user_id], { type: "mail", title: "New email", body: `You have ${box.unread} unread in ${r.address}.`, link: "/email", groupKey: `mail:${r.id}` }, nowIso());
      await setState(r.id, { unread: box.unread, lastUid: box.uidNext, error: null });
      checked++;
    } catch (e) {
      await setState(r.id, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { checked };
}

export async function unreadMail(userId: string): Promise<{ has: boolean; unread: number }> {
  const r = await get<{ unread: number | null }>("SELECT m.unread FROM email_senders s LEFT JOIN mail_state m ON m.sender_id = s.id WHERE s.user_id = ? AND s.mailbox = 1 AND s.active = 1", userId);
  return r ? { has: true, unread: Number(r.unread ?? 0) } : { has: false, unread: 0 };
}

// ---------------------------------------------------------------------------
// A shared mailbox read and answered by the app itself (customer support, Phase 20)
// ---------------------------------------------------------------------------

export type IncomingMail = { uid: number; messageId: string | null; inReplyTo: string | null; references: string[]; subject: string; fromName: string; fromAddress: string; text: string; date: string };

async function rowByAddress(address: string) {
  const row = await get<SenderRow>("SELECT * FROM email_senders WHERE LOWER(address) = LOWER(?) AND mailbox = 1 AND active = 1", address);
  if (!row) throw new WorkflowError("NOT_FOUND", `${address} is not a mailbox in the app (Email, Settings, Mailboxes).`);
  return row;
}

// New messages in a mailbox's inbox after a uid (oldest first), with the plain text of each.
export async function mailboxNewMessages(address: string, afterUid: number, max = 30): Promise<{ messages: IncomingMail[]; lastUid: number }> {
  const store = await storeFor(await rowByAddress(address));
  const list = await store.list("INBOX", { page: 0, size: 100 });
  const fresh = list.rows.filter((r) => r.uid > afterUid).sort((a, b) => a.uid - b.uid).slice(0, max);
  const out: IncomingMail[] = [];
  for (const r of fresh) {
    const m = await store.raw("INBOX", r.uid);
    if (!m) continue;
    const p = await simpleParser(m.raw);
    const from = (p.from?.value ?? [])[0];
    const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
    out.push({ uid: r.uid, messageId: p.messageId ?? null, inReplyTo: p.inReplyTo ?? null, references: refs, subject: p.subject ?? "", fromName: from?.name || from?.address || "", fromAddress: (from?.address ?? "").toLowerCase(), text: (p.text ?? "").trim(), date: (p.date ?? new Date()).toISOString() });
  }
  return { messages: out, lastUid: fresh.length ? fresh[fresh.length - 1]!.uid : afterUid };
}

// The newest message's uid, so a mailbox connected to support starts from now, not from its old mail.
export async function mailboxTopUid(address: string) {
  return (await (await storeFor(await rowByAddress(address))).inbox()).uidNext - 1;
}

// Sends from a shared mailbox (not a person's), keeping a copy in its Sent folder.
export async function sendFromMailbox(address: string, input: { to: string[]; subject: string; text: string; inReplyTo?: string | null; references?: string[] }) {
  const row = await rowByAddress(address);
  const messageId = `<${crypto.randomUUID()}@${row.address.split("@")[1]}>`;
  const o = mailOptions(row, { to: input.to, subject: input.subject, text: input.text, inReplyTo: input.inReplyTo ?? null, references: input.references ?? [] }, messageId);
  if (fake()) {
    for (const rcpt of [...o.to]) {
      const target = await get<SenderRow>("SELECT * FROM email_senders WHERE address = ? AND mailbox = 1", rcpt);
      if (target) await new MemStore(target.address).append("INBOX", await build(o, false), []);
    }
    await memOutbox.push({ to: o.to, subject: o.subject, text: o.text, messageId, inReplyTo: input.inReplyTo ?? null });
  } else {
    const t = await transportFor(row);
    await t.transporter.sendMail(o);
  }
  const store = await storeFor(row);
  const sent = (await store.folders()).find((f) => f.specialUse === "\Sent")?.path ?? "Sent";
  await store.append(sent, await build(o, true), ["\Seen"]).catch(() => null);
  return { messageId };
}

// In tests (fake mail), what the app sent from shared mailboxes, and a way to drop a message into a mailbox.
export const memOutbox = {
  list: [] as { to: string[]; subject: string; text: string; messageId: string; inReplyTo: string | null }[],
  async push(m: { to: string[]; subject: string; text: string; messageId: string; inReplyTo: string | null }) {
    this.list.push(m);
  },
};
export async function deliverForTest(address: string, input: { from: string; fromName?: string; subject: string; text: string; inReplyTo?: string | null; messageId?: string }) {
  if (!fake()) throw new Error("Only with fake mail.");
  const c = new MailComposer({ from: { name: input.fromName ?? "", address: input.from }, to: address, subject: input.subject, text: input.text, messageId: input.messageId ?? `<${crypto.randomUUID()}@example.com>`, inReplyTo: input.inReplyTo ?? undefined, date: new Date() });
  return new MemStore(address).append("INBOX", await c.compile().build(), []);
}

// ---------------------------------------------------------------------------
// Signatures and sending later (Phase 14)
// ---------------------------------------------------------------------------

export async function mySignature(user: AppUser) {
  const row = await myMailbox(user.id);
  return row ? ((await get<{ signature: string | null }>("SELECT signature FROM email_senders WHERE id = ?", row.id))?.signature ?? "") : "";
}

export async function saveSignature(user: AppUser, text: string) {
  const row = await myMailbox(user.id);
  if (!row) throw new WorkflowError("NOT_FOUND", "You do not have a mailbox in the app yet.");
  await run("UPDATE email_senders SET signature = ? WHERE id = ?", String(text ?? "").slice(0, 2000) || null, row.id);
}

// A message written now and sent from the person's own mailbox at a set time (checked by the scheduled jobs).
export async function mailSchedule(user: AppUser, input: MailCompose, sendAt: string) {
  const at = new Date(sendAt);
  if (Number.isNaN(at.getTime())) throw new WorkflowError("VALIDATION", "Choose when to send it.");
  if (at.getTime() < Date.now() + 60e3) throw new WorkflowError("VALIDATION", "Choose a time at least a minute from now.");
  if (at.getTime() > Date.now() + 90 * 864e5) throw new WorkflowError("VALIDATION", "Messages can be scheduled up to 90 days ahead.");
  const b = await open(user, input.box);
  readOnly(b);
  // Checked now, so a wrong address is found while the person is still here.
  mailOptions(b.row, input, "<check@local>");
  const id = crypto.randomUUID();
  const to = [...(input.to ?? []), ...(input.cc ?? []), ...(input.bcc ?? [])].join(", ").slice(0, 500);
  await run(
    "INSERT INTO mail_scheduled (id, user_id, subject, recipients, payload, send_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)",
    id,
    user.id,
    (input.subject || "(no subject)").slice(0, 300),
    to,
    JSON.stringify({ ...input, box: null, draftUid: null }),
    at.toISOString(),
    nowIso(),
  );
  if (input.draftUid) await b.store.expunge(await folderFor(b, "drafts"), [input.draftUid]).catch(() => null);
  return { id, sendAt: at.toISOString() };
}

export async function myScheduled(user: AppUser) {
  return all<{ id: string; subject: string; recipients: string; send_at: string; status: string; error: string | null }>(
    "SELECT id, subject, recipients, send_at, status, error FROM mail_scheduled WHERE user_id = ? AND (status = 'waiting' OR (status = 'failed' AND send_at > ?)) ORDER BY send_at",
    user.id,
    new Date(Date.now() - 7 * 864e5).toISOString(),
  );
}

export async function cancelScheduled(user: AppUser, id: string) {
  const r = await get<{ payload: string }>("SELECT payload FROM mail_scheduled WHERE id = ? AND user_id = ? AND status IN ('waiting','failed')", id, user.id);
  if (!r) throw new WorkflowError("NOT_FOUND", "That message was already sent or removed.");
  await run("DELETE FROM mail_scheduled WHERE id = ?", id);
  // Back to Drafts, so nothing written is lost.
  await mailSaveDraft(user, { ...(JSON.parse(r.payload) as MailCompose), draftUid: null }).catch(() => null);
}

export async function sendScheduledMail(now = nowIso()) {
  const due = await all<{ id: string; user_id: string; payload: string; subject: string }>("SELECT id, user_id, payload, subject FROM mail_scheduled WHERE status = 'waiting' AND send_at <= ? ORDER BY send_at LIMIT 50", now);
  const { loadUser } = await import("./users");
  let sent = 0;
  for (const m of due) {
    // Claimed first, so two runs never send the same message.
    const claimed = await run("UPDATE mail_scheduled SET status = 'sending' WHERE id = ? AND status = 'waiting'", m.id);
    if (!claimed.changes) continue;
    try {
      const user = await loadUser(m.user_id);
      if (!user) throw new Error("The account is gone.");
      await mailSend(user, JSON.parse(m.payload) as MailCompose);
      await run("UPDATE mail_scheduled SET status = 'sent', sent_at = ? WHERE id = ?", nowIso(), m.id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await run("UPDATE mail_scheduled SET status = 'failed', error = ? WHERE id = ?", msg.slice(0, 300), m.id);
      await notify([m.user_id], { type: "mail", title: "A scheduled email was not sent", body: `${m.subject}: ${msg}`, link: "/email" }, nowIso());
    }
  }
  return { sent };
}
