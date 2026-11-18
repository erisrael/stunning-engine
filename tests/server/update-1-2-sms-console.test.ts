// Update 1.2, System improvements 5: the SMS console. Recipients come from typed numbers (Ethiopian numbers in any
// usual form) and groups (staff, Noor parents and students); the estimate shows parts, encoding and cost (parts times
// the provider's price per part) before anything is sent; a batch sends to everyone and records parts and cost per
// message; delivery reports set delivered, failed and rejected apart from pending; history filters, pages and
// exports; usage sums messages, parts, delivery rate and spend per day and provider. Only Admin uses it.
import http from "node:http";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as C from "../../src/server/connectors";
import * as S from "../../src/server/sms";
import * as X from "../../src/server/sms-console";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

// A provider that refuses one number and accepts the rest, giving each message an id.
let n = 0;
const sent: { to: string; text: string }[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const b = JSON.parse(body || "{}");
    if (String(b.to).endsWith("000000")) return res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Invalid destination" }));
    sent.push({ to: b.to, text: b.text });
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: `p-${++n}` }));
  });
});

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const [admin, dawit] = [await by("admin@demo.local"), await by("dawit@demo.local")];
  const id = await C.saveConnector(admin, { name: "Test SMS", capability: "sms", baseUrl: base, auth: { kind: "none" } as never, operation: { method: "POST", path: "/sms", contentType: "json", map: { to: "{{to}}", text: "{{message}}", from: "{{sender}}" }, headers: {} }, response: { idPath: "id", errorPath: "message" }, secrets: { token: "k" }, status: "active" });
  await S.saveSmsConfig(admin, { retries: 0, routes: { otp: { connectors: [], sender: "" }, alerts: { connectors: [id], sender: "MYSEED" }, marketing: { connectors: [], sender: "" } } });

  // 1. Numbers.
  check("Ethiopian numbers in their usual forms", ["0911 22 33 44", "911223344", "251911223344", "+251-911-223344", "0711223344"].map(X.normalizePhone).join() === "+251911223344,+251911223344,+251911223344,+251911223344,+251711223344");
  check("other countries need their code; junk is refused", X.normalizePhone("+14155550100") === "+14155550100" && X.normalizePhone("12345") === null && X.normalizePhone("hello") === null);
  const r = await X.resolveRecipients({ numbers: "0911223344 Abebe\n+251911223344, 0922000000; not-a-number" });
  check("pasted lists keep names, drop repeats and report what is not a number", r.recipients.length === 2 && r.recipients[0].name === "Abebe" && r.invalid.join() === "not-a-number", r);

  // 2. Groups.
  await run("UPDATE users SET phone = '0933445566' WHERE id = ?", admin.id);
  for (let i = 0; i < 3; i++) await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES (?, 'parents', ?, ?, ?, ?)", uid(), `p${i}`, `Parent ${i}`, JSON.stringify({ Name: `Parent ${i}`, "Phone Number": i === 2 ? "n/a" : `09440000${10 + i}` }), nowIso());
  const groups = await X.smsRecipientGroups(admin);
  check("groups count the people they would reach", groups.find((g) => g.key === "staff")!.count >= 1 && groups.find((g) => g.key === "noor:parents")!.count === 2, groups);
  const g = await X.resolveRecipients({ groups: ["noor:parents"], numbers: "0944000010" });
  check("a group and a typed number are not counted twice", g.recipients.length === 2 && g.recipients.some((x) => x.name === "Parent 1"));

  // 3. Estimate.
  const e0 = await X.estimateSms(admin, { numbers: "0911223344, 0922334455", message: "a".repeat(161) });
  check("the estimate counts parts for everyone", e0.recipients === 2 && e0.count.segments === 2 && e0.parts === 4 && e0.provider.name === "Test SMS");
  check("without a price, no cost is invented", e0.price === null && e0.cost === null);
  check("a negative price is refused", /price of one SMS part/.test(await err(() => X.saveSmsPrice(admin, id, { perPart: -1, currency: "ETB" }))));
  check("a currency must be a code", /three-letter/.test(await err(() => X.saveSmsPrice(admin, id, { perPart: 0.3, currency: "birr" }))));
  await X.saveSmsPrice(admin, id, { perPart: 0.35, currency: "etb", source: "Price list, November 2026" });
  const e1 = await X.estimateSms(admin, { numbers: "0911223344, 0922334455", message: "ሰ".repeat(71) });
  check("Amharic goes as UCS-2 and the cost is parts times the price", e1.count.encoding === "UCS-2" && e1.parts === 4 && e1.cost === 1.4 && e1.price?.currency === "ETB", e1);
  check("only Twilio has a pricing API", /no pricing API/.test(await err(() => X.refreshLivePrice(admin, id))));
  check("Members cannot estimate or send", /Only Admin/.test(await err(() => X.estimateSms(dawit, { numbers: "0911223344", message: "x" }))) && /Only Admin/.test(await err(() => X.sendSmsBatch(dawit, { numbers: "0911223344", message: "x" }))));

  // 4. Send a batch.
  check("an empty message is refused", /Write the message/.test(await err(() => X.sendSmsBatch(admin, { numbers: "0911223344", message: "  " }))));
  check("no recipients is refused", /at least one/.test(await err(() => X.sendSmsBatch(admin, { numbers: "", message: "Hi" }))));
  const b = await X.sendSmsBatch(admin, { numbers: "0911223344 Abebe, 0922000000, 0933112233", message: "School opens Monday." });
  check("a batch sends to everyone and says what failed", b.recipients === 3 && b.sent === 2 && b.failed === 1 && sent.length === 2, b);
  const rows = (await X.smsHistory(admin, { batch: b.id })).rows;
  const ok = rows.find((x) => x.to_phone === "+251911223344")!;
  check("each message keeps its name, parts, encoding and cost", ok.recipient_name === "Abebe" && ok.segments === 1 && ok.encoding === "GSM-7" && ok.cost === 0.35 && ok.currency === "ETB" && !!ok.sent_at, ok);
  const bad = rows.find((x) => x.to_phone === "+251922000000")!;
  check("a refused message keeps the provider's reason", bad.status === "failed" && /Invalid destination/.test(bad.error ?? ""), bad);
  check("sent but not reported is pending", ok.status === "pending");
  const batch = await get<{ sent: number; failed: number; est_cost: number; status: string }>("SELECT sent, failed, est_cost, status FROM sms_batches WHERE id = ?", b.id);
  check("the batch records its estimate and outcome", batch?.sent === 2 && batch.failed === 1 && Number(batch.est_cost) === 1.05 && batch.status === "done", batch);

  // 5. Delivery reports.
  const cfg = await S.smsConfig();
  const other = rows.find((x) => x.to_phone === "+251933112233")!;
  await S.handleDeliveryReport(cfg.dlrToken, { id: ok.provider_id, status: "Success" });
  await S.handleDeliveryReport(cfg.dlrToken, { id: other.provider_id, status: "Rejected", failureReason: "UserInBlacklist" });
  const after = (await X.smsHistory(admin, { batch: b.id })).rows;
  check("delivered and rejected are told apart", after.find((x) => x.id === ok.id)!.status === "delivered" && after.find((x) => x.id === other.id)!.status === "rejected");
  check("the provider's own status and reason are kept", after.find((x) => x.id === other.id)!.report_status === "Rejected" && after.find((x) => x.id === other.id)!.error === "UserInBlacklist");

  // 6. History.
  check("history filters by status", (await X.smsHistory(admin, { status: "rejected" })).rows.every((x) => x.status === "rejected") && (await X.smsHistory(admin, { status: "pending" })).total === 0);
  check("history searches names and numbers", (await X.smsHistory(admin, { q: "abebe" })).total === 1 && (await X.smsHistory(admin, { q: "933112233" })).total === 1);
  const today = new Date().toISOString().slice(0, 10);
  check("history filters by date", (await X.smsHistory(admin, { from: today, until: today })).total === 3 && (await X.smsHistory(admin, { from: "2020-01-01", until: "2020-01-02" })).total === 0);
  const csv = (await X.exportSmsHistory(admin, { batch: b.id })).csv.split("\n");
  check("the export holds every message with its status, parts and cost", csv.length === 4 && csv[0].startsWith("Sent,Recipient") && csv.some((l) => l.includes("rejected") && l.includes("UserInBlacklist")), csv.slice(0, 2));

  // 7. Usage.
  const u = await X.smsUsage(admin, { from: today, until: today });
  check("usage counts messages and parts by outcome", u.totals.messages === 3 && u.totals.delivered === 1 && u.totals.rejected === 1 && u.totals.failed === 1, u.totals);
  check("the delivery rate is of those reported", u.deliveryRate === 33);
  check("spend is the cost of what was sent", u.costs.length === 1 && u.costs[0].amount === 0.7 && u.costs[0].currency === "ETB", u.costs);
  check("usage per provider and per day", u.providers.some((p) => p.name === "Test SMS" && p.messages === 2) && u.days.length === 1);
  check("console sends are listed with who sent them", u.batches[0]?.id === b.id && u.batches[0].by_name === admin.name);
  const con = await X.smsConsole(admin);
  check("the console lists providers with their price", con.providers[0].price?.perPart === 0.35 && con.purposes.map((p) => p.key).join() === "alerts,marketing");

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
    server.close();
    await closeDb();
  });
