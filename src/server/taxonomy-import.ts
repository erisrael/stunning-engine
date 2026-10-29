import { all, get, nowIso, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { createItem, type Ctx } from "./workflow";
import { subjectCode as subjectCodeFromName } from "./workspace-data";

/*
 * Curriculum structure imports used from Settings: grades, subjects, units and parts one kind at a time,
 * or all of them together (the structure template, one row per part). Rows create what is missing and
 * update what exists; a blank cell never clears a stored value, so a pre-filled export can be edited and
 * imported back. Every write checks again at apply time, so rows that depend on each other in one file work.
 */

export const TAXONOMY_KEYS = ["structure", "grades", "subjects", "units", "parts"] as const;
export type TaxonomyKey = (typeof TAXONOMY_KEYS)[number];

type Row = Record<string, string>;
export type TaxonomyPlan = { action: "create" | "update"; key: string; summary: string; apply: (ctx: Ctx) => Promise<void> };

const yes = (v: string | undefined, dflt: boolean) => (!v ? dflt : /^(y|yes|true|1)$/i.test(v.trim()));
const intOr = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) ? Number(v) : null);

// "5", "G5", "g05" and "Grade 5" are all G05.
export function normGradeCode(v: string) {
  const t = v.trim();
  const m = /(\d+)/.exec(t);
  return m ? `G${m[1].padStart(2, "0")}` : t.toUpperCase();
}
const normSubjectCode = (code: string, name?: string) => (code.trim() ? code.trim().toUpperCase() : name?.trim() ? subjectCodeFromName(name) : "");

const gradeRow = (code: string) => get<{ id: string; name: string }>("SELECT id, name FROM grades WHERE code = ?", code);
const subjectRow = (code: string) => get<{ id: string; name: string }>("SELECT id, name FROM subjects WHERE code = ?", code);
const unitRow = (g: string, s: string, n: number) => get<{ id: string; title: string }>("SELECT id, title FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", g, s, n);
const lessonRow = (u: string, n: number) => get<{ id: string; title: string }>("SELECT id, title FROM lessons WHERE unit_id = ? AND number = ?", u, n);

async function ensureGrade(code: string, f: { name?: string; level?: string; sort?: number | null; active?: string }) {
  const n = Number(/\d+/.exec(code)?.[0] ?? 0);
  const existing = await gradeRow(code);
  if (existing) {
    await run(
      "UPDATE grades SET name = COALESCE(?, name), level = COALESCE(?, level), sort = COALESCE(?, sort), active = COALESCE(?, active) WHERE id = ?",
      f.name || null,
      f.level || null,
      f.sort ?? null,
      f.active ? (yes(f.active, true) ? 1 : 0) : null,
      existing.id,
    );
    return existing.id;
  }
  const id = `grd_${code.toLowerCase()}`;
  await run(
    "INSERT INTO grades (id, code, name, level, sort, active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING",
    id,
    code,
    f.name || (n ? `Grade ${n}` : code),
    f.level || null,
    f.sort ?? n,
    yes(f.active, true) ? 1 : 0,
  );
  return (await gradeRow(code))!.id;
}

