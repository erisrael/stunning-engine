/*
 * Runs the project's tests against throwaway databases, never the one in .env.
 *
 *   npm test                         server tests (tests/server)
 *   npm run test:e2e                 browser tests (tests/e2e), against the built app: run `npm run build` first
 *   npm run test:all                 both
 *   npm test -- signin attendance    only the tests with these names
 *
 * A demo workspace is seeded once (tests/fixtures/demo-seed.ts); each test gets its own copy. Browser tests use
 * Chrome (CHROME_PATH, or the usual install place) and start the app on a spare port with that copy.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const mode = args.includes("--all") ? "all" : args.includes("--e2e") ? "e2e" : "server";
const only = args.filter((a) => !a.startsWith("--"));
const tsx = [path.join(root, "node_modules", "tsx", "dist", "cli.mjs")];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "myseed-tests-"));
const results = path.join(root, "test-results");

// The live database is never touched: every child process gets DATABASE_URL set to empty. (Removing it is not
// enough: `next start` reads .env itself and fills in variables that are missing, but not ones set to empty.)
const baseEnv = (): NodeJS.ProcessEnv => ({ ...process.env, DATABASE_URL: "" });

const chrome =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p)) ||
  "";

function list(dir: string, suffix: string) {
  return fs
    .readdirSync(path.join(root, "tests", dir))
    .filter((f) => f.endsWith(suffix))
    .map((f) => ({ name: f.slice(0, -suffix.length), file: path.join(root, "tests", dir, f) }))
    .filter((t) => !only.length || only.includes(t.name));
}

function copyDb(from: string, name: string) {
  const to = path.join(tmp, name);
  fs.cpSync(from, to, { recursive: true });
  return to;
}

type Outcome = { name: string; kind: string; passed: number; failed: number; ok: boolean; seconds: number; tail: string[] };
const outcomes: Outcome[] = [];

function judge(name: string, kind: string, out: string, status: number | null, t0: number) {
  const lines = out.split(/\r?\n/);
  const passed = lines.filter((l) => l.startsWith("PASS")).length;
  const failedLines = lines.filter((l) => l.startsWith("FAIL"));
  const ok = status === 0 && failedLines.length === 0 && passed > 0;
  outcomes.push({ name, kind, passed, failed: failedLines.length, ok, seconds: Math.round((Date.now() - t0) / 1000), tail: ok ? [] : [...failedLines, ...lines.filter((l) => !l.startsWith("PASS") && l.trim()).slice(-15)] });
  console.log(`${ok ? "ok  " : "FAIL"} ${kind} ${name}: ${passed} passed, ${failedLines.length} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
}

function seed() {
  const dir = path.join(tmp, "seed");
  const r = spawnSync(process.execPath, [...tsx, "tests/fixtures/demo-seed.ts"], { cwd: root, env: { ...baseEnv(), PGLITE_DIR: dir }, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Seeding the demo workspace failed:\n${r.stderr || r.stdout}`);
  return dir;
}

function serverTests(seedDir: string) {
  for (const t of list("server", ".test.ts")) {
    const t0 = Date.now();
    const db = copyDb(seedDir, `s-${t.name}`);
    const r = spawnSync(process.execPath, [...tsx, t.file], { cwd: root, env: { ...baseEnv(), PGLITE_DIR: db }, encoding: "utf8", timeout: 15 * 60e3 });
    judge(t.name, "server", `${r.stdout}\n${r.stderr}`, r.status, t0);
  }
}

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function stop(p: ChildProcess) {
  if (!p.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
}

async function e2eTests(seedDir: string) {
  if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) throw new Error("Build the app first: npm run build");
  if (!chrome) console.warn("Chrome not found; set CHROME_PATH. Trying Playwright's own browser.");
  let port = 3210;
  for (const t of list("e2e", ".e2e.mjs")) {
    const t0 = Date.now();
    const db = copyDb(seedDir, `e-${t.name}`);
    const prepFile = path.join(tmp, `${t.name}.json`);
    const prep = spawnSync(process.execPath, [...tsx, "tests/e2e/prep.ts", t.name], { cwd: root, env: { ...baseEnv(), PGLITE_DIR: db, PREP_FILE: prepFile }, encoding: "utf8" });
    if (prep.status !== 0) {
      judge(t.name, "browser", `FAIL prep\n${prep.stderr}`, 1, t0);
      continue;
    }
    port++;
    const env = { ...baseEnv(), PGLITE_DIR: db, PORT: String(port), MYSEED_INSECURE_COOKIES: "1", MYSEED_TIMER: "0", NODE_ENV: "production" as const, BACKUP_DIR: path.join(tmp, `backups-${t.name}`) };
    const server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    server.stdout?.on("data", (d) => (log += d));
    server.stderr?.on("data", (d) => (log += d));
    try {
      if (!(await waitFor(`http://127.0.0.1:${port}/api/health`, 120e3))) {
        judge(t.name, "browser", `FAIL the app did not start\n${log.slice(-2000)}`, 1, t0);
        continue;
      }
      const r = await new Promise<{ out: string; status: number | null }>((resolve) => {
        let out = "";
        const c = spawn(process.execPath, [t.file], { cwd: root, env: { ...baseEnv(), BASE_URL: `http://localhost:${port}`, PREP_FILE: prepFile, SHOTS_DIR: results, CHROME_PATH: chrome } });
        c.stdout.on("data", (d) => (out += d));
        c.stderr.on("data", (d) => (out += d));
        const timer = setTimeout(() => c.kill(), 15 * 60e3);
        c.on("close", (status) => (clearTimeout(timer), resolve({ out, status })));
      });
      judge(t.name, "browser", r.out, r.status, t0);
      if (outcomes.at(-1)!.ok === false) fs.writeFileSync(path.join(tmp, `${t.name}-server.log`), log);
    } finally {
      stop(server);
    }
  }
}

async function main() {
  fs.mkdirSync(results, { recursive: true });
  console.log(`Throwaway databases in ${tmp}`);
  const seedDir = seed();
  if (mode !== "e2e") serverTests(seedDir);
  if (mode !== "server") await e2eTests(seedDir);
  const bad = outcomes.filter((o) => !o.ok);
  const passed = outcomes.reduce((n, o) => n + o.passed, 0);
  console.log(`\n${outcomes.length} test files, ${passed} checks passed, ${bad.length} files failed.`);
  for (const b of bad) console.log(`\n--- ${b.kind} ${b.name}\n${b.tail.join("\n")}`);
  if (!bad.length) fs.rmSync(tmp, { recursive: true, force: true });
  else console.log(`\nDatabases and server logs kept in ${tmp}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
