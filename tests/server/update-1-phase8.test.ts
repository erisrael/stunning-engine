// Update 1.0, Phase 8: customization. The Chapa Overview's widgets per person with Admin's default; theme presets
// (the list, and the script that applies one before the page paints); the settings search.
import vm from "node:vm";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as H from "../../src/server/chapa-hub";
import { cleanWidgets, DEFAULT_CHAPA_WIDGETS } from "../../src/lib/chapa";
import { THEME_PRESETS, isPreset } from "../../src/lib/themes";
import { appearanceScript } from "../../src/lib/appearance-script";
import { ADMIN_INDEX, searchAdmin } from "../../src/lib/admin-index";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

// Runs the pre-paint script against a fake page: what it leaves on <html>.
function runScript(def: string, stored: Record<string, string>, path = "/dashboard") {
  const dataset: Record<string, string> = {};
  const html = { dataset, lang: "en" };
  vm.runInNewContext(appearanceScript(def), { localStorage: { getItem: () => JSON.stringify(stored) }, document: { documentElement: html }, location: { pathname: path } });
  return dataset;
}

async function main() {
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");

  // Chapa Overview layout.
  check("unknown and repeated widgets are dropped", JSON.stringify(cleanWidgets(["daily", "nope", "daily", "today", 3])) === JSON.stringify(["daily", "today"]));
  let l = await H.chapaOverviewLayout(dawit);
  check("everyone starts with every widget in the default order", JSON.stringify(l.widgets) === JSON.stringify(DEFAULT_CHAPA_WIDGETS) && !l.own && !l.canSetDefault, l);
  check("Admin may set the default", (await H.chapaOverviewLayout(admin)).canSetDefault);
  check("an empty Overview is refused", /at least one widget/.test((await err(() => H.saveChapaOverviewLayout(dawit, [], "me"))) ?? ""));
  check("only Admin sets everyone's", /Only Admin/.test((await err(() => H.saveChapaOverviewLayout(dawit, ["today"], "default"))) ?? ""));
  await H.saveChapaOverviewLayout(dawit, ["daily", "today", "bogus"], "me");
  l = await H.chapaOverviewLayout(await by("dawit@demo.local"));
  check("a person keeps their own widgets and order", l.own && JSON.stringify(l.widgets) === JSON.stringify(["daily", "today"]), l);
  await H.saveChapaOverviewLayout(admin, ["d30", "status", "sync"], "default");
  check("Admin's default reaches people without their own", JSON.stringify((await H.chapaOverviewLayout(await by("sara@demo.local"))).widgets) === JSON.stringify(["d30", "status", "sync"]));
  check("but not people with their own", JSON.stringify((await H.chapaOverviewLayout(await by("dawit@demo.local"))).widgets) === JSON.stringify(["daily", "today"]));
  check("Admin follows the default they set", !(await H.chapaOverviewLayout(await by("admin@demo.local"))).own);
  await H.saveChapaOverviewLayout(await by("dawit@demo.local"), [], "reset");
  l = await H.chapaOverviewLayout(await by("dawit@demo.local"));
  check("reset goes back to the default", !l.own && JSON.stringify(l.widgets) === JSON.stringify(["d30", "status", "sync"]), l);
  check("setting everyone's is in the audit log", !!(await get("SELECT id FROM audit_events WHERE action = 'chapa.overview'")));

  // Theme presets.
  check("six presets ship", THEME_PRESETS.length === 6 && ["dim", "midnight", "forest", "ocean", "sand", "contrast"].every(isPreset));
  check("each is light or dark", THEME_PRESETS.every((p) => p.mode === "light" || p.mode === "dark"));
  let d = runScript("", {});
  check("no preset by default", !d.preset && !d.mode && d.presetDefault === "" && d.accent === "violet");
  d = runScript("ocean", {});
  check("the workspace's preset applies before paint", d.preset === "ocean" && d.mode === "light" && d.presetDefault === "ocean");
  d = runScript("ocean", { preset: "dim" });
  check("a person's own preset wins", d.preset === "dim" && d.mode === "dark");
  d = runScript("ocean", { preset: "none" });
  check("None turns the workspace's off for that person", !d.preset && !d.mode);
  d = runScript("ocean", { preset: "dim" }, "/support-widget");
  check("the customer widget keeps its own look", !d.preset && !d.mode);
  d = runScript("<script>", { preset: "x\"y" });
  check("unknown presets are ignored", !d.preset && d.presetDefault === "");
  check("the script cannot be broken out of", !appearanceScript("</script><script>alert(1)</script>").includes("</script>"));

  // Settings search.
  const find = (q: string) => searchAdmin(q, ADMIN_INDEX).map((e) => e.label);
  check("search finds a screen by a setting inside it", find("smtp")[0] === "Email settings" && find("passkey")[0] === "Sign-in", [find("smtp"), find("passkey")]);
  check("the name matches first", find("branding")[0] === "Branding");
  check("every word must match", find("theme preset")[0] === "Workspace settings" && find("theme banana").length === 0, find("theme preset"));
  check("an empty search lists nothing", find("  ").length === 0);
  check("every Admin tab is in the index", ["people", "teams", "departments", "permissions", "access", "sidebar", "signin", "sessions", "privacy", "customer-support", "chat", "feedback", "reports", "external-apis", "system", "branding", "files", "usage", "clean-data", "presentations", "data"].every((t) => ADMIN_INDEX.some((e) => e.tab === t)));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
