import { all, get, parseJson, run, uid } from "./db";
import { ESSENTIAL_NOTIFICATION_TYPES, type NotificationType, type Role } from "@/lib/domain";
import { sendPush } from "./push";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  itemId?: string | null;
  // Same dedupe key for the same user is never delivered twice (retries, repeated scans).
  dedupeKey?: string;
  // Unread notifications with the same group key are merged into one entry with a count.
  groupKey?: string;
};

async function mutedTypes(userId: string): Promise<string[]> {
  const row = await get<{ prefs: string }>("SELECT prefs FROM users WHERE id = ?", userId);
  return parseJson<{ mutedNotificationTypes?: string[] }>(row?.prefs, {}).mutedNotificationTypes ?? [];
}

export async function notify(userIds: (string | null | undefined)[], input: NotifyInput, now: string, exceptUserId?: string) {
  const essential = ESSENTIAL_NOTIFICATION_TYPES.includes(input.type);
  const unique = [...new Set(userIds.filter((u): u is string => !!u && u !== exceptUserId))];
  const delivered: string[] = [];
  for (const userId of unique) {
    if (!essential && (await mutedTypes(userId)).includes(input.type)) continue;
    if (input.dedupeKey) {
      const exists = await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND dedupe_key = ?", userId, input.dedupeKey);
      if (exists) continue;
    }
    if (input.groupKey) {
      const open = await get<{ id: string }>(
              "SELECT id FROM notifications WHERE user_id = ? AND group_key = ? AND read_at IS NULL",
              userId,
              input.groupKey,
            );
      if (open) {
        await run(
                    "UPDATE notifications SET count = count + 1, title = ?, body = ?, link = COALESCE(?, link), updated_at = ? WHERE id = ?",
                    input.title,
                    input.body ?? null,
                    input.link ?? null,
                    now,
                    open.id,
                  );
        delivered.push(userId);
        continue;
      }
    }
    await run(
            `INSERT INTO notifications (id, user_id, type, title, body, link, item_id, group_key, dedupe_key, essential, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            uid("n_"),
            userId,
            input.type,
            input.title,
            input.body ?? null,
            input.link ?? null,
            input.itemId ?? null,
            input.groupKey ?? null,
            input.dedupeKey ?? null,
            essential,
            now,
            now,
          );
    delivered.push(userId);
  }
  // The same notice also goes to the person's browsers and phones that turned on push.
  if (delivered.length) await sendPush(delivered, { title: input.title, body: input.body, link: input.link, tag: input.groupKey ?? input.dedupeKey });
  // And by email to those who asked for email copies of this type (sent in the background).
  if (delivered.length)
    await (await import("./outbox")).queueNotificationEmails(delivered, input).catch((err) => console.error("Notification email", err));
}

export async function usersWithRole(role: Role): Promise<string[]> {
  return (await all<{ user_id: string }>(
      "SELECT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = ? AND u.active = 1",
      role,
    )).map((r) => r.user_id);
}

// Users holding a role whose scope covers the item.
export async function roleUsersForItem(role: Role, itemId: string): Promise<string[]> {
  const ids = await usersWithRole(role);
  if (!ids.length) return [];
  const memberships = await all<{ grade_id: string; subject_id: string }>(
      "SELECT grade_id, subject_id FROM item_memberships WHERE item_id = ?",
      itemId,
    );
  const allScopes = await all<{ user_id: string; grade_id: string | null; subject_id: string | null }>(
    `SELECT user_id, grade_id, subject_id FROM access_scopes WHERE user_id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  return ids.filter((id) => {
    const scopes = allScopes.filter((s) => s.user_id === id);
    if (!scopes.length) return true;
    return scopes.some(
      (s) =>
        (!s.grade_id && !s.subject_id) ||
        memberships.some(
          (m) => (!s.grade_id || s.grade_id === m.grade_id) && (!s.subject_id || s.subject_id === m.subject_id),
        ),
    );
  });
}

// Active team leads of a stage (Admin, Teams).
export async function teamLeads(stage: string): Promise<string[]> {
  return (await all<{ user_id: string }>("SELECT t.user_id FROM team_leads t JOIN users u ON u.id = t.user_id WHERE t.stage = ? AND u.active = 1", stage)).map((r) => r.user_id);
}

export async function managers(): Promise<string[]> {
  return await usersWithRole("manager");
}

export async function unreadCount(userId: string, now: string) {
  return (
    (await get<{ c: number }>(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?)",
            userId,
            now,
          ))?.c ?? 0
  );
}
