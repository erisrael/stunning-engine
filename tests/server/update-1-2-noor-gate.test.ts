// Noor's protection: every request to Noor's address goes through one gate (one at a time, a gap between them, a
// short queue, a pause after errors, Admin's stop), other addresses are untouched; reading Noor live is for Admin
// and the people Admin grants it to, the others get the saved copy; automatic reads are off unless Admin turns them on.
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveLegacyCmsConfig, saveUserCmsOverride, fetchLegacyCmsLivePage } from "../../src/server/legacy-cms";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => fn().then(() => "", (e: Error) => e.message);
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

// Noor, and another site, answering through a stub under the gate.
const BASE = "https://noor.gate.test";
let inFlight = 0;
let maxInFlight = 0;
const seen: number[] = [];
let answer = 200;
const real = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin === "https://other.test") return new Response("ok");
  if (url.origin !== BASE) return real(input, init);
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  seen.push(Date.now());
  await new Promise((r) => setTimeout(r, 30));
  inFlight--;
  return new Response("<html></html>", { status: answer });
}) as typeof fetch;

async function main() {
  const G = await import("../../src/server/noor-gate");
  G.installNoorGate();
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  await saveLegacyCmsConfig(admin, { baseUrl: BASE, username: "fixture", password: "fixture", sessionCookie: "session=fixture", autoSync: false });
  G.forgetNoorGateConfig();

  check("automatic reads are off unless Admin turns them on", (await G.noorAutomaticAllowed()) === false);
  await G.saveNoorGate(admin, { gapSeconds: 0.5, heavyGapSeconds: 1, maxPerMinute: 60, queueLimit: 3, errorsToPause: 2, pauseMinutes: 5 });
  G.resetNoorGateForTests();

  // One at a time, with the gap between.
  const t0 = Date.now();
  await Promise.all([fetch(`${BASE}/admin/a`), fetch(`${BASE}/admin/b`), fetch(`${BASE}/admin/c`)]);
  const gaps = seen.slice(1).map((t, i) => t - seen[i]!);
  check("requests to Noor go one at a time", maxInFlight === 1, maxInFlight);
  check("with the gap between them", gaps.every((g) => g >= 480), gaps);
  check("other sites are not held back", await (async () => { const s = Date.now(); await fetch("https://other.test/x"); return Date.now() - s < 200; })());

  // A short queue: more waiting than allowed are refused at once.
  const many = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => fetch(`${BASE}/admin/q${i}`)));
  const refused = many.filter((r) => r.status === "rejected" && /too many requests are waiting/.test(String((r as PromiseRejectedResult).reason))).length;
  check("requests beyond the queue are refused, not piled up", refused >= 2 && many.filter((r) => r.status === "fulfilled").length <= 4, many.map((r) => r.status));

  // Errors in a row pause every call.
  answer = 502;
  await fetch(`${BASE}/admin/e1`);
  await fetch(`${BASE}/admin/e2`);
  const before = seen.length;
  const paused = await err(() => fetch(`${BASE}/admin/e3`));
  check("after two errors in a row every Noor call pauses", /paused until/.test(paused) && seen.length === before, paused);
  const st = await G.noorGateStatus(admin);
  check("Admin sees the pause, its reason and the latest requests", !!st.pausedUntil && /HTTP 502/.test(st.pauseReason ?? "") && st.recent[0]?.status === 502, st);
  answer = 200;
  await G.pauseNoor(admin, 0);
  check("Admin resumes them", (await fetch(`${BASE}/admin/ok`)).status === 200);
  await G.pauseNoor(admin, 60);
  check("and can stop every call", /paused until/.test(await err(() => fetch(`${BASE}/admin/stop`))));
  await G.pauseNoor(admin, 0);
  check("only Admin changes the protection", /Only Admin/.test(await err(() => G.saveNoorGate(sara, { maxPerMinute: 60 }))) && /Only Admin/.test(await err(() => G.pauseNoor(sara, 0))));

  // Live access.
  await saveUserCmsOverride(admin, { userId: sara.id, allowedTabs: ["students", "parents", "invoices"] });
  check("Admin reads Noor live", await G.noorLiveAllowed(admin));
  check("others do not, unless granted", !(await G.noorLiveAllowed(sara)));
  const page = await fetchLegacyCmsLivePage(sara, { category: "students" });
  check("their live table says to use the saved copy, with no call to Noor", !page.ok && /saved copy/.test(page.message ?? ""));
  const X = await import("../../src/server/cms-admin");
  check("Noor's admin pages are live only", /grants live Noor access|Admin grants/.test(await err(() => X.noorAdminList(sara, "students"))));
  // Date ranges come from the saved copy.
  await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES (?, 'invoices', 'i1', 'Inv', ?, ?)", uid(), JSON.stringify({ Status: "pending_review", "Created At": "2026-11-10 10:00:00", Amount: "500" }), nowIso());
  await run("INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES (?, 'invoices', 'i2', 'Inv', ?, ?)", uid(), JSON.stringify({ Status: "paid", "Created At": "2026-10-01 10:00:00", Amount: "700" }), nowIso());
  const calls = seen.length;
  const { fetchCmsRange } = await import("../../src/server/cms-range");
  const range = await fetchCmsRange(sara, { category: "invoices", from: "2026-11-01", until: "2026-11-30" });
  check("a date range is built from the saved copy without calling Noor", range.method === "mirror" && range.records.length === 1 && seen.length === calls, { n: range.records.length, method: range.method });
  const { noorTotals } = await import("../../src/server/noor-totals");
  const tot = await noorTotals(sara);
  check("Noor's totals come from the saved copy for them", tot.source === "saved" && tot.canRefresh === false && tot.lists.find((l) => l.key === "waitingApproval")?.total === 1 && seen.length === calls, tot);
  check("and reading them live is refused", /grants live Noor access|Admin grants/.test(await err(() => noorTotals(sara, { refresh: true }))));
  await G.saveNoorGate(admin, { grants: [sara.id] });
  check("granted, they read Noor live", await G.noorLiveAllowed(sara));
  await G.saveNoorGate(admin, { grants: [] });
  check("and the grant can be taken back", !(await G.noorLiveAllowed(sara)));
  check("changes are audited", !!(await get("SELECT id FROM audit_events WHERE action = 'noor.gate'")));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
