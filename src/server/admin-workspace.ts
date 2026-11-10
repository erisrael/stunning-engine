import { all, get, nowIso } from "./db";
import { type AppUser, can } from "./users";
import { myDepartments } from "./departments";
import { listTasks } from "./work";
import { myApprovals } from "./assistant-ops";

export type AdminWorkspaceData = {
  tasks: {
    id: string;
    code: string;
    title: string;
    dept: string;
    deptTitle: string;
    status: string;
    priority: string | null;
    due_date: string | null;
  }[];
  approvals: {
    leave: { id: string; full_name: string; start_date: string; end_date: string; type_key: string }[];
    claims: { id: string; name: string; amount: number; description: string; date: string }[];
    corrections: { id: string; full_name: string; day: string; reason: string }[];
  };
  pendingUsers: { id: string; name: string; email: string; created_at: string; role: string }[];
  systemHealth: {
    onlineUsersCount: number;
    totalUsersCount: number;
    dbSizeEstimate: string;
    lastBackupTime: string | null;
    recentErrorsCount: number;
    noorConnected: boolean;
  };
};

export async function adminWorkspaceData(user: AppUser): Promise<AdminWorkspaceData> {
  const isSuper = can(user, "users.manage");

  // 1. Tasks assigned to this admin across all departments
  const tasks: AdminWorkspaceData["tasks"] = [];
  const depts = await myDepartments(user).catch(() => []);
  for (const d of depts) {
    try {
      const res = await listTasks(user, d.dept, { assignee: "me", open: true, sort: "due", dir: "asc" });
      for (const t of res.tasks.slice(0, 30)) {
        tasks.push({
          id: t.id,
          code: t.code,
          title: t.title,
          dept: d.dept,
          deptTitle: d.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
        });
      }
    } catch {
      // department without tasks
    }
  }

  // 2. Approvals
  const approvals = await myApprovals(user as any).catch(() => ({ leave: [], claims: [], corrections: [] }));

  // 3. Pending users (if users.manage)
  let pendingUsers: AdminWorkspaceData["pendingUsers"] = [];
  if (isSuper) {
    pendingUsers = await all<{ id: string; name: string; email: string; created_at: string; role: string }>(
      "SELECT id, name, email, created_at, role FROM users WHERE active = 0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 15"
    ).catch(() => []);
  }

  // 4. System health
  const onlineCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const onlineCount = Number(
    (await get<{ c: number }>("SELECT COUNT(DISTINCT user_id) AS c FROM user_sessions WHERE expires_at > ?", nowIso()))?.c ?? 0
  );
  const totalUsers = Number(
    (await get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL"))?.c ?? 0
  );
  const recentErrors = Number(
    (await get<{ c: number }>("SELECT COUNT(*) AS c FROM system_errors WHERE created_at >= ?", onlineCutoff).catch(() => ({ c: 0 })))?.c ?? 0
  );

  // Noor connection check
  const noorRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  let noorConnected = false;
  if (noorRow?.value) {
    try {
      const parsed = JSON.parse(noorRow.value);
      noorConnected = !!parsed.sessionCookieEnc;
    } catch {}
  }

  // Last backup
  const backupRow = await get<{ occurred_at: string }>(
    "SELECT occurred_at FROM audit_events WHERE action LIKE 'backup%' ORDER BY occurred_at DESC LIMIT 1"
  ).catch(() => null);

  return {
    tasks,
    approvals,
    pendingUsers,
    systemHealth: {
      onlineUsersCount: onlineCount,
      totalUsersCount: totalUsers,
      dbSizeEstimate: "PostgreSQL Live",
      lastBackupTime: backupRow?.occurred_at ?? null,
      recentErrorsCount: recentErrors,
      noorConnected,
    },
  };
}