async function ensureSubject(code: string, f: { name?: string; nameAm?: string; sort?: number | null; active?: string }) {
  const existing = await subjectRow(code);
  if (existing) {
    await run(
      "UPDATE subjects SET name = COALESCE(?, name), name_am = COALESCE(?, name_am), sort = COALESCE(?, sort), active = COALESCE(?, active) WHERE id = ?",
      f.name || null,
      f.nameAm || null,
      f.sort ?? null,
      f.active ? (yes(f.active, true) ? 1 : 0) : null,
      existing.id,
    );
    return existing.id;
  }
  const sort = f.sort ?? ((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) AS n FROM subjects"))?.n ?? 0) + 1;
  await run(
    "INSERT INTO subjects (id, code, name, name_am, sort, active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING",
    `sub_${code.toLowerCase()}`,
    code,
    f.name || code,
    f.nameAm || null,
    sort,
    yes(f.active, true) ? 1 : 0,
  );
  return (await subjectRow(code))!.id;
}

const ensureOffering = (gradeId: string, subjectId: string) =>
  run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", gradeId, subjectId);

async function ensureUnit(gradeId: string, subjectId: string, n: number, f: { title?: string; titleAm?: string; term?: string }) {
  await ensureOffering(gradeId, subjectId);
  const existing = await unitRow(gradeId, subjectId, n);
  if (existing) {
    await run("UPDATE units SET title = COALESCE(?, title), title_am = COALESCE(?, title_am), term = COALESCE(?, term) WHERE id = ?", f.title || null, f.titleAm || null, f.term || null, existing.id);
    return existing.id;
  }
  await run("INSERT INTO curricula (id, name, version, cycle, active) VALUES ('cur_main', 'Ethiopian General Education Curriculum', 'Imported', ?, 1) ON CONFLICT (id) DO NOTHING", String(new Date().getFullYear()));
  const id = uid("unt_");
  await run(
    "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am, term) VALUES (?, (SELECT id FROM curricula WHERE active = 1 ORDER BY id LIMIT 1), ?, ?, ?, ?, ?, ?)",
    id,
    gradeId,
    subjectId,
    n,
    f.title || `Unit ${n}`,
    f.titleAm || null,
    f.term || null,
  );
  return id;
}

async function ensureLesson(unitId: string, n: number, f: { title?: string; titleAm?: string; language?: string }) {
  const existing = await lessonRow(unitId, n);
  if (existing) {
    await run("UPDATE lessons SET title = COALESCE(?, title), title_am = COALESCE(?, title_am), language = COALESCE(?, language) WHERE id = ?", f.title || null, f.titleAm || null, f.language || null, existing.id);
    return existing.id;
  }
  const id = uid("les_");
  await run(
    "INSERT INTO lessons (id, unit_id, number, title, title_am, language, planned_deliverables, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    id,
    unitId,
    n,
    f.title || `Part ${n}`,
    f.titleAm || null,
    f.language || "en",
    nowIso(),
  );
  return id;
}

// One production item per part, so new parts show up in the sheet, board and reports.
async function ensureItem(ctx: Ctx, lessonId: string, gradeId: string, subjectId: string) {
  if (await get("SELECT 1 AS x FROM items WHERE lesson_id = ? AND lifecycle NOT IN ('archived','cancelled')", lessonId)) return;
  const l = (await get<{ title: string; title_am: string | null; language: string | null }>("SELECT title, title_am, language FROM lessons WHERE id = ?", lessonId))!;
  await createItem({ ...ctx, actor: null }, { lessonId, gradeId, subjectId, title: l.title, titleAm: l.title_am, language: l.language ?? "en" });
}

export async function planTaxonomyRow(key: TaxonomyKey, rec: Row, user: AppUser, errors: string[], warnings: string[], seen: Set<string>): Promise<TaxonomyPlan | null> {
  const dup = (k: string) => {
    if (seen.has(k)) errors.push(`${k} appears more than once in this file.`);
    seen.add(k);
  };
  const canItems = can(user, "items.create") || can(user, "import.run");
  const wantItem = (v: string | undefined) => {
    const w = yes(v, true);
    if (w && !canItems) warnings.push("Your role cannot create production items, so the part is added without one.");
    return w && canItems;
  };

  if (key === "grades") {
    const code = normGradeCode(rec.grade_code);
    dup(code);
    const g = await gradeRow(code);
    if (errors.length) return null;
    return {
      action: g ? "update" : "create",
      key: code,
      summary: g ? `Update grade ${code}` : `Add grade ${code} ${rec.name || ""}`.trim(),
      apply: async () => void (await ensureGrade(code, { name: rec.name, level: rec.level, sort: intOr(rec.sort), active: rec.active })),
    };
  }

  if (key === "subjects") {
    const code = normSubjectCode(rec.subject_code, rec.name);
    dup(code);
    const grades = (rec.grades ?? "").split(/[;,|]/).map((x) => x.trim()).filter(Boolean).map(normGradeCode);
    for (const gc of grades) if (!(await gradeRow(gc))) errors.push(`Grade ${gc} does not exist. Import grades first, or use the structure template.`);
    const s = await subjectRow(code);
    if (errors.length) return null;
    return {
      action: s ? "update" : "create",
      key: code,
      summary: `${s ? "Update" : "Add"} subject ${code} ${rec.name || ""}${grades.length ? `, offered in ${grades.join(", ")}` : ""}`.trim(),
      apply: async () => {
        const sid = await ensureSubject(code, { name: rec.name, nameAm: rec.name_am, sort: intOr(rec.sort), active: rec.active });
        for (const gc of grades) await ensureOffering((await gradeRow(gc))!.id, sid);
      },
    };
  }

  // Units, parts and the full structure all need a grade, subject and unit number.
  const gc = normGradeCode(rec.grade_code ?? "");
  const sc = normSubjectCode(rec.subject_code ?? "", rec.subject_name);
  const unitNo = intOr(rec.unit_number);
  const partNo = intOr(rec.part_number);
  if (!sc) errors.push("Give a subject_code (or subject_name).");
  if (!unitNo) errors.push("unit_number must be a whole number.");
  if (key === "parts" && !partNo) errors.push("part_number must be a whole number.");
  const rowKey = `${gc}-${sc}-U${unitNo}${partNo ? `-P${partNo}` : ""}`;
  dup(rowKey);
  const g = await gradeRow(gc);
  const s = sc ? await subjectRow(sc) : undefined;
  if (key !== "structure") {
    if (!g) errors.push(`Grade ${gc} does not exist. Import it first, or use the structure template.`);
    if (sc && !s) errors.push(`Subject ${sc} does not exist. Import it first, or use the structure template.`);
  }
  if (errors.length) return null;
  const u = g && s ? await unitRow(g.id, s.id, unitNo!) : undefined;
  const l = u && partNo ? await lessonRow(u.id, partNo) : undefined;

  if (key === "units") {
    return {
      action: u ? "update" : "create",
      key: rowKey,
      summary: u ? `Update unit ${unitNo}${rec.unit_title ? ` to "${rec.unit_title}"` : ""}` : `Add unit ${unitNo} "${rec.unit_title || `Unit ${unitNo}`}"`,
      apply: async () => void (await ensureUnit(g!.id, s!.id, unitNo!, { title: rec.unit_title, titleAm: rec.unit_title_am, term: rec.term })),
    };
  }

  if (key === "parts") {
    if (!u) warnings.push(`Unit ${unitNo} does not exist yet; it is added as "Unit ${unitNo}".`);
    const item = wantItem(rec.create_item);
    return {
      action: l ? "update" : "create",
      key: rowKey,
      summary: l ? `Update part ${partNo}${rec.part_title ? ` to "${rec.part_title}"` : ""}` : `Add part ${partNo} "${rec.part_title || `Part ${partNo}`}"${item ? " with its production item" : ""}`,
      apply: async (ctx) => {
        const unitId = await ensureUnit(g!.id, s!.id, unitNo!, {});
        const lessonId = await ensureLesson(unitId, partNo!, { title: rec.part_title, titleAm: rec.part_title_am, language: rec.language });
        if (item) await ensureItem(ctx, lessonId, g!.id, s!.id);
      },
    };
  }

  // structure: grade, subject, unit and (optionally) part in one row; anything missing is added.
  const adds = [!g && `grade ${gc}`, !s && `subject ${sc}`, !u && `unit ${unitNo}`, partNo && !l && `part ${partNo}`].filter(Boolean);
  const item = partNo ? wantItem(rec.create_item) : false;
  return {
    action: adds.length ? "create" : "update",
    key: rowKey,
    summary: adds.length ? `Add ${adds.join(", ")}` : "Update titles",
    apply: async (ctx) => {
      const gradeId = await ensureGrade(gc, { name: rec.grade_name, level: rec.grade_level });
      const subjectId = await ensureSubject(sc, { name: rec.subject_name });
      const unitId = await ensureUnit(gradeId, subjectId, unitNo!, { title: rec.unit_title, titleAm: rec.unit_title_am, term: rec.term });
      if (!partNo) return;
      const lessonId = await ensureLesson(unitId, partNo, { title: rec.part_title, titleAm: rec.part_title_am, language: rec.language });
      if (item) await ensureItem(ctx, lessonId, gradeId, subjectId);
    },
  };
}

// The current curriculum in each template's own columns: download, edit, import back.
export async function taxonomyPrefillRows(key: TaxonomyKey): Promise<Record<string, string>[]> {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  if (key === "grades")
    return (await all<Record<string, unknown>>("SELECT code AS grade_code, name, level, sort, CASE WHEN active = 1 THEN 'yes' ELSE 'no' END AS active FROM grades ORDER BY sort")).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])),
    );
  if (key === "subjects") {
    const subjects = await all<{ id: string; code: string; name: string; name_am: string | null; sort: number; active: number }>("SELECT * FROM subjects ORDER BY sort");
    const offered = await all<{ subject_id: string; code: string }>("SELECT gs.subject_id, g.code FROM grade_subjects gs JOIN grades g ON g.id = gs.grade_id ORDER BY g.sort");
    return subjects.map((s) => ({
      subject_code: s.code,
      name: s.name,
      name_am: str(s.name_am),
      grades: offered.filter((o) => o.subject_id === s.id).map((o) => o.code).join("; "),
      sort: str(s.sort),
      active: s.active ? "yes" : "no",
    }));
  }
  const rows = await all<Record<string, unknown>>(
    `SELECT g.code AS grade_code, g.name AS grade_name, g.level AS grade_level, s.code AS subject_code, s.name AS subject_name,
            u.number AS unit_number, u.title AS unit_title, u.title_am AS unit_title_am, u.term,
            l.number AS part_number, l.title AS part_title, l.title_am AS part_title_am, l.language
       FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
       LEFT JOIN lessons l ON l.unit_id = u.id ${key === "units" ? "AND 1 = 0" : ""}
      ${key === "parts" ? "WHERE l.id IS NOT NULL" : ""}
      ORDER BY g.sort, s.sort, u.number, l.number`,
  );
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])));
}
