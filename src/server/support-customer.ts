import { all, get, parseJson, run } from "./db";
import { WorkflowError } from "./workflow";
import { customerByToken, type AppFull } from "./support-desk";

// The customer's own pages in the support app and Mini App (Update 1.2, spec 15): the requests support raised for
// them (what was asked, where it stands, how it ended; never the team's notes, people or approvals), their profile
// and language, and the most read help articles as the FAQ.

// What a customer sees of a request's status, in English and Amharic. Internal steps fold into a few plain words.
const CUSTOMER_STATUS: Record<string, [string, string, string]> = {
  submitted: ["received", "Received", "ደርሷል"],
  received: ["received", "Received", "ደርሷል"],
  acknowledged: ["progress", "In progress", "በሂደት ላይ"],
  in_progress: ["progress", "In progress", "በሂደት ላይ"],
  approved: ["progress", "In progress", "በሂደት ላይ"],
  pending_approval: ["review", "Under review", "በግምገማ ላይ"],
  waiting_info: ["info", "Waiting for information", "መረጃ እየጠበቅን ነው"],
  rejected: ["declined", "Not approved", "አልጸደቀም"],
  resolved: ["resolved", "Resolved", "ተፈቷል"],
  closed: ["closed", "Closed", "ተዘግቷል"],
};
const TYPE_WORDS: Record<string, [string, string]> = {
  payment: ["Payment", "ክፍያ"],
  refund: ["Refund", "ተመላሽ ክፍያ"],
  subscription: ["Subscription", "ምዝገባ"],
  account: ["Account", "መለያ"],
  technical: ["Technical problem", "ቴክኒካዊ ችግር"],
  content: ["Content", "ይዘት"],
  feature: ["Suggestion", "ጥቆማ"],
  escalation: ["Escalation", "ወደ ላይ የተላለፈ"],
  other: ["Other", "ሌላ"],
};
const statusOf = (s: string) => {
  const [key, en, am] = CUSTOMER_STATUS[s] ?? ["progress", "In progress", "በሂደት ላይ"];
  return { key, en, am, open: !["rejected", "resolved", "closed"].includes(s) };
};
const typeOf = (t: string) => {
  const [en, am] = TYPE_WORDS[t] ?? [t, t];
  return { key: t, en, am };
};

// The customer's requests: raised for them, or from one of their conversations. Drafts stay with the team.
export async function customerRequests(app: AppFull, token: string) {
  const c = await customerByToken(app, token);
  const rows = await all<{ id: string; reference: string; type: string; title: string; status: string; created_at: string; updated_at: string; ticket_id: string | null; number: number | null }>(
    `SELECT r.id, r.reference, r.type, r.title, r.status, r.created_at, r.updated_at, r.ticket_id, t.number FROM sup_requests r LEFT JOIN sup_tickets t ON t.id = r.ticket_id
     WHERE r.status <> 'draft' AND (r.customer_id = ? OR t.customer_id = ?) ORDER BY r.updated_at DESC LIMIT 50`,
    c.id, c.id,
  );
  return rows.map((r) => ({ id: r.id, reference: r.reference, title: r.title, type: typeOf(r.type), status: statusOf(r.status), createdAt: r.created_at, updatedAt: r.updated_at, conversation: r.ticket_id ? { id: r.ticket_id, number: r.number } : null }));
}

