import { all, nowIso, uid, run } from "./db";
import { can, type AppUser } from "./users";
import { csvEscape } from "./exporter";
import { audit, WorkflowError } from "./workflow";
import { assertIo, roleGroup, type IoEntity } from "./io-rules";
import { ROLE_LABELS, type Role } from "@/lib/domain";

// People exports: members (accounts), teams (production team membership and leads) and departments (department
// roles). Each is behind Admin's export switch and the person's own export or user-management permission.
export async function exportPeople(user: AppUser, entity: string) {
  if (entity !== "members" && entity !== "teams" && entity !== "departments") throw new WorkflowError("VALIDATION", "Choose members, teams or departments.");
  if (!can(user, "users.manage") && !can(user, "export.run")) throw new WorkflowError("FORBIDDEN", "You do not have permission to export people.");
  await assertIo(entity as IoEntity, "export");
  const users = await all<{ id: string; name: string; email: string; title: string | null; active: number; created_at: string }>("SELECT id, name, email, title, active, created_at FROM users ORDER BY lower(name)");
  const roles = await all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments ORDER BY role");
  const leads = new Set((await all<{ user_id: string; stage: string }>("SELECT user_id, stage FROM team_leads")).map((l) => `${l.user_id}:${l.stage}`));
  let head: string[];
  let rows: unknown[][];
  if (entity === "members") {
    head = ["name", "email", "title", "active", "created"];
    rows = users.map((u) => [u.name, u.email, u.title ?? "", u.active ? "yes" : "no", u.created_at.slice(0, 10)]);
  } else {
    const byId = new Map(users.map((u) => [u.id, u]));
    const mine = roles.filter((r) => roleGroup(r.role) === entity && byId.has(r.user_id));
    head = entity === "teams" ? ["team", "name", "email", "lead", "active"] : ["department", "name", "email", "active"];
    rows = mine.map((r) => {
      const u = byId.get(r.user_id)!;
      return entity === "teams" ? [ROLE_LABELS[r.role] ?? r.role, u.name, u.email, leads.has(`${u.id}:${r.role}`) ? "yes" : "no", u.active ? "yes" : "no"] : [ROLE_LABELS[r.role] ?? r.role, u.name, u.email, u.active ? "yes" : "no"];
    });
  }
  const body = [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const now = nowIso();
  const filename = `myseed-${entity}-${now.slice(0, 10)}.csv`;
  await run(
    "INSERT INTO jobs (id, kind, template, mode, file_name, status, total_rows, actor_id, created_at, finished_at) VALUES (?, 'export', ?, 'csv', ?, 'completed', ?, ?, ?, ?)",
    uid("job_"),
    entity,
    filename,
    rows.length,
    user.id,
    now,
    now,
  );
  await audit({ actor: user }, { action: "export.people", summary: `${user.name} exported ${entity} (${rows.length} rows)` });
  return { filename, body };
}
