// Phases 16.2 and 16.3 checks: the company's file places and links outside them; the link check (with a stand-in
// for the web) telling the leads; publishing a part's master to the Myseed App through its API (a stand-in app on a
// local port) and recording the app's ID, then the app saying it plays.
import http from "node:http";
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { createItem, releaseToProduction } from "../../src/server/workflow";
import { upsertAccount } from "../../src/server/workspace-data";
import * as fp from "../../src/server/files-publishing";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const g = (await get<{ id: string }>("SELECT id FROM grades LIMIT 1"))!.id;
  const sub = (await get<{ id: string }>("SELECT id FROM subjects LIMIT 1"))!.id;
  const item = await createItem({ actor: admin }, { gradeId: g, subjectId: sub, title: "Published by the app", teacher: "T" });
  await releaseToProduction({ actor: admin }, item.id, "uploading");
  const add = async (kind: string, url: string) =>
    await run("INSERT INTO assets (id, item_id, stage, kind, version_no, url, status, created_by, created_at) VALUES (?, ?, 'editing', ?, 1, ?, 'current', ?, ?)", uid("ast_"), item.id, kind, url, admin.id, nowIso());
  await add("master", "https://drive.google.com/drive/folders/company/master.mp4");
  await add("raw", "https://dropbox.com/personal/raw.mp4");

  // Places.
  await fp.saveStorageConfig(admin, { locations: [{ label: "Company Drive", prefix: "https://drive.google.com/drive/folders/company" }], pattern: "{grade}/{subject}/{code}" });
  const out = await fp.linksOutside({ itemId: item.id });
  check("a link outside the company's places is flagged", out.length === 1 && out[0]!.kind === "raw", out);
  check("the folder pattern is filled in", /\//.test((await fp.folderFor(item.id)) ?? "") && (await fp.folderFor(item.id))!.endsWith(item.code));

  // The weekly link check.
  const res = await fp.checkLinks(async (url) => (url.includes("dropbox") ? 404 : 200));
  check("links are checked", res.checked >= 2 && res.broken >= 1, res);
  check("broken ones are listed", (await fp.brokenLinks()).some((b) => b.url.includes("dropbox") && b.status === 404));
  check("and the leads are told", !!(await get("SELECT 1 AS x FROM notifications WHERE title LIKE '%no longer open%'")));
  check("weekly, not every run", ((await fp.weeklyLinkCheck()) as { skipped?: boolean }).skipped === true);

  // A stand-in Myseed App.
  const seen: { method: string; url: string; auth: string | undefined; body: string }[] = [];
  const app = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/videos") return res.end(JSON.stringify({ id: "app-77", status: "processing" }));
      if (req.method === "GET" && req.url === "/videos/app-77") return res.end(JSON.stringify({ id: "app-77", status: "ready", playable: true, url: "https://app.myseed.test/v/77" }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", () => r()));
  const port = (app.address() as { port: number }).port;
  try {
  await fp.saveAppConfig(admin, { url: `http://127.0.0.1:${port}/`, key: "app-secret-key" });
  // Uploads are recorded by Uploading.
  const mgr = (await loadUser((await upsertAccount({ name: "fpuploader", email: "fpuploader@fp.local", title: "Uploader", roles: ["uploading"], password: "Files-2026!", mustChangePassword: false })).id))!;
  check("the key is kept sealed", !((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.myseedApp'"))?.value ?? "").includes("app-secret-key"));
  const sent = await fp.publishToApp(mgr, item.id);
  check("the master is sent with the part's details and the key", sent.id === "app-77" && seen[0]?.auth === "Bearer app-secret-key" && JSON.parse(seen[0]!.body).videoUrl.includes("master.mp4") && JSON.parse(seen[0]!.body).code === item.code, seen[0]);
  const t1 = await get<{ external_id: string; upload_status: string }>("SELECT external_id, upload_status FROM publication_targets WHERE item_id = ? AND platform = 'myseed_app'", item.id);
  check("the app's ID is recorded as the upload", t1?.external_id === "app-77", t1);
  const chk = await fp.checkApp(mgr, item.id);
  const t2 = await get<{ upload_status: string; playback_checked: number }>("SELECT upload_status, playback_checked FROM publication_targets WHERE item_id = ? AND platform = 'myseed_app'", item.id);
  check("when the app says it plays, the upload is complete and checked", chk.playable && t2?.upload_status === "uploaded" && !!t2.playback_checked, t2);
  await fp.saveAppConfig(admin, { url: "" });
  let msg = "";
  await fp.publishToApp(mgr, item.id).catch((e) => (msg = e.message));
  check("without a connection it says so", /not connected/.test(msg));
  } finally {
    app.close();
  }

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
