// The guest arcade on the server: what a visitor without an account gets (the town, its layout and the catalog,
// everything free; one resident, the guest; no staff, departments, homes, chat or voice), the games on show, and
// Admin's switch that closes it.
import { all, closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as fun from "../../src/server/fun";
import * as W from "../../src/server/fun-world";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", "admin@demo.local"))!.id))!;

  check("the guest arcade is open by default", (await fun.funConfig()).guestArcade === true);
  const a = await W.guestArcade();
  check("it shows the games Admin has on", !!a && a.world && a.games.includes("snake"), a);

  const h = await W.guestHome();
  check("a guest gets the town", !!h && h.name.length > 0 && Array.isArray(h.layout.props));
  check("the only resident is the guest", !!h && h.residents.length === 1 && h.residents[0]!.id === "guest" && h.residents[0]!.me, h?.residents);
  check("no departments, homes, chat or voice", !!h && h.departments.length === 0 && Object.keys(h.homes).length === 0 && !h.chat && !h.voice && h.iceServers.length === 0);
  check("everything in the catalog is free for a guest", !!h && h.items.length > 20 && h.items.every((i) => i.price === 0));
  // No account's id, email or full name anywhere in it (first names can also be shop characters' names).
  const text = JSON.stringify(h);
  const people = await all<{ id: string; email: string; name: string }>("SELECT id, email, name FROM users");
  const leaks = people.flatMap((u) => [u.id, u.email, u.name].filter((v) => v && v.length > 4 && text.includes(v)));
  check("nothing about the company's people is in it", people.length > 3 && leaks.length === 0, leaks);

  await fun.saveFunConfig(admin, { guestArcade: false });
  check("Admin's switch closes it", (await W.guestArcade()) === null && (await W.guestHome()) === null);
  await fun.saveFunConfig(admin, { guestArcade: true });
  check("and opens it again", (await W.guestHome()) !== null);
  await fun.saveFunConfig(admin, { world: false });
  check("without Seed Town the arcade has only the games", (await W.guestHome()) === null && !!(await W.guestArcade()));
  await fun.saveFunConfig(admin, { world: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
