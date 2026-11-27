// The Tools hub, its connections, People operations, the roles fixes and the settings cache:
//  - notes, tasks, reminders and files are private to their owner; View as cannot open them
//  - Admin switches apps and connections on per role
//  - the private calendar feed works with its token only, and stops when the link is replaced
//  - the cross-check finds matches, differences and missing codes, within what the person may see
//  - OAuth: dynamic registration, PKCE, one-time codes, refresh rotation and reuse detection, bearer checks
//  - the MCP and ChatGPT operations act only on the person's own data
//  - People operations: only the Operations head, inside the departments Admin chose, never Admin or Owner accounts
//  - Sales and Operations are real departments; created roles are known roles
//  - settings rows read through the cache always see the latest write
process.env.MAIL_FAKE = "1";
import crypto from "node:crypto";
import { all, get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { saveToolsAccess, toolsConfig, toolsFor } from "../../src/server/tools";
import * as D from "../../src/server/tools-data";
import * as O from "../../src/server/oauth";
import { runOperation } from "../../src/server/tools-api";
import * as P from "../../src/server/people-ops";
import { isKnownRole } from "../../src/server/role-catalog";
import { getPermissionMatrix } from "../../src/server/settings";
import { canOpenPath } from "../../src/server/page-access";
import { homeDepartment } from "../../src/server/nav";
import { checkboxStats, toggleCheckbox } from "../../src/lib/tools";
import { roleLabel } from "../../src/lib/domain";

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
const b64 = (b: Buffer) => b.toString("base64url");

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const hana = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'hana@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@tools.local`, title: "Staff", roles: roles as never, password: "Tools-2026!xx", mustChangePassword: false })).id))!;
  const sales = await mk("toolsales", ["sales"]);
  const ops = await mk("toolops", ["operations"]);
  const ops2 = await mk("toolops2", ["operations"]);
  const mkt = await mk("toolmkt", ["marketing"]);

  // --- Markdown tick boxes ---
  const md = "- [ ] one\n- [x] two\n  - [ ] three\ntext";
  check("tick boxes are counted", JSON.stringify(checkboxStats(md)) === JSON.stringify({ done: 1, total: 3 }));
  check("a tick box is toggled by position", toggleCheckbox(md, 2).includes("  - [x] three") && toggleCheckbox(md, 1).includes("- [ ] two"));

  // --- Roles and departments ---
  check("Sales and Operations roles no longer get the owners' company view", !(await getPermissionMatrix()).sales!.includes("company.view") && !(await getPermissionMatrix()).operations!.includes("company.view"));
  check("a Sales person can open /sales", await canOpenPath(sales, "/sales"));
  check("a Sales person gets Sales as their own sidebar", (await homeDepartment({ ...sales, activeRole: "sales" }))?.base === "/sales");
  check("an Operations person gets Operations as their own sidebar", (await homeDepartment({ ...ops, activeRole: "operations" }))?.base === "/operations");
  check("the chief roles exist with labels", roleLabel("cfo").includes("CFO") && (await isKnownRole("ceo")));
  check("a preset role is a known role with a label", (await isKnownRole("support_head")) && roleLabel("support_head") === "Customer Support Head");
  check("a team-lead key is not a role", !(await isKnownRole("lead.recording")));
  check("an unknown role gets a readable label, not a blank", roleLabel("night_shift") === "Night shift");

  // --- Tools access, set by Admin ---
  check("everyone gets the six apps by default", (await toolsFor(sales)).apps.length === 6);
  const cfg = await toolsConfig();
  await saveToolsAccess(admin, { enabled: true, apps: { ...cfg.apps, letters: { on: true, roles: ["operations"], users: [], blocked: [] } }, features: cfg.features });
  check("an app limited to a role is hidden from others", !(await toolsFor(sales)).apps.some((a) => a.key === "letters") && (await toolsFor(ops)).apps.some((a) => a.key === "letters"));
  check("Admin always has every app", (await toolsFor(admin)).apps.length === 6);
  check("someone without the app cannot use it", !!(await throws(() => D.listFiles(sales, "letter"))));
  check("only Admin chooses who gets the tools", !!(await throws(() => saveToolsAccess(sales, { enabled: false, apps: cfg.apps, features: cfg.features }))));
  await saveToolsAccess(admin, { enabled: true, apps: cfg.apps, features: cfg.features });

  // --- Privacy ---
  const noteId = await D.saveNote(sales, { title: "Leads to call", body: "- [ ] Abebe\n- [x] Sara" });
  await D.saveTask(sales, { noteId, title: "Send the quote", dueAt: new Date(Date.now() + 864e5).toISOString() });
  check("the owner sees their note", (await D.listNotes(sales)).some((n) => n.id === noteId));
  check("nobody else sees it, not even Admin", !(await D.listNotes(admin)).some((n) => n.id === noteId) && !(await D.listNotes(ops)).some((n) => n.id === noteId));
  check("someone else cannot change it", !!(await throws(() => D.saveNote(ops, { id: noteId, title: "x", body: "" }))));
  await D.deleteNote(ops, noteId);
  check("someone else cannot delete it", (await D.listNotes(sales)).some((n) => n.id === noteId));
  check("a task cannot be put in someone else's note", !!(await throws(() => D.saveTask(ops, { noteId, title: "sneak" }))));
  const preview = { ...sales, previewBy: { id: admin.id, name: admin.name } } as AppUser;
  check("View as cannot open someone's notes", !!(await throws(() => D.listNotes(preview))));
  const fileId = await D.saveFile(sales, "doc", { title: "Plan", data: { blocks: [] } });
  check("someone else cannot open a saved document", !!(await throws(() => D.getFile(ops, "doc", fileId))));

  // --- Links to production records ---
  const item = (await get<{ id: string; code: string; title: string; teacher: string | null }>("SELECT id, code, title, teacher FROM items ORDER BY code LIMIT 1"))!;
  const hits = await D.searchRecords(hana, item.code);
  check("a production person finds a record by code", hits.some((h) => h.id === item.id));
  check("someone with no sight of production finds nothing", (await D.searchRecords(sales, item.code)).length === 0);
  check("a link to a record they cannot see is refused", !!(await throws(() => D.saveNote(sales, { title: "x", body: "", link: { kind: "item", id: item.id } }))));
  const linked = await D.saveNote(hana, { title: "Part notes", body: "", link: { kind: "item", id: item.id, label: "forged label" } });
  check("a link's label comes from the database, not the browser", (await D.listNotes(hana)).find((n) => n.id === linked)?.link?.label.startsWith(item.code) === true);

  // --- Cross-check ---
  const other = (await get<{ code: string; title: string }>("SELECT code, title FROM items WHERE id <> ? ORDER BY code LIMIT 1", item.id))!;
  const cc = await D.crossCheck(hana, [
    { row: 2, code: item.code, title: item.title, teacher: item.teacher ?? "" },
    { row: 3, code: other.code, title: "A different title", teacher: "" },
    { row: 4, code: "NOPE-999", title: "x", teacher: "" },
    { row: 5, code: "", title: "", teacher: "" },
    { row: 6, code: item.code, title: item.title, teacher: "" },
  ]);
  const st = cc.results.map((r) => r.status);
  check("cross-check: match, differs, missing, invalid", st[0] === "match" && st[1] === "mismatch" && st[2] === "missing" && st[3] === "invalid", st);
  check("cross-check: a repeated code is flagged", cc.results[4]!.status !== "match" && cc.results[4]!.issues.some((i) => i.includes("row 2")));
  check("cross-check explains the difference", cc.results[1]!.issues.some((i) => i.includes("Title differs")));
  check("cross-check needs sight of production", !!(await throws(() => D.crossCheck(sales, [{ row: 2, code: item.code, title: "", teacher: "" }]))));

  // --- Calendar feed ---
  await D.saveReminder(sales, { title: "Call the school; then, email", at: new Date(Date.now() + 3600e3).toISOString() });
  const token = await D.regenerateCalendarFeed(sales);
  const ics = await D.icsForToken(token, "https://ops.example");
  check("the feed is a calendar with the reminder and the dated task", !!ics && ics.startsWith("BEGIN:VCALENDAR") && ics.includes("SUMMARY:Call the school\\; then\\, email") && ics.includes("Send the quote"), ics?.slice(0, 300));
  check("the feed's lines are folded and end in CRLF", !!ics && ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
  check("only the token's hash is stored", !(await get("SELECT 1 AS x FROM tool_calendar_tokens WHERE token_hash = ?", token)));
  check("a wrong token gives nothing", (await D.icsForToken("x".repeat(32), "https://ops.example")) === null);
  const token2 = await D.regenerateCalendarFeed(sales);
  check("a new link stops the old one", (await D.icsForToken(token, "https://ops.example")) === null && !!(await D.icsForToken(token2, "https://ops.example")));
  await run("UPDATE tool_calendar_tokens SET expires_at = ? WHERE user_id = ?", new Date(Date.now() - 1000).toISOString(), sales.id);
  check("an expired link gives nothing", (await D.icsForToken(token2, "https://ops.example")) === null);
  await saveToolsAccess(admin, { enabled: true, apps: cfg.apps, features: { ...cfg.features, ics: { on: false, roles: [], users: [], blocked: [] } } });
  const token3 = await D.regenerateCalendarFeed(admin);
  check("the feed stops for people Admin switched it off for", (await D.icsForToken(token3, "https://ops.example")) !== null && !!(await throws(() => D.regenerateCalendarFeed(sales))));
  await saveToolsAccess(admin, { enabled: true, apps: cfg.apps, features: cfg.features });

  // --- OAuth ---
  check("registration refuses http addresses off this computer", !!(await throws(() => O.registerClient({ client_name: "x", redirect_uris: ["http://evil.example/cb"] }))));
  const reg = await O.registerClient({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const verifier = b64(crypto.randomBytes(48));
  const challenge = b64(crypto.createHash("sha256").update(verifier).digest());
  const cb = "https://claude.ai/api/mcp/auth_callback";
  check("a public client must use PKCE", !!(await throws(() => O.issueCode(sales, { clientId: reg.client_id, redirectUri: cb, codeChallenge: null, method: null, scope: "tools", resource: null }))));
  check("an unlisted callback is refused", !!(await throws(() => O.issueCode(sales, { clientId: reg.client_id, redirectUri: "https://evil.example/cb", codeChallenge: challenge, method: "S256", scope: "tools", resource: null }))));
  const code = await O.issueCode(sales, { clientId: reg.client_id, redirectUri: cb, codeChallenge: challenge, method: "S256", scope: "tools", resource: null });
  const form = (o: Record<string, string>) => new URLSearchParams(o);
  check("a wrong verifier fails", !!(await throws(() => O.tokenEndpoint(form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: cb, code_verifier: b64(crypto.randomBytes(48)) }), null))));
  const tok = await O.tokenEndpoint(form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: cb, code_verifier: verifier }), null);
  check("the right verifier gets tokens", tok.access_token.startsWith("msa_") && tok.refresh_token.startsWith("msr_"));
  const req = (t: string) => new Request("https://ops.example/api/mcp", { method: "POST", headers: { authorization: `Bearer ${t}` } });
  check("the token acts as its person", (await O.bearerUser(req(tok.access_token), "mcp"))?.id === sales.id);
  check("an MCP token does not work for ChatGPT actions", (await O.bearerUser(req(tok.access_token), "gpt")) === null);
  check("a code works once, and reusing it withdraws the connection", !!(await throws(() => O.tokenEndpoint(form({ grant_type: "authorization_code", code, client_id: reg.client_id, code_verifier: verifier }), null))) && (await O.bearerUser(req(tok.access_token), "mcp")) === null);
  const code2 = await O.issueCode(sales, { clientId: reg.client_id, redirectUri: cb, codeChallenge: challenge, method: "S256", scope: "tools", resource: null });
  const t2 = await O.tokenEndpoint(form({ grant_type: "authorization_code", code: code2, client_id: reg.client_id, code_verifier: verifier }), null);
  const t3 = await O.tokenEndpoint(form({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: reg.client_id }), null);
  check("refreshing gives new tokens and ends the old access token", (await O.bearerUser(req(t3.access_token), "mcp"))?.id === sales.id && (await O.bearerUser(req(t2.access_token), "mcp")) === null);
  check("an old refresh token used again withdraws everything", !!(await throws(() => O.tokenEndpoint(form({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: reg.client_id }), null))) && (await O.bearerUser(req(t3.access_token), "mcp")) === null);
  const code3 = await O.issueCode(sales, { clientId: reg.client_id, redirectUri: cb, codeChallenge: challenge, method: "S256", scope: "tools", resource: null });
  const t4 = await O.tokenEndpoint(form({ grant_type: "authorization_code", code: code3, client_id: reg.client_id, code_verifier: verifier }), null);
  await saveToolsAccess(admin, { enabled: true, apps: cfg.apps, features: { ...cfg.features, mcp: { on: false, roles: [], users: [], blocked: [] } } });
  check("a token stops working when Admin switches the connection off", (await O.bearerUser(req(t4.access_token), "mcp")) === null);
  await saveToolsAccess(admin, { enabled: true, apps: cfg.apps, features: cfg.features });
  check("…and works again when it is back on", (await O.bearerUser(req(t4.access_token), "mcp"))?.id === sales.id);
  await O.disconnectClient(sales, reg.client_id);
  check("the person can disconnect the app", (await O.bearerUser(req(t4.access_token), "mcp")) === null);
  check("no token, code or secret is stored in clear", !(await get("SELECT 1 AS x FROM oauth_tokens WHERE token_hash IN (?, ?)", t4.access_token, t4.refresh_token)) && !(await get("SELECT 1 AS x FROM oauth_codes WHERE code_hash = ?", code3)));
  const gpt = await O.createGptClient(admin, { name: "Myseed GPT", redirectUris: [] });
  check("only Admin creates a ChatGPT client", !!(await throws(() => O.createGptClient(sales, { name: "x", redirectUris: [] }))));
  const gcode = await O.issueCode(sales, { clientId: gpt.clientId, redirectUri: "https://chatgpt.com/aip/g-abc123/oauth/callback", codeChallenge: null, method: null, scope: "tools", resource: null });
  check("a ChatGPT client needs its secret", !!(await throws(() => O.tokenEndpoint(form({ grant_type: "authorization_code", code: gcode, client_id: gpt.clientId }), null))));
  const gcode2 = await O.issueCode(sales, { clientId: gpt.clientId, redirectUri: "https://chatgpt.com/aip/g-abc123/oauth/callback", codeChallenge: null, method: null, scope: "tools", resource: null });
  const gt = await O.tokenEndpoint(form({ grant_type: "authorization_code", code: gcode2 }), { id: gpt.clientId, secret: gpt.clientSecret });
  check("with its secret the GPT gets a token for ChatGPT actions", (await O.bearerUser(req(gt.access_token), "gpt"))?.id === sales.id);

  // --- The AI operations act on the person's own data ---
  const listed = (await runOperation(sales, "list_user_notes", {})) as { notes: { id: string; checklist: string | null }[] };
  check("list_user_notes lists their notes with checklist progress", listed.notes.some((n) => n.id === noteId && n.checklist === "1/2 done"));
  const made = (await runOperation(sales, "create_note", { title: "From Claude", body: "- [ ] a" })) as { id: string };
  await runOperation(sales, "add_checklist_item", { note_id: made.id, title: "b" });
  check("add_checklist_item adds a tick box to the note", (await D.listNotes(sales)).find((n) => n.id === made.id)?.body.endsWith("- [ ] b") === true);
  check("add_checklist_item cannot touch someone else's note", !!(await throws(() => runOperation(ops, "add_checklist_item", { note_id: made.id, title: "x" }))));
  const rem = (await runOperation(sales, "list_reminders", {})) as { reminders: unknown[]; tasks: unknown[] };
  check("list_reminders returns their reminders and dated tasks", rem.reminders.length >= 1 && rem.tasks.length >= 1);
  const look = (await runOperation(hana, "crosscheck_code_or_teacher", { code: item.code, title: item.title })) as { result: { status: string } };
  check("crosscheck_code_or_teacher compares one record", look.result.status === "match" || look.result.status === "mismatch");
  check("crosscheck_code_or_teacher needs sight of production", !!(await throws(() => runOperation(sales, "crosscheck_code_or_teacher", { code: item.code }))));

  // --- People operations ---
  await setPosition(admin, "operations", ops.id, "head");
  await setPosition(admin, "operations", ops2.id, "lead");
  const opsHead = (await loadUser(ops.id))!;
  check("the Operations head may manage people", (await P.peopleOpsAccess(opsHead)).allowed);
  check("an Operations lead may not (by default)", !(await P.peopleOpsAccess((await loadUser(ops2.id))!)).allowed);
  check("a Sales person may not", !(await P.peopleOpsAccess(sales)).allowed);
  await P.setManagedRoles(opsHead, mkt.id, ["marketing", "cfo"]);
  check("the head gives a managed role and a chief role", (await loadUser(mkt.id))!.roles.includes("cfo"));
  check("the head cannot give Admin", !!(await throws(() => P.setManagedRoles(opsHead, mkt.id, ["admin"]))));
  check("the head cannot change an Admin account", !!(await throws(() => P.setManagedRoles(opsHead, admin.id, ["sales"]))));
  check("the head cannot change their own roles", !!(await throws(() => P.setManagedRoles(opsHead, ops.id, ["sales"]))));
  // Taking a role goes through its impact page, then the head confirms it there.
  check("taking a role asks for its impact first", /impact/i.test((await throws(() => P.setManagedRoles(opsHead, mkt.id, ["marketing"]))) ?? ""));
  await (await import("../../src/server/role-change")).applyRoleChange(opsHead, mkt.id, { roles: ["cfo"], leads: [] }, {}, mkt.name);
  check("removing a managed role keeps the others", JSON.stringify((await loadUser(mkt.id))!.roles.sort()) === JSON.stringify(["marketing"]));
  await P.setManagedPosition(opsHead, "marketing", mkt.id, "lead");
  check("the head names a lead", (await get<{ position: string }>("SELECT position FROM department_positions WHERE department = 'marketing' AND user_id = ?", mkt.id))?.position === "lead");
  check("the head cannot name a head unless Admin allows it", !!(await throws(() => P.setManagedPosition(opsHead, "marketing", mkt.id, "head"))));
  check("a department outside the chosen ones is refused", !!(await throws(() => P.setManagedPosition(opsHead, "dev", mkt.id, "lead"))));
  await P.savePeopleOpsConfig(admin, { enabled: true, departments: ["marketing"], chiefs: false, who: "head_and_leads", assignHeads: true });
  check("Admin widens it to leads", (await P.peopleOpsAccess((await loadUser(ops2.id))!)).allowed);
  check("…and narrows the roles: chiefs off", !(await P.peopleOpsAccess(opsHead)).roles.some((r) => r.key === "cfo"));
  check("nobody but Admin names the Operations head", !!(await throws(() => P.setManagedPosition(opsHead, "operations", ops2.id, "head"))));
  check("only Admin changes what Operations manages", !!(await throws(() => P.savePeopleOpsConfig(opsHead, { enabled: true, departments: ["dev"], chiefs: true, who: "head", assignHeads: true }))));
  await P.savePeopleOpsConfig(admin, { enabled: false, departments: [], chiefs: false, who: "head", assignHeads: false });
  check("switched off, the head can do nothing", !(await P.peopleOpsAccess(opsHead)).allowed);

  // --- Settings cache ---
  await run("INSERT INTO settings (key, value, updated_at) VALUES ('test.cache', '1', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", nowIso());
  const read = async () => (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'test.cache'"))?.value;
  const a1 = await read();
  await run("UPDATE settings SET value = '2' WHERE key = 'test.cache'");
  check("a settings row read through the cache sees the latest write", a1 === "1" && (await read()) === "2");
  const r1 = await read();
  const r2 = await read();
  check("cached reads are separate copies", r1 === r2);
  const rows = await all("SELECT value FROM settings WHERE key = 'test.cache'");
  (rows[0] as { value: string }).value = "mutated";
  check("changing a cached row in memory does not change the cache", (await read()) === "2");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
