// Update 1.0, Phase 7: the call and callback monitor (redacted addresses, alerts once per window, filters), SMS with
// routing, retries, fallback, delivery reports and templates, connector order, email bounce reports and the domain
// check, the AI page's console and cost, kiosk capture modes and test capture, attendance setup checks, and the hub.
process.env.AI_FAKE = "1";
import http from "node:http";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import * as M from "../../src/server/call-monitor";
import * as C from "../../src/server/connectors";
import * as S from "../../src/server/sms";
import * as E from "../../src/server/email-health";
import * as AI from "../../src/server/assistant-ai";
import * as att from "../../src/server/attendance";
import { attendanceSetupSteps } from "../../src/server/attendance-setup";
import { integrationsOverview, setIntegrationOwner } from "../../src/server/integrations-hub";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

let base = "";
const hits: string[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = (req.url ?? "/").split("?")[0];
    hits.push(u);
    const json = (code: number, v: unknown) => (res.writeHead(code, { "Content-Type": "application/json" }), res.end(JSON.stringify(v)));
    if (u === "/bad/sms") return json(500, { message: "down" });
    if (u === "/good/sms") return json(200, { id: `good-${hits.length}` });
    if (u === "/ok") return json(200, { ok: true });
    if (u === "/fail") return json(503, { ok: false });
    json(404, {});
  });
});

async function monitor(admin: Awaited<ReturnType<typeof by>>) {
  check("addresses lose their query and the Telegram token", M.safeUrl("https://api.telegram.org/bot123:ABC/sendMessage?x=1") === "api.telegram.org/bot…/sendMessage" && M.safeUrl("https://g.example/v1/models?key=SECRET") === "g.example/v1/models");
  await M.saveAlertRules(admin, { on: true, failurePct: 50, minCalls: 3, windowMin: 60 });
  await M.trackedFetch("noor", `${base}/ok?token=hide`, undefined, { ref: "R-1" });
  const row = await get<{ summary: string; ok: number; source: string; direction: string; ref: string }>("SELECT summary, ok, source, direction, ref FROM int_calls WHERE ref = 'R-1'");
  check("a tracked call is recorded without its query", !!row && row.ok === 1 && row.source === "noor" && row.direction === "out" && !row.summary.includes("hide"), row);
  for (let i = 0; i < 3; i++) await M.trackedFetch("noor", `${base}/fail`);
  const alerts = await all<{ source: string }>("SELECT source FROM int_alerts WHERE source = 'noor'");
  check("failing past the rule raises one alert", alerts.length === 1, alerts);
  await M.trackedFetch("noor", `${base}/fail`);
  check("only one alert per window", (await all("SELECT 1 FROM int_alerts WHERE source = 'noor'")).length === 1);
  check("Admin is told", !!(await get("SELECT 1 FROM notifications WHERE user_id = ? AND title = 'Noor CMS is failing'", admin.id)));
  await M.recordIncoming("chapa", { ok: true, status: 200, summary: "Webhook charge.success", ref: "tx-9" });
  const d = await M.monitorData(admin, { source: "noor", failed: true, hours: 24 });
  check("filters: source and failures only", d.rows.length === 4 && d.rows.every((r) => r.source === "noor" && !r.ok), d.rows.length);
  check("the chart has a bucket per hour", d.series.length === 24 && d.series.reduce((t, s) => t + s.failures, 0) >= 4);
  const din = await M.monitorData(admin, { direction: "in", q: "tx-9" });
  check("callbacks in, searched by reference", din.rows.length === 1 && din.rows[0].source === "chapa");
  const stats = await M.sourceStats(24);
  check("stats per source with the failure rate", stats.find((s) => s.source === "noor")?.failurePct === 80, stats.find((s) => s.source === "noor"));
  const dawit = await by("dawit@demo.local");
  check("members cannot see the monitor", !!(await err(() => M.monitorData(dawit))));
  await M.saveAlertRules(admin, { on: false });
}

