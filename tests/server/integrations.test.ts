// Phase 27: Integrate a platform (a stand-in provider on this machine): the docs page leads to its OpenAPI file,
// the right operation is chosen and its fields matched, curl examples work without a spec, the call is made with
// the sealed key, success and the id or payment link are read, every call is logged; SMS, the app's own email and
// payment links go through connected providers; presets; Notion (a stand-in) both ways; Office exports.
process.env.MAIL_FAKE = "1";
import http from "node:http";
import JSZip from "jszip";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import * as C from "../../src/server/connectors";
import * as N from "../../src/server/notion";
import { officeExport } from "../../src/server/office";
import { sendSystemEmail } from "../../src/server/email";
import { createDoc, saveDoc } from "../../src/server/dev-studio";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const seen: { path: string; auth: string | undefined; body: string; type: string | undefined }[] = [];
const notionPages: Record<string, unknown>[] = [];
let base = "";
const spec = () => ({
  openapi: "3.0.0",
  info: { title: "TestSMS" },
  servers: [{ url: `${base}/api` }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, schemas: { Send: { type: "object", required: ["phone", "text"], properties: { phone: { type: "string" }, text: { type: "string" }, sender_id: { type: "string" }, priority: { type: "string" } } } } },
  paths: {
    "/messages": { get: { operationId: "listMessages", summary: "List messages" } },
    "/messages/send": { post: { operationId: "sendSms", summary: "Send an SMS", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Send" } } } } } },
    "/balance": { get: { summary: "Account balance" } },
  },
});

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = req.url ?? "/";
    seen.push({ path: u, auth: req.headers.authorization as string | undefined, body, type: req.headers["content-type"] as string | undefined });
    const json = (code: number, v: unknown) => (res.writeHead(code, { "Content-Type": "application/json" }), res.end(JSON.stringify(v)));
    if (u === "/docs") return res.end(`<html><body><div id="swagger"></div><script>SwaggerUIBundle({ url: "/specs/sms.json", dom_id: "#swagger" })</script></body></html>`);
    if (u === "/specs/sms.json") return json(200, spec());
    if (u === "/curl-docs") return res.end(`<html><body><pre><code>curl -X POST ${base}/pay/init \\\n  -H "Authorization: Bearer SECRET" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": "100", "currency": "ETB", "email": "a@b.c", "tx_ref": "x1", "return_url": "https://x"}'</code></pre></body></html>`);
    if (u === "/api/messages/send") {
      if (req.headers.authorization !== "Bearer sms-key") return json(401, { message: "Bad key" });
      const b = JSON.parse(body || "{}");
      return b.phone && b.text ? json(200, { status: "queued", id: "msg-77" }) : json(422, { message: "phone and text needed" });
    }
    if (u === "/pay/init") return json(200, { status: "success", data: { checkout_url: `${base}/checkout/abc` } });
    if (u === "/mail/send") return json(202, { messageId: "m-1" });
    // Notion stand-in.
    if (u === "/notion/users/me") return req.headers.authorization === "Bearer ntn_test" ? json(200, { bot: { workspace_name: "Myseed HQ" } }) : json(401, { message: "API token is invalid." });
    if (u.startsWith("/notion/pages/") && req.method === "GET") return json(200, { properties: { title: { type: "title", title: [{ plain_text: "Team handbook" }] } } });
    if (u === "/notion/pages" && req.method === "POST") return notionPages.push(JSON.parse(body)), json(200, { id: `pg${notionPages.length}`, url: `https://notion.so/pg${notionPages.length}` });
    if (u === "/notion/databases") return json(200, { id: "db1", url: "https://notion.so/db1" });
    if (/^\/notion\/blocks\/.*\/children/.test(u)) return req.method === "PATCH" ? json(200, {}) : json(200, { results: [{ type: "heading_1", heading_1: { rich_text: [{ plain_text: "Welcome" }] } }, { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Be on time" }] } }, { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Read this first." }] } }], has_more: false });
    json(404, { message: "nope" });
  });
});

