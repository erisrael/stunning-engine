import { all, placeholders } from "./db";
import type { ItemListRow } from "./queries";
import { NEXT_STAGE } from "@/lib/domain";
import type { WorkRow } from "@/components/app/worklist";

export async function toWorkRows(rows: ItemListRow[], viewerId: string): Promise<WorkRow[]> {
  const ids = rows.map((r) => r.id);
  const mine = new Set(
    ids.length
      ? (await all<{ item_id: string }>(`SELECT item_id FROM work_sessions WHERE user_id = ? AND ended_at IS NULL AND item_id IN (${placeholders(ids.length)})`, viewerId, ...ids)).map((r) => r.item_id)
      : [],
  );
  return rows.map((r) => {
    const next = r.stage ? NEXT_STAGE[r.stage] : null;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      title_am: r.title_am,
      lifecycle: r.lifecycle,
      stage: r.stage,
      stage_status: r.stage_status,
      substate: r.substate,
      priority: r.priority,
      grade_name: r.grade_name,
      subject_name: r.subject_name,
      unit_number: r.unit_number,
      lesson_number: r.lesson_number,
      current_due_at: r.current_due_at,
      stage_entered_at: r.stage_entered_at,
      next_action: r.next_action,
      next_action_owner_id: r.next_action_owner_id,
      version: r.version,
      ownerId: r.stage ? r.stages[r.stage].ownerId : r.lifecycle === "draft" ? r.owners.recording : null,
      nextOwnerId: next ? r.owners[next] : null,
      open_blocker: r.open_blocker,
      comment_count: r.comment_count,
      hasMySession: mine.has(r.id),
    };
  });
}

export async function userNames(): Promise<Record<string, string>> {
  return Object.fromEntries((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
}
