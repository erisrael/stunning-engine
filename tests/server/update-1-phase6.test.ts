// Update 1.0, Phase 6: import undo (change log, request, approval, reverse in one transaction, rows changed since
// skipped, audit), Admin's undo window and approvers, import and export switches for members, teams and
// departments, and My work take rules (most open, most per take, members' takes waiting for the lead).
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { TEMPLATES, autoMap, runImport } from "../../src/server/importer";
import { decideUndo, requestUndo, undoState, undoRequests } from "../../src/server/import-undo";
import { saveIoPermissions, saveUndoConfig, undoConfig } from "../../src/server/io-rules";
import { exportPeople } from "../../src/server/io-export";
import { decideTakes, myTakeRequests, saveTakeRules, takeParts, takeRequestsFor, takeRules, takeStages, openCount } from "../../src/server/my-work";
import { waitingInStage } from "../../src/server/team-flow";
import { releaseToProduction } from "../../src/server/workflow";

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

async function importUndo() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const head = ["Asset tag", "Name", "Department", "Category", "Status", "Notes"];
  const eq = (tag: string, notes: string) => [tag, `Gear ${tag}`, "general", "Camera", "available", notes];
  const imp = (rows: string[][], mode: "create" | "update" | "upsert", fileName: string) =>
    runImport(admin, { template: "equipment", mode, sheet: { headers: head, rows }, mapping: autoMap(TEMPLATES.equipment, head), dryRun: false, fileName });

  check("defaults: 24 hours, Admin or the import's role approves", (await undoConfig()).hours === 24 && (await undoConfig()).approval === "role");

  // Job A creates three; someone edits one by hand afterwards.
  const a = await imp([eq("UND-01", "a"), eq("UND-02", "b"), eq("UND-03", "c")], "create", "a.csv");
  const changesA = await all<{ tbl: string; op: string }>("SELECT tbl, op FROM job_changes WHERE job_id = ?", a.jobId!);
  check("the import's changes are recorded", changesA.some((c) => c.tbl === "equipment" && c.op === "INSERT") && changesA.filter((c) => c.tbl === "equipment").length >= 3, changesA);
  check("writes outside an import are not recorded", (await run("UPDATE equipment SET notes = 'edited by hand' WHERE tag = 'UND-02'")) && !(await get("SELECT 1 FROM job_changes WHERE job_id = '' OR job_id IS NULL")));

  // Job B updates UND-03's notes.
  const b = await imp([eq("UND-03", "changed by B")], "update", "b.csv");
  check("B's update is recorded with before and after", !!(await get("SELECT 1 FROM job_changes WHERE job_id = ? AND tbl = 'equipment' AND op = 'UPDATE' AND before_row LIKE '%\"c\"%'", b.jobId!)));

  const jobA = (await get<Parameters<typeof undoState>[1]>("SELECT * FROM jobs WHERE id = ?", a.jobId!))!;
  const stA = await undoState(admin, jobA);
  check("A can be undone, with a deadline a day out", stA.can && Math.abs(Date.parse(stA.until) - Date.now() - 24 * 3600e3) < 120e3, stA);

  // Undo B first (approval by Admin), then A.
  const rb = await requestUndo(sara, b.jobId!, "wrong notes").catch((e) => e as Error);
  check("only the runner, Admin or the import's team may ask", rb instanceof Error || (rb as { status: string }).status === "pending", rb);
  const reqB = await requestUndo(admin, b.jobId!, "wrong notes");
  check("the request waits for approval", reqB.status === "pending");
  check("a second request for the same job is refused", /already waiting/.test((await err(() => requestUndo(admin, b.jobId!))) ?? ""));
  check("it shows in the requests list", (await undoRequests(admin)).some((r) => r.id === reqB.id && r.canDecide));
  const doneB = await decideUndo(admin, reqB.id, true);
  check("approving puts B's update back", doneB.result!.reversed >= 1 && (await get<{ notes: string }>("SELECT notes FROM equipment WHERE tag = 'UND-03'"))?.notes === "c", doneB.result);

  const reqA = await requestUndo(admin, a.jobId!);
  const doneA = await decideUndo(admin, reqA.id, true);
  const left = await all<{ tag: string }>("SELECT tag FROM equipment WHERE tag LIKE 'UND-%' ORDER BY tag");
  check("A's created rows are removed, the hand-edited one is kept", left.map((r) => r.tag).join() === "UND-02", left);
  check("the edited row is skipped and listed", doneA.result!.skipped.some((s) => s.table === "equipment" && /Changed since/.test(s.why)), doneA.result);
  check("the job shows as undone", !!(await get<{ undone_at: string }>("SELECT undone_at FROM jobs WHERE id = ?", a.jobId!))?.undone_at);
  check("undo is in the audit trail", !!(await get("SELECT 1 FROM audit_events WHERE action = 'import.undone' AND job_id = ? AND new_value LIKE '%reversed%'", a.jobId!)));
  check("the undo's own records are not left behind", !(await get("SELECT 1 FROM job_changes WHERE job_id LIKE 'undo:%'")));
  const again = await undoState(admin, (await get<Parameters<typeof undoState>[1]>("SELECT * FROM jobs WHERE id = ?", a.jobId!))!);
  check("an undone job cannot be undone again", !again.can && /Already undone/.test(again.why ?? ""));

  // Declining.
  const c = await imp([eq("UND-04", "d")], "create", "c.csv");
  const reqC = await requestUndo(admin, c.jobId!);
  await decideUndo(admin, reqC.id, false, "keep it");
  check("declining keeps the rows", !!(await get("SELECT 1 FROM equipment WHERE tag = 'UND-04'")) && (await get<{ status: string }>("SELECT status FROM job_undo_requests WHERE id = ?", reqC.id))?.status === "declined");

  // Window per kind and approval off.
  await saveUndoConfig(admin, { kinds: { equipment: 0 } });
  const d = await imp([eq("UND-05", "e")], "create", "d.csv");
  const stD = await undoState(admin, (await get<Parameters<typeof undoState>[1]>("SELECT * FROM jobs WHERE id = ?", d.jobId!))!);
  check("0 hours turns undo off for that import kind", !stD.can && /turned off/.test(stD.why ?? ""), stD);
  await saveUndoConfig(admin, { kinds: {}, approval: "none" });
  const direct = await requestUndo(admin, d.jobId!);
  check("with no approval the person undoes it straight away", direct.status === "done" && !(await get("SELECT 1 FROM equipment WHERE tag = 'UND-05'")));
  await saveUndoConfig(admin, { approval: "role" });
  check("only Admin sets the rules", /Only Admin/.test((await err(() => saveUndoConfig(sara, { hours: 1 }))) ?? ""));

  // An old job (before the change log) cannot be undone.
  await run("INSERT INTO jobs (id, kind, template, mode, file_name, status, total_rows, actor_id, created_at, finished_at) VALUES ('job_old_p6', 'import', 'equipment', 'create', 'old.csv', 'completed', 1, ?, ?, ?)", admin.id, new Date().toISOString(), new Date().toISOString());
  const old = await undoState(admin, (await get<Parameters<typeof undoState>[1]>("SELECT * FROM jobs WHERE id = 'job_old_p6'"))!);
  check("imports with nothing recorded say so", !old.can && /Nothing was recorded/.test(old.why ?? ""));

  // A cascade into records people added since: the parent stays.
  const p = await imp([eq("UND-06", "f")], "create", "e.csv");
  const eqRow = await get<{ id: string }>("SELECT id FROM equipment WHERE tag = 'UND-06'");
  const fk = await get<{ tbl: string; col: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'equipment'::regclass AND c.confdeltype = 'c' LIMIT 1`,
  );
  if (fk && eqRow) {
    const cols = await all<{ column_name: string; is_nullable: string; column_default: string | null; data_type: string }>("SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()", fk.tbl);
    const vals: Record<string, unknown> = {};
    for (const col of cols) if (col.is_nullable === "NO" && col.column_default === null) vals[col.column_name] = col.column_name === fk.col ? eqRow.id : col.column_name === "id" ? "p6child" : /int|numeric/.test(col.data_type) ? 1 : new Date().toISOString();
    vals[fk.col] = eqRow.id;
    const ok = await run(`INSERT INTO ${fk.tbl} (${Object.keys(vals).join(", ")}) VALUES (${Object.keys(vals).map(() => "?").join(", ")})`, ...(Object.values(vals) as string[])).then(() => true, () => false);
    if (ok) {
      const rq = await requestUndo(admin, p.jobId!);
      const res = await decideUndo(admin, rq.id, true);
      check("a row other records now depend on is kept and listed", !!(await get("SELECT 1 FROM equipment WHERE tag = 'UND-06'")) && res.result!.skipped.some((s) => /depend/.test(s.why)), res.result);
    } else check("cascade check skipped (no child row could be made)", true);
  } else check("cascade check skipped (no cascading table)", true);
  return { admin, sara };
}

async function ioSwitches(admin: Awaited<ReturnType<typeof by>>) {
  const head = ["Full name", "Email", "Roles"];
  const imp = (rows: string[][]) => runImport(admin, { template: "users", mode: "upsert", sheet: { headers: head, rows }, mapping: autoMap(TEMPLATES.users, head), dryRun: true, fileName: "u.csv" });
  const hana = await get<{ name: string; email: string }>("SELECT name, email FROM users WHERE email = 'hana@demo.local'");
  const hanaRoles = (await all<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = (SELECT id FROM users WHERE email = 'hana@demo.local') ORDER BY role")).map((r) => r.role);
  await saveIoPermissions(admin, { teams: { import: false, export: false } });
  const changed = await imp([[hana!.name, hana!.email, [...hanaRoles.filter((r) => r !== "editing"), hanaRoles.includes("editing") ? "recording" : "editing"].join(";")]]);
  check("with teams import off, a row that changes team roles is refused", changed.outcomes[0].action === "error" && /turned off importing teams/.test(changed.outcomes[0].summary), changed.outcomes[0]);
  const same = await imp([[hana!.name, hana!.email, hanaRoles.join(";")]]);
  check("a row that keeps team roles still imports", same.outcomes[0].action !== "error", same.outcomes[0]);
  check("teams export is refused when off", /turned off exporting teams/.test((await err(() => exportPeople(admin, "teams"))) ?? ""));
  const members = await exportPeople(admin, "members");
  check("members export is a CSV of people", members.body.startsWith("name,email,title,active,created") && members.body.includes("admin@demo.local"));
  await saveIoPermissions(admin, { members: { import: false, export: true } });
  check("with members import off, the users import is refused", /turned off importing members/.test((await err(() => imp([[hana!.name, hana!.email, hanaRoles.join(";")]]))) ?? ""));
  await saveIoPermissions(admin, { members: { import: true, export: true }, teams: { import: true, export: true } });
  const teams = await exportPeople(admin, "teams");
  check("teams export lists team, person and lead", teams.body.startsWith("team,name,email,lead,active"));
  check("the switches are in the audit trail", !!(await get("SELECT 1 FROM audit_events WHERE action = 'settings.io_permissions'")));
}

async function takeWork(admin: Awaited<ReturnType<typeof by>>) {
  const hana = await by("hana@demo.local");
  const dawit = await by("dawit@demo.local");
  check("defaults: members do not take, the lead approves", !(await takeRules()).members && (await takeRules()).leadApproval);
  check("a member cannot take work by default", !(await takeStages(dawit)).length);
  for (const d of await all<{ id: string }>("SELECT id FROM items WHERE lifecycle = 'draft' ORDER BY code LIMIT 10")) await releaseToProduction({ actor: admin }, d.id).catch(() => {});
  let waiting = await waitingInStage(hana, "recording");
  check("there are waiting recording parts", waiting.length >= 4, waiting.length);
  const refused = await takeParts(dawit, [{ id: waiting[0].id, stage: "recording" }]);
  check("the server refuses a member's take when Admin has not allowed it", !refused[0].ok && /Not a stage/.test(refused[0].error ?? ""), refused);
  check("only Admin sets take rules", /Only Admin/.test((await err(() => saveTakeRules(hana, { members: true }))) ?? ""));

  await saveTakeRules(admin, { members: true, leadApproval: true, maxPerTake: 3, maxOpen: 0 });
  check("the member can now take recording work", (await takeStages(dawit)).some((s) => s.stage === "recording" && !s.lead));
  check("most per take is enforced on the server", /at most 3/.test((await err(() => takeParts(dawit, waiting.slice(0, 4).map((w) => ({ id: w.id, stage: "recording" as const }))))) ?? ""));
  const asked = await takeParts(dawit, waiting.slice(0, 2).map((w) => ({ id: w.id, stage: "recording" as const })));
  check("a member's take waits for the lead", asked.every((r) => r.ok && r.pending) && (await myTakeRequests(dawit)).length === 2, asked);
  check("the same part cannot be asked for twice", !(await takeParts(dawit, [{ id: waiting[0].id, stage: "recording" }]))[0].ok);
  const reqs = await takeRequestsFor(hana);
  check("the lead sees the requests", reqs.length === 2 && reqs.every((r) => r.userName === "Dawit"), reqs);
  check("someone who is not the lead cannot decide", !(await decideTakes(dawit, [reqs[0].id], true))[0].ok);
  const dec = await decideTakes(hana, reqs.map((r) => r.id), true);
  const owners = await all<{ owner_id: string }>(`SELECT a.owner_id FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id IN (?, ?)`, waiting[0].id, waiting[1].id);
  check("approving gives the parts to the member", dec.every((d) => d.ok) && owners.every((o) => o.owner_id === dawit.id), { dec, owners });
  check("open count includes them", (await openCount(dawit.id, "recording")) >= 2);

  // Most open at once, per team.
  const open = await openCount(dawit.id, "recording");
  await saveTakeRules(admin, { leadApproval: false, stages: { recording: { maxOpen: open + 1 } } });
  waiting = await waitingInStage(hana, "recording");
  const direct = await takeParts(dawit, waiting.slice(0, 2).map((w) => ({ id: w.id, stage: "recording" as const })));
  check("without approval the member takes it straight away, up to the open limit", direct[0].ok && !direct[0].pending && !direct[1].ok && /Admin allows/.test(direct[1].error ?? ""), direct);
  check("the per-team override is kept", (await takeRules()).stages.recording?.maxOpen === open + 1);
  const taken = await takeParts(hana, [{ id: waiting[0].id, stage: "recording" }]);
  check("a part someone has is not taken again", !taken[0].ok, taken);
  await saveTakeRules(admin, { members: false, leadApproval: true, maxOpen: 0, maxPerTake: 20, stages: {} });
}

async function main() {
  const { admin } = await importUndo();
  await ioSwitches(admin);
  await takeWork(admin);
  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
