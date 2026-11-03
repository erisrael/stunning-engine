// Phase 28: Admin, Platform. The database page (tables, rows, sizes), the read-only console (no changes, no second
// statement, secrets hidden, audited), API usage recorded by the routes, deploys noted once per build, status, the
// app's OpenAPI file, and the health score.
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as P from "../../src/server/platform";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dev = (await loadUser((await upsertAccount({ name: "platdev", email: "platdev@p.local", title: "Dev", roles: ["developer"], password: "Platform-2026!", mustChangePassword: false })).id))!;
  check("only Admin", /Only Admin/.test((await throws(() => P.databaseInfo(dev))) ?? "") && /Only Admin/.test((await throws(() => P.runQuery(dev, "SELECT 1"))) ?? ""));

  const db = await P.databaseInfo(admin);
  const users = db.tables.find((t) => t.name === "users");
  check("every table with its rows and size", db.tables.length > 100 && !!users && users.rows >= 9 && users.backedUp && db.size > 0, { n: db.tables.length, users });
  check("the schema is up to date", db.schemaVersion === db.expectedSchema);

  const q = await P.runQuery(admin, "SELECT email, password_hash, name FROM users ORDER BY email LIMIT 3;");
  check("a read-only query runs", q.columns.join(",") === "email,password_hash,name" && q.rows.length === 3);
  check("passwords are hidden", q.hidden.includes("password_hash") && q.rows.every((r) => r[1] === "•••"));
  check("changes are refused", /Only reading/.test((await throws(() => P.runQuery(admin, "DELETE FROM users"))) ?? ""));
  check("changes hidden in a SELECT are refused", /change something/.test((await throws(() => P.runQuery(admin, "SELECT 1 FROM users WHERE id IN (SELECT id FROM users) UNION SELECT pg_sleep(10)::text::int"))) ?? ""));
  check("a second statement is refused", /One query/.test((await throws(() => P.runQuery(admin, "SELECT 1; DROP TABLE users"))) ?? ""));
  check("the transaction is read only even if checks were fooled", /read-only|read only/i.test((await throws(() => P.runQuery(admin, "WITH x AS (SELECT 1) SELECT * FROM x WHERE nextval('audit_events_seq_seq') > 0"))) ?? ""));
  check("users still exist", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM users"))?.c) >= 9);
  check("queries are audited", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'platform.query'")));
  check("EXPLAIN works", (await P.runQuery(admin, "EXPLAIN SELECT * FROM users")).rows.length >= 1);

  // API usage.
  await P.tracked("feeds", async () => new Response("ok"));
  await P.tracked("feeds", async () => new Response("no", { status: 401 }));
  await P.tracked("support-sdk", async () => Response.json({}));
  await new Promise((r) => setTimeout(r, 200));
  const u = await P.apiUsage(admin, 7);
  const f = u.routes.find((r) => r.route === "feeds");
  check("calls are counted per route, with errors", !!f && f.calls === 2 && f.errors === 1 && u.total === 3 && u.daily.length === 7, u.routes);

  // Status and deploys.
  const s1 = await P.statusInfo(admin);
  const s2 = await P.statusInfo(admin);
  check("a deploy is noted once per build", s1.deploys.length === 1 && s2.deploys.length === 1 && s1.deploys[0]!.version === s1.build.version);
  check("status lists the parts", s1.parts.some((p) => p.key === "db") && s1.parts.some((p) => p.key === "ai") && ["ok", "warn", "bad"].includes(s1.overall));

  // Developer integration.
  const spec = (await P.openApiDoc("https://work.myseed.et")) as { openapi: string; servers: { url: string }[]; paths: Record<string, unknown> };
  check("the app's own OpenAPI file", spec.openapi.startsWith("3") && spec.servers[0]!.url === "https://work.myseed.et" && "/api/feeds/dept_tasks" in spec.paths && "/api/support/v1/identify" in spec.paths);
  const dv = await P.developerInfo(admin, "https://work.myseed.et");
  check("developer page lists the endpoints", dv.endpoints.length >= 12);

  // Health.
  const h = await P.systemHealth(admin);
  check("a health score with the checks", h.score >= 0 && h.score <= 100 && h.checks.some((c) => c.key === "dbspeed") && h.metrics.dbP50 >= 0 && h.metrics.cpus > 0, { score: h.score });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
