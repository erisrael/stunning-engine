// Two fixes: i-Conic SMS sends with the request shape Admin copies from i-Conic's API page (no guessed /health or
// /balance), says plainly which address answered 404, sends through the SMS module (logged, retried) and never shows
// a made-up balance; and the Customer Support role gets its own home (tickets, waiting queue, calls, numbers).
import http from "node:http";
import crypto from "node:crypto";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as X from "../../src/server/external-api";
import * as sd from "../../src/server/support-desk";
import { connectorsFor } from "../../src/server/connectors";

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
const got: { path: string; key: string | null; auth: string | null; body: Record<string, unknown> }[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = new URL(req.url ?? "/", "http://x");
    const json = (code: number, v: unknown) => (res.writeHead(code, { "Content-Type": "application/json" }), res.end(JSON.stringify(v)));
    let parsed: Record<string, unknown> = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = Object.fromEntries(new URLSearchParams(body));
    }
    got.push({ path: u.pathname, key: (req.headers["key"] as string) ?? null, auth: req.headers.authorization ?? null, body: parsed });
    if (req.headers["key"] !== "ic-secret") return json(401, { message: "bad key" });
    if (u.pathname === "/api/send" && req.method === "POST") return json(200, { acknowledge: "success", response: { message_id: "IC-77" } });
    if (u.pathname === "/api/balance") return json(200, { data: { credit: "1234" } });
    json(404, { message: "no route" });
  });
});

async function iconic(admin: Awaited<ReturnType<typeof by>>) {
  const cfg = await X.getExternalApiConfig();
  check("no guessed address: the old sms.iconic.et default is gone", cfg.iconicSms.baseUrl === "");
  check("switching on without an address is refused", /API address/.test((await err(() => X.saveExternalApiConfig(admin, { iconicSms: { ...cfg.iconicSms, enabled: true, apiKey: "x" } }))) ?? ""));

  // Wrong path first: the 404 names the address tried.
  await X.saveExternalApiConfig(admin, { iconicSms: { ...cfg.iconicSms, enabled: true, baseUrl: `${base}/api/`, apiKey: "ic-secret", senderId: "MYSEED", sendPath: "/wrong", authStyle: "header", authName: "KEY", toField: "to", messageField: "message", senderField: "from", balancePath: "/nope", balanceField: "data.credit" } });
  const t404 = await X.testExternalApi("iconicSms");
  check("a 404 says which address and path were tried", !t404.ok && t404.status === 404 && t404.message.includes(`${base}/api/nope`) && /does not exist/.test(t404.message), t404);
  check("the test no longer calls /health", !got.some((g) => g.path.endsWith("/health")));
  const send404 = await err(() => X.testExternalApi("iconicSms", "+251911000111").then((r) => (r.ok ? null : Promise.reject(new Error(r.message)))));
  check("a send to a wrong path says Not found with the address", !!send404 && send404.includes("404") && send404.includes(`${base}/api/wrong`), send404);
  const logged = await get<{ status: string; error: string }>("SELECT status, error FROM sms_messages ORDER BY created_at DESC LIMIT 1");
  check("the failed send is logged", logged?.status === "failed" && /404/.test(logged.error), logged);

  // The right shape from i-Conic's page.
  await X.saveExternalApiConfig(admin, { iconicSms: { ...(await X.getExternalApiConfig()).iconicSms, sendPath: "/send", balancePath: "/balance" } });
  const c = (await connectorsFor("sms")).find((x) => x.preset === "iconic");
  check("saving makes an active i-Conic SMS connection", !!c && c.status === "active" && c.auth.kind === "header" && c.auth.name === "KEY" && c.operation.path === "/send");
  const ok = await X.testExternalApi("iconicSms");
  check("the balance test passes", ok.ok, ok);
  const bal = await X.fetchIconicSmsStatus();
  check("the balance is read from the answer, not invented", bal.balance === 1234, bal);
  const sent = await X.testExternalApi("iconicSms", "+251 911 000 222");
  check("a test SMS is sent", sent.ok, sent);
  const last = got.at(-1)!;
  check("with the key in the KEY header and the fields named as set", last.path === "/api/send" && last.key === "ic-secret" && !last.auth && last.body.to === "+251911000222" && last.body.from === "MYSEED" && /Test SMS/.test(String(last.body.message)), last);
  const row = await get<{ status: string; provider_id: string; connector_id: string }>("SELECT status, provider_id, connector_id FROM sms_messages ORDER BY created_at DESC LIMIT 1");
  check("and kept in the SMS log with i-Conic's id", row?.status === "sent" && row.provider_id === "IC-77" && row.connector_id === c!.id, row);

  // A bad key says so.
  await X.saveExternalApiConfig(admin, { iconicSms: { ...(await X.getExternalApiConfig()).iconicSms, apiKey: "wrong" } });
  const bad = await X.testExternalApi("iconicSms");
  check("a refused key is explained", !bad.ok && /refused the key/.test(bad.message), bad);
  check("no made-up balance when it fails", !!(await err(() => X.fetchIconicSmsStatus())));

  // Off: the connection becomes a draft.
  await X.saveExternalApiConfig(admin, { iconicSms: { ...(await X.getExternalApiConfig()).iconicSms, enabled: false } });
  check("switching off stops using it for SMS", !(await connectorsFor("sms")).some((x) => x.preset === "iconic"));
  const members = await by("dawit@demo.local");
  check("only Admin saves it", !!(await err(() => X.saveExternalApiConfig(members, {}))));
}

