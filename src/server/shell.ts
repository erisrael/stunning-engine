import { get, nowIso } from "./db";
import { can, scopeSql, type AppUser } from "./users";
import { unreadChatCount } from "./chat";
import { unreadCount } from "./notifications";

const count = async (sql: string, ...params: string[]) => (await get<{ c: number }>(sql, ...params))?.c ?? 0;

// Sidebar and top bar badges. The queries are independent, so they run in parallel (one round trip, not six).
export async function shellCounts(user: AppUser) {
  const now = nowIso();
  const sc = scopeSql(user, "i");
  const isManager = can(user, "questions.ask");
  const [myWork, handoffs, questions, corrections, notifications, chat] = await Promise.all([
    count(
      `SELECT COUNT(*) AS c FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
       WHERE i.lifecycle = 'in_production' AND (a.owner_id = ? OR i.next_action_owner_id = ?) AND ${sc.sql}`,
      user.id,
      user.id,
      ...sc.params,
    ),
    count(`SELECT COUNT(*) AS c FROM items i WHERE i.lifecycle = 'in_production' AND i.stage_status = 'awaiting_handoff' AND ${sc.sql}`, ...sc.params),
    count(
      isManager
        ? "SELECT COUNT(*) AS c FROM manager_questions WHERE status = 'open' AND (owner_id = ? OR asked_by = ?)"
        : "SELECT COUNT(*) AS c FROM manager_questions WHERE status = 'open' AND (owner_id = ? OR owner_id = ?)",
      user.id,
      user.id,
    ),
    can(user, "corrections.approve") ? count("SELECT COUNT(*) AS c FROM session_corrections WHERE status = 'pending'") : Promise.resolve(0),
    unreadCount(user.id, now),
    unreadChatCount(user.id),
  ]);
  return { myWork, handoffs, questions, corrections, notifications, chat };
}
