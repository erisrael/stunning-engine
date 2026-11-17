// Update 1.2, Phase 7: Customer Support Requests. Admin switches destinations on (the Dev team, its head, Finance
// through a chosen member, Administration) and sets approval chains. Support writes a request from a conversation;
// the destination receives, acknowledges (a linked task appears in the Dev workspace), asks for information, submits
// for approval, and resolves, which returns the result to the conversation. The eleven statuses move only as allowed,
// for the right people; nobody approves their own request unless the chain allows it, and that use is audited.
process.env.MAIL_FAKE = "1";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as sd from "../../src/server/support-desk";
import * as R from "../../src/server/support-requests";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [admin, abel, liya, sara] = [await by("admin@demo.local"), await by("abel@demo.local"), await by("liya@demo.local"), await by("sara@demo.local")];
  const mk = async (name: string, email: string) => (await loadUser((await upsertAccount({ name, email, title: "Developer", roles: ["developer"], password: "Demo-Workflow-2026", mustChangePassword: false })).id))!;
  const devHead = await mk("Tigist Head", "tigist@demo.local");
  const dev = await mk("Kebede Dev", "kebede@demo.local");
  await (await import("../../src/server/departments")).setPosition(admin, "dev", devHead.id, "head");
  // The Dev workspace takes requests (Admin, Departments), so an acknowledged request becomes a task there.
  const dc = await import("../../src/server/dept-config");
  const cfg = await dc.getDeptConfig("dev");
  await dc.saveDeptConfig(admin, "dev", { ...cfg, features: { ...cfg.features, requests: true } }, cfg.version, "Take requests");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [liya.id] });
  const general = await sd.saveQueue(liya, { name: "General", members: [abel.id, sara.id] });
  const cus = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, phone, created_at) VALUES (?, NULL, 'test:r1', 'Hana Girma', '0911223344', ?)", cus, nowIso());
  const ticket = await sd.createTicketFromChannel({ subject: "Lessons do not load", body: "Lesson 4 never loads on Android", customerId: cus, channel: "web", appQueue: general });
  await run("UPDATE sup_tickets SET assignee_id = ? WHERE id = ?", abel.id, ticket);

  // 1. Setup.
  check("only Admin sets destinations", /Only Admin/.test(await err(() => R.saveDestination(abel, { label: "Dev", kind: "dept", dept: "dev" }))));
  let setup = await R.saveDestination(admin, { label: "Developer Team", kind: "dept", dept: "dev", types: ["technical", "bug", "feature"] });
  setup = await R.saveDestination(admin, { label: "Developer Team Head", kind: "dept_head", dept: "dev" });
  setup = await R.saveDestination(admin, { label: "Finance (Sara)", kind: "member", memberId: sara.id, types: ["payment_verification", "refund"] });
  setup = await R.saveDestination(admin, { label: "Administration", kind: "admin" });
  check("a destination nobody would receive is refused", /Nobody would receive/.test(await err(() => R.saveDestination(admin, { label: "Empty", kind: "dept_head", dept: "marketing" }))));
  const devTeam = setup.destinations.find((d) => d.label === "Developer Team")!;
  const finance = setup.destinations.find((d) => d.label === "Finance (Sara)")!;
  setup = await R.saveChain(admin, { destinationId: devTeam.id, steps: [{ kind: "dept_head", target: "dev" }, { kind: "admin" }] });
  setup = await R.saveChain(admin, { destinationId: finance.id, type: "refund", steps: [{ kind: "user", target: sara.id }], allowSelf: true });
  check("support sees the switched-on destinations", (await R.requestDestinationsFor(abel)).length === 4);

  // 2. A request from a conversation.
  check("a destination's types are kept", /does not take that type/.test(await err(() => R.createSupportRequest(abel, { type: "refund", title: "x", destinationId: devTeam.id }))));
  const made = await R.createSupportRequest(abel, { type: "bug", title: "Lesson 4 video does not load on Android", description: "Several customers", destinationId: devTeam.id, ticketId: ticket, errorDetails: "HTTP 403 from the video CDN", requestedAction: "Fix the video link", priority: "high" });
  let d = await R.detail(abel, made.id);
  check("it starts as a draft with a reference, linked to the conversation and customer", d.status === "draft" && /^SR-\d{4}-\d{4}$/.test(made.reference) && d.ticket?.id === ticket && d.customer?.name === "Hana Girma" && d.actions.join() === "submit", d);
  check("a draft is not seen by the destination", !(await R.listSupportRequests(dev, "inbox")).some((x) => x.id === made.id));
  d = await R.act(abel, made.id, "submit");
  check("submitted, it reaches the Dev team", d.status === "submitted" && (await R.listSupportRequests(dev, "inbox")).some((x) => x.id === made.id) && !!(await get("SELECT 1 FROM notifications WHERE user_id = ? AND title LIKE ?", dev.id, `%${made.reference}%`)));
  check("the creator cannot acknowledge their own request", /not yours/.test(await err(() => R.act(abel, made.id, "acknowledge"))));
  d = await R.detail(devHead, made.id);
  check("opened by the destination it is received", d.status === "received" && d.canAssign);
  d = await R.act(devHead, made.id, "acknowledge");
  check("acknowledged, a linked task appears in the Dev workspace", d.status === "acknowledged" && !!d.task?.code && (await get<{ request_state: string; title: string }>("SELECT request_state, title FROM dept_tasks WHERE id = (SELECT task_id FROM sup_requests WHERE id = ?)", made.id))?.request_state === "accepted", d.task);
  d = await R.assignRequest(devHead, made.id, dev.id);
  check("the head assigns a developer (the task follows)", d.assignee.id === dev.id && (await get<{ assignee_id: string }>("SELECT assignee_id FROM dept_tasks WHERE id = (SELECT task_id FROM sup_requests WHERE id = ?)", made.id))?.assignee_id === dev.id);
  check("only the destination's heads assign", /heads and Admin assign/.test(await err(() => R.assignRequest(dev, made.id, devHead.id))));
  check("a step out of order is refused", /cannot be moved/.test(await err(() => R.act(abel, made.id, "provide_info", { text: "x" }))) && /cannot be moved/.test(await err(() => R.act(abel, made.id, "close"))));
  check("asking for information needs the question", /What do you need/.test(await err(() => R.act(dev, made.id, "ask_info"))));
  d = await R.act(dev, made.id, "ask_info", { text: "Which Android version?" });
  check("waiting for information, the creator is told", d.status === "waiting_info" && !!(await get("SELECT 1 FROM notifications WHERE user_id = ? AND body = ?", abel.id, "Which Android version?")));
  d = await R.act(abel, made.id, "provide_info", { text: "Android 11, Samsung A12" });
  check("the creator answers and it is back in progress", d.status === "in_progress");
  await R.commentRequest(abel, made.id, "Two more customers reported it");
  check("comments are in the discussion", (await R.detail(dev, made.id)).events.some((e) => e.kind === "comment" && e.body === "Two more customers reported it"));

  // 3. Approval chain: the Dev head, then Admin.
  d = await R.act(dev, made.id, "submit_approval");
  check("submitted for approval, the first approver is the Dev head", d.status === "pending_approval" && d.approval?.steps === 2 && (await R.listSupportRequests(devHead, "approvals")).some((x) => x.id === made.id) && !(await R.listSupportRequests(admin, "approvals")).some((x) => x.id === made.id));
  check("a developer cannot approve", /not yours/.test(await err(() => R.act(dev, made.id, "approve"))));
  d = await R.act(devHead, made.id, "approve", { text: "Fix is safe" });
  check("after the head it waits for Admin", d.status === "pending_approval" && d.approval?.step === 1 && (await R.listSupportRequests(admin, "approvals")).some((x) => x.id === made.id));
  d = await R.act(admin, made.id, "approve");
  check("after the last step it is approved", d.status === "approved" && d.approvals.length === 2);
  d = await R.act(dev, made.id, "start");
  d = await R.act(dev, made.id, "resolve", { text: "The CDN token was renewed; videos load again." });
  const note = await get<{ body: string }>("SELECT body FROM sup_messages WHERE ticket_id = ? AND author_kind = 'system' ORDER BY created_at DESC LIMIT 1", ticket);
  check("resolving returns the result to support's conversation", d.status === "resolved" && !!note?.body.includes("videos load again") && note.body.includes(made.reference), note);
  d = await R.act(abel, made.id, "reopen", { text: "Still failing on Android 10" });
  check("the creator can reopen it", d.status === "in_progress");
  await R.act(dev, made.id, "resolve", { text: "Fixed for Android 10 too." });
  d = await R.act(abel, made.id, "close");
  check("and close it", d.status === "closed" && d.actions.length === 0);
  check("the history holds every step", d.events.filter((e) => e.to_status && e.from_status !== e.to_status).map((e) => e.to_status).join(",") === "draft,submitted,received,acknowledged,waiting_info,in_progress,pending_approval,approved,in_progress,resolved,in_progress,resolved,closed", d.events.map((e) => e.to_status));

  // 4. Self-approval: refused, unless the chain allows it, then recorded and audited.
  const own = await R.createSupportRequest(sara, { type: "payment_verification", title: "Check my own refund rule", destinationId: finance.id, submit: true });
  await R.act(sara, own.id, "acknowledge");
  await run("INSERT INTO sup_request_chains (id, destination_id, type, steps_json, allow_self, created_at) VALUES (?, ?, 'payment_verification', ?, 0, ?)", uid("src_"), finance.id, JSON.stringify([{ kind: "user", target: sara.id }]), nowIso());
  await R.act(sara, own.id, "submit_approval");
  check("nobody approves their own request", /your own request/.test(await err(() => R.act(sara, own.id, "approve"))) && !(await R.detail(sara, own.id)).actions.includes("approve"));
  const exc = await R.createSupportRequest(sara, { type: "refund", title: "Refund under the allowed exception", destinationId: finance.id, submit: true });
  await R.act(sara, exc.id, "acknowledge");
  await R.act(sara, exc.id, "submit_approval");
  d = await R.act(sara, exc.id, "approve");
  check("with an allowed exception it is approved, marked and audited", d.status === "approved" && d.approvals[0].selfException && !!(await get("SELECT 1 FROM audit_events WHERE action = 'support.request_self_approval'")));
  check("non-agents cannot write requests", /Support agents and Admin/.test(await err(() => R.createSupportRequest(devHead, { type: "bug", title: "x", destinationId: devTeam.id }))));
  const meron = await by("meron@demo.local");
  check("a stranger cannot see a request", /not found/i.test(await err(() => R.detail(meron, made.id))));
  const counts = await R.supportRequestCounts(sara);
  check("counts for the page", counts.inbox >= 1 && counts.mine >= 1, counts);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
