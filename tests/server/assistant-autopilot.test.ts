// "Do it for me": what the assistant presses itself, what it hands to the person, tutorials read as steps, and
// Admin's options per role (autopilot on by default, exports by the assistant off by default).
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { autoKind, guideSteps, type AutoTarget } from "../../src/lib/assistant-auto";
import { TUTORIALS } from "../../src/lib/tutorials";
import { roleOptions, saveRoleOptions, assistantContext } from "../../src/server/assistant";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const el = (tag: string, text: string, attrs: Record<string, string> = {}, opts: { form?: boolean; file?: boolean } = {}): AutoTarget => ({
  tagName: tag.toUpperCase(),
  textContent: text,
  getAttribute: (n) => attrs[n] ?? null,
  querySelector: (s) => (s.includes("file") && opts.file ? {} : null),
  closest: (s) => (s === "form" && opts.form ? {} : null),
});

async function main() {
  const s = { note: "" };
  check("a plain button is pressed", autoKind(el("button", "New task", { type: "button" }), s, false) === "click");
  check("a link or a tab is pressed even when its name sounds like money", autoKind(el("a", "Pay and claims", { href: "/profile?tab=pay" }), s, false) === "click" && autoKind(el("button", "Refunds", { role: "tab" }), s, false) === "click");
  check("typing in a field is the person's", autoKind(el("input", ""), s, false) === "user" && autoKind(el("textarea", ""), s, false) === "user" && autoKind(el("button", "Grade", { role: "combobox" }), s, false) === "user");
  check("saving a form is the person's", autoKind(el("button", "Save", { type: "submit" }), s, false) === "user" && autoKind(el("button", "Save", {}, { form: true }), s, false) === "user");
  check("imports and file choosers are the person's", autoKind(el("button", "Import from Excel"), s, false) === "user" && autoKind(el("label", "Choose", {}, { file: true }), s, false) === "user");
  check("risky buttons are the person's", ["Delete", "Reject", "Approve", "Refund", "Send", "Withdraw"].every((t) => autoKind(el("button", t, { type: "button" }), s, false) === "user"));
  check("exports only when the role allows them", autoKind(el("button", "Export"), s, false) === "user" && autoKind(el("button", "Export…"), s, true) === "click" && autoKind(el("button", "Export 120 rows", { type: "submit" }), s, true) === "click");
  check("a hover step hovers", autoKind(el("button", "x"), { note: "", act: "hover" }, false) === "hover");

  const two = guideSteps({ href: "/profile?tab=account", steps: ["Open Profile, Account.", "Under Two-step sign-in press Set up with an app.", "Scan the code and type the 6 digits."] });
  check("a tutorial opens its page first and finds the button to press", two[0]!.href === "/profile?tab=account" && two[1]!.text === "Set up with an app" && !two[2]!.text, two);
  check("quoted names are read as written", guideSteps({ steps: ['Press "New task" and fill in the title.'] })[0]!.text === "New task");
  const all = TUTORIALS.map((t) => guideSteps(t));
  check("every tutorial becomes steps, and most name something to press", all.every((x, i) => x.length === TUTORIALS[i]!.steps.length) && all.filter((x) => x.some((y) => y.text)).length >= Math.ceil(TUTORIALS.length / 2) && guideSteps({ steps: ["Press Book and choose the day and time."] })[0]!.text === "Book", all.map((x) => x.filter((y) => y.text).length));

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const member = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!.id))!;
  const role = member.roles[0]!;
  const before = await roleOptions(role);
  check("Do it for me is on and exports by the assistant off by default", before.autopilot === true && before.autoExport === false, before);
  await saveRoleOptions(admin, { [role]: { ...before, autopilot: false, autoExport: true } });
  const after = await roleOptions(role);
  check("Admin changes both per role", after.autopilot === false && after.autoExport === true, after);
  const ctx = await assistantContext({ ...member, activeRole: role } as never);
  check("the person's assistant gets the role's options", ctx.options.autopilot === false && ctx.options.autoExport === true, ctx.options);

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
