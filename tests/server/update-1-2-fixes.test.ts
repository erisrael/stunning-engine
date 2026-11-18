// Fixes after go-live: (1) behind the VPS proxy the Telegram Mini App's same-site requests were refused, because the
// app compared the browser's https Origin with its own inside address; (2) Noor's real Send SMS page binds its message
// outside data and shows recipients per tab, and its Send push notification form starts empty; (3) Chapa customers
// are compared over their tries (paid first time, paid after failing, never paid); (4) Admin clears every support
// conversation only with the typed confirmation and a reason, legal holds kept, call records kept unless asked.
import http from "node:http";
import { all, closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { fromThisSite } from "../../src/server/request-origin";
import { callNoorForm, noorUpdates, readNoorForm } from "../../src/lib/cms-forms";
import * as H from "../../src/server/chapa-hub";
import * as R from "../../src/server/support-retention";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const enc = (o: unknown) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

async function main() {
  // 1. Same site behind a proxy.
  const behind = new Request("http://0.0.0.0:3000/api/support/telegram/webapp", { method: "POST", headers: { host: "ops.myseed.com.et", origin: "https://ops.myseed.com.et" } });
  check("a page of this site is recognised behind the proxy", fromThisSite(behind, "https://ops.myseed.com.et"));
  check("the forwarded host counts too", fromThisSite(new Request("http://0.0.0.0:3000/x", { headers: { host: "app:3000", "x-forwarded-host": "ops.myseed.com.et" } }), "https://ops.myseed.com.et"));
  check("another site is not", !fromThisSite(behind, "https://evil.example") && !fromThisSite(behind, null) && !fromThisSite(behind, "not a url"));
  const { POST } = await import("../../src/app/api/support/telegram/webapp/route");
  const res = await POST(new Request("http://0.0.0.0:3000/api/support/telegram/webapp", { method: "POST", headers: { host: "ops.myseed.com.et", origin: "https://ops.myseed.com.et", "content-type": "application/json" }, body: JSON.stringify({ initData: "x" }) }));
  const said = (await res.json()) as { error?: string };
  check("the Mini App sign-in is no longer refused as another site", said.error !== "Not allowed.", said);

  // 2. Noor's real form shapes.
  const page = (snapshot: unknown, inner: string) => `<html><head><meta name="csrf-token" content="tok"></head><body><div wire:snapshot="${enc(snapshot)}" data-update-uri="/livewire/update">${inner}</div></body></html>`;
  const sms = page(
    { data: { data: [{ selectedStudents: [[], { s: "arr" }] }, { s: "arr" }], message: "", activeTab: "students" }, memo: { name: "app.filament.pages.send-bulk-sms" } },
    `<h1>Send Bulk SMS</h1><button wire:click="setActiveTab('students')">Students</button><button wire:click="setActiveTab('parents')">Parents</button><button wire:click="setActiveTab('manual')">Manual numbers</button>
     <form wire:submit="sendSms"><select multiple wire:model="data.selectedStudents"><option value="1">Abebe</option></select><label for="message">Message<sup>*</sup></label><textarea id="message" wire:model="message"></textarea><button type="submit">Send SMS</button></form>`,
  );
  const f = readNoorForm(sms);
  const message = f.fields.find((x) => x.name === "message");
  check("a message bound outside data is a field", !!message && message.path === "message" && message.kind === "textarea" && message.required, f.fields);
  check("the tabs and the open one are read", f.tabs?.map((t) => t.label).join() === "Students,Parents,Manual numbers" && f.tab === "students");
  check("values go to their own place", JSON.stringify(noorUpdates(f, { message: "Hi", selectedStudents: ["1"] })) === JSON.stringify({ message: "Hi", "data.selectedStudents": ["1"] }));
  const push = page({ data: { data: null, mountedActions: [[], { s: "arr" }] }, memo: { name: "app.filament.pages.send-bulk-notification" } }, `<form wire:submit="send"><input type="text" wire:model="data.title"><textarea wire:model="data.body"></textarea><select wire:model="data.mode"><option value="all">All</option></select><button type="submit">Send</button></form>`);
  const p = readNoorForm(push);
  check("a form whose data starts empty is read from its bindings", p.submit === "send" && p.fields.map((x) => x.name).join() === "title,body,mode", p.fields.map((x) => x.name));
  check("Livewire's own properties are never fields", !p.fields.some((x) => /mounted/.test(x.name)));

  // Switching a tab goes through the page's own setActiveTab and reads what Noor renders.
  let call: unknown = null;
  const noor = http.createServer((req, r) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      call = JSON.parse(body).components[0].calls[0];
      const snapshot = JSON.stringify({ data: { data: [{ numbers: "" }, { s: "arr" }], message: "", activeTab: "manual" }, memo: { name: "x" } });
      r.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ components: [{ snapshot, effects: { html: `<div><textarea wire:model="data.numbers"></textarea><textarea wire:model="message"></textarea></div>` } }] }));
    });
  });
  await new Promise<void>((ok) => noor.listen(0, "127.0.0.1", () => ok()));
  const base = `http://127.0.0.1:${(noor.address() as { port: number }).port}`;
  const manual = await callNoorForm(base, "s=1", f, "setActiveTab", ["manual"]);
  noor.close();
  check("a tab is opened with setActiveTab", JSON.stringify(call) === JSON.stringify({ path: "", method: "setActiveTab", params: ["manual"] }));
  check("and its fields are read, keeping the page's submit", manual.tab === "manual" && manual.submit === "sendSms" && manual.fields.map((x) => x.name).sort().join() === "message,numbers", manual);

  // 3. Chapa customers compared over their tries.
  const admin = await by("admin@demo.local");
  const acct = uid();
  const t0 = nowIso();
  await run("INSERT INTO chapa_accounts (id, name, secret_key_enc, currency, mode, active, created_at, updated_at) VALUES (?, 'Subs', 'x', 'ETB', 'live', 1, ?, ?)", acct, t0, t0);
  const tx = async (phone: string, status: string, at: string, amount = 500) => run("INSERT INTO chapa_transactions (account_id, tx_ref, amount, currency, method, status, first_name, phone, created_at, updated_at) VALUES (?, ?, ?, 'ETB', 'telebirr', ?, ?, ?, ?, ?)", acct, uid(), amount, status, `P${phone}`, phone, at, at);
  await tx("0911000001", "failed", "2026-11-01T08:00:00Z");
  await tx("0911000001", "failed", "2026-11-01T08:05:00Z");
  await tx("0911000001", "success", "2026-11-01T09:00:00Z");
  await tx("0911000002", "success", "2026-11-02T08:00:00Z");
  await tx("0911000003", "failed", "2026-11-03T08:00:00Z");
  await tx("0911000004", "pending", "2026-11-04T08:00:00Z");
  await tx("0911000005", "success", "2026-11-05T08:00:00Z");
  await tx("0911000005", "failed", "2026-11-06T08:00:00Z");
  const list = await H.chapaCustomers(admin, { biz: acct });
  const o = (phone: string) => list.find((c) => c.phone === phone)?.outcome;
  check("failed twice then paid is paid after failing", o("0911000001") === "recovered" && list.find((c) => c.phone === "0911000001")!.failedBeforePaid === 2, list.find((c) => c.phone === "0911000001"));
  check("paid at once is paid first time; only failed is never paid; only pending is pending", o("0911000002") === "paid_first" && o("0911000003") === "failed_only" && o("0911000004") === "pending_only");
  check("a failure after paying is not a recovery", o("0911000005") === "paid_first");
  const sum = H.chapaCustomerSummary(list);
  check("the comparison counts who paid after failing among those who failed", sum.failedOnce === 3 && sum.recovered === 1 && Math.round((sum.recoveryRate ?? 0) * 100) === 33 && sum.medianRecoveryMs === 3600e3, sum);
  check("customers filter by outcome", (await H.chapaCustomers(admin, { biz: acct, outcome: ["recovered"] })).length === 1);
  check("and by date range", (await H.chapaCustomers(admin, { biz: acct, from: "2026-11-03", until: "2026-11-04" })).length === 2);
  const tries = await H.chapaCustomerTries(admin, acct, list.find((c) => c.phone === "0911000001")!.key);
  check("every try of a customer, oldest first", tries.map((t) => t.status).join() === "failed,failed,success");
  const rep = await H.chapaCustomersReport(admin, { biz: acct });
  check("the export says the comparison", rep.report.totals.count === 5 && /1 paid after failing/.test(rep.meta.filters), rep.meta.filters);

  // 4. Clearing support conversations.
  const dawit = await by("dawit@demo.local");
  let n = 9000;
  const ticket = async (hold = 0) => {
    const id = uid();
    await run("INSERT INTO sup_tickets (id, number, subject, status, channel, created_at, updated_at, legal_hold) VALUES (?, ?, 'Help', 'open', 'telegram', ?, ?, ?)", id, ++n, t0, t0, hold);
    for (let i = 0; i < 3; i++) await run("INSERT INTO sup_messages (id, ticket_id, author_kind, body, created_at) VALUES (?, ?, 'customer', 'hi', ?)", uid(), id, t0);
    return id;
  };
  const kept = await ticket(1);
  await ticket();
  const withCall = await ticket();
  const callId = uid();
  await run("INSERT INTO sup_calls (id, ticket_id, started_at) VALUES (?, ?, ?)", callId, withCall, t0);
  const before = await R.supportClearPreview(admin);
  check("Admin sees what a clear removes", before.held >= 1 && before.conversations >= 2 && before.messages >= 6, before);
  check("only Admin clears", /Only Admin/.test(await err(() => R.clearSupportChats(dawit, { confirm: R.CLEAR_SUPPORT_PHRASE, reason: "x" }))));
  check("the confirmation must be typed exactly", /exactly/.test(await err(() => R.clearSupportChats(admin, { confirm: "delete all support chats", reason: "x" }))));
  check("a reason is needed", /Say why/.test(await err(() => R.clearSupportChats(admin, { confirm: R.CLEAR_SUPPORT_PHRASE, reason: " " }))));
  const done = await R.clearSupportChats(admin, { confirm: R.CLEAR_SUPPORT_PHRASE, reason: "Removing test conversations" });
  const left = await all<{ id: string }>("SELECT id FROM sup_tickets");
  check("every conversation goes except those under legal hold", left.length === 1 && left[0].id === kept && done.conversations === before.conversations, { left, done });
  check("their messages go with them", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_messages"))?.n) === 3);
  check("call records stay, unlinked", (await get<{ ticket_id: string | null }>("SELECT ticket_id FROM sup_calls WHERE id = ?", callId))?.ticket_id === null);
  check("the audit log keeps who cleared what and why", !!(await get("SELECT 1 FROM audit_events WHERE action = 'support.conversations_cleared' AND summary LIKE '%Removing test conversations%'")));
  await R.clearSupportChats(admin, { confirm: R.CLEAR_SUPPORT_PHRASE, reason: "Calls too", includeCalls: true });
  check("asked to, call records go too", !(await get("SELECT 1 FROM sup_calls WHERE id = ?", callId)));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
