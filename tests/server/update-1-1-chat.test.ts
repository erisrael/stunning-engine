// Update 1.1: support conversations work like the team chat. Replies that quote (public only for the customer),
// emoji reactions both ways, files with captions, calls in the customer's timeline, live updates on reactions;
// Telegram: voice, audio and video kept, agent files sent as themselves, and "Share my phone number" any time with
// the number matched to our records (payments, invoices, other conversations; never sample data).
import crypto from "node:crypto";
import { closeDb, get, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as R from "../../src/server/customer-records";

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

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "Help", keywords: [], members: [sara.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "App", origins: ["https://a.example"], queueId: q, verifyIdentity: true });
  const A = await sd.appByKey((await sd.listApps(admin))[0]!.publicKey, "https://a.example");
  const sign = (id: string) => crypto.createHmac("sha256", app.secret!).update(id).digest("hex");
  const c1 = await sd.identify(A, { id: "c-1", name: "Almaz", hash: sign("c-1") });
  const tid = await sd.customerCreateTicket(A, c1.token, { subject: "Login", message: "I cannot sign in" });
  await sd.assignTicket(admin, tid, sara.id).catch(() => null);

  // Replies.
  const first = (await sd.customerMessages(A, c1.token, tid)).messages[0]!;
  const a1 = await sd.agentReply(sara, tid, { body: "Which phone do you use?", replyTo: first.id });
  const note = await sd.agentReply(sara, tid, { body: "Probably the old app", internal: true });
  check("a public reply cannot quote an internal note", /not in this conversation/.test((await err(() => sd.agentReply(sara, tid, { body: "x", replyTo: note }))) ?? ""));
  check("a note may quote a note", !!(await sd.agentReply(sara, tid, { body: "agreed", internal: true, replyTo: note })));
  check("the customer cannot quote an internal note", /not in this conversation/.test((await err(() => sd.customerReply(A, c1.token, tid, "hi", note))) ?? ""));
  const c2 = await sd.customerReply(A, c1.token, tid, "A Samsung", a1);
  let cm = await sd.customerMessages(A, c1.token, tid);
  const quoted = cm.messages.find((m) => m.id === c2)!;
  check("the customer's reply quotes the agent by first name", quoted.replyTo?.author === "Sara" && quoted.replyTo.body === "Which phone do you use?", quoted.replyTo);
  let d = await sd.ticketDetail(sara, tid);
  check("the agent sees the quote with the customer's name", d.messages.find((m) => m.id === a1)?.replyTo?.author === "Almaz");
  check("the agent's own messages are marked theirs", d.messages.find((m) => m.id === a1)?.mine === true);

  // Reactions.
  const live0 = await sd.customerLive(A, c1.token, tid);
  check("the customer reacts to the agent's message", (await sd.customerReact(A, c1.token, tid, a1, "👍")).on);
  check("the live view changes on a reaction", (await sd.customerLive(A, c1.token, tid)).stamp !== live0.stamp);
  await sd.agentReact(sara, a1, "👍");
  await sd.agentReact(sara, c2, "❤️");
  cm = await sd.customerMessages(A, c1.token, tid);
  const r1 = cm.messages.find((m) => m.id === a1)!.reactions;
  check("reactions are counted with the customer's own marked", r1.length === 1 && r1[0]!.count === 2 && r1[0]!.mine, r1);
  d = await sd.ticketDetail(sara, tid);
  const r2 = d.messages.find((m) => m.id === a1)!.reactions;
  check("the agent sees who reacted", r2[0]!.mine && r2[0]!.who.includes("Almaz") && r2[0]!.who.includes(sara.name), r2);
  check("again takes it back", !(await sd.customerReact(A, c1.token, tid, a1, "👍")).on && (await sd.customerMessages(A, c1.token, tid)).messages.find((m) => m.id === a1)!.reactions[0]!.count === 1);
  check("the customer cannot react to a note", /not found/i.test((await err(() => sd.customerReact(A, c1.token, tid, note, "👍"))) ?? ""));
  check("only emoji", /Choose an emoji/.test((await err(() => sd.agentReact(sara, a1, "lol"))) ?? ""));
  check("someone outside support cannot react", !!(await err(async () => sd.agentReact(await by("dawit@demo.local"), a1, "👍"))));

  // Files with a caption.
  const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
  await sd.customerUpload(A, c1.token, tid, { name: "screen.png", mime: "image/png", data: png, caption: "This is the error", replyTo: a1 });
  cm = await sd.customerMessages(A, c1.token, tid);
  const capMsg = cm.messages.at(-1)!;
  const files = await sd.customerFiles(A, c1.token, tid);
  check("a photo goes with its caption on the same message", capMsg.body === "This is the error" && capMsg.replyTo?.id === a1 && files.some((f) => f.message_id === capMsg.id && f.name === "screen.png"));
  await sd.agentUpload(sara, tid, { name: "steps.pdf", mime: "application/pdf", data: Buffer.from("%PDF").toString("base64"), caption: "Follow these" });
  d = await sd.ticketDetail(sara, tid);
  const af = d.messages.at(-1)!;
  check("the agent's file has its caption", af.body === "Follow these" && (d.files ?? []).some((f) => f.message_id === af.id));
  check("a file over 10 MB is refused", /10 MB/.test((await err(() => sd.customerUpload(A, c1.token, tid, { name: "big.bin", mime: "application/octet-stream", data: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64") }))) ?? ""));

  // Calls in the customer's timeline.
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, status, direction, started_at, duration_s) VALUES (?, ?, ?, ?, 'ended', 'inbound', ?, 75)", uid("call_"), tid, c1.customer?.id ?? (await get<{ customer_id: string }>("SELECT customer_id FROM sup_tickets WHERE id = ?", tid))!.customer_id, sara.id, new Date().toISOString());
  cm = await sd.customerMessages(A, c1.token, tid);
  check("the customer's timeline has the call", cm.calls.length === 1 && cm.calls[0]!.durationS === 75 && cm.calls[0]!.status === "ended");

  // Telegram.
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const uploads: { method: string; form: FormData }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    if (url.endsWith("/getFile")) return { ok: true, result: { file_path: "voice/file_1.oga" } };
    return { ok: true, result: { username: "myseed_help_bot", message_id: posts.length } };
  });
  ch.setTelegramDownloader(async () => Buffer.from("OggS-voice"));
  ch.setTelegramUploader(async (method, _token, form) => {
    uploads.push({ method, form });
    return { ok: true };
  });
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);
  let mid = 1;
  const msg = (extra: Record<string, unknown>, from = 777) => ch.telegramUpdate(secret, secret, { message: { message_id: mid++, chat: { id: 777, type: "private" }, from: { id: from, first_name: "Selam" }, ...extra } as never });
  const press = (data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${mid++}`, data, from: { id: 777, first_name: "Selam" }, message: { chat: { id: 777, type: "private" } } } });
  const sent = () => posts.filter((p) => p.url.endsWith("/sendMessage") && String(p.body.chat_id) === "777");
  const kb = (p: { body: Record<string, unknown> }) => p.body.reply_markup as { keyboard?: { text: string; request_contact?: boolean }[][]; inline_keyboard?: { text: string; callback_data?: string }[][] } | undefined;

  posts.length = 0;
  await msg({ text: "/start" });
  const s1 = sent();
  const ask = s1.find((p) => kb(p)?.keyboard?.[0]?.[0]?.request_contact);
  check("/start offers Share my phone number until it is shared", !!ask && /Share my phone number/.test(kb(ask)!.keyboard![0]![0]!.text));
  check("the menu stays the last message, with the phone button", !!kb(s1.at(-1)!)?.inline_keyboard?.flat().some((b) => b.callback_data === "ph"), kb(s1.at(-1)!));
  posts.length = 0;
  await press("ph");
  check("the menu button asks for the number at any time", sent().some((p) => kb(p)?.keyboard?.[0]?.[0]?.request_contact));
  posts.length = 0;
  await msg({ text: "/phone" });
  check("so does /phone", sent().some((p) => kb(p)?.keyboard?.[0]?.[0]?.request_contact));

  // A voice note from Telegram.
  await msg({ voice: { file_id: "v1", mime_type: "audio/ogg", file_size: 2000, duration: 4 } });
  const tg = (await get<{ id: string; customer_id: string }>("SELECT id, customer_id FROM sup_tickets WHERE channel = 'telegram' ORDER BY created_at DESC LIMIT 1"))!;
  const tf = await get<{ name: string; mime: string }>("SELECT name, mime FROM sup_files WHERE ticket_id = ?", tg.id);
  check("a Telegram voice note is kept as a voice note", tf?.mime === "audio/ogg" && /\.ogg$/.test(tf.name) && !!(await get("SELECT id FROM sup_messages WHERE ticket_id = ? AND body = '(a voice note)'", tg.id)));
  await msg({ video_note: { file_id: "vn1", file_size: 3000 } });
  check("round video notes are kept too", !!(await get("SELECT id FROM sup_files WHERE ticket_id = ? AND mime = 'video/mp4'", tg.id)));

  // Agent files go to Telegram as themselves.
  await sd.assignTicket(admin, tg.id, sara.id).catch(() => null);
  posts.length = 0;
  await sd.agentUpload(sara, tg.id, { name: "fix.png", mime: "image/png", data: png, caption: "Tap here" });
  await sd.agentUpload(sara, tg.id, { name: "hello.ogg", mime: "audio/ogg", data: Buffer.from("OggS").toString("base64") });
  await sd.agentUpload(sara, tg.id, { name: "guide.pdf", mime: "application/pdf", data: Buffer.from("%PDF").toString("base64") });
  check("a photo goes as a photo with the caption and the agent's name", uploads[0]?.method === "sendPhoto" && String(uploads[0].form.get("caption")).startsWith("Tap here") && /Sara, support/.test(String(uploads[0].form.get("caption"))) && uploads[0].form.get("chat_id") === "777", uploads.map((u) => u.method));
  check("a voice note as a voice note, a file as a document", uploads[1]?.method === "sendVoice" && uploads[2]?.method === "sendDocument");
  check("no placeholder text is sent instead", !sent().some((p) => /\(a (file|voice note)/.test(String(p.body.text))));
  ch.setTelegramUploader(async () => ({ ok: false, description: "Bad Request: file too big" }));
  await sd.agentUpload(sara, tg.id, { name: "x.pdf", mime: "application/pdf", data: Buffer.from("%PDF").toString("base64") });
  check("a file Telegram refuses is noted for the agent", !!(await get("SELECT id FROM sup_messages WHERE ticket_id = ? AND internal = 1 AND body LIKE '%could not be sent%file too big%'", tg.id)));

  // Sharing the number, matched to our records.
  const acct = uid("cha_");
  await run("INSERT INTO chapa_accounts (id, name, secret_key_enc, currency, mode, active, created_at, updated_at) VALUES (?, 'Subs', 'x', 'ETB', 'live', 1, ?, ?)", acct, new Date().toISOString(), new Date().toISOString());
  const hasAcct = !!(await get("SELECT id FROM chapa_accounts WHERE id = ?", acct));
  if (hasAcct) {
    await run("INSERT INTO chapa_transactions (account_id, tx_ref, amount, currency, status, first_name, last_name, phone, created_at, updated_at) VALUES (?, 'tx1', 300, 'ETB', 'success', 'Selam', 'T', '0911223344', '2026-11-01T08:00:00Z', '2026-11-01T08:00:00Z')", acct);
    await run("INSERT INTO chapa_transactions (account_id, tx_ref, amount, currency, status, phone, created_at, updated_at) VALUES (?, 'tx2', 300, 'ETB', 'failed', '251911223344', '2026-11-02T08:00:00Z', '2026-11-02T08:00:00Z')", acct);
  }
  await run("INSERT INTO cms_invoice_reviews (invoice_id, student, grade, plan, phone, invoice_date, updated_at) VALUES ('inv-1', 'Hana T', 'Grade 6', 'Yearly', '+251 911 22 33 44', '2026-10-01', ?)", new Date().toISOString());
  await run("UPDATE sup_customers SET phone = '0911223344' WHERE id = (SELECT customer_id FROM sup_tickets WHERE id = ?)", tid);
  posts.length = 0;
  check("only their own number is taken", (await msg({ contact: { phone_number: "251900000000", user_id: 999 } }), !(await get<{ phone: string | null }>("SELECT phone FROM sup_customers WHERE id = ?", tg.customer_id))?.phone));
  await msg({ contact: { phone_number: "251911223344", user_id: 777 } });
  const cust = (await get<{ phone: string; meta: string }>("SELECT phone, meta FROM sup_customers WHERE id = ?", tg.customer_id))!;
  const meta = JSON.parse(cust.meta) as Record<string, string>;
  check("the number is kept in full form", cust.phone === "+251911223344", cust.phone);
  if (hasAcct) check("their Chapa payments are found by the number", /1 payment|2 payments/.test(meta["Chapa payments"] ?? "") && /ETB 300 paid/.test(meta["Chapa payments"] ?? ""), meta);
  check("their Noor invoices are found", /Hana T/.test(meta["Noor invoices"] ?? "") && /Grade 6/.test(meta["Noor invoices"] ?? ""), meta);
  check("and the same person in the app", /Almaz by App/.test(meta["Also contacted us"] ?? ""), meta);
  check("no sample student records are used without the academy connected", !meta["Student records"]);
  check("the agent gets a note on the open conversation", !!(await get("SELECT id FROM sup_messages WHERE ticket_id = ? AND internal = 1 AND body LIKE 'The customer shared their phone number +251911223344 on Telegram%'", tg.id)));
  check("the customer is thanked and the button removed", sent().some((p) => /number is saved/.test(String(p.body.text)) && (kb(p) as { remove_keyboard?: boolean } | undefined)?.remove_keyboard));
  posts.length = 0;
  await msg({ text: "/start" });
  check("once shared, /start no longer asks", !sent().some((p) => kb(p)?.keyboard));

  // The agent asks for a number, or types one.
  const other = await get<{ id: string }>("SELECT id FROM sup_customers WHERE external_id = 'tg:777'");
  await run("UPDATE sup_customers SET phone = NULL WHERE id = ?", other!.id);
  posts.length = 0;
  await ch.askTelegramPhone(sara, tg.id);
  check("the agent asks a Telegram customer for their number", sent().some((p) => kb(p)?.keyboard?.[0]?.[0]?.request_contact) && !!(await get("SELECT id FROM sup_messages WHERE ticket_id = ? AND body LIKE '%asked the customer to share their phone number%'", tg.id)));
  check("not for customers outside Telegram", /not on Telegram/.test((await err(() => ch.askTelegramPhone(sara, tid))) ?? ""));
  const typed = await R.recordPhone((await get<{ customer_id: string }>("SELECT customer_id FROM sup_tickets WHERE id = ?", tid))!.customer_id, "0911 22 33 44", "agent");
  check("an agent can type a number, matched the same way", typed?.phone === "+251911223344" && !!typed.lines["Noor invoices"]);
  check("numbers are compared by their last nine digits", R.phoneKey("+251 911-22-33-44") === R.phoneKey("0911223344") && R.normalPhone("0911223344") === "+251911223344" && R.normalPhone("911223344") === "+251911223344");
  check("a widget customer can share a number", (await sd.customerSharePhone(A, c1.token, "0911223344")).phone === "+251911223344");
  check("nonsense is refused", /Enter a phone number/.test((await err(() => sd.customerSharePhone(A, c1.token, "abc"))) ?? ""));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
