// Phase 14 checks: mailboxes made through a (fake) cPanel API with passwords nobody sees, reading folders and
// messages safely, search, archive, stars, attachments, sending between mailboxes with a copy in Sent, drafts, and
// privacy (nobody opens another person's mail unless Admin allows it, and then read-only, recorded and told).
process.env.MAIL_FAKE = "1";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as mail from "../../src/server/mail";
import { shellCounts } from "../../src/server/shell";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

// A stand-in for cPanel's UAPI: records each call, checks the token.
const calls: { fn: string; q: Record<string, string>; auth: string }[] = [];
const existing = ["old.box@myseed.test", "info@myseed.test"];
const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  const fn = u.pathname.split("/").at(-1)!;
  const auth = req.headers.authorization ?? "";
  calls.push({ fn, q: Object.fromEntries(u.searchParams), auth });
  res.setHeader("Content-Type", "application/json");
  if (auth !== "cpanel myseed:TOKEN123") return res.end(JSON.stringify({ status: 0, errors: ["Access denied"], data: null }));
  if (fn === "list_pops_with_disk") return res.end(JSON.stringify({ status: 1, errors: null, data: existing.map((email) => ({ email, _diskused: 1048576 * 3, _diskquota: 1048576 * 1024 })) }));
  if (fn === "add_pop" && u.searchParams.get("email") === "taken") return res.end(JSON.stringify({ status: 0, errors: ["The account taken@myseed.test already exists!"], data: null }));
  res.end(JSON.stringify({ status: 1, errors: null, data: null }));
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, name: string) => (await loadUser((await upsertAccount({ name, email: `${key}@people.local`, title: "Staff", roles: ["developer"], password: "Mail-Test-2026!", mustChangePassword: false })).id))!;
  const abebe = await mk("abebe", "Abebe Kebede");
  const sara = await mk("sara", "Sara Haile");
  const other = await mk("other", "Other Person");

  // Settings
  check("only email managers change mailbox settings", !!(await throws(() => mail.saveMailConfig(abebe, { imapHost: "", imapPort: 993, imapSecure: true, cpanelUrl: "", cpanelUser: "", domain: "", quotaMb: 0, adminOpen: true }))));
  await mail.saveMailConfig(admin, { imapHost: "", imapPort: 993, imapSecure: true, cpanelUrl: `http://127.0.0.1:${port}`, cpanelUser: "myseed", cpanelToken: "WRONG", domain: "myseed.test", quotaMb: 512, adminOpen: false });
  const cfg = await mail.mailConfig();
  check("the token is kept sealed, never shown", cfg.hasToken && !JSON.stringify(cfg).includes("WRONG") && !(await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.mail'"))!.value.includes("WRONG"));
  const bad = await mail.checkCpanel(admin);
  check("a wrong token is reported by the check", bad[0]?.status === "fail" && /Access denied/.test(bad[0].detail), bad);
  await mail.saveMailConfig(admin, { ...cfg, cpanelToken: "TOKEN123" });
  check("the check signs in to cPanel", (await mail.checkCpanel(admin))[0]?.status === "ok");
  check("cPanel's mailboxes are listed", (await mail.cpanelMailboxes(admin)).map((m) => m.address).join() === "info@myseed.test,old.box@myseed.test");

  // Creating and taking over
  check("people cannot create mailboxes", !!(await throws(() => mail.createMailbox(abebe, { userId: abebe.id, local: "abebe" }))));
  const a = await mail.createMailbox(admin, { userId: abebe.id, local: "abebe" });
  const add = calls.find((c) => c.fn === "add_pop")!;
  check("a new mailbox is made at cPanel with the quota", a.address === "abebe@myseed.test" && add.q.email === "abebe" && add.q.domain === "myseed.test" && add.q.quota === "512");
  const pw = add.q.password!;
  check("its password is long and random", pw.length >= 24);
  const stored = JSON.stringify(await all("SELECT * FROM email_senders")) + JSON.stringify(await all("SELECT * FROM audit_events"));
  check("the password is stored nowhere in plain text", !stored.includes(pw));
  check("a refusal from cPanel is shown", /already exists/.test((await throws(() => mail.createMailbox(admin, { userId: other.id, local: "taken" }))) ?? ""));
  check("one mailbox per person", /already has/.test((await throws(() => mail.connectMailbox(admin, { userId: abebe.id, address: "second@myseed.test", password: "x" }))) ?? ""));
  const s = await mail.takeOverMailbox(admin, { userId: sara.id, address: "old.box@myseed.test" });
  const pwd = calls.find((c) => c.fn === "passwd_pop")!;
  check("taking over an existing mailbox changes its password at cPanel", s.address === "old.box@myseed.test" && pwd.q.email === "old.box" && pwd.q.domain === "myseed.test" && pwd.q.password!.length >= 24);
  check("Admin sees who has a mailbox", (await mail.mailboxes(admin)).filter((b) => b.mailbox).length === 2);

  // Reading
  const home = await mail.mailHome(abebe);
  const roles = home.folders.map((f) => f.role).join();
  check("folders come in order with their roles", roles === "inbox,drafts,sent,junk,trash", roles);
  check("the inbox counts unread", home.folders[0]!.unread === 2 && home.folders[0]!.name === "Inbox");
  let list = await mail.mailList(abebe, { folder: "INBOX" });
  check("the list is newest first", list.total === 3 && list.rows[0]!.subject === "Question about the maths lessons", list.rows.map((r) => r.subject));
  const report = list.rows.find((r) => r.subject === "Monthly report")!;
  check("attachments are flagged in the list", report.attachments && !report.seen);
  let m = await mail.mailMessage(abebe, { folder: "INBOX", uid: report.uid });
  check("scripts are removed with their content", !/<script|alert\(1\)/i.test(m.html ?? "") && /Downloads went up/.test(m.html ?? ""));
  check("outside pictures are blocked until asked", m.remoteImages && /img-src data:"/.test(m.html ?? "") && !/img-src data: https:/.test(m.html ?? ""));
  m = await mail.mailMessage(abebe, { folder: "INBOX", uid: report.uid, images: true });
  check("Show images allows them", /img-src data: https: http:/.test(m.html ?? ""));
  check("opening marks it read", (await mail.mailFolders(abebe))[0]!.unread === 1);
  check("the attachment is listed", m.attachments.length === 1 && m.attachments[0]!.name === "report.csv");
  const file = await mail.mailAttachment(abebe, { folder: "INBOX", uid: report.uid, index: 0 });
  check("and downloads", file.data.toString().includes("October,1200"));
  check("unsafe HTML handlers and links are removed", !/onerror|javascript:/i.test(mail.safeHtml('<img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a>', new Map(), false)));
  check("search finds by words in the body", (await mail.mailList(abebe, { folder: "INBOX", q: "offline" })).total === 1);

  // Changing
  await mail.mailAct(abebe, { folder: "INBOX", uids: [report.uid], action: "star" });
  check("starred filter", (await mail.mailList(abebe, { folder: "INBOX", only: "starred" })).rows[0]?.uid === report.uid);
  await mail.mailAct(abebe, { folder: "INBOX", uids: [report.uid], action: "archive" });
  const withArchive = await mail.mailFolders(abebe);
  const archive = withArchive.find((f) => f.role === "archive");
  check("Archive is made when first used, next to the others", archive?.path === "INBOX.Archive" && archive.total === 1, withArchive);
  const junk = withArchive.find((f) => f.role === "junk")!;
  const spam = (await mail.mailList(abebe, { folder: junk.path })).rows[0]!;
  await mail.mailAct(abebe, { folder: junk.path, uids: [spam.uid], action: "trash" });
  const trash = (await mail.mailFolders(abebe)).find((f) => f.role === "trash")!;
  check("delete moves to Trash", trash.total === 1);
  await mail.mailAct(abebe, { folder: trash.path, uids: [(await mail.mailList(abebe, { folder: trash.path })).rows[0]!.uid], action: "trash" });
  check("delete in Trash is for good", (await mail.mailFolders(abebe)).find((f) => f.role === "trash")!.total === 0);

  // Sending and drafts
  const draft = await mail.mailSaveDraft(abebe, { to: ["old.box@myseed.test"], subject: "Lesson plan", text: "Draft text" });
  check("a draft goes to Drafts", (await mail.mailFolders(abebe)).find((f) => f.role === "drafts")!.total === 1);
  const back = await mail.mailDraft(abebe, { folder: draft.folder, uid: draft.uid! });
  check("a draft opens again with its fields", back.subject === "Lesson plan" && back.to[0] === "old.box@myseed.test" && back.text.trim() === "Draft text");
  check("a wrong address is refused", /not an email address/.test((await throws(() => mail.mailSend(abebe, { to: ["nope"], subject: "x", text: "y" }))) ?? ""));
  const sent = await mail.mailSend(abebe, { to: ["old.box@myseed.test"], bcc: ["boss@elsewhere.test"], subject: "Lesson plan", text: "Here it is.", draftUid: draft.uid, attachments: [{ name: "plan.txt", type: "text/plain", base64: Buffer.from("Week 1").toString("base64") }] });
  const fa = await mail.mailFolders(abebe);
  check("sending removes the draft", fa.find((f) => f.role === "drafts")!.total === 0);
  const sentBox = fa.find((f) => f.role === "sent")!;
  const sentRow = (await mail.mailList(abebe, { folder: sentBox.path })).rows[0];
  check("a copy is kept in Sent, read", sentBox.total === 1 && sentRow?.seen === true && sentRow.subject === "Lesson plan");
  const sinbox = await mail.mailList(sara, { folder: "INBOX" });
  const got = sinbox.rows.find((r) => r.subject === "Lesson plan")!;
  check("the other mailbox receives it", !!got && got.attachments);
  const gm = await mail.mailMessage(sara, { folder: "INBOX", uid: got.uid });
  check("Bcc is not shown to the recipient", !JSON.stringify(gm).includes("boss@elsewhere.test"));
  await mail.mailSend(sara, { to: ["abebe@myseed.test"], subject: "Re: Lesson plan", text: "Thanks", inReplyTo: gm.messageId, references: gm.references, replied: { folder: "INBOX", uid: got.uid } });
  check("the replied message is marked answered", (await mail.mailList(sara, { folder: "INBOX" })).rows.find((r) => r.uid === got.uid)?.answered === true);
  const ar = (await mail.mailList(abebe, { folder: "INBOX" })).rows.find((r) => r.subject === "Re: Lesson plan")!;
  const am = await mail.mailMessage(abebe, { folder: "INBOX", uid: ar.uid });
  check("a reply keeps the thread", am.references.includes(sent.messageId), { refs: am.references, id: sent.messageId });
  // Forwarding takes the attachments along.
  await mail.mailSend(sara, { to: ["abebe@myseed.test"], subject: "Fwd: Lesson plan", text: "See below", forward: { folder: "INBOX", uid: got.uid } });
  const fw = (await mail.mailList(abebe, { folder: "INBOX" })).rows.find((r) => r.subject === "Fwd: Lesson plan")!;
  check("forwarding keeps the attachments", (await mail.mailMessage(abebe, { folder: "INBOX", uid: fw.uid })).attachments.some((x) => x.name === "plan.txt"));

  // Privacy
  check("a person cannot open someone else's mailbox", /private/.test((await throws(() => mail.mailHome(sara, a.id))) ?? ""));
  check("nor can an email manager while Admin has not allowed it", /private/.test((await throws(() => mail.mailHome(admin, a.id))) ?? ""));
  check("someone with no mailbox is told", /do not have a mailbox/.test((await throws(() => mail.mailHome(other))) ?? ""));
  await mail.saveMailConfig(admin, { ...(await mail.mailConfig()), adminOpen: true });
  const before = (await mail.mailFolders(abebe))[0]!.unread;
  const opened = await mail.mailHome(admin, a.id);
  check("allowed, an email manager opens it read-only", opened.box.other && opened.box.address === "abebe@myseed.test");
  check("the opening is recorded", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'mail.open_other'")));
  check("and the person is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE ?", abebe.id, "%opened your mailbox%")));
  const unreadRow = (await mail.mailList(admin, { box: a.id, folder: "INBOX" })).rows.find((r) => !r.seen)!;
  await mail.mailMessage(admin, { box: a.id, folder: "INBOX", uid: unreadRow.uid });
  check("reading it does not mark it read", (await mail.mailFolders(abebe))[0]!.unread === before);
  check("nothing can be changed or sent from it", /read-only/.test((await throws(() => mail.mailAct(admin, { box: a.id, folder: "INBOX", uids: [unreadRow.uid], action: "trash" }))) ?? "") && /read-only/.test((await throws(() => mail.mailSend(admin, { box: a.id, to: ["x@y.test"], subject: "s", text: "t" }))) ?? ""));
  check("a person still cannot open others when Admin allows managers", /private/.test((await throws(() => mail.mailHome(sara, a.id))) ?? ""));

  // Sidebar and the scheduled check
  const r = await mail.checkAllMailboxes();
  check("the scheduled check reads every mailbox", r.checked === 2);
  const counts = await shellCounts(abebe);
  check("the sidebar knows the mailbox and its unread", counts.mailbox === true && counts.mail === (await mail.mailFolders(abebe))[0]!.unread, counts);
  check("someone without a mailbox has none", (await shellCounts(other)).mailbox === false);

  // Turning off and removing
  await mail.setMailboxOn(admin, s.id, false);
  check("with the inbox off the person has no mailbox", /do not have a mailbox/.test((await throws(() => mail.mailHome(sara))) ?? ""));
  await mail.newMailboxPassword(admin, a.id);
  check("a new password is set through cPanel", calls.filter((c) => c.fn === "passwd_pop" && c.q.email === "abebe").length === 1);
  await mail.removeMailbox(admin, a.id, true);
  check("removing can delete it at cPanel", calls.some((c) => c.fn === "delete_pop" && c.q.email === "abebe") && !(await get("SELECT 1 AS x FROM email_senders WHERE id = ?", a.id)));
  check("a mailbox entered by hand cannot be deleted at cPanel", !!(await throws(async () => mail.removeMailbox(admin, (await mail.connectMailbox(admin, { userId: other.id, address: "other@myseed.test", password: "secret" })).id, true))));

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
