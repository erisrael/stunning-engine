// Speed with years of data (Phase 18): fills a throwaway workspace with about five years of data and times the
// queries the busiest pages run, so slow ones show before people feel them.
//
//   PGLITE_DIR=/tmp/myseed-big npx tsx scripts/big-data.ts            (fill, then time)
//   PGLITE_DIR=/tmp/myseed-big npx tsx scripts/big-data.ts --time      (time only)
//
// Never point it at a real database: it refuses unless PGLITE_DIR is set and DATABASE_URL is not.
// Sizes (change with BIG_SCALE, default 1): 20,000 parts, 40,000 department tasks, 1,000,000 attendance events.

import { all, closeDb, execRaw, get, run } from "../src/server/db";
import { loadUser } from "../src/server/users";
import { syncFromUsers } from "../src/server/hr";

if (!process.env.PGLITE_DIR || process.env.DATABASE_URL) {
  console.error("Set PGLITE_DIR to a throwaway folder and leave DATABASE_URL unset.");
  process.exit(1);
}
const scale = Math.max(0.01, Number(process.env.BIG_SCALE ?? 1));
const n = (x: number) => Math.round(x * scale);

async function fill() {
  const t0 = Date.now();
  const days = 5 * 365;
  console.log(`Filling: ${n(20000)} parts, ${n(40000)} tasks, ${n(1_000_000)} attendance events...`);
  await execRaw(`
    INSERT INTO items (id, code, title, lifecycle, created_at, updated_at)
    SELECT 'big_itm_' || g, 'BIG-' || g, 'Big part ' || g, (ARRAY['draft','in_production','published','archived'])[1 + g % 4],
           to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"'),
           to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"')
    FROM generate_series(1, ${n(20000)}) g ON CONFLICT DO NOTHING;`);
  const users = (await all<{ id: string }>("SELECT id FROM users WHERE active = 1 LIMIT 50")).map((u) => u.id);
  const arr = `ARRAY[${users.map((u) => `'${u}'`).join(",")}]::text[]`;
  await execRaw(`
    INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, created_at, updated_at)
    SELECT 'big_tsk_' || g, (ARRAY['dev','marketing'])[1 + g % 2], 'BIG-T' || g, 'Big task ' || g,
           (ARRAY['todo','in_progress','done'])[1 + g % 3], (ARRAY['open','active','done'])[1 + g % 3],
           (${arr})[1 + g % ${Math.max(1, users.length)}],
           to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"'),
           to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"')
    FROM generate_series(1, ${n(40000)}) g ON CONFLICT DO NOTHING;`);
  if (!(await get("SELECT 1 AS x FROM employees LIMIT 1"))) {
    const admin = await loadUser((await get<{ id: string }>("SELECT u.id FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = 'admin' LIMIT 1"))!.id);
    await syncFromUsers(admin!);
  }
  const emps = (await all<{ id: string }>("SELECT id FROM employees LIMIT 200")).map((e) => e.id);
  if (emps.length) {
    const ea = `ARRAY[${emps.map((e) => `'${e}'`).join(",")}]::text[]`;
    await execRaw(`
      INSERT INTO att_events (id, employee_id, kind, at, day, source, created_at)
      SELECT 'big_att_' || g, (${ea})[1 + g % ${emps.length}], CASE WHEN g % 2 = 0 THEN 'in' ELSE 'out' END,
             to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"'),
             to_char(now() - (g % ${days}) * interval '1 day', 'YYYY-MM-DD'), 'kiosk',
             to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"')
      FROM generate_series(1, ${n(1_000_000)}) g ON CONFLICT DO NOTHING;`);
  }
  console.log(`Filled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// The heaviest queries behind the busiest pages; anything over 300 ms is listed to fix.
const CHECKS: { page: string; sql: string; params?: string[] }[] = [
  { page: "Home (production counts)", sql: "SELECT lifecycle, COUNT(*) FROM items GROUP BY lifecycle" },
  { page: "Overview (latest parts)", sql: "SELECT id, code, title FROM items WHERE lifecycle = 'in_production' ORDER BY updated_at DESC LIMIT 100" },
  { page: "Dev board (open tasks)", sql: "SELECT id, code, title, status FROM dept_tasks WHERE dept = 'dev' AND status_category <> 'done' ORDER BY updated_at DESC LIMIT 500" },
  { page: "My tasks", sql: "SELECT id FROM dept_tasks WHERE assignee_id = (SELECT id FROM users LIMIT 1) AND status_category <> 'done' LIMIT 100" },
  { page: "Attendance daily board", sql: "SELECT employee_id, MIN(at), MAX(at) FROM att_events WHERE day = to_char(now(), 'YYYY-MM-DD') GROUP BY employee_id" },
  { page: "Timesheets (a month)", sql: "SELECT employee_id, COUNT(*) FROM att_events WHERE day >= to_char(now() - interval '30 days', 'YYYY-MM-DD') GROUP BY employee_id" },
  { page: "Search (by title)", sql: "SELECT id FROM items WHERE title ILIKE '%part 1234%' LIMIT 12" },
];

async function time() {
  const rows: { page: string; ms: number }[] = [];
  for (const c of CHECKS) {
    const t0 = performance.now();
    await all(c.sql, ...(c.params ?? []));
    rows.push({ page: c.page, ms: Math.round(performance.now() - t0) });
  }
  const counts = {
    items: Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM items"))?.c ?? 0),
    tasks: Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_tasks"))?.c ?? 0),
    attendance: Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM att_events"))?.c ?? 0),
  };
  console.log(`\nRows: ${counts.items} parts, ${counts.tasks} tasks, ${counts.attendance} attendance events`);
  for (const r of rows) console.log(`${r.ms > 300 ? "SLOW" : "ok  "} ${String(r.ms).padStart(6)} ms  ${r.page}`);
  const slow = rows.filter((r) => r.ms > 300);
  console.log(slow.length ? `\n${slow.length} slow; add an index or paging for them.` : "\nAll under 300 ms.");
}

(async () => {
  if (!process.argv.includes("--time")) await fill();
  await time();
  void run;
  await closeDb();
})();
