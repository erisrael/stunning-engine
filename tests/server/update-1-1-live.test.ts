// Update 1.1, phase 12: live chat. Typing and read on both sides, presence, files and voice notes both ways (each
// side sees only its own conversations' files), the stream's stamp moving on new messages, the inactivity and close
// rules (with the reason and times kept), the transcript, and Latin-to-Ge'ez typing.
import crypto from "node:crypto";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import { toGeez } from "../../src/lib/geez";

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
  await sd.saveSupportConfig(admin, { enabled: true, leads: [], inactiveHours: 24, autoCloseDays: 3 });
  const q = await sd.saveQueue(admin, { name: "Help", keywords: [], members: [sara.id], strategy: "least_busy" });
  const app = await sd.saveApp(admin, { name: "App", origins: ["https://a.example"], queueId: q, verifyIdentity: true });
  const A = await sd.appByKey((await sd.listApps(admin))[0]!.publicKey, "https://a.example");
  const sign = (id: string) => crypto.createHmac("sha256", app.secret!).update(id).digest("hex");
  const c1 = await sd.identify(A, { id: "c-1", name: "Almaz", hash: sign("c-1") });
  const c2 = await sd.identify(A, { id: "c-2", name: "Other", hash: sign("c-2") });
  await sd.setAgentStatus(sara, "online");
  const tid = await sd.customerCreateTicket(A, c1.token, { subject: "Login", message: "I cannot sign in" });

  // Presence, typing, read.
  let cl = await sd.customerLive(A, c1.token, tid);
  check("the customer sees the agent online", cl.online && !cl.typing && !cl.closed, cl);
  let al = await sd.agentLive(sara, tid);
  check("the agent sees the customer online (they opened the stream)", al.online && !al.typing, al);
  await sd.customerTyping(A, c1.token, tid);
  check("the agent sees the customer typing", (await sd.agentLive(sara, tid)).typing);
  await sd.agentTyping(sara, tid);
  cl = await sd.customerLive(A, c1.token, tid);
  check("the customer sees the agent's first name typing", cl.typing === sara.name.split(" ")[0], cl.typing);
  const stamp0 = cl.stamp;
  await sd.agentReply(sara, tid, { body: "Try resetting the password", status: "pending" });
  cl = await sd.customerLive(A, c1.token, tid);
  check("a reply moves the stamp and stops the typing", cl.stamp !== stamp0 && cl.typing === null, cl);
  await sd.agentReply(sara, tid, { body: "internal only", internal: true });
  check("internal notes do not move the customer's stamp", (await sd.customerLive(A, c1.token, tid)).stamp === cl.stamp);
  await sd.customerRead(A, c1.token, tid);
  check("the agent sees when the customer read it", !!(await sd.agentLive(sara, tid)).read);
  await sd.agentRead(sara, tid);
  check("the customer sees when the agent read it", !!(await sd.customerLive(A, c1.token, tid)).read);
  check("another customer cannot follow this conversation", !!(await err(() => sd.customerLive(A, c2.token, tid))));

  // Files and voice notes.
  const voice = await sd.customerUpload(A, c1.token, tid, { name: "voice.webm", mime: "audio/webm", data: Buffer.from("OggS-voice").toString("base64") });
  const last = await get<{ body: string; author_kind: string }>("SELECT body, author_kind FROM sup_messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1", tid);
  check("a voice note is a customer message with the file", last?.body === "(a voice note)" && last.author_kind === "customer" && !!voice.id);
  check("the customer can play their voice note", (await sd.customerFile(A, c1.token, voice.id)).data.toString() === "OggS-voice");
  check("another customer cannot", !!(await err(() => sd.customerFile(A, c2.token, voice.id))));
  const sent = await sd.agentUpload(sara, tid, { name: "steps.pdf", mime: "application/pdf", data: Buffer.from("%PDF").toString("base64") });
  const files = await sd.customerFiles(A, c1.token, tid);
  const agentMsg = await get<{ id: string }>("SELECT id FROM sup_messages WHERE ticket_id = ? AND body = '(a file: steps.pdf)'", tid);
  check("the agent's file reaches the customer, on the agent's message", files.some((f) => f.id === sent.id && f.message_id === agentMsg?.id), files);
  check("an empty file is refused", /empty/.test((await err(() => sd.customerUpload(A, c1.token, tid, { name: "x", mime: "text/plain", data: "" }))) ?? ""));

  // Waiting on the customer too long: solved with the reason, then closed.
  await run("UPDATE sup_tickets SET status = 'pending', last_agent_at = ?, last_customer_at = ?, updated_at = ? WHERE id = ?", new Date(Date.now() - 30 * 3600e3).toISOString(), new Date(Date.now() - 40 * 3600e3).toISOString(), new Date(Date.now() - 30 * 3600e3).toISOString(), tid);
  await sd.supportChecks();
  let row = await get<{ status: string; close_reason: string | null; solved_at: string | null }>("SELECT status, close_reason, solved_at FROM sup_tickets WHERE id = ?", tid);
  check("a silent customer's conversation is solved, with the reason", row?.status === "solved" && row.close_reason === "no_reply" && !!row.solved_at, row);
  check("they are told they can still reply", !!(await get("SELECT 1 FROM sup_messages WHERE ticket_id = ? AND body LIKE 'We have not heard back%'", tid)));
  await sd.customerReply(A, c1.token, tid, "Still broken");
  row = await get("SELECT status, close_reason, solved_at FROM sup_tickets WHERE id = ?", tid);
  check("a reply reopens it and clears the reason", row?.status === "open" && row.close_reason === null, row);
  await sd.setTicketStatus(sara, tid, "solved");
  await run("UPDATE sup_tickets SET solved_at = ? WHERE id = ?", new Date(Date.now() - 4 * 864e5).toISOString(), tid);
  await sd.supportChecks();
  const closed = await get<{ status: string; closed_at: string | null; close_reason: string | null; first_response_at: string | null }>("SELECT status, closed_at, close_reason, first_response_at FROM sup_tickets WHERE id = ?", tid);
  check("solved, then closed after the days set, times kept", closed?.status === "closed" && !!closed.closed_at && closed.close_reason === "agent" && !!closed.first_response_at, closed);
  check("the customer sees it is closed", (await sd.customerLive(A, c1.token, tid)).closed);
  check("a closed conversation takes no replies", /closed/.test((await err(() => sd.customerReply(A, c1.token, tid, "hello?"))) ?? ""));

  // The transcript keeps everything.
  const tr = await sd.transcript(sara, tid);
  check("the transcript has the messages, notes marked, times and reason", tr.text.includes("I cannot sign in") && tr.text.includes("(internal) ") && tr.text.includes("Closed: ") && tr.text.includes("(agent)") && tr.name === `ticket-${(await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", tid))!.number}.txt`);
  const dawit = await by("dawit@demo.local");
  check("people outside support cannot read it", !!(await err(() => sd.transcript(dawit, tid))));

  // Amharic typed in Latin letters.
  check("selam and amesegnalehu in Ge'ez", toGeez("selam") === "ሰላም" && toGeez("amesegnalehu") === "አመሰግናለሁ" && toGeez("chigir yelem 123") === "ቺጊር የለም 123");

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
