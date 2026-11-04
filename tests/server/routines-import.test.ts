// Phase 33: a routine's form filled from a file with a set template; importing a routine; changing, copying and deleting.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as rt from "../../src/server/routines";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};
const file = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const by = async (email: string, activeRole: string) => ({ ...(await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!, activeRole });

async function main() {
  const admin = await by("admin@demo.local", "admin");
  const dawit = await by("dawit@demo.local", "recording");
  const hana = await by("hana@demo.local", "recording");
  const steps = [
    { path: "/requests", do: "fill", label: "Title", value: "Lights", ask: true },
    { path: "/requests", do: "select", label: "Priority", value: "high", ask: true },
    { path: "/requests", do: "fill", label: "Title", value: "Again", ask: true },
    { path: "/requests", do: "fill", label: "Fixed", value: "same", ask: false },
    { path: "/requests", do: "click", role: "button", name: "Send" },
  ];
  const id = await rt.saveRoutine(dawit, { name: "Ask for lights", steps, shared: "team" });

  // The set template.
  const r = await rt.getRoutine(dawit, id);
  check("the fields it asks for are the columns", r.fields.map((f) => f.column).join("|") === "Title|Priority|Title (2)", r.fields);
  const tpl = await rt.routineTemplate(dawit, id);
  check("the template has those headings and an example", tpl.csv.includes('"Title","Priority","Title (2)"') && tpl.csv.includes('"Lights","high","Again"'), tpl.csv);

  // Filling from a file.
  const good = '"Title","Priority","Title (2)"\r\n"A","low","A2"\r\n"B","high",""\r\n"C","urgent","C2"\r\n';
  const dry = await rt.importRunRows(dawit, id, "form.csv", file(good), true);
  check("checking the file reports good rows and problems", dry.rows === 2 && dry.errors.length === 1 && /Row 3.*Title \(2\)/.test(dry.errors[0]!), dry);
  check("a preview shows what will be filled", dry.preview[0]?.Title === "A" && dry.preview[1]?.Priority === "urgent", dry.preview);
  check("checking creates nothing", !(await get("SELECT 1 AS x FROM assistant_runs WHERE routine_id = ?", id)));
  check("a file that is not the template is refused", await rejects(() => rt.importRunRows(dawit, id, "x.csv", file('"Name","Other"\r\n"A","B"\r\n'), true), /not the routine's template.*Title/));
  const made = await rt.importRunRows(dawit, id, "form.csv", file(good), false);
  check("with your own approval the runs are ready", made.status === "approved" && made.rows === 2 && !!made.batchId, made);
  const runs = await all<{ id: string; run_values: string }>("SELECT id, run_values FROM assistant_runs WHERE batch_id = ? ORDER BY requested_at", made.batchId!);
  check("each row is one run, in the file's order, with its values under the right steps", runs.length === 2 && JSON.parse(runs[0]!.run_values)["0"] === "A" && JSON.parse(runs[0]!.run_values)["1"] === "low" && JSON.parse(runs[0]!.run_values)["2"] === "A2" && JSON.parse(runs[1]!.run_values)["1"] === "urgent", runs);
  const started = await rt.startRun(dawit, runs[0]!.id);
  check("a run gets its row's values", started.values["0"] === "A" && started.steps.length === 5, started);
  await rt.finishRun(dawit, runs[0]!.id, true);

  // With approval: one notice and one decision for the file.
  await rt.saveRoutinesConfig(admin, { approval: "admin", maxImportRows: 3 });
  const waiting = await rt.importRunRows(dawit, id, "form.csv", file(good), false);
  check("needing approval, the file waits", waiting.status === "pending", waiting);
  check("the approver sees each row", (await rt.listRuns(admin)).toApprove.filter((x) => x.batchId === waiting.batchId).length === 2);
  check("the whole file is decided at once", (await rt.decideBatch(admin, waiting.batchId!, true)) === 2 && (await rt.listRuns(dawit)).mine.filter((x) => x.batchId === waiting.batchId).every((x) => x.status === "approved"));
  check("too many rows are refused", await rejects(() => rt.importRunRows(dawit, id, "x.csv", file(`"Title","Priority","Title (2)"\r\n${'"a","b","c"\r\n'.repeat(4)}`), true), /At most 3/));
  await rt.saveRoutinesConfig(admin, { imports: false });
  check("Admin can turn file imports off", await rejects(() => rt.importRunRows(dawit, id, "form.csv", file(good), true), /turned off/));
  await rt.saveRoutinesConfig(admin, { imports: true, approval: "self", maxImportRows: 100 });

  // Importing a routine.
  check("the steps template has the set columns", rt.STEPS_TEMPLATE.includes('"page","action","field","value","ask","note"'));
  const csv = '"page","action","field","value","ask","note"\r\n"/items/new","fill","Title","Example","yes",""\r\n"/items/new","select","Priority","high","no",""\r\n"/items/new","click","Create","","",""\r\n"/items/new","note","","","","Check it"\r\n';
  const imp = await rt.getRoutine(dawit, await rt.importRoutine(dawit, { name: "From a file", fileName: "t.csv", data: file(csv) }));
  check("a routine is made from the template", imp.steps.length === 4 && imp.steps[0]!.do === "fill" && imp.steps[0]!.ask === true && imp.steps[2]!.name === "Create" && imp.steps[3]!.note === "Check it", imp.steps);
  check("a wrong template is refused", await rejects(() => rt.importRoutine(dawit, { fileName: "t.csv", data: file('"a","b"\r\n"1","2"\r\n') }), /not the routine template/));
  check("a wrong action is named by row", await rejects(() => rt.importRoutine(dawit, { fileName: "t.csv", data: file('"page","action","field"\r\n"/x","jump","Y"\r\n') }), /Row 2/));
  check("a step outside the app is refused", await rejects(() => rt.importRoutine(dawit, { name: "x", fileName: "t.csv", data: file('"page","action","field"\r\n"https://evil.example","click","Y"\r\n') }), /outside the app/));
  const json = JSON.stringify({ name: "From JSON", steps: [{ path: "/dashboard", do: "note", note: "Hello" }] });
  check("or from an exported routine", (await rt.getRoutine(dawit, await rt.importRoutine(dawit, { fileName: "r.json", data: file(json) }))).name === "From JSON");

  // Changing and deleting.
  await rt.saveRoutine(dawit, { id, name: "Ask for lights 2", steps: steps.slice(0, 2), shared: "team" });
  check("the owner changes it", (await rt.getRoutine(dawit, id)).steps.length === 2 && (await rt.getRoutine(dawit, id)).name === "Ask for lights 2");
  check("nobody else does", await rejects(() => rt.saveRoutine(hana, { id, name: "Mine now", steps }), /owner/));
  check("nobody else deletes it", await rejects(() => rt.deleteRoutine(hana, id), /owner/));
  const copy = await rt.duplicateRoutine(admin, await rt.saveRoutine(admin, { name: "Admin's", steps, shared: "everyone" }));
  check("a copy is your own", (await rt.getRoutine(admin, copy)).mine && (await rt.getRoutine(admin, copy)).name === "Admin's (copy)");
  const shared = (await rt.listRoutines(dawit)).find((x) => x.name === "Admin's")!;
  check("someone else's shared routine can be copied", (await rt.getRoutine(dawit, await rt.duplicateRoutine(dawit, shared.id))).ownerId === dawit.id);
  await rt.deleteRoutine(dawit, id);
  check("deleting removes it and its runs", !(await get("SELECT 1 AS x FROM assistant_routines WHERE id = ?", id)) && !(await get("SELECT 1 AS x FROM assistant_runs WHERE routine_id = ?", id)));

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
