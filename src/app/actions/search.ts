"use server";

import { requireViewer } from "@/server/auth";
import { all } from "@/server/db";
import { scopeSql } from "@/server/users";

export async function searchAction(q: string) {
  const viewer = await requireViewer();
  const term = q.trim();
  if (term.length < 2) return [];
  const sc = scopeSql(viewer, "i");
  const like = `%${term}%`;
  return await all<{ id: string; code: string; title: string; title_am: string | null; lifecycle: string; stage: string | null; stage_status: string | null }>(
      `SELECT i.id, i.code, i.title, i.title_am, i.lifecycle, i.stage, i.stage_status FROM items i
     WHERE ${sc.sql} AND (i.code ILIKE ? OR i.title ILIKE ? OR i.title_am ILIKE ? OR i.teacher ILIKE ? OR i.id = ?)
     ORDER BY CASE WHEN i.code ILIKE ? THEN 0 ELSE 1 END, i.updated_at DESC LIMIT 12`,
      ...sc.params,
      like,
      like,
      like,
      like,
      term,
      `${term}%`,
    );
}