async function supportHome(admin: Awaited<ReturnType<typeof by>>) {
  const sara = await by("sara@demo.local");
  const off = await sd.agentHome(sara);
  check("before support is on, the home says so instead of failing", !off.enabled && off.mine.length === 0);
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const notAgent = await sd.agentHome(sara);
  check("someone in no queue is told, not failed", notAgent.enabled && !notAgent.agent);
  const q = await sd.saveQueue(admin, { name: "Help", keywords: ["help"], members: [sara.id], strategy: "least_busy", slaFirstMin: 30, slaResolveMin: 240 });
  const app = await sd.saveApp(admin, { name: "App", origins: ["https://a.example"], queueId: q, verifyIdentity: true });
  const A = await sd.appByKey((await sd.listApps(admin))[0]!.publicKey, "https://a.example");
  const s = await sd.identify(A, { id: "c-1", name: "Almaz", hash: crypto.createHmac("sha256", app.secret!).update("c-1").digest("hex") });
  await sd.customerCreateTicket(A, s.token, { subject: "Waiting one", message: "help me" });
  let h = await sd.agentHome(sara);
  check("a waiting ticket shows in the queue", h.agent && h.waitingCount === 1 && h.waiting[0].subject === "Waiting one", h.waiting);
  await sd.setAgentStatus(sara, "online");
  h = await sd.agentHome(sara);
  check("going online gives it to her: it is in My tickets", h.mine.length === 1 && h.waitingCount === 0 && h.stats.open === 1 && h.status === "online", { mine: h.mine.length, w: h.waitingCount, s: h.stats });
  const tid = h.mine[0].id;
  await sd.agentReply(sara, tid, { body: "Try again now", status: "solved" });
  h = await sd.agentHome(sara);
  check("solving counts today, with a first response time", h.stats.solvedToday === 1 && h.stats.open === 0 && h.stats.firstResponseMin !== null, h.stats);
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, started_at, duration_s) VALUES ('call-h1', ?, ?, ?, 'inbound', 'web', 'ended', ?, 95)", tid, s.customer.id, sara.id, new Date().toISOString());
  h = await sd.agentHome(sara);
  check("recent calls and minutes", h.calls.length === 1 && h.calls[0].duration_s === 95 && h.stats.callsToday === 1 && h.stats.callMinutes7 === 2, h.calls);
  check("reading the home does not mark her seen", (await all("SELECT 1 FROM sup_agents WHERE user_id = ?", sara.id)).length === 1);
}

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const admin = await by("admin@demo.local");
  await iconic(admin);
  await supportHome(admin);
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