async function sms(admin: Awaited<ReturnType<typeof by>>) {
  const mk = (name: string, path: string) =>
    C.saveConnector(admin, { name, capability: "sms", baseUrl: base, auth: { kind: "none" } as never, operation: { method: "POST", path, contentType: "json", map: { to: "{{to}}", text: "{{message}}", from: "{{sender}}" }, headers: {} }, response: { idPath: "id" }, secrets: { token: "k" }, status: "active" });
  const bad = await mk("Bad SMS", "/bad/sms");
  const good = await mk("Good SMS", "/good/sms");
  await C.setConnectorOrder(admin, "sms", [bad, good]);
  check("the order is kept", (await C.connectorsFor("sms")).map((c) => c.id).join() === [bad, good].join());
  await S.saveSmsConfig(admin, { retries: 1, routes: { otp: { connectors: [], sender: "MYSEED" }, alerts: { connectors: [], sender: "ALERT" }, marketing: { connectors: [good], sender: "PROMO" } }, templates: [{ key: "Code", name: "Code", purpose: "otp", text: "Your code is {{code}}" }] });
  const cfg = await S.smsConfig();
  check("templates are saved with a clean key", cfg.templates[0]?.key === "code" && cfg.dlrToken.length >= 16);
  const r = await S.sendSmsMessage({ to: "0911223344", purpose: "otp", template: "code", vars: { code: "482913" } });
  check("a failing provider is retried, then the next one sends", r.fallback && r.attempts === 3 && r.provider === "Good SMS", r);
  const m = await get<{ status: string; preview: string | null; sender: string; attempts: number; provider_id: string }>("SELECT status, preview, sender, attempts, provider_id FROM sms_messages WHERE id = ?", r.id);
  check("the message is kept as sent, the code is not", m?.status === "sent" && m.preview === null && m.sender === "MYSEED" && m.attempts === 3, m);
  const n0 = hits.filter((h) => h === "/bad/sms").length;
  await S.sendSmsMessage({ to: "0911223344", purpose: "marketing", message: "Sale on" });
  check("routing by purpose skips providers not chosen", hits.filter((h) => h === "/bad/sms").length === n0);
  check("a wrong report address is refused", !(await S.handleDeliveryReport("nope", { id: m!.provider_id, status: "Success" })).ok);
  await S.handleDeliveryReport(cfg.dlrToken, { id: m!.provider_id, status: "Success" });
  check("a delivery report marks it delivered", (await get<{ status: string }>("SELECT status FROM sms_messages WHERE id = ?", r.id))?.status === "delivered");
  check("the report is logged as a callback", !!(await get("SELECT 1 FROM int_calls WHERE source = 'sms' AND direction = 'in' AND ok = 1")));
  await C.setConnectorOrder(admin, "sms", [good, bad]);
  const r2 = await S.sendSmsMessage({ to: "0911223344", message: "Hello" });
  check("after reordering the first provider sends without fallback", !r2.fallback && r2.attempts === 1);
  const ov = await S.smsOverview(admin);
  check("the overview hides phone numbers", ov.recent.every((x) => x.to_phone.includes("•••")) && (ov.counts.sent ?? 0) >= 2, ov.recent[0]);
  check("calls to providers are in the monitor", (await all("SELECT 1 FROM int_calls WHERE source = 'sms' AND direction = 'out'")).length >= 4);
}

async function email(admin: Awaited<ReturnType<typeof by>>) {
  const tok = await E.emailEventsToken();
  check("a wrong events address is refused", (await E.handleEmailEvent("x".repeat(tok.length), {})).status === 401);
  await run("INSERT INTO email_log (id, from_address, subject, mode, recipient_count, sent_count, failed_count, status, created_at) VALUES ('elg_p7', 'a@b.c', 'Hi', 'individual', 1, 1, 0, 'sent', ?)", new Date().toISOString()).catch(() => null);
  await run("INSERT INTO email_log_recipients (log_id, address, kind, status, message_id, sent_at) VALUES ('elg_p7', 'gone@example.com', 'to', 'sent', 're_123', ?)", new Date().toISOString()).catch(() => null);
  const r = await E.handleEmailEvent(tok, { type: "email.bounced", data: { email_id: "re_123", to: ["Gone@example.com"], bounce: { type: "Permanent", message: "Mailbox does not exist" } } });
  check("a Resend bounce is recorded", r.ok && r.recorded === 1 && !!(await get("SELECT 1 FROM email_bounces WHERE address = 'gone@example.com' AND kind = 'hard'")));
  const rec = await get<{ status: string }>("SELECT status FROM email_log_recipients WHERE log_id = 'elg_p7'");
  check("the recipient is marked bounced", !rec || rec.status === "bounced", rec);
  await E.handleEmailEvent(tok, { event: "spam", email: "angry@example.com", "message-id": "<b1>" });
  check("a Brevo complaint is recorded", !!(await get("SELECT 1 FROM email_bounces WHERE address = 'angry@example.com' AND kind = 'complaint'")));
  check("bounces are listed for Admin", (await E.listBounces(admin)).length >= 2);
  check("the parser ignores other events", E.parseEmailEvent({ type: "email.delivered", data: { to: ["a@b.c"] } }).length === 0);
  const st = await E.emailSetupSteps(admin);
  check("email setup has five checked steps and the events address", st.steps.length === 5 && st.eventsPath.includes(tok) && st.steps.find((s) => s.key === "events")?.status === "ok", st.steps);
  check("a bad domain is refused", !!(await err(() => E.checkEmailDns("not a domain"))));
}

