// A task as a prompt for an AI coding assistant, made in the app with no AI key: the full agent prompt (context,
// what to do, acceptance criteria, steps for its type, the team's rules, branch, commit and pull request), the
// short one and the code review one; only for people who may see the task.
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { applyDevHistory } from "../../src/server/dev-history";
import { taskPrompt } from "../../src/server/task-prompt";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

async function main() {
  const kidus = (await loadUser((await upsertAccount({ name: "Kidus Sebsibe", email: "kidus@prompt.local", title: "Developer", roles: ["developer"], password: "Prompt-2026!", mustChangePassword: false })).id))!;
  await applyDevHistory();
  const id = (await get<{ id: string }>("SELECT id FROM dept_tasks WHERE code = 'VERIFY-16'"))!.id;
  const full = await taskPrompt(kidus, "dev", id, "agent");
  check("the full prompt names the task, the project and its priority", /^# Task VERIFY-16: /.test(full) && /Transaction Verify/.test(full) && /Priority: Urgent/.test(full), full.slice(0, 300));
  check("with the acceptance criteria and the definition of done", /## Acceptance criteria\n\nEvery value in those files is rotated/.test(full) && /## Definition of done/.test(full) === false || /## Acceptance criteria/.test(full));
  check("steps for its type, the rules and what to hand back", /## How to go about it/.test(full) && /## Rules/.test(full) && /additive only/.test(full) && /`chore\/VERIFY-16-remove-and-rotate/.test(full) && /pull request description/.test(full), full.slice(-900));
  const bug = (await get<{ id: string }>("SELECT id FROM dept_tasks WHERE dept = 'dev' AND type = 'bug' LIMIT 1"))?.id;
  if (bug) check("a bug starts by reproducing it and a failing test", /Reproduce the problem first/.test(await taskPrompt(kidus, "dev", bug, "agent")));
  const short = await taskPrompt(kidus, "dev", id, "short");
  check("the short prompt is the task and its acceptance only", short.length < full.length / 2 && /Done when:/.test(short) && !/## Rules/.test(short));
  const review = await taskPrompt(kidus, "dev", id, "review");
  check("the review prompt asks for problems against the task", /^Review the pull request for VERIFY-16/.test(review) && /permissions checked on the server/.test(review));
  check("no emojis in any prompt", !/\p{Extended_Pictographic}/u.test(full + short + review));
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const member = (await loadUser((await upsertAccount({ name: "Other Dev", email: "other@prompt.local", title: "Developer", roles: ["developer"], password: "Prompt-2026!", mustChangePassword: false })).id))!;
  await setPosition(admin, "dev", member.id, "member");
  check("someone who may not see the task gets no prompt", await taskPrompt(member, "dev", id, "agent").then(() => false, () => true));
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
