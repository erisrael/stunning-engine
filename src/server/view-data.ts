import { all } from "./db";
import { getSettings } from "./settings";
import { taxonomy } from "./queries";
import { hasFullScope, userDirectory, type AppUser } from "./users";

// Everything the shared filter bar and editors need, restricted to the viewer's scope.
export async function filterOptions(user: AppUser, page: string) {
  const tax = await taxonomy();
  const s = await getSettings();
  const scoped = hasFullScope(user);
  const grades = tax.grades.filter((g) => g.active && (scoped || user.scopes.some((x) => !x.gradeId || x.gradeId === g.id)));
  const subjects = tax.subjects.filter((sub) => sub.active && (scoped || user.scopes.some((x) => !x.subjectId || x.subjectId === sub.id)));
  const views = await all<{ id: string; name: string; page: string; query: string; shared: number; owner_id: string }>(
      "SELECT id, name, page, query, shared, owner_id FROM saved_views WHERE (owner_id = ? OR shared = 1) ORDER BY shared DESC, name",
      user.id,
    );
  return {
    page,
    grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.name })),
    subjects: subjects.map((x) => ({ id: x.id, code: x.code, name: x.name, nameAm: x.name_am })),
    gradeSubjects: tax.gradeSubjects,
    units: tax.units.map((u) => ({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, number: u.number, title: u.title })),
    users: await userDirectory(),
    lists: s.lists,
    destinations: s.destinations.filter((d) => d.active).map((d) => ({ key: d.key, label: d.label })),
    views,
    viewerId: user.id,
    // Managers and planners may share saved views with everyone.
    isManager: user.roles.includes("manager") || user.perms.includes("items.plan"),
    timezone: s.workspace.timezone,
  };
}

export type FilterOptions = Awaited<ReturnType<typeof filterOptions>>;
