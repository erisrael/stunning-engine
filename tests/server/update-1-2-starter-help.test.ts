// Starter answers behind the help menu: added once in English and Amharic, each shown to customers of its own
// language, and never added back after the team deletes or changes one.
import { all, closeDb, get, run } from "../../src/server/db";
import * as h from "../../src/server/support-help";
import * as ch from "../../src/server/support-channels";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};

async function main() {
  await h.helpCategories();
  const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_articles WHERE keywords LIKE '%starter%'"))?.n);
  check("starter answers are added for every topic, in both languages", n === 30, n);
  const en = await h.categoryArticles("payments", 10, "en");
  const am = await h.categoryArticles("payments", 10, "am");
  check("English customers get the English answers", en.length === 3 && en.every((a) => /[a-z]/i.test(a.title)), en.map((a) => a.title));
  check("Amharic customers get the Amharic ones", am.length === 3 && am.every((a) => /[ሀ-፿]/.test(a.title)), am.map((a) => a.title));
  check("customers who chose no language see English", (await h.categoryArticles("payments", 10, "both")).map((a) => a.id).join() === en.map((a) => a.id).join());
  check("search keeps to the language too", (await ch.searchArticles("", 50, "am")).every((a) => /[ሀ-፿]/.test(a.title)));
  await run("DELETE FROM sup_articles WHERE id = ?", en[0]!.id);
  await h.helpCategories();
  check("a deleted answer is not added back", !(await get("SELECT id FROM sup_articles WHERE id = ?", en[0]!.id)) && (await all("SELECT id FROM sup_articles WHERE keywords LIKE '%starter%'")).length === 29);
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
