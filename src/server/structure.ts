import { all } from "./db";
import { scopeAllowsGradeSubject, scopeSql, type AppUser } from "./users";
import { STAGES, type SimpleStatus, type Stage } from "@/lib/domain";

/*
 * Curriculum structure with a simple status per stage, used by Coverage and Overview.
 * One row per part (lesson); a unit without parts gets one row of its own.
 *
 *   done        the stage is complete
 *   in_process  the part is in this stage now (including a submitted handoff not yet accepted)
 *   missing     nothing has been done where work is needed: no item, or a draft that never started
 *   none ("-")  the stage has not been reached yet
 */

export type StructureRow = {
  gradeId: string;
  gradeName: string;
  gradeSort: number;
  subjectId: string;
  subjectName: string;
  subjectSort: number;
  unitId: string;
  unitNumber: number;
  unitTitle: string;
  partId: string | null;
  partNumber: number | null;
  partTitle: string | null;
  itemId: string | null;
  itemCode: string | null;
  cameraCodes: string[];
  stages: Record<Stage, SimpleStatus>;
  // When each stage was done: recorded, edited, uploaded and publication dates.
  dates: Record<Stage, string | null>;
  ownerIds: string[];
};

type ItemRow = {
  id: string;
  code: string;
  lesson_id: string;
  lifecycle: string;
  stage: Stage | null;
  stage_status: string | null;
  deliverable_type: string;
  recorded_at: string | null;
  edited_at: string | null;
  uploaded_at: string | null;
  published_at: string | null;
};

function rank(i: ItemRow) {
  if (i.lifecycle === "published") return 10;
  if (i.lifecycle === "in_production" && i.stage) return 2 + STAGES.indexOf(i.stage);
  return i.lifecycle === "draft" ? 1 : 0;
}

export function stageStatuses(item: Pick<ItemRow, "lifecycle" | "stage"> | null): Record<Stage, SimpleStatus> {
  const out = { recording: "none", editing: "none", uploading: "none", publication: "none" } as Record<Stage, SimpleStatus>;
  if (!item || item.lifecycle === "draft" || item.lifecycle === "cancelled" || item.lifecycle === "archived") {
    out.recording = "missing";
    return out;
  }
  if (item.lifecycle === "published") {
    for (const s of STAGES) out[s] = "done";
    return out;
  }
  const idx = item.stage ? STAGES.indexOf(item.stage) : 0;
  STAGES.forEach((s, i) => (out[s] = i < idx ? "done" : i === idx ? "in_process" : "none"));
  return out;
}

export async function structureRows(user: AppUser, filter: { gradeIds?: string[]; subjectIds?: string[] } = {}): Promise<StructureRow[]> {
  const units = (
    await all<{ unit_id: string; unit_number: number; unit_title: string; grade_id: string; grade_name: string; grade_sort: number; subject_id: string; subject_name: string; subject_sort: number }>(
      `SELECT u.id AS unit_id, u.number AS unit_number, u.title AS unit_title, g.id AS grade_id, g.name AS grade_name, g.sort AS grade_sort,
              s.id AS subject_id, s.name AS subject_name, s.sort AS subject_sort
       FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
       WHERE g.active = 1 AND s.active = 1
       ORDER BY g.sort, s.sort, u.number`,
    )
  ).filter(
    (u) =>
      scopeAllowsGradeSubject(user, u.grade_id, u.subject_id) &&
      (!filter.gradeIds?.length || filter.gradeIds.includes(u.grade_id)) &&
      (!filter.subjectIds?.length || filter.subjectIds.includes(u.subject_id)),
  );
  if (!units.length) return [];
  const unitIds = new Set(units.map((u) => u.unit_id));
  const lessons = (await all<{ id: string; unit_id: string; number: number; title: string }>("SELECT id, unit_id, number, title FROM lessons ORDER BY number")).filter((l) =>
    unitIds.has(l.unit_id),
  );
  const sc = scopeSql(user, "i");
  const items = await all<ItemRow>(
    `SELECT i.id, i.code, i.lesson_id, i.lifecycle, i.stage, i.stage_status, i.deliverable_type, i.recorded_at, i.edited_at, i.uploaded_at, i.published_at FROM items i
     WHERE i.lesson_id IS NOT NULL AND i.lifecycle NOT IN ('archived','cancelled') AND i.revision_of_id IS NULL AND ${sc.sql}`,
    ...sc.params,
  );
  // The main deliverable represents the part; otherwise the most advanced item.
  const byLesson = new Map<string, ItemRow>();
  for (const i of items) {
    const cur = byLesson.get(i.lesson_id);
    const main = (x: ItemRow) => x.deliverable_type === "main_video";
    if (!cur || (main(i) && !main(cur)) || (main(i) === main(cur) && rank(i) > rank(cur))) byLesson.set(i.lesson_id, i);
  }
  const codes = await all<{ item_id: string; camera_code: string }>(
    "SELECT item_id, camera_code FROM assets WHERE kind = 'raw' AND camera_code IS NOT NULL AND status <> 'superseded' ORDER BY version_no",
  );
  const codeMap = new Map<string, string[]>();
  for (const c of codes) codeMap.set(c.item_id, [...(codeMap.get(c.item_id) ?? []), c.camera_code]);

  const owners = await all<{ item_id: string; user_id: string }>("SELECT item_id, user_id FROM stage_assignments WHERE user_id IS NOT NULL");
  const ownerMap = new Map<string, string[]>();
  for (const o of owners) ownerMap.set(o.item_id, [...(ownerMap.get(o.item_id) ?? []), o.user_id]);
  const noDates = { recording: null, editing: null, uploading: null, publication: null };
  const rows: StructureRow[] = [];
  for (const u of units) {
    const base = {
      gradeId: u.grade_id,
      gradeName: u.grade_name,
      gradeSort: u.grade_sort,
      subjectId: u.subject_id,
      subjectName: u.subject_name,
      subjectSort: u.subject_sort,
      unitId: u.unit_id,
      unitNumber: u.unit_number,
      unitTitle: u.unit_title,
    };
    const ls = lessons.filter((l) => l.unit_id === u.unit_id);
    if (!ls.length) {
      // Own-work members only see parts assigned to them, so empty units are left out for them.
      if (!user.ownWorkOnly)
        rows.push({ ...base, partId: null, partNumber: null, partTitle: null, itemId: null, itemCode: null, cameraCodes: [], stages: stageStatuses(null), dates: noDates, ownerIds: [] });
      continue;
    }
    for (const l of ls) {
      const item = byLesson.get(l.id) ?? null;
      if (user.ownWorkOnly && !item) continue;
      rows.push({
        ...base,
        partId: l.id,
        partNumber: l.number,
        partTitle: l.title,
        itemId: item?.id ?? null,
        itemCode: item?.code ?? null,
        cameraCodes: item ? (codeMap.get(item.id) ?? []) : [],
        stages: stageStatuses(item),
        dates: item ? { recording: item.recorded_at, editing: item.edited_at, uploading: item.uploaded_at, publication: item.published_at } : noDates,
        ownerIds: item ? (ownerMap.get(item.id) ?? []) : [],
      });
    }
  }
  return rows;
}