export async function customerRequest(app: AppFull, token: string, id: string) {
  const c = await customerByToken(app, token);
  const r = await get<{ id: string; reference: string; type: string; title: string; status: string; resolution: string | null; created_at: string; updated_at: string; resolved_at: string | null; ticket_id: string | null; customer_id: string | null; number: number | null; ticket_customer: string | null }>(
    `SELECT r.id, r.reference, r.type, r.title, r.status, r.resolution, r.created_at, r.updated_at, r.resolved_at, r.ticket_id, r.customer_id, t.number, t.customer_id AS ticket_customer
     FROM sup_requests r LEFT JOIN sup_tickets t ON t.id = r.ticket_id WHERE r.id = ? OR r.reference = ?`,
    id, id,
  );
  if (!r || r.status === "draft" || (r.customer_id !== c.id && r.ticket_customer !== c.id)) throw new WorkflowError("NOT_FOUND", "Request not found.");
  // The steps the customer would recognise: each change of the plain status, once.
  const events = await all<{ to_status: string | null; created_at: string }>("SELECT to_status, created_at FROM sup_request_events WHERE request_id = ? AND to_status IS NOT NULL AND to_status <> 'draft' ORDER BY created_at", r.id);
  const steps: { status: ReturnType<typeof statusOf>; at: string }[] = [];
  for (const e of events) {
    const s = statusOf(e.to_status!);
    if (steps.at(-1)?.status.key !== s.key) steps.push({ status: s, at: e.created_at });
  }
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    type: typeOf(r.type),
    status: statusOf(r.status),
    // How it ended, once it has: the resolution support wrote.
    resolution: ["resolved", "closed", "rejected"].includes(r.status) ? r.resolution : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    conversation: r.ticket_id ? { id: r.ticket_id, number: r.number } : null,
    steps,
  };
}

// The profile: who support knows them as, how to reach them, and their language. A name the customer's own app
// gives (signed-in customers) is the app's to change; a Telegram or visitor name the customer may correct.
export async function customerProfile(app: AppFull, token: string) {
  const c = await customerByToken(app, token);
  const row = (await get<{ name: string; email: string | null; phone: string | null; external_id: string | null; meta: string; created_at: string }>("SELECT name, email, phone, external_id, meta, created_at FROM sup_customers WHERE id = ?", c.id))!;
  const n = async (sql: string, twice = false) => Number((await get<{ n: number }>(sql, ...(twice ? [c.id, c.id] : [c.id])))?.n ?? 0);
  const meta = parseJson<Record<string, string>>(row.meta, {});
  const source = /^tg:/.test(row.external_id ?? "") ? "telegram" : /^v-/.test(row.external_id ?? "") || !row.external_id ? "visitor" : "app";
  return {
    name: row.name,
    email: row.email,
    phone: row.phone,
    source,
    canRename: source !== "app",
    lang: meta.lang === "am" ? "am" : meta.lang === "en" ? "en" : null,
    since: row.created_at,
    counts: {
      conversations: await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE customer_id = ?"),
      open: await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved', 'closed')"),
      calls: await n("SELECT COUNT(*) AS n FROM sup_calls WHERE customer_id = ?"),
      requests: await n("SELECT COUNT(*) AS n FROM sup_requests r LEFT JOIN sup_tickets t ON t.id = r.ticket_id WHERE r.status <> 'draft' AND (r.customer_id = ? OR t.customer_id = ?)", true),
    },
  };
}

export async function customerSaveProfile(app: AppFull, token: string, input: { name?: string | null; lang?: string | null }) {
  const c = await customerByToken(app, token);
  const p = await customerProfile(app, token);
  if (input.name !== undefined && input.name !== null) {
    const name = String(input.name).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!p.canRename) throw new WorkflowError("FORBIDDEN", "Your name comes from your account in the app. Change it there.");
    if (name.length < 2) throw new WorkflowError("VALIDATION", "Enter your name.");
    await run("UPDATE sup_customers SET name = ? WHERE id = ?", name, c.id);
  }
  if (input.lang !== undefined && input.lang !== null) {
    if (!["en", "am"].includes(input.lang)) throw new WorkflowError("VALIDATION", "Choose English or Amharic.");
    // The same setting the Telegram bot reads, so the bot and the app speak one language.
    const meta = parseJson<Record<string, string>>((await get<{ meta: string }>("SELECT meta FROM sup_customers WHERE id = ?", c.id))?.meta, {});
    await run("UPDATE sup_customers SET meta = ? WHERE id = ?", JSON.stringify({ ...meta, lang: input.lang }), c.id);
  }
  return customerProfile(app, token);
}

// The FAQ: the most read published help articles (Admin writes them in Support, Knowledge base).
export async function customerFaq(app: AppFull, token: string) {
  await customerByToken(app, token);
  return (await import("./support-channels")).searchArticles("", 20);
}
