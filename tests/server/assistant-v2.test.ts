// Update 1.0, phase 5: the assistant answers "What can you do?" with buttons grouped for the role, creates tasks on
// the page (the form opens filled in), runs guided sessions, understands Amharic in Ge'ez and in Latin letters (a
// 100-phrase set), and counts out-of-role requests for Admin.
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as ai from "../../src/server/assistant-ai";
import { assistantContext, assistantStats, logAssistant } from "../../src/server/assistant";
import { createDepartmentRow, setPosition } from "../../src/server/departments";
import { DEFAULT_ASSISTANT, FLOWS, matchText, taskHandoff } from "../../src/lib/assistant";
import { amharicToKeywords, detectAmharic } from "../../src/lib/amharic-intent";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 700)}` : ""}`);
};

// Where a phrase may rightly take someone: the page, or the flow that does it there.
const SAME: Record<string, string[]> = {
  "do.leave": ["do.leave", "Leave"],
  "do.checkin": ["do.checkin", "Attendance", "show.checkin"],
  Attendance: ["Attendance", "show.checkin", "do.checkin"],
  "My work": ["My work", "show.send"],
  "Pay and claims": ["Pay and claims", "show.claim"],
  "show.claim": ["show.claim", "Pay and claims"],
  Approvals: ["Approvals", "show.approvals", "show.approve"],
  "Studio sessions": ["Studio sessions", "show.session"],
  Chat: ["Chat", "show.chat"],
  Email: ["Email", "show.email"],
  "show.request": ["show.request", "Requests"],
  Finance: ["Finance", "show.finance"],
  HR: ["HR", "show.hr_people"],
};
// What people write, and where it should take them (a page name, or a flow key).
const PHRASES: [string, string][] = [
  // Ge'ez
  ["ፈቃድ መጠየቅ እፈልጋለሁ", "do.leave"],
  ["የዓመት ፈቃድ እፈልጋለሁ", "do.leave"],
  ["ፈቃዴ ስንት ቀር", "do.leave"],
  ["ዕረፍት መውሰድ እፈልጋለሁ", "do.leave"],
  ["መግቢያ መዝግብልኝ", "do.checkin"],
  ["ገባሁ", "do.checkin"],
  ["መውጫ", "do.checkin"],
  ["ወጣሁ አሁን", "do.checkin"],
  ["የመገኘት ገጽ ክፈት", "Attendance"],
  ["መገኘቴን አሳየኝ", "Attendance"],
  ["ሰዓቴን አሳየኝ", "Attendance"],
  ["ሥራዬን ክፈት", "My work"],
  ["ስራዬ የት ነው", "My work"],
  ["የእኔ ሥራ", "My work"],
  ["ተግባራቴን አሳየኝ", "My work"],
  ["አዲስ ተግባር ፍጠር", "do.task"],
  ["ተግባር ፍጠርልኝ", "do.task"],
  ["ተግባር ጀምር", "do.start"],
  ["ቀጣዩን ሥራ ጀምር", "do.start"],
  ["ደመወዜን አሳየኝ", "Pay and claims"],
  ["የደመወዝ ወረቀት", "Pay and claims"],
  ["ወጪ መጠየቅ", "show.claim"],
  ["ደረሰኝ አለኝ ወጪ", "show.claim"],
  ["ማጽደቂያዎችን ክፈት", "Approvals"],
  ["የሚጠብቁ ማጽደቂያዎች", "Approvals"],
  ["ሰዎችን አሳየኝ", "People"],
  ["የሠራተኞች ስልክ", "People"],
  ["መልዕክት ክፈት", "Chat"],
  ["ጭውውት", "Chat"],
  ["ኢሜይል ክፈት", "Email"],
  ["ኢሜይሌን አሳየኝ", "Email"],
  ["ማሳወቂያዎችን አሳየኝ", "Notifications"],
  ["የስቱዲዮ ቀጠሮ", "Studio sessions"],
  ["ቀረጻ ቀጠሮ ያዝ", "Studio sessions"],
  ["የይለፍ ቃል መቀየር", "Account and password"],
  ["መለያዬ", "Account and password"],
  ["እርዳታ", "Help"],
  ["መመሪያ አሳየኝ", "Help"],
  ["ሪፖርት አሳየኝ", "Reports"],
  ["ሪፖርቶችን ክፈት", "Reports"],
  ["ፋይናንስ ክፈት", "Finance"],
  ["የሰው ኃይል ገጽ", "HR"],
  ["ማስታወቂያዎችን አሳየኝ", "Announcements"],
  ["ጥያቄ ለሌላ ክፍል", "show.request"],
  ["ቡድኔ እንዴት ነው", "Team"],
  ["መነሻ ገጽ", "Home"],
  ["ዛሬ ምን አለ", "Home"],
  ["ሥርዓተ ትምህርት", "Curriculum"],
  ["ርክክብ", "Handovers"],
  ["የቀን መቁጠሪያ", "Calendar"],
  // Latin letters
  ["fikad efelgalehu", "do.leave"],
  ["fikad mewsed efelgalehu", "do.leave"],
  ["ye amet fikad", "do.leave"],
  ["fikade sint ale", "do.leave"],
  ["erft efelgalehu", "do.leave"],
  ["megbiya mezgeb", "do.checkin"],
  ["gebahu", "do.checkin"],
  ["mewcha", "do.checkin"],
  ["wetahu ahun", "do.checkin"],
  ["seat asayegn", "Attendance"],
  ["megegnet kifet", "Attendance"],
  ["siraye yet new", "My work"],
  ["sira kifet", "My work"],
  ["siraye asayegn", "My work"],
  ["tegbaroch asayegn", "My work"],
  ["addis tegbar fter", "do.task"],
  ["tegbar fetsim", "do.task"],
  ["tegbar jemir", "do.start"],
  ["kechayu sira jemir", "do.start"],
  ["demoze asayegn", "Pay and claims"],
  ["dimoz yet new", "Pay and claims"],
  ["wechi teyake", "show.claim"],
  ["dereseny ale wechi", "show.claim"],
  ["matsdek kifet", "Approvals"],
  ["sewoch asayegn", "People"],
  ["serategnoch kifet", "People"],
  ["melekt kifet", "Chat"],
  ["chewewit", "Chat"],
  ["imeil kifet", "Email"],
  ["masawekia asayegn", "Notifications"],
  ["studio ketero", "Studio sessions"],
  ["kerets ketero yaz", "Studio sessions"],
  ["yeyilef qal", "Account and password"],
  ["erdata", "Help"],
  ["memeria asayegn", "Help"],
  ["riport asayegn", "Reports"],
  ["hisab kifet", "Finance"],
  ["mastawekia asayegn", "Announcements"],
  ["tiyake le lela kifil", "show.request"],
  ["budine endet new", "Team"],
  ["menesha", "Home"],
  ["zare min ale", "Home"],
  ["selam kifya yet new", "Pay and claims"],
  ["mastaweqia", "Announcements"],
  ["fikad", "do.leave"],
  ["sira", "My work"],
  ["demoz", "Pay and claims"],
  ["megbiya", "do.checkin"],
  ["matsdek", "Approvals"],
  ["sewoch", "People"],
];
const ENGLISH = ["I want leave", "open my work", "where is attendance", "create a task", "show me approvals", "check me in", "what can you do", "open chat", "my payslip please", "help", "who is absent today", "start my next task", "book a studio session", "new request to dev", "open the calendar", "reports", "notifications", "change my password", "team", "home"];

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = { ...(await by("admin@demo.local")), activeRole: "admin" as const };
  const hana = { ...(await by("hana@demo.local")), activeRole: "recording" as const };
  const dawit = { ...(await by("dawit@demo.local")), activeRole: "recording" as const };
  const fin = { ...(await loadUser((await upsertAccount({ name: "Selam Finance", email: "selam@v2.local", title: "Accountant", roles: ["accountant"], password: "Phase5-2026-Fin!", mustChangePassword: false })).id))!, activeRole: "accountant" as const };
  await createDepartmentRow(admin, { key: "ops", title: "Ops", template: "general" });
  await setPosition(admin, "ops", hana.id, "lead");
  await setPosition(admin, "ops", dawit.id, "member");

  // "What can you do?": grouped buttons for the role.
  const groupsOf = async (u: Parameters<typeof assistantContext>[0]) => (await assistantContext(u)).menu;
  const member = await groupsOf(dawit);
  const keys = (g: typeof member) => g.map((x) => x.key);
  const items = (g: typeof member) => g.flatMap((x) => x.items.map((i) => i.id));
  check("a member gets Me, My tasks and Production, in buttons", ["me", "tasks", "production"].every((k) => keys(member).includes(k)) && member.every((g) => g.items.length > 0 && g.labelAm), keys(member));
  check("a member's create-task is for themselves", member.find((g) => g.key === "tasks")!.items.some((i) => i.id === "do.task" && /for me/.test(i.label)));
  check("nothing for leads, Finance, HR or Admin", !["team", "finance", "hr", "admin"].some((k) => keys(member).includes(k)), keys(member));
  check("every button has an Amharic label", member.every((g) => g.items.every((i) => /[ሀ-፿]/.test(i.labelAm))));
  const lead = await groupsOf(hana);
  check("a lead also gets My team, and hands off a batch", keys(lead).includes("team") && items(lead).includes("guide.handoff") && items(lead).includes("guide.approve-parts"), items(lead));
  const finance = await groupsOf(fin);
  check("Finance gets today's Chapa board, the summary and follow-ups", ["go.chapa-daily", "go.chapa", "go.followups"].every((k) => items(finance).includes(k)) && !keys(finance).includes("production"), items(finance));
  check("but not Noor invoices without access to the Noor CMS", !items(finance).includes("guide.invoices"));
  const adm = await groupsOf(admin);
  check("Admin gets health checks and the assistant report", items(adm).includes("go.health") && items(adm).includes("go.assistant"));
  check("guided steps press only navigation (going online), never Save", [...member, ...lead, ...finance, ...adm].flatMap((g) => g.items.flatMap((i) => i.steps ?? [])).every((st) => st.act !== "click" || /online/.test(st.selector ?? "")));

  // Creating a task: the form on the page, filled in.
  const steps = taskHandoff("/d/ops", { title: "Fix the light", assigneeId: dawit.id, due: "2026-12-01" });
  check("the hand-off opens the form filled in, then points at the fields and Create", steps[0]!.href === `/d/ops/list?new=1&title=Fix+the+light&assignee=${dawit.id}&due=2026-12-01` && steps.map((s) => s.selector).join(" ") === "[data-assist='task-title'] [data-assist='task-assignee'] [data-assist='task-save']");
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: true, key: "sk-test" });
  const prop = await ai.proposeOp(hana, "create_task", { department: "ops", title: "Check the lights", assignee_id: dawit.id });
  check("a lead's AI proposal opens the form for the team member", !prop.token && prop.handoff?.[0]?.href?.includes(`assignee=${dawit.id}`) === true, prop);
  check("the scope still holds: a member cannot prefill it for someone else", !!(await ai.proposeOp(dawit, "create_task", { department: "ops", title: "For Hana", assignee_id: hana.id }).catch(() => null)) === false);

  // Out of role: counted for Admin.
  await ai.askAi(dawit, { history: [], text: "tool:hr_people {}" });
  await logAssistant(dawit, { event: "refused", text: "open admin" });
  const stats = await assistantStats(admin);
  const rec = stats.refused.find((r) => r.role === "recording");
  check("out-of-role asks are counted by role for Admin", !!rec && rec.n >= 2 && rec.top.some((t) => t.text === "open admin"), stats.refused);

  // Amharic.
  check("Ge'ez is recognised", detectAmharic("ፈቃድ እፈልጋለሁ") === "geez");
  check("so is Amharic in Latin letters", detectAmharic("selam, fikad efelgalehu") === "latin" && detectAmharic("siraye yet new") === "latin");
  const falseAm = ENGLISH.filter((e) => detectAmharic(e));
  check("English is not taken for Amharic", !falseAm.length, falseAm);
  const flows = FLOWS;
  const misses: string[] = [];
  for (const [phrase, want] of PHRASES) {
    const top = matchText(amharicToKeywords(phrase), flows, DEFAULT_ASSISTANT)[0];
    const got = !top ? null : top.type === "flow" ? top.flow.key : top.type === "place" ? top.place.name : top.type;
    const alt = !top ? null : top.type === "flow" && want.startsWith("do.") === false ? null : null;
    void alt;
    if (!(SAME[want] ?? [want]).includes(String(got))) misses.push(`${phrase} → ${got ?? "nothing"} (want ${want})`);
  }
  check(`the 100-phrase Amharic set: ${PHRASES.length - misses.length} of ${PHRASES.length} understood (95 needed)`, PHRASES.length === 100 && PHRASES.length - misses.length >= 95, misses);
  check("every phrase is detected as Amharic", PHRASES.every(([p]) => !!detectAmharic(p)), PHRASES.filter(([p]) => !detectAmharic(p)).map(([p]) => p));

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
