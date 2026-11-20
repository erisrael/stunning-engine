// Seed Town's economy and world: the shop (prices, levels, balances and ownership all checked on the server; one
// purchase per thing unless it stacks), homes (only owned houses and furniture, inside the room, no overlaps,
// access), vehicles (owned, paint, upgrades), play coins (capped a day and paced), Admin's gifts, prices and own
// items, character looks that need owned items, presets, the pet's needs and growth, the live room (heights,
// vehicles, chat channels, voice rooms and signals), reports and the town editor; plus game scores by mode.
import { closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as fun from "../../src/server/fun";
import * as shop from "../../src/server/fun-shop";
import * as W from "../../src/server/fun-world";
import { CATALOG, cleanLook, lookItems, mergedCatalog } from "../../src/lib/fun-catalog";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  const guest = (await loadUser((await upsertAccount({ name: "Town Guest", email: "guest@seedtown.local", title: "x", roles: ["editing"] as never, password: "Guest-Town-2026!", mustChangePassword: false })).id))!;
  await fun.saveFunConfig(admin, { enabled: true, shop: true, world: true, worldVoice: true, playCoins: 30, points: true, pet: true });
  await run("DELETE FROM fun_points WHERE user_id = ?", dawit.id);
  await run("DELETE FROM fun_items WHERE user_id = ?", dawit.id);
  await run("DELETE FROM fun_homes WHERE user_id = ?", dawit.id);

  // ---------------------------------------------------------------- the catalog
  check("the catalog has every kind of thing", ["outfit", "hair", "acc", "furniture", "house", "vehicle", "petfood", "pettoy", "petwear", "petskin", "skin", "special"].every((k) => CATALOG.some((i) => i.kind === k)));
  check("catalog keys are unique", new Set(CATALOG.map((i) => i.key)).size === CATALOG.length);
  check("some things are free for everyone", CATALOG.some((i) => i.price === 0 && i.kind === "house") && CATALOG.some((i) => i.price === 0 && i.kind === "vehicle"));
  const look = cleanLook({ hairStyle: "nope", outfit: "suit", acc: ["acc.glasses", "acc.shades", "acc.wings"], shirt: "javascript:x", height: 9 } as never);
  check("looks are cleaned: unknown styles fall back, one accessory per slot, sliders clamp", look.hairStyle === "short" && look.outfit === "suit" && look.acc.join() === "acc.glasses,acc.wings" && look.shirt === "#4f46e5" && look.height === 1);
  check("a look lists the paid things it uses", lookItems(look).includes("outfit.suit") && lookItems(look).includes("acc.wings"));

  // ---------------------------------------------------------------- buying
  const w0 = await shop.wallet(dawit);
  check("a new person has no coins and only free things", w0.coins === 0 && w0.owned.length === 0);
  check("you cannot buy without coins", await rejects(shop.buy(dawit, "furn.sofa")));
  check("free things cannot be bought", await rejects(shop.buy(dawit, "house.cottage")));
  check("unknown things are not for sale", await rejects(shop.buy(dawit, "car.spaceship")));
  await shop.grantCoins(admin, dawit.id, 700, "Great quarter");
  check("level-locked things wait for the level", await rejects(shop.buy(dawit, "outfit.knight")));
  await shop.grantCoins(admin, dawit.id, 1000, "Test budget");
  check("Admin gives coins and they show in the balance", (await shop.wallet(dawit)).coins === 1700);
  check("only Admin gives coins", await rejects(shop.grantCoins(dawit, dawit.id, 10, "")));
  let w = await shop.buy(dawit, "furn.sofa");
  check("buying takes the price and gives the thing", w.coins === 1640 && w.owned.some((o) => o.key === "furn.sofa"));
  await shop.buy(dawit, "furn.sofa");
  check("furniture stacks: a second sofa adds one", (await shop.ownedQty(dawit.id, "furn.sofa")) === 2);
  await shop.buy(dawit, "car.hatch");
  check("a vehicle is bought once", await rejects(shop.buy(dawit, "car.hatch")));
  w = await shop.wallet(dawit);
  check("each purchase is in the ledger", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM fun_points WHERE user_id = ? AND source = 'shop'", dawit.id))?.n) >= 2);

  const before = (await shop.wallet(dawit)).coins;
  w = await shop.buy(dawit, "food.fish", 3);
  check("stacks buy several at once", w.owned.find((o) => o.key === "food.fish")?.qty === 3 && w.coins === before - 45);

  // ---------------------------------------------------------------- vehicles
  check("you ride only vehicles you own", await rejects(shop.setRide(dawit, "car.sports")));
  w = await shop.setRide(dawit, "car.hatch", { paint: "#ff0000", rims: "javascript:1" as never });
  const ride = await shop.rideOf(dawit.id);
  check("choose a vehicle and its paint (bad colours ignored)", ride.key === "car.hatch" && ride.paint === "#ff0000" && !ride.rims);
  const coinsBefore = (await shop.wallet(dawit)).coins;
  await shop.upgradeRide(dawit, "car.hatch");
  check("an engine upgrade costs coins and raises the level", (await shop.rideOf(dawit.id)).level === 2 && (await shop.wallet(dawit)).coins < coinsBefore);
  await shop.grantUpgrade(admin, dawit.id, "car.hatch");
  check("Admin can upgrade a vehicle for free", (await shop.rideOf(dawit.id)).level === 3);
  check("three levels at most", await rejects(shop.upgradeRide(dawit, "car.hatch")));

  // ---------------------------------------------------------------- homes
  let h = await shop.homeOf(dawit.id);
  check("everyone starts in the free cottage with a bed, a table and a chair", h.house === "house.cottage" && h.items.length === 3);
  check("only owned houses", await rejects(shop.saveHome(dawit, { house: "house.villa" })));
  check("furniture must fit inside", await rejects(shop.saveHome(dawit, { items: [{ key: "furn.bed", x: 15, z: 0, r: 0 }] })));
  check("furniture cannot overlap", await rejects(shop.saveHome(dawit, { items: [{ key: "furn.table", x: 2, z: 2, r: 0 }, { key: "furn.chair", x: 3, z: 3, r: 0 }] })));
  check("you place only as many as you own", await rejects(shop.saveHome(dawit, { items: [{ key: "furn.sofa", x: 0, z: 0, r: 0 }, { key: "furn.sofa", x: 0, z: 4, r: 0 }, { key: "furn.sofa", x: 0, z: 8, r: 0 }] })));
  check("only furniture goes inside", await rejects(shop.saveHome(dawit, { items: [{ key: "car.hatch", x: 0, z: 0, r: 0 }] })));
  await shop.buy(dawit, "furn.rug");
  h = await shop.saveHome(dawit, { wall: "#ffeeee", floor: "#112233", access: "private", items: [{ key: "furn.sofa", x: 0, z: 0, r: 1 }, { key: "furn.rug", x: 4, z: 4, r: 0 }, { key: "furn.table", x: 5, z: 5, r: 0 }] });
  check("a turned sofa, a rug under a table and new colours are saved", h.items.length === 3 && h.wall === "#ffeeee" && h.access === "private");
  check("private homes keep visitors out; the owner and Admin may go in", !(await shop.mayVisit(guest, dawit.id)) && (await shop.mayVisit(dawit, dawit.id)) && (await shop.mayVisit(admin, dawit.id)));
  await shop.saveHome(dawit, { access: "invited", guests: [guest.id] });
  check("invited guests may come in", await shop.mayVisit(guest, dawit.id));
  const cap0 = (await shop.homeOf(dawit.id)).level;
  await shop.grantUpgrade(admin, dawit.id, "home");
  check("Admin can upgrade a home (more room)", (await shop.homeOf(dawit.id)).level === cap0 + 1);

  // ---------------------------------------------------------------- Admin's shelves
  const cfg = await shop.saveShopConfig(admin, { items: { "furn.lamp": { price: 5, on: false }, "nope.x": { price: 1 } }, custom: [{ base: "outfit.jacket", label: "Ruby jacket", color: "#e11d48", price: 99, rarity: "epic" } as never] });
  const merged = mergedCatalog(cfg);
  check("Admin changes a price and takes a thing off sale", merged.find((i) => i.key === "furn.lamp")?.price === 5 && merged.find((i) => i.key === "furn.lamp")?.on === false && !("nope.x" in cfg.items));
  check("Admin adds a colour variant of an existing model", merged.some((i) => i.key === "custom.ruby-jacket" && i.model === "jacket" && i.color === "#e11d48" && i.price === 99));
  check("off-sale things cannot be bought", await rejects(shop.buy(dawit, "furn.lamp")));
  check("only Admin sets the shelves", await rejects(shop.saveShopConfig(dawit, {})));
  await shop.buy(dawit, "custom.ruby-jacket");
  check("Admin's own items can be bought", await shop.owns(dawit.id, "custom.ruby-jacket"));
  await shop.grantItem(admin, dawit.id, "acc.wings");
  check("Admin gives an item", await shop.owns(dawit.id, "acc.wings"));
  await shop.revokeItem(admin, dawit.id, "acc.wings");
  check("Admin takes an item back", !(await shop.owns(dawit.id, "acc.wings")));
  const eco = await shop.adminEconomy(admin, dawit.id);
  check("Admin sees balances, history and what someone owns", eco.people.length > 1 && eco.log.length > 0 && eco.owned.some((o) => o.key === "car.hatch"));
  check("only Admin sees the economy", await rejects(shop.adminEconomy(dawit)));

  // ---------------------------------------------------------------- looks
  const tryLook = async (o: string) => W.saveLook(dawit, { outfit: o }).then((l) => `saved ${l.outfit}`, (e: Error) => e.message);
  const k1 = await tryLook("knight"), k2 = await tryLook("suit");
  check("paid looks need the things bought", k1.startsWith("Buy") && k2.startsWith("Buy"), [k1, k2]);
  await shop.buy(dawit, "outfit.suit");
  const l3 = await W.saveLook(dawit, { outfit: "suit", hat: "crown", hairStyle: "ponytail", eyes: "#22c55e", height: 0.4 });
  check("a bought suit, a free crown and anime details are kept", l3.outfit === "suit" && l3.hat === "crown" && l3.hairStyle === "ponytail" && l3.eyes === "#22c55e" && l3.height === 0.4);
  let pr = await W.savePreset(dawit, "Work", l3);
  pr = await W.savePreset(dawit, "Party", { ...l3, outfit: "hoodie" });
  check("looks can be saved as presets", pr.length === 2 && pr[1]!.look.outfit === "hoodie");
  pr = await W.savePreset(dawit, "Work", null);
  check("presets can be deleted", pr.length === 1 && pr[0]!.name === "Party");

  // ---------------------------------------------------------------- play coins
  await run("DELETE FROM fun_points WHERE user_id = ? AND source = 'play'", dawit.id);
  const r1 = await shop.playReward(dawit, "race", 3);
  check("playing earns a few coins", r1.coins === 15);
  const r2 = await shop.playReward(dawit, "race", 3);
  check("the same activity pays once every 20 seconds", r2.coins === 0);
  const r3 = await shop.playReward(dawit, "archery", 100);
  check("each activity pays at most its maximum and within the day's play cap", r3.coins === 15 && r3.left === 0);
  check("unknown activities are refused", await rejects(shop.playReward(dawit, "hacking", 5)));
  await fun.saveFunConfig(admin, { playCoins: 0 });
  check("Admin can make only work earn (0 play coins)", (await shop.playReward(dawit, "hoops", 5)).coins === 0);
  await fun.saveFunConfig(admin, { playCoins: 30 });

  // ---------------------------------------------------------------- the pet
  await run("DELETE FROM fun_pets WHERE user_id = ?", dawit.id);
  let pet = await fun.adoptPet(dawit, "dragon", "Ember");
  check("a new pet starts as a baby with full needs", pet.pet?.stage === "baby" && pet.pet.full >= 85 && pet.pet.energy === 100 && pet.pet.log.length === 1);
  await run("UPDATE fun_pets SET stats = ? WHERE user_id = ?", JSON.stringify({ full: { v: 20, at: nowIso() }, fun: { v: 30, at: nowIso() }, clean: { v: 40, at: nowIso() }, energy: { v: 80, at: nowIso() }, love: { v: 50, at: nowIso() }, health: { v: 60, at: nowIso() } }), dawit.id);
  let c = await fun.carePet(dawit, "feed", "food.fish");
  check("special food from the shop fills more and is used up", (c.pet?.full ?? 0) >= 60 && (c.things.find((t) => t.key === "food.fish")?.qty ?? 0) === 2 && c.gained >= 10);
  check("the first care of the day starts a streak", c.pet?.streak === 1);
  c = await fun.carePet(dawit, "bath");
  check("a bath cleans it and earns care points", c.pet?.clean === 100 && c.gained === 8);
  c = await fun.carePet(dawit, "play");
  check("playing lifts fun and tires it", (c.pet?.fun ?? 0) >= 50 && (c.pet?.energy ?? 100) < 80);
  check("toys must be owned", await rejects(fun.carePet(dawit, "play", "toy.frisbee")));
  check("only pet food is food", await rejects(fun.carePet(dawit, "feed", "furn.sofa")));
  c = await fun.carePet(dawit, "sleep");
  check("asleep", c.pet?.sleeping === true && c.pet.mood === "sleeping");
  check("it will not play while asleep", await rejects(fun.carePet(dawit, "play")));
  c = await fun.carePet(dawit, "wake");
  check("and wakes up", c.pet?.sleeping === false);
  await run("UPDATE fun_pets SET xp = 95 WHERE user_id = ?", dawit.id);
  await run("UPDATE fun_pets SET stats = ? WHERE user_id = ?", JSON.stringify({ full: { v: 10, at: nowIso() } }), dawit.id);
  c = await fun.carePet(dawit, "feed");
  check("enough care grows it up a stage", c.pet?.stage === "young" && c.grew === "Young" && c.pet.log.some((l) => l.what.startsWith("Grew up")));
  check("wearing shop things needs them bought", await rejects(fun.carePet(dawit, "wear", "petwear.collar")));
  await shop.buy(dawit, "petwear.collar");
  c = await fun.carePet(dawit, "wear", "petwear.collar");
  check("a bought collar can be worn", c.pet?.wear.includes("petwear.collar") === true);
  c = await fun.carePet(dawit, "rename", "Blaze");
  check("rename the pet", c.pet?.name === "Blaze");

  // ---------------------------------------------------------------- the live room
  const s1 = await W.sync(dawit, { x: 10, y: 4.5, z: -60, veh: "car.hatch", vp: "#ff0000", act: "sit", say: "hi floor one", ch: "near", fresh: true });
  const s2 = await W.sync(admin, { x: 12, y: 0, z: -58, fresh: true });
  const me = s2.p.find((p) => p[0] === dawit.id);
  check("positions now carry height, vehicle, paint and what they do", !!me && me[3] === 4.5 && me[9] === "car.hatch" && me[10] === "#ff0000" && me[11] === "sit", me);
  check("looks are sent once, then only when they change", !!s2.looks[dawit.id] && !(await W.sync(admin, { x: 12, z: -58 })).looks[dawit.id]);
  check("nearby chat reaches people close by", s2.m.some((m) => m.text === "hi floor one" && m.ch === "near"));
  const far = await W.sync(admin, { x: 150, z: 150, since: 0 });
  check("nearby chat does not reach people far away", !far.m.some((m) => m.text === "hi floor one"));
  await new Promise((r) => setTimeout(r, 1600));
  await W.sync(dawit, { say: "hello town", ch: "town" });
  check("town chat reaches everyone", (await W.sync(admin, { x: 150, z: 150, since: 0 })).m.some((m) => m.text === "hello town"));
  // Voice rooms.
  let v = await W.sync(dawit, { voice: { mode: "near" }, vr: { op: "create", name: "Design crew", priv: true } });
  const roomId = v.me.voice.room!;
  check("make a private voice room (its owner sees the code)", v.me.voice.mode === "room" && !!roomId && v.rooms.find((r) => r.id === roomId)?.code.length === 4);
  const code = v.rooms.find((r) => r.id === roomId)!.code;
  let a = await W.sync(admin, { x: 12, z: -58, vr: { op: "join", id: roomId, code: "0000" } });
  check("private rooms need the code (and others do not see it)", !!a.err && a.rooms.find((r) => r.id === roomId)?.code === "");
  a = await W.sync(admin, { vr: { op: "join", id: roomId, code } });
  check("join with the code", a.me.voice.room === roomId);
  await W.sync(admin, { sig: [{ to: dawit.id, d: { t: "offer", sdp: "v=0" } }] });
  v = await W.sync(dawit, {});
  check("voice introductions pass between people in the same room", v.s.some((s) => s.from === admin.id && (s.d as { t: string }).t === "offer"));
  await W.sync(dawit, { vr: { op: "kick", id: admin.id } });
  a = await W.sync(admin, {});
  check("the owner removes people from the room", a.me.voice.room === null);
  a = await W.sync(admin, { vr: { op: "join", id: roomId, code } });
  check("removed people cannot come back", !!a.err);
  await W.sync(admin, { sig: [{ to: dawit.id, d: { t: "offer", sdp: "x" } }] });
  check("no introductions to people you may not talk with", !(await W.sync(dawit, {})).s.some((s) => s.from === admin.id));
  check("reports go to Admin", await W.reportPlayer(admin, dawit.id, "Testing the report"));
  check("you cannot report yourself", await rejects(W.reportPlayer(dawit, dawit.id, "")));
  await fun.saveFunConfig(admin, { worldVoice: false });
  check("Admin turns voice off: everyone is silent", (await W.sync(dawit, { voice: { mode: "near" } })).me.voice.mode === "off");
  await fun.saveFunConfig(admin, { worldVoice: true });

  // ---------------------------------------------------------------- the town editor
  const lay = await W.saveWorldLayout(admin, { notice: "Party at five", props: [{ id: "t1", kind: "tree", x: 500, z: 3, r: 0, s: 9, color: "bad", text: "", name: "", lines: [] }, { id: "n1", kind: "npc", x: 4, z: 4, r: 90, s: 1, color: "#123456", text: "Guide", name: "Abebe", lines: ["Hi", "", "Welcome"] }] });
  check("Admin places things: positions and sizes are kept in town", lay.props[0]!.x === 190 && lay.props[0]!.s === 5 && lay.props[0]!.color === "#64748b" && lay.props[1]!.lines.join() === "Hi,Welcome");
  check("only known things can be placed", await rejects(W.saveWorldLayout(admin, { props: [{ kind: "rocket" } as never] })));
  check("only Admin edits the town", await rejects(W.saveWorldLayout(dawit, {})));
  const home = await W.worldHome(dawit);
  check("the town opens with the shop, homes, the ride, the layout and the wallet", home.items.length > 50 && !!home.homes[dawit.id] && home.ride.key === "car.hatch" && home.layout.notice === "Party at five" && !!home.wallet);

  // ---------------------------------------------------------------- scores by mode
  await fun.saveScore(dawit, "snake:maze", 120);
  await fun.saveScore(dawit, "snake:maze", 80);
  check("scores are kept per mode", (await fun.bestScores(dawit, "snake:maze")).mine === 120);
  await fun.saveScore(dawit, "world:race", 900);
  await fun.saveScore(dawit, "world:race", 700);
  check("lap times count lowest first", (await fun.bestScores(dawit, "world:race")).mine === 700);
  check("modes of switched-off games are refused", await (async () => {
    await fun.saveFunConfig(admin, { games: fun.FUN_GAMES.map((g) => g.key).filter((k) => k !== "snake") });
    const no = await rejects(fun.saveScore(dawit, "snake:classic", 5));
    await fun.saveFunConfig(admin, { games: fun.FUN_GAMES.map((g) => g.key) });
    return no;
  })());
  check("odd game names are refused", await rejects(fun.saveScore(dawit, "snake:<script>", 5)));

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
