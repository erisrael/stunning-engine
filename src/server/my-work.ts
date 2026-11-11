import { get } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, isLeadOf, type AppUser } from "./users";
import { audit, assignStage, WorkflowError } from "./workflow";
import { myDepartments } from "./departments";
import { listTasks } from "./work";
import { deptPath } from "@/lib/work";
import { STAGES, type Stage } from "@/lib/domain";

// My work (Update 1.0): taking several waiting parts at once (up to Admin's limit), and the tasks assigned to the
// person in every department, for the table view.

export async function takeLimit() {
  const n = Number(await getMeta("myWorkTakeLimit"));
  return Number.isFinite(n) && n > 0 ? Math.min(200, n) : 20;
}

export async function setTakeLimit(user: AppUser, n: number) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets how many parts one person takes at once.");
  const v = Math.min(200, Math.max(1, Math.round(Number(n) || 20)));
  await setMeta("myWorkTakeLimit", String(v));
  await audit({ actor: user }, { action: "settings.my_work", summary: `${user.name} set the most parts one person takes at once to ${v}` });
  return v;
}

// Each part is assigned to the person in its stage, as "Take it" does one at a time; each result is reported.
export async function takeParts(user: AppUser, parts: { id: string; stage: Stage }[]) {
  const list = parts.filter((p) => p && typeof p.id === "string" && STAGES.includes(p.stage));
  if (!list.length) throw new WorkflowError("VALIDATION", "Choose the parts to take.");
  const limit = await takeLimit();
  if (list.length > limit) throw new WorkflowError("VALIDATION", `Take at most ${limit} parts at once (Admin sets this).`);
  const results: { id: string; code: string; ok: boolean; error?: string }[] = [];
  for (const p of list) {
    const item = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", p.id);
    if (!item) continue;
    if (!can(user, "items.plan") && !isLeadOf(user, p.stage)) {
      results.push({ id: p.id, code: item.code, ok: false, error: "Not a stage you lead" });
      continue;
    }
    try {
      await assignStage({ actor: user, source: "bulk" }, p.id, { stage: p.stage, userId: user.id, reason: "Took it myself" });
      results.push({ id: p.id, code: item.code, ok: true });
    } catch (e) {
      results.push({ id: p.id, code: item.code, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

export type MyTask = { id: string; code: string; title: string; dept: string; deptTitle: string; status: string; statusCategory: string; priority: string; due: string | null; project: string | null; href: string };

// Open tasks assigned to this person in every department they can open.
export async function myDeptTasks(user: AppUser): Promise<MyTask[]> {
  const out: MyTask[] = [];
  for (const d of await myDepartments(user).catch(() => [])) {
    if (d.dept === "production") continue;
    try {
      const { tasks } = await listTasks(user, d.dept, { assignee: "me", open: true, sort: "due", dir: "asc" });
      for (const t of tasks.slice(0, 200))
        out.push({ id: t.id, code: t.code, title: t.title, dept: d.dept, deptTitle: d.title, status: t.status, statusCategory: t.status_category, priority: t.priority, due: t.due_date ?? null, project: t.project_name, href: `${deptPath(d.dept)}/list?task=${t.id}` });
    } catch {
      // A department without tasks for this person.
    }
  }
  return out;
}
