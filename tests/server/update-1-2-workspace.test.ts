// Update 1.2, spec 11.3 to 14.1 and 18: the support role presets and their permissions, the agent statuses (only
// Available agents are given work), conversations offered for accept or decline, retention (archive, legal hold and
// permanent deletion kept apart; recordings kept indefinitely or deleted by hand; call records survive), call record
// filters, and the analytics dashboard with its exports.
process.env.MAIL_FAKE = "1";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as Q from "../../src/server/support-queues";
import * as RT from "../../src/server/support-retention";
import * as R from "../../src/server/call-records";
import * as D from "../../src/server/support-dashboard";
import { getPermissionMatrix } from "../../src/server/settings";
import { roleCatalog } from "../../src/server/role-catalog";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const grant = (u: AppUser, ...caps: string[]) => ({ ...u, perms: [...u.perms, ...caps] }) as AppUser;
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

async function main() {
  const [admin, sara, abel, dawit] = [await by("admin@demo.local"), await by("sara@demo.local"), await by("abel@demo.local"), await by("dawit@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "General", members: [sara.id, abel.id] });

  // 1. Roles.
  const matrix = (await getPermissionMatrix()) as Record<string, string[]>;
  const roles = (await roleCatalog()).map((r) => r.label);
  check("the spec's support roles are ready in Roles and permissions", ["Customer Support Head", "Customer Support Supervisor", "Call Center Supervisor", "Auditor"].every((l) => roles.includes(l)), roles);
  check("the Support Head has every support permission", ["support.lead", "support.retention", "support.ivr", "support.recordings"].every((c) => matrix.support_head?.includes(c)));
  check("the Auditor reads but does not configure", matrix.auditor?.includes("support.conversations_all") && !matrix.auditor.includes("support.queues"));
  check("Support Head is a support lead without being named in Settings", await sd.isLead(grant(dawit, "support.lead")));
  check("viewing every conversation opens the desk", await sd.isAgent(grant(dawit, "support.conversations_all")));

  // 2. Statuses: only Available agents get work.
  await sd.setAgentStatus(sara, "online");
  await sd.setAgentStatus(abel, "busy");
  check("Busy and Break are statuses", (await get<{ status: string }>("SELECT status FROM sup_agents WHERE user_id = ?", abel.id))?.status === "busy");
  check("a busy agent is not given conversations", (await sd.availableAgents(q)).map((a) => a.userId).join() === sara.id);
  await sd.setAgentStatus(abel, "break");
  check("nor one on a break", !(await sd.availableAgents(q)).some((a) => a.userId === abel.id));
  check("an unknown status is refused", /Choose Available/.test(await err(() => sd.setAgentStatus(sara, "dancing" as never))));
  await sd.setAgentStatus(abel, "online");

  // 3. Offered conversations.
  await Q.saveQueueSettings(admin, q, { acceptRequired: true });
  const cus = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, phone, created_at) VALUES (?, NULL, 'w:1', 'Hana Girma', '0911000111', ?)", cus, nowIso());
  const t = await sd.createTicketFromChannel({ subject: "Payment not showing", body: "I paid", customerId: cus, channel: "web", appQueue: q });
  const first = await get<{ assignee_id: string; offered_at: string | null }>("SELECT assignee_id, offered_at FROM sup_tickets WHERE id = ?", t);
  check("in a queue where agents accept, the conversation is offered", !!first?.offered_at && !!first.assignee_id);
  const firstAgent = first!.assignee_id === sara.id ? sara : abel;
  const other = firstAgent.id === sara.id ? abel : sara;
  await Q.declineConversation(firstAgent, t);
  const second = await get<{ assignee_id: string; declined_by: string }>("SELECT assignee_id, declined_by FROM sup_tickets WHERE id = ?", t);
  check("declined, it goes to the next agent", second?.assignee_id === other.id && second.declined_by.includes(firstAgent.id), second);
  await run("UPDATE sup_tickets SET offered_at = ? WHERE id = ?", ago(300), t);
  await Q.expireOffers();
  check("not accepted in time, it is not given back to someone who declined", (await get<{ assignee_id: string | null }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t))?.assignee_id === null);
  await run("UPDATE sup_tickets SET declined_by = '[]' WHERE id = ?", t);
  await sd.autoAssign(t);
  const owner = (await get<{ assignee_id: string }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t))!.assignee_id === sara.id ? sara : abel;
  await Q.acceptConversation(owner, t);
  check("accepted, it is theirs", (await get<{ offered_at: string | null }>("SELECT offered_at FROM sup_tickets WHERE id = ?", t))?.offered_at === null);
  check("only the offered agent accepts", /not waiting for you/.test(await err(() => Q.acceptConversation(owner, t))));
  await Q.saveQueueSettings(admin, q, { acceptRequired: false });

  // 4. Retention.
  const call = uid("scl_");
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, answered_at, ended_at, duration_s, wait_s, queue_id, recording_id, recording_storage, recording_mime, recording_size, recording_status) VALUES (?, ?, ?, ?, 'inbound', 'web', 'ended', 1, ?, ?, ?, 400, 10, ?, 'rec_w1', 'db', 'audio/webm', 3, 'saved')", call, t, cus, sara.id, ago(600), ago(590), ago(190), q);
  await run("INSERT INTO sup_blobs (id, data) VALUES ('rec_w1', 'AQID')");
  check("an agent cannot delete a conversation", /retention/.test(await err(() => RT.deleteConversation(sara, t, "test"))));
  check("a hold needs a reason", /Say why/.test(await err(() => RT.setConversationHold(admin, t, true, ""))));
  await RT.setConversationHold(admin, t, true, "Customer dispute");
  check("a conversation under legal hold cannot be deleted", /legal hold/.test(await err(() => RT.deleteConversation(admin, t, "cleanup"))));
  await RT.setConversationHold(admin, t, false);
  check("deleting needs a reason", /Say why/.test(await err(() => RT.deleteConversation(admin, t, " "))));
  await RT.deleteConversation(grant(dawit, "support.retention"), t, "Customer asked to be forgotten");
  check("deleted for good, by someone with the retention permission", !(await get("SELECT 1 AS x FROM sup_tickets WHERE id = ?", t)));
  check("the call record stays, unlinked", (await get<{ ticket_id: string | null }>("SELECT ticket_id FROM sup_calls WHERE id = ?", call))?.ticket_id === null);
  check("the audit log keeps who deleted it and why", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'support.conversation_deleted' AND summary LIKE '%forgotten%'")));
  await RT.deleteRecording(admin, call, "Recorded by mistake");
  const k = await get<{ recording_id: string | null; recording_status: string }>("SELECT recording_id, recording_status FROM sup_calls WHERE id = ?", call);
  check("a recording deleted by hand leaves the call record", k?.recording_id === null && k.recording_status === "deleted" && !(await get("SELECT 1 AS x FROM sup_blobs WHERE id = 'rec_w1'")));
  await sd.saveSupportConfig(admin, { recordingDays: 0 });
  check("recordings can be kept indefinitely", (await sd.supportConfig()).recordingDays === 0);
  const old = uid("scl_");
  await run("INSERT INTO sup_calls (id, customer_id, agent_id, direction, kind, status, consent, started_at, recording_id, recording_storage, recording_status) VALUES (?, ?, ?, 'inbound', 'web', 'ended', 1, ?, 'rec_w2', 'db', 'saved')", old, cus, sara.id, ago(5 * 365 * 86400));
  await run("INSERT INTO sup_blobs (id, data) VALUES ('rec_w2', 'AQID')");
  await sd.supportChecks();
  check("and then the purge keeps even old ones", (await get<{ recording_id: string | null }>("SELECT recording_id FROM sup_calls WHERE id = ?", old))?.recording_id === "rec_w2");
  // Conversations are kept forever unless Admin sets a period.
  const t2 = await sd.createTicketFromChannel({ subject: "Old", body: "x", customerId: cus, channel: "web", appQueue: q });
  await run("UPDATE sup_tickets SET status = 'closed', updated_at = ? WHERE id = ?", ago(400 * 86400), t2);
  await sd.supportChecks();
  check("closed conversations are kept by default", !!(await get("SELECT 1 AS x FROM sup_tickets WHERE id = ?", t2)));
  await sd.saveSupportConfig(admin, { conversationDays: 365 });
  await RT.purgeConversations();
  check("with a retention period, old closed conversations go", !(await get("SELECT 1 AS x FROM sup_tickets WHERE id = ?", t2)));

  // 5. Call record filters.
  check("call records filter by customer", (await R.listCallRecords(admin, { customer: "hana" })).rows.length >= 2);
  check("and by duration range (minutes)", (await R.listCallRecords(admin, { minDur: 5 })).rows.every((r) => (r.durationS ?? 0) >= 300) && (await R.listCallRecords(admin, { minDur: 5 })).rows.some((r) => r.id === call));
  check("and by expired or deleted recordings", (await R.listCallRecords(admin, { recorded: "deleted" })).rows.some((r) => r.id === call));

  // 6. Analytics.
  const t3 = await sd.createTicketFromChannel({ subject: "Refund for double payment", body: "x", customerId: cus, channel: "telegram", appQueue: q });
  await run("UPDATE sup_tickets SET first_response_at = ?, status = 'solved', solved_at = ?, rating = 4, escalated_at = ? WHERE id = ?", nowIso(), nowIso(), nowIso(), t3);
  const day = nowIso().slice(0, 10);
  const dsh = await D.supportDashboard(admin, { from: day, to: day });
  check("conversation metrics come from stored conversations", dsh.conversations.total >= 1 && dsh.conversations.resolved >= 1 && dsh.conversations.satisfaction === 4 && (dsh.conversations.escalationRate ?? 0) > 0, dsh.conversations);
  check("financial support counts payment and refund conversations", dsh.finance.paymentInquiries >= 1 && dsh.finance.refundRequests >= 1, dsh.finance);
  check("agents are listed with their numbers", dsh.agents.length === 2 && dsh.agents.every((a) => typeof a.availableHours === "number"));
  check("filters narrow it (customer)", (await D.supportDashboard(admin, { from: day, to: day, customer: "nobody-here" })).conversations.total === 0);
  check("only leads and people allowed see analytics", !!(await err(() => D.supportDashboard(dawit, { from: day, to: day }))) && (await err(() => D.supportDashboard(grant(dawit, "support.analytics"), { from: day, to: day }))) === "");
  const csv = await D.exportDashboard(admin, { from: day, to: day }, "csv");
  const xlsx = await D.exportDashboard(admin, { from: day, to: day }, "xlsx");
  check("analytics export as CSV and Excel", Buffer.from(csv.base64, "base64").toString().includes("Conversations") && Buffer.from(xlsx.base64, "base64").subarray(0, 2).toString() === "PK");

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
