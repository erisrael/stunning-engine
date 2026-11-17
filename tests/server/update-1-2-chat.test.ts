// Update 1.2, Phase 6: support conversations at team-chat level. The ten conversation views (archived ones only in
// Archived), escalation, message search, unread counts and read marks, editing (own messages; never a reply already
// in Telegram or email), deleting (hidden from the customer, kept for the leads), saving, reporting, message details,
// and forwarding to configured targets: who may use them, customer details hidden unless allowed, approval by a lead.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as M from "../../src/server/support-chat";
import * as F from "../../src/server/support-forward";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, abel, liya, dawit, sara] = [await by("admin@demo.local"), await by("abel@demo.local"), await by("liya@demo.local"), await by("dawit@demo.local"), await by("sara@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id] });
  const general = await sd.saveQueue(liya, { name: "General", members: [abel.id, sara.id] });
  await sd.setAgentStatus(abel, "online");
  const customer = async (name: string, phone: string) => {
    const id = uid("cus_");
    await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)", id, `test:${id}`, name, `${name.toLowerCase()}@example.et`, phone, nowIso());
    return id;
  };
  const hana = await customer("Hana", "0911223344");
  const t1 = await sd.createTicketFromChannel({ subject: "Cannot open lesson 4", body: "The video for lesson 4 never loads on my phone", customerId: hana, channel: "web", appQueue: general });
  const ids = async (u: typeof abel, view: string, q?: string) => (await sd.inbox(u, view, q ?? null)).map((r) => r.id);

  // 1. Views.
  check("a new request is given to the agent online: Active and Assigned to me", (await ids(liya, "active")).includes(t1) && (await ids(abel, "mine")).includes(t1));
  const unread = (await sd.inbox(abel, "mine")).find((r) => r.id === t1)?.unread;
  check("its customer message is unread", Number(unread) === 1, unread);
  await sd.ticketDetail(abel, t1);
  check("opening it reads it", Number((await sd.inbox(abel, "mine")).find((r) => r.id === t1)?.unread) === 0);
  const mid = await sd.agentReply(abel, t1, { body: "Which phone do you use? Call me on 0911000000 if easier." });
  check("My conversations holds what I answered", (await ids(abel, "involved")).includes(t1));
  check("message search finds a conversation by words in its messages", (await ids(liya, "all", "never loads")).includes(t1) && !(await ids(liya, "all", "nothing like this")).includes(t1));
  await sd.setTicketStatus(abel, t1, "pending");
  check("Pending", (await ids(liya, "pending")).includes(t1) && !(await ids(liya, "active")).includes(t1));
  await M.escalateTicket(abel, t1, "Third time this week");
  const esc = await get<{ priority: string; escalated_at: string | null }>("SELECT priority, escalated_at FROM sup_tickets WHERE id = ?", t1);
  check("escalating marks it, raises its priority and tells the leads", (await ids(liya, "escalated")).includes(t1) && esc?.priority === "high" && !!(await get("SELECT 1 FROM notifications WHERE user_id = ? AND title LIKE ?", liya.id, `%escalated by ${abel.name}%`)), esc);
  await M.archiveTicket(abel, t1, true);
  check("an archived conversation is only under Archived", (await ids(liya, "archived")).includes(t1) && !(await ids(liya, "all")).includes(t1) && !(await ids(liya, "escalated")).includes(t1));
  await M.archiveTicket(abel, t1, false);
  check("and comes back", (await ids(liya, "all")).includes(t1));
  const t2 = await sd.createTicketFromChannel({ subject: "Payment", body: "Paid twice", customerId: await customer("Liya", "0922000000"), channel: "web", appQueue: general });
  await run("UPDATE sup_tickets SET assignee_id = NULL, status = 'new' WHERE id = ?", t2);
  check("Waiting in queue and Unassigned", (await ids(liya, "waiting")).includes(t2) && (await ids(liya, "unassigned")).includes(t2));
  check("filters by priority", (await sd.inbox(liya, "all", null, { priority: "high" })).every((r) => r.priority === "high") && (await sd.inbox(liya, "all", null, { priority: "high" })).some((r) => r.id === t1));

  // 2. Message actions.
  await M.editSupportMessage(abel, mid, "Which phone do you use?");
  const edited = await get<{ body: string; edited_at: string | null }>("SELECT body, edited_at FROM sup_messages WHERE id = ?", mid);
  check("an agent edits their own reply", edited?.body === "Which phone do you use?" && !!edited.edited_at);
  check("but not someone else's", /only your own/.test(await err(() => M.editSupportMessage(sara, mid, "x"))));
  const mail = await sd.createTicketFromChannel({ subject: "By email", body: "Hello", customerId: await customer("Mekdes", "0933000000"), channel: "email", appQueue: general });
  await run("UPDATE sup_tickets SET assignee_id = ? WHERE id = ?", abel.id, mail);
  const mailReply = await sd.agentReply(abel, mail, { body: "Thanks, we are on it." });
  check("a reply already in the customer's email cannot be edited", /cannot be changed/.test(await err(() => M.editSupportMessage(abel, mailReply, "Edited"))));
  const note = await sd.agentReply(abel, mail, { body: "Internal: check the invoice", internal: true });
  await M.editSupportMessage(abel, note, "Internal: check invoice 1203");
  check("an internal note can be edited", (await get<{ body: string }>("SELECT body FROM sup_messages WHERE id = ?", note))?.body === "Internal: check invoice 1203");
  const gone = await M.deleteSupportMessage(abel, mailReply);
  check("deleting an emailed reply says the customer keeps their copy", gone.stillWithCustomer === true);
  const forAgent = (await sd.ticketDetail(sara, mail)).messages.find((m) => m.id === mailReply)!;
  const forLead = (await sd.ticketDetail(liya, mail)).messages.find((m) => m.id === mailReply)!;
  check("a deleted message's words are kept for the leads only", !!forAgent.deleted_at && forAgent.body === "" && forLead.body === "Thanks, we are on it.");
  check("another agent cannot delete it", /delete your own/.test(await err(() => M.deleteSupportMessage(sara, mid))));
  check("saving a message", (await M.toggleSavedMessage(abel, mid)).saved && (await M.savedMessages(abel)).some((s) => s.id === mid));
  check("and unsaving it", !(await M.toggleSavedMessage(abel, mid)).saved);
  await M.reportSupportMessage(sara, mid, "Shares a personal number");
  check("reporting tells the leads", !!(await get("SELECT 1 FROM notifications WHERE user_id = ? AND title LIKE ?", liya.id, `%${sara.name} reported a message%`)));
  const det = await M.messageDetails(liya, mid);
  check("details show edit, report and times", !!det.editedAt && det.reports.length === 1 && det.author === abel.name, det);

  // 3. Forwarding.
  check("only Admin and the leads set targets", /Only Admin/.test(await err(() => F.saveForwardTarget(abel, { kind: "user", target: dawit.id, label: "Dawit" }))));
  let targets = await F.saveForwardTarget(liya, { kind: "user", target: dawit.id, label: "Finance: Dawit" });
  targets = await F.saveForwardTarget(liya, { kind: "support_leads", target: "support", label: "Support head", needsApproval: true, includeCustomer: true });
  targets = await F.saveForwardTarget(liya, { kind: "user", target: admin.id, label: "Admin only for finance managers", allowed: ["role:finance_manager"] });
  const mine = await F.forwardTargetsFor(abel);
  check("an agent sees the targets open to them", mine.length === 2 && !mine.some((t) => t.label.startsWith("Admin only")), mine);
  const custMsg = (await sd.ticketDetail(abel, t1)).messages.find((m) => m.author_kind === "customer")!;
  await run("UPDATE sup_messages SET body = ? WHERE id = ?", "My number is +251 911 223 344 and email hana@example.et, lesson 4 fails", custMsg.id);
  const toDawit = targets.find((t) => t.label === "Finance: Dawit")!;
  const r1 = await F.forwardMessage(abel, { messageId: custMsg.id, targetId: toDawit.id, note: "Is this a payment issue?" });
  const card = await get<{ body: string; kind: string }>("SELECT c.body, c.kind FROM chat_messages c JOIN chat_groups g ON g.id = c.group_id WHERE g.dm_key = ? ORDER BY c.created_at DESC LIMIT 1", [abel.id, dawit.id].sort().join(":"));
  check("a forward arrives in the recipient's direct chat", r1.status === "sent" && r1.recipients === 1 && card?.kind === "request" && card.body.includes("Is this a payment issue?") && card.body.includes(`/support?ticket=${t1}`), card);
  check("without customer details, numbers and emails are hidden", !!card && card.body.includes("[number hidden]") && card.body.includes("[email hidden]") && !card.body.includes("hana@example.et") && !card.body.includes("Customer: Hana"), card?.body);
  check("the forward is on the ticket's log", !!(await get("SELECT 1 FROM sup_activity WHERE ticket_id = ? AND kind = 'forwarded'", t1)));
  const toHead = targets.find((t) => t.label === "Support head")!;
  const r2 = await F.forwardMessage(abel, { messageId: custMsg.id, targetId: toHead.id });
  check("a target that needs approval waits for a lead", r2.status === "pending" && (await F.pendingForwards(liya)).length === 1);
  check("an agent cannot approve", /leads approve/.test(await err(() => F.decideForward(abel, r2.id, true))));
  const d2 = await F.decideForward(liya, r2.id, true);
  const leadCard = await get<{ body: string }>("SELECT c.body FROM chat_messages c JOIN chat_groups g ON g.id = c.group_id WHERE g.dm_key = ? ORDER BY c.created_at DESC LIMIT 1", [abel.id, liya.id].sort().join(":"));
  check("approved, it is sent, with the customer's details as the target allows", d2.recipients === 1 && !!leadCard?.body.includes("Customer: Hana") && leadCard.body.includes("hana@example.et"), leadCard?.body);
  check("a target not open to the agent is refused", /may not forward/.test(await err(() => F.forwardMessage(abel, { messageId: custMsg.id, targetId: targets.find((t) => t.label.startsWith("Admin only"))!.id }))));
  check("message details list the forwards", (await M.messageDetails(liya, custMsg.id)).forwards.length === 2);
  check("nothing else was posted", (await all("SELECT 1 FROM sup_forwards")).length === 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
