// Phase 18 checks: announcements for everyone, a department or roles; policies confirmed with "I have read this";
// who may announce to whom; who has not read or confirmed, and reminders; page visits for Admin's usage view.
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import * as an from "../../src/server/announcements";

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

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@an.local`, title: "Staff", roles: roles as never, password: "Announce-2026!", mustChangePassword: false })).id))!;
  const head = await mk("anhead", ["developer"]);
  const dev = await mk("andev", ["developer"]);
  const mkt = await mk("anmkt", ["marketing"]);
  await setPosition(admin, "dev", head.id, "head");

  check("a member cannot announce", /Only Admin/.test((await throws(() => an.saveAnnouncement(dev, { title: "x", body: "y", kind: "news", audience: { all: true, departments: [], roles: [] } }))) ?? ""));
  check("a head cannot announce to everyone", /own department/.test((await throws(() => an.saveAnnouncement(head, { title: "x", body: "y", kind: "news", audience: { all: true, departments: [], roles: [] } }))) ?? ""));
  check("nor to another department", /own department/.test((await throws(() => an.saveAnnouncement(head, { title: "x", body: "y", kind: "news", audience: { all: false, departments: ["marketing"], roles: [] } }))) ?? ""));
  const devNews = await an.saveAnnouncement(head, { title: "Sprint demo on Friday", body: "Bring your work.", kind: "news", audience: { all: false, departments: ["dev"], roles: [] } });
  check("a head announces to their department", (await an.pendingAnnouncements(dev)).some((a) => a.id === devNews));
  check("others do not see it", !(await an.myAnnouncements(mkt)).some((a) => a.id === devNews));
  check("the people are told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title = 'Sprint demo on Friday'", dev.id)));
  const policy = await an.saveAnnouncement(admin, { title: "Leave policy 2027", body: "Read the new rules.", kind: "policy", audience: { all: true, departments: [], roles: [] }, pinned: true });
  check("a policy for everyone reaches everyone", (await an.pendingAnnouncements(mkt)).some((a) => a.id === policy));
  check("pinned first", (await an.myAnnouncements(dev))[0]?.id === policy);
  await an.markAnnouncement(dev, devNews, false);
  check("read news leaves the strip", !(await an.pendingAnnouncements(dev)).some((a) => a.id === devNews));
  await an.markAnnouncement(dev, policy, false);
  check("a policy stays until confirmed", (await an.pendingAnnouncements(dev)).some((a) => a.id === policy));
  await an.markAnnouncement(dev, policy, true);
  check("confirmed, it leaves the strip", !(await an.pendingAnnouncements(dev)).some((a) => a.id === policy));
  const st = await an.announcementStatus(admin, policy);
  check("the author sees who confirmed and who has not", st.done >= 1 && st.waiting.some((p) => p.id === mkt.id) && !st.waiting.some((p) => p.id === dev.id), { done: st.done, total: st.total });
  check("others cannot see that", !!(await throws(() => an.announcementStatus(mkt, policy))));
  const n = await an.remindAnnouncement(admin, policy);
  check("reminders go to those who have not confirmed", n === st.waiting.length && !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Please read and confirm%'", mkt.id)));
  const roleNews = await an.saveAnnouncement(admin, { title: "For marketing", body: "Campaign starts.", kind: "news", audience: { all: false, departments: [], roles: ["marketing"] } });
  check("by role", (await an.myAnnouncements(mkt)).some((a) => a.id === roleNews) && !(await an.myAnnouncements(dev)).some((a) => a.id === roleNews));
  const old = await an.saveAnnouncement(admin, { title: "Old", body: "Gone.", kind: "news", audience: { all: true, departments: [], roles: [] }, expiresAt: "2020-01-01", notify: false });
  check("expired ones leave the strip", !(await an.pendingAnnouncements(dev)).some((a) => a.id === old));
  check("only the author removes it", !!(await throws(() => an.deleteAnnouncement(head, policy))));
  await an.deleteAnnouncement(admin, old);

  // Usage.
  check("sections drop ids", an.sectionOf("/items/itm_123?x=1") === "/items" && an.sectionOf("/dev/list?task=1") === "/dev/list" && an.sectionOf("/d/sales") === "/d/sales");
  await an.recordVisit(dev.id, "developer", "/dev/list?task=1");
  await an.recordVisit(dev.id, "developer", "/dev/list");
  await an.recordVisit(mkt.id, "marketing", "/marketing");
  const u = await an.usageReport(admin);
  check("visits counted by section and role", u.sections.find((s) => s.key === "/dev/list")?.visits === 2 && u.roles.some((r) => r.key === "marketing"), u.sections);
  check("people not signed in are listed", u.quiet.some((p) => p.id === mkt.id));
  check("only Admin sees usage", !!(await throws(() => an.usageReport(dev))));
  await an.recordTiming("/dev/list", 800);
  await an.recordTiming("/dev/list", 3200);
  await an.recordTiming("/hr", 400);
  const t = (await an.usageReport(admin)).timings;
  const dl = t.find((x) => x.section === "/dev/list");
  check("page timings: average, share over 2 seconds, slowest first", dl?.avgMs === 2000 && dl.slowPct === 50 && dl.maxMs === 3200 && t[0]!.section === "/dev/list", t);

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