async function main() {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.NOTION_API_URL = `${base}/notion`;
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dev = (await loadUser((await upsertAccount({ name: "intdev", email: "intdev@int.local", title: "Dev", roles: ["developer"], password: "Integrate-2026!", mustChangePassword: false })).id))!;
  await setPosition(admin, "dev", dev.id, "member");

  // Reading the documentation.
  check("only Admin connects platforms", /Only Admin/.test((await throws(() => C.setupFromDocs(dev, { url: `${base}/docs`, capability: "sms" }))) ?? ""));
  const s = await C.setupFromDocs(admin, { url: `${base}/docs`, capability: "sms" });
  check("the docs page leads to its OpenAPI file", s.discovery.source === "openapi" && s.discovery.specUrl === `${base}/specs/sms.json` && s.discovery.count === 3, s.discovery);
  check("the send operation is chosen, not list or balance", s.draft.operation.method === "POST" && s.draft.operation.path === "/messages/send", s.draft.operation);
  check("its fields are matched to the app's", s.draft.operation.map.phone === "{{to}}" && s.draft.operation.map.text === "{{message}}" && s.draft.operation.map.sender_id === "{{sender}}", s.draft.operation.map);
  check("the sign-in is read from the spec", s.draft.auth.kind === "bearer" && s.draft.baseUrl === `${base}/api`);
  const pasted = await C.setupFromDocs(admin, { spec: JSON.stringify(spec()).replace(/"openapi":"3.0.0"/, '"openapi":"3.0.0"'), capability: "sms" });
  check("a pasted spec works too", pasted.draft.operation.path === "/messages/send");
  const yaml = (await import("yaml")).default.stringify(spec());
  check("and YAML", (await C.setupFromDocs(admin, { spec: yaml, capability: "sms" })).discovery.count === 3);
  const curl = await C.setupFromDocs(admin, { url: `${base}/curl-docs`, capability: "payment" });
  check("without a spec, the curl examples are read", curl.discovery.source === "curl" && curl.draft.operation.path === "/pay/init" && curl.draft.auth.kind === "bearer" && curl.draft.operation.map.amount === "{{amount}}" && curl.draft.operation.map.tx_ref === "{{reference}}", curl.draft);
  check("a page with nothing to read says so", /No API operations/.test((await throws(() => C.setupFromDocs(admin, { url: `${base}/nothing`, capability: "sms" }))) ?? ""));

  // Saving, testing, switching on.
  const smsId = await C.saveConnector(admin, { ...s.draft, operations: s.discovery.operations, secrets: { token: "sms-key" }, status: "draft" });
  const list = await C.listConnectors(admin);
  const sms = list.find((c) => c.id === smsId)!;
  check("keys are sealed, only their names shown", sms.hasSecrets && sms.secretNames.includes("token") && !JSON.stringify(list).includes("sms-key"));
  check("a draft is not used yet", !(await C.smsAvailable()));
  const t = await C.testConnector(admin, smsId, { to: "+251911223344", message: "Hello from the test" });
  check("a test call is made with the key, and its id read", t.ok && t.id === "msg-77" && seen.some((x) => x.path === "/api/messages/send" && x.auth === "Bearer sms-key" && /"phone":"\+251911223344"/.test(x.body)), t);
  await C.saveConnector(admin, { ...sms, id: smsId, status: "active" });
  const sent = await C.sendSms("0911 22 33 44", "Your leave was approved");
  check("switched on, the app sends SMS through it", sent.id === "msg-77" && (await C.listConnectors(admin)).find((c) => c.id === smsId)!.isDefault);
  check("a bad number is refused before calling", /too short/.test((await throws(() => C.sendSms("12", "x"))) ?? ""));
  await C.saveConnector(admin, { ...sms, id: smsId, status: "active", secrets: { token: "wrong" } });
  check("a refused call says why", /Bad key/.test((await throws(() => C.sendSms("+251911223344", "x"))) ?? ""));
  const log = await C.callLog(admin);
  check("every call is logged, without secrets or the message", log.length >= 3 && log.some((l) => !l.ok && /Bad key/.test(l.error ?? "")) && !JSON.stringify(log).includes("Your leave"), log.slice(0, 2));

  // Payments.
  const payId = await C.saveConnector(admin, { ...curl.draft, response: { okPath: "status", okValue: "success", urlPath: "data.checkout_url" }, secrets: { token: "pay" }, status: "active" });
  check("Finance or Admin only ask for payments", /Only Finance/.test((await throws(() => C.createPaymentLink(dev, { amount: 50, description: "x" }))) ?? ""));
  const link = await C.createPaymentLink(admin, { amount: 250, description: "Grade 9 package", email: "parent@x.et", name: "Abebe Kebede" });
  check("a payment link comes back", link.url === `${base}/checkout/abc` && /^MS-/.test(link.reference), link);
  void payId;

  // The app's own email through a connected provider.
  const mailId = await C.saveConnector(admin, { name: "Mail API", capability: "email", baseUrl: base, auth: { kind: "header", name: "api-key" }, operation: { method: "POST", path: "/mail/send", contentType: "json", map: { "to.0.email": "{{to}}", subject: "{{subject}}", textContent: "{{text}}", "sender.email": "{{from}}" }, headers: {} }, response: { idPath: "messageId" }, secrets: { token: "mk" }, status: "active", useForSystem: true });
  await sendSystemEmail("someone@x.et", "Welcome", "Hello");
  const m = seen.filter((x) => x.path === "/mail/send").pop();
  check("chosen for the app's email, it is used instead of SMTP", !!m && /"to":\[\{"email":"someone@x.et"\}\]/.test(m.body) && /"subject":"Welcome"/.test(m.body), m);
  await C.saveConnector(admin, { ...(await C.listConnectors(admin)).find((c) => c.id === mailId)!, id: mailId, useForSystem: false, status: "active" });

  // Presets.
  const pid = await C.installPreset(admin, "chapa");
  const chapa = (await C.listConnectors(admin)).find((c) => c.id === pid)!;
  check("a preset is ready to fill in (Chapa)", chapa.baseUrl === "https://api.chapa.co" && chapa.operation.map.tx_ref === "{{reference}}" && chapa.status === "draft");
  check("presets cover SMS, email and payments", ["sms", "email", "payment"].every((c) => C.PRESETS.some((p) => p.capability === c)) && C.PRESETS.some((p) => p.region === "Ethiopia"));

  // Notion.
  check("a wrong Notion secret is refused", /invalid/.test((await throws(() => N.connectNotion(admin, { token: "bad", parentPage: "https://www.notion.so/Team-0123456789abcdef0123456789abcdef" }))) ?? ""));
  await N.connectNotion(admin, { token: "ntn_test", parentPage: "https://www.notion.so/Team-0123456789abcdef0123456789abcdef" });
  check("Notion connects", (await N.notionStatus()).connected && (await N.notionStatus()).workspace === "Myseed HQ" && (await N.notionStatus()).parentPageId === "01234567-89ab-cdef-0123-456789abcdef");
  const docId = await createDoc(dev, "dev", { kind: "note", template: "note" });
  await saveDoc(dev, "dev", docId, { title: "Release plan", body: "# Plan\n- Ship **v2**\n1. Test\n```\nnpm test\n```" });
  const sentDoc = await N.docToNotion(dev, "dev", docId);
  const page = notionPages[notionPages.length - 1] as { children: { type: string }[]; properties: { title: { title: { text: { content: string } }[] } } };
  check("a document goes to Notion as a page with its blocks", sentDoc.blocks === 4 && page.properties.title.title[0]!.text.content === "Release plan" && page.children.map((b) => b.type).join(",") === "heading_1,bulleted_list_item,numbered_list_item,code", page.children.map((b) => b.type));
  const back = await N.notionToDoc(dev, "dev", { page: "0123456789abcdef0123456789abcdef" });
  const doc = await get<{ title: string; body: string }>("SELECT title, body FROM dept_docs WHERE id = ?", back);
  check("a Notion page comes back as a document", doc?.title === "Team handbook" && doc.body === "# Welcome\n- Be on time\nRead this first.", doc);
  const ds = await N.datasetToNotion(admin, "People", [{ Name: "Abebe", Age: 30 }, { Name: "Hana", Age: 28 }]);
  check("a dataset goes to Notion as a database", ds.rows === 2 && ds.url === "https://notion.so/db1");

  // Office.
  for (const f of ["xlsx", "docx", "pptx"] as const) {
    const o = await officeExport(admin, "dept_tasks", f);
    const zip = await JSZip.loadAsync(o.data);
    check(`a dataset as ${f}`, o.name.endsWith(`.${f}`) && Object.keys(zip.files).some((k) => (f === "xlsx" ? /xl\/worksheets/ : f === "docx" ? /word\/document/ : /ppt\/slides/).test(k)));
  }
  check("Office exports follow the dataset's rights", /cannot see/.test((await throws(() => officeExport(dev, "headcount", "xlsx"))) ?? ""));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => (server.close(), closeDb()));