async function ai(admin: Awaited<ReturnType<typeof by>>) {
  await AI.saveAiPrices(admin, { [(await AI.aiConfig()).model]: { in: 1, out: 2 } });
  const r = await AI.aiConsole(admin, { prompt: "Say hello" });
  check("the console answers with time and tokens", r.ok && r.text.includes("Say hello") && r.tokensIn > 0, r);
  const row = await get<{ summary: string; cost: number | null; tokens_in: number | null }>("SELECT summary, cost, tokens_in FROM int_calls WHERE source = 'ai' AND summary LIKE '%console%' ORDER BY at DESC LIMIT 1");
  check("the call is logged with tokens and cost", !!row && Number(row.tokens_in) > 0 && Number(row.cost) > 0, row);
  const c = await AI.aiCosts(admin, 30);
  check("usage and cost add up per day and model", c.total.calls >= 1 && c.total.cost > 0 && c.byModel.length >= 1 && c.byDay.length >= 1, c.total);
  const dawit = await by("dawit@demo.local");
  check("members cannot use the console", !!(await err(() => AI.aiConsole(dawit, { prompt: "x" }))));
}

async function kiosk(admin: Awaited<ReturnType<typeof by>>) {
  await syncFromUsers(admin);
  await att.saveAttendanceConfig(admin, { methods: { anywhere: true, kiosk: true, mobile: false, face: false } });
  const k = await att.createKiosk(admin, "Phase 7 kiosk");
  const token = await att.pairKiosk(k.code);
  let kr = (await att.kioskFromToken(token))!;
  const emp = (await get<{ id: string; code: string }>("SELECT id, code FROM employees WHERE status <> 'left' ORDER BY code LIMIT 1"))!;
  const pin = await att.resetPin(admin, emp.id);
  await att.newBadges(admin, [emp.id]);
  const badge = (await get<{ badge: string }>("SELECT badge FROM att_badges WHERE employee_id = ?", emp.id))!.badge;
  await att.setKioskModes(admin, k.id, ["pin"]);
  kr = (await att.kioskFromToken(token))!;
  check("the kiosk reports its modes", (await att.kioskPing(kr)).modes.join() === "pin");
  check("a way the kiosk does not take is refused", /does not take/.test((await err(() => att.kioskPunch(kr, { badge }))) ?? ""));
  check("at least one way must stay", !!(await err(() => att.setKioskModes(admin, k.id, []))));
  await att.startKioskTest(admin, k.id);
  kr = (await att.kioskFromToken(token))!;
  const before = (await all("SELECT 1 FROM att_events WHERE employee_id = ?", emp.id)).length;
  const t = await att.kioskPunch(kr, { code: emp.code, pin });
  check("a test capture recognises the person", "test" in t && t.test === true && !!t.name, t);
  check("and records nothing", (await all("SELECT 1 FROM att_events WHERE employee_id = ?", emp.id)).length === before);
  const list = await att.listKiosks(admin);
  const me = list.find((x) => x.id === k.id)!;
  check("the result shows on the list with health", me.testResult?.ok === true && me.health === "online" && !!me.testUntil, me);
  await att.kioskPunch(kr, { code: emp.code, pin: "9999" }).catch(() => null);
  check("a failed test is shown too", (await att.listKiosks(admin)).find((x) => x.id === k.id)?.testResult?.ok === false);
  const steps = await attendanceSetupSteps();
  check("attendance setup has six checked steps", steps.length === 6 && steps.every((s) => ["ok", "warn", "fail"].includes(s.status)) && steps.find((s) => s.key === "kiosk")?.status !== "fail", steps);
}

async function hub(admin: Awaited<ReturnType<typeof by>>) {
  const cards = await integrationsOverview(admin);
  check("the hub has seven integrations", cards.length === 7 && ["payments", "sms", "email", "ai", "telegram", "attendance", "noor"].every((k) => cards.some((c) => c.key === k)));
  const smsCard = cards.find((c) => c.key === "sms")!;
  check("SMS shows its providers, calls and failures", smsCard.keys >= 2 && smsCard.calls >= 4 && smsCard.failures >= 2, smsCard);
  check("Noor shows failing calls", cards.find((c) => c.key === "noor")!.failures >= 4);
  await setIntegrationOwner(admin, "sms", admin.id);
  check("an owner is set", (await integrationsOverview(admin)).find((c) => c.key === "sms")?.owner?.id === admin.id);
  const dawit = await by("dawit@demo.local");
  check("members cannot set owners", !!(await err(() => setIntegrationOwner(dawit, "sms", null))));
}

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const admin = await by("admin@demo.local");
  await monitor(admin);
  await sms(admin);
  await email(admin);
  await ai(admin);
  await kiosk(admin);
  await hub(admin);
  server.close();
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  server.close();
  await closeDb().catch(() => {});
  process.exit(1);
});
