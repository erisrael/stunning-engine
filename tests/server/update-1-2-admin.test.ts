// Update 1.2, Phase 10: a permission for every new action (granted per role in Roles and permissions; Admin and
// support leads keep theirs), the reports under Monitor (conversations, calls, the phone menu, support requests, sync
// health), the help chapter and the navigation entries.
process.env.MAIL_FAKE = "1";
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ivr from "../../src/server/support-ivr";
import * as Q from "../../src/server/support-queues";
import * as R from "../../src/server/call-records";
import { updateReports } from "../../src/server/support-analytics";
import { CAPABILITIES, DEFAULT_PERMISSIONS } from "../../src/lib/domain";
import { CHAPTERS } from "../../src/lib/help";
import { SIDEBAR_ENTRIES } from "../../src/lib/nav";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const grant = (u: AppUser, ...caps: string[]) => ({ ...u, perms: [...u.perms, ...caps] }) as AppUser;

async function main() {
  const [admin, dawit, sara] = [await by("admin@demo.local"), await by("dawit@demo.local"), await by("sara@demo.local")];
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  const q = await sd.saveQueue(admin, { name: "General", members: [sara.id] });

  // 1. The new permissions exist, and Admin has them by default.
  const keys = CAPABILITIES.map((c) => c.key as string);
  const NEW = ["support.ivr", "support.queues", "support.content", "support.forwarding", "support.recordings", "support.export", "support.requests_setup", "cms.manage", "cms.sensitive", "cms.export"];
  check("every new action has a permission in Roles and permissions", NEW.every((k) => keys.includes(k)), NEW.filter((k) => !keys.includes(k)));
  check("Admin has them by default", NEW.every((k) => (DEFAULT_PERMISSIONS.admin as string[]).includes(k)));

  // 2. Without the permission: refused. With it: allowed, though not a support lead.
  check("without it, the phone menu is refused", /phone menu/.test(await err(() => ivr.listFlows(dawit))));
  check("with Phone menu, it opens", (await ivr.listFlows(grant(dawit, "support.ivr"))).length >= 1);
  check("without it, the queue board is refused", !!(await err(() => Q.queueBoard(dawit))));
  check("with Queues, the board opens", Array.isArray((await Q.queueBoard(grant(dawit, "support.queues"))).queues));
  check("and queue settings save", (await err(() => Q.saveQueueSettings(grant(dawit, "support.queues"), q, { wrapUpS: 15 }))) === "");
  check("without it, call records stay closed to a non-agent", !(await R.recordAccess(dawit)).all);
  check("with Recordings, every call record opens", (await R.recordAccess(grant(dawit, "support.recordings"))).all);
  check("but export needs its own permission", /export/.test(await err(() => R.exportCallRecords(grant(dawit, "support.recordings"), {}))));
  check("with both, export works", typeof (await R.exportCallRecords(grant(dawit, "support.recordings", "support.export"), {})) === "string");
  const C = await import("../../src/server/support-content");
  check("content publishing needs Content", !!(await err(() => C.listSupportContent(dawit, "default"))) && (await err(() => C.listSupportContent(grant(dawit, "support.content"), "default"))) === "");
  const F = await import("../../src/server/support-forward");
  check("forwarding targets need Forwarding", !!(await err(() => F.listForwardTargets(dawit))) && (await err(() => F.listForwardTargets(grant(dawit, "support.forwarding")))) === "");
  const SR = await import("../../src/server/support-requests");
  check("request setup needs Request setup", !!(await err(() => SR.requestSetup(dawit))) && (await err(() => SR.requestSetup(grant(dawit, "support.requests_setup")))) === "");
  const L = await import("../../src/server/legacy-cms");
  check("Noor management follows Noor: manage", !(await L.canManageCmsData(dawit)) && (await L.canManageCmsData(grant(dawit, "cms.manage"))));

  // 3. Reports.
  const cus = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at) VALUES (?, NULL, 'rep:1', 'Rep', ?)", cus, nowIso());
  const t = await sd.createTicketFromChannel({ subject: "Help", body: "x", customerId: cus, channel: "telegram", appQueue: q });
  await run("INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, answered_at, ended_at, duration_s, wait_s, queue_id) VALUES (?, ?, ?, ?, 'inbound', 'web', 'ended', 1, ?, ?, ?, 90, 20, ?)", uid("scl_"), t, cus, sara.id, nowIso(), nowIso(), nowIso(), q);
  await Q.logQueue("abandoned", { queueId: q, ticketId: t });
  const day = nowIso().slice(0, 10);
  const r = await updateReports(admin, { from: day, to: day });
  check("reports count conversations by channel", r.channels.some((c) => c.channel === "telegram" && c.count >= 1));
  const g = r.callsByQueue.find((x) => x.queue === "General");
  check("and calls by queue with waits, talk and abandoned calls", !!g && g.answered === 1 && g.avgWaitS === 20 && g.avgTalkS === 90 && g.abandoned === 1, g);
  check("with the phone menu and requests sections", !!r.ivr && Array.isArray(r.requests.byDest) && Array.isArray(r.sync));
  check("reports are for leads", !!(await err(() => updateReports(dawit, { from: day, to: day }))));

  // 4. Help and navigation.
  check("the manual has a chapter for the new pages", CHAPTERS.some((c) => c.key === "support-calls" && c.sections.length >= 5));
  check("Call records is a page Admin can show or hide", SIDEBAR_ENTRIES.some((p) => p.key === "/call-records"));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FAIL crashed", e);
  process.exit(1);
});
