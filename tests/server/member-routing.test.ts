// Team members contact only their team, their own lead or head, and HR (questions and direct chats); Admin hears
// from them through Feedback. A member's request to Finance goes first to their team lead (work things) or HR
// (personal money matters), who passes it on to Finance or turns it down.
process.env.MAIL_FAKE = "1";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { eligibleQuestionRecipients } from "../../src/server/question-routing";
import { isPlainMember, mayContact } from "../../src/server/contact-rules";
import { resourceRequest } from "../../src/server/resources";
import { purchasesToReview, reviewPurchase } from "../../src/server/finance-routing";
import { shellCounts } from "../../src/server/shell";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => fn().then(() => false, (e) => re.test(String(e?.message ?? e)));

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [dawit, hana, admin, meron, yonas] = await Promise.all(["dawit", "hana", "admin", "meron", "yonas"].map((n) => by(`${n}@demo.local`)));
  const hr = (await loadUser((await upsertAccount({ name: "Helen HR", email: "hr@demo.local", title: "HR officer", roles: ["hr_manager"] as never, password: "Hr-Officer-2026!", mustChangePassword: false })).id))!;

  // ------------------------------------------------ who a member contacts
  check("Dawit is a plain member, Hana (lead) and Admin are not", (await isPlainMember(dawit)) && !(await isPlainMember(hana)) && !(await isPlainMember(admin)));
  const ids = new Set((await eligibleQuestionRecipients(dawit)).map((u) => u.id));
  check("a member does not see Admin as someone to ask", !ids.has(admin.id), [...ids]);
  check("nor another team's lead", !ids.has(meron.id));
  check("nor another team's member", !ids.has(yonas.id));
  check("a member can ask their own lead and HR", ids.has(hana.id) && ids.has(hr.id), [...ids]);
  check("a member contacts their own lead and HR", (await mayContact(dawit, hana.id)) && (await mayContact(dawit, hr.id)));
  check("a member cannot start a chat with Admin", !(await mayContact(dawit, admin.id)));
  check("a lead is not limited", await mayContact(hana, admin.id));

  // ------------------------------------------------ finance requests
  const general = { department: "general", amount: 120, quantity: 1, description: "For the studio" };
  const work = await resourceRequest(dawit, { ...general, kind: "device", title: "Tripod" });
  const personal = await resourceRequest(dawit, { ...general, kind: "salary_advance", title: "Advance for rent" });
  const rows = await all<{ id: string; status: string; route: string | null; reviewer_id: string | null }>("SELECT id, status, route, reviewer_id FROM fin_purchases WHERE id IN (?, ?)", work, personal);
  const w = rows.find((r) => r.id === work);
  const p = rows.find((r) => r.id === personal);
  check("a work request goes to the member's team lead first", w?.status === "review" && w.route === "lead" && w.reviewer_id === hana.id, w);
  check("a personal one goes to HR", p?.status === "review" && p.route === "hr", p);
  check("the lead sees only the work one to review", (await purchasesToReview(hana)).map((r) => r.id).join() === work);
  check("HR sees the personal one", (await purchasesToReview(hr)).some((r) => r.id === personal) && !(await purchasesToReview(hr)).some((r) => r.id === work));
  check("the lead's Approvals count includes it", Number((await shellCounts(hana)).approvals) >= 1);
  check("another lead cannot review it", await rejects(() => reviewPurchase(meron, work, { approve: true }), /team lead reviews/));
  check("turning down needs a reason", await rejects(() => reviewPurchase(hr, personal, { approve: false }), /Say why/));
  await reviewPurchase(hana, work, { approve: true });
  await reviewPurchase(hr, personal, { approve: false, note: "Talk to HR about the policy first" });
  const after = await all<{ id: string; status: string }>("SELECT id, status FROM fin_purchases WHERE id IN (?, ?)", work, personal);
  check("passed on, it waits for Finance", after.find((r) => r.id === work)?.status === "submitted");
  check("turned down, it is closed", after.find((r) => r.id === personal)?.status === "rejected");
  const told = await all<{ title: string }>("SELECT title FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", dawit.id);
  check("the member is told both", told.some((n) => /passed on to Finance/.test(n.title)) && told.some((n) => /not passed on/.test(n.title)), told);
  const lead = await resourceRequest(hana, { ...general, kind: "device", title: "Lights" });
  check("a lead's request goes straight to Finance", (await get<{ status: string }>("SELECT status FROM fin_purchases WHERE id = ?", lead))?.status === "submitted");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
