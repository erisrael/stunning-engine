// Seed Town, more: several pets (one out, the rest resting with their needs paused), the stadium's shared ball and
// match score, voice relay credentials, uploaded models (Admin only, real .glb files only) and model props, the
// anime characters in the catalog and in looks.
import { createHmac } from "node:crypto";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as fun from "../../src/server/fun";
import * as W from "../../src/server/fun-world";
import * as M from "../../src/server/fun-models";
import * as shop from "../../src/server/fun-shop";
import { CATALOG, VRM_BASES, cleanLook, lookItems } from "../../src/lib/fun-catalog";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

// The smallest valid glTF 2.0 binary: one empty node.
function tinyGlb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes: [{ name: "box" }], scene: 0 }).padEnd(80, " "));
  const out = Buffer.alloc(12 + 8 + json.length);
  out.write("glTF", 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.write("JSON", 16);
  json.copy(out, 20);
  return new Uint8Array(out);
}

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await fun.saveFunConfig(admin, { enabled: true, pet: true, world: true, worldVoice: true, shop: true });

  // ---------------------------------------------------------------- anime characters
  check("ten anime characters, four free", VRM_BASES.length === 10 && CATALOG.filter((i) => i.kind === "avatar" && i.price === 0).length === 4);
  const fs = await import("node:fs");
  check("every character file is in the app", VRM_BASES.every((b) => fs.existsSync(`public${b.file}`)), VRM_BASES.map((b) => b.file));
  check("the animations are in the app", fs.existsSync("public/models/anims/ual.json") && fs.existsSync("public/models/CREDITS.txt"));
  const anims = JSON.parse(fs.readFileSync("public/models/anims/ual.json", "utf8")) as { clips: Record<string, { bones: Record<string, number[]> }> };
  check("animations cover walking, running, jumping, sitting, driving and dancing", ["idle", "walk", "jog", "sprint", "jumpStart", "jumpLoop", "sit", "drive", "dance", "crouchWalk", "swim"].every((k) => Object.keys(anims.clips[k]?.bones ?? {}).length > 20));
  const look = cleanLook({ style: "anime", base: "seed", tintHair: true } as never);
  check("looks keep the character and the tints", look.base === "seed" && look.tintHair && lookItems(look).includes("avatar.seed"));
  check("unknown characters fall back", cleanLook({ base: "nobody" } as never).base === "kai" && cleanLook({ style: "chibi" } as never).style === "chibi");
  check("a paid character must be bought first", await rejects(W.saveLook(dawit, { style: "anime", base: "seed" })));
  check("free characters can be worn", (await W.saveLook(dawit, { style: "anime", base: "mei" })).base === "mei");

  // ---------------------------------------------------------------- music and sounds
  const { MUSIC, musicFor } = await import("../../src/components/app/fun/world/audio");
  check("every district's music file is in the app", Object.values(MUSIC).every((f) => fs.existsSync(`public${f}`)) && fs.existsSync("public/audio/CREDITS.txt"));
  check("each recorded effect is in the app", ["click", "select", "open", "close", "confirm", "glass", "error", "bong", "maximize", "toggle", "question", "pluck"].every((n) => fs.existsSync(`public/audio/sfx/${n}.mp3`)));
  check("music follows the place and the activity", musicFor("Shops", null) === "market" && musicFor("Office · first floor", null) === "office" && musicFor("Plaza", "circuit") === "race" && musicFor("Stadium", null) === "arena" && musicFor("Park", "archery") === "action");

  // ---------------------------------------------------------------- several pets
  await run("DELETE FROM fun_pets WHERE user_id = ?", dawit.id);
  await run("DELETE FROM fun_pet_kennel WHERE user_id = ?", dawit.id);
  await fun.adoptPet(dawit, "cat", "Mimi");
  await run("UPDATE fun_pets SET xp = 150 WHERE user_id = ?", dawit.id);
  let pets = await fun.adoptPet(dawit, "dog", "Bolt");
  check("adopting another puts the first to rest", pets.pet?.name === "Bolt" && pets.others?.length === 1 && pets.others[0]!.name === "Mimi" && pets.others[0]!.stage === "Young");
  pets = await fun.adoptPet(dawit, "owl", "Hoot");
  check("three pets at most", pets.others?.length === 2 && (await rejects(fun.adoptPet(dawit, "fox", "Four"))));
  pets = await fun.switchPet(dawit, pets.others!.find((o) => o.name === "Mimi")!.id);
  check("switching brings a pet out with its growth kept", pets.pet?.name === "Mimi" && pets.pet.xp === 150 && pets.others?.length === 2 && pets.others.every((o) => o.name !== "Mimi"));
  check("only your own pets can be switched", await rejects(fun.switchPet(admin, pets.others![0]!.id)));

  // ---------------------------------------------------------------- the stadium
  const kick = await W.sync(dawit, { x: 180, z: 60, ball: { x: 182, y: 0.3, z: 60, vx: 8, vy: 1, vz: 0 }, fresh: true });
  check("near the stadium you get the shared ball", !!kick.pitch && kick.pitch.by === dawit.id && kick.pitch.ball?.vx === 8);
  const other = await W.sync(admin, { x: 185, z: 58, fresh: true });
  check("others near the stadium see the same ball", other.pitch?.ball?.x === 182 && other.pitch.by === dawit.id);
  check("far from the stadium there is no ball to send", (await W.sync(admin, { x: 0, z: 0 })).pitch === null);
  await W.sync(admin, { x: 185, z: 58, goal: "teal" });
  check("only the last kicker reports goals", (await W.sync(admin, { x: 185, z: 58 })).pitch?.score.teal === 0);
  await W.sync(dawit, { x: 180, z: 60, goal: "teal" });
  const sc = await W.sync(dawit, { x: 180, z: 60, goal: "teal" });
  check("a goal counts once and the ball goes back to the centre", sc.pitch?.score.teal === 1 && sc.pitch.ball?.x === 185 && sc.pitch.by === "");
  check("bad ball numbers are ignored", (await W.sync(dawit, { x: 180, z: 60, ball: { x: 1e9, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } })).pitch?.ball?.x === 185);
  const reset = await W.sync(admin, { x: 185, z: 58, ballReset: true });
  check("a new match starts at nil-nil", reset.pitch?.score.teal === 0 && reset.pitch.score.gold === 0);

  // ---------------------------------------------------------------- voice relay
  let ice = await W.iceServers(dawit);
  check("without a relay: the public STUN servers only", ice.length === 1 && ice[0]!.urls[0]!.startsWith("stun:"));
  await fun.saveFunConfig(admin, { turnUrls: "turn:turn.example.com:3478, http://bad, turns:turn.example.com:5349", turnSecret: "s3cret" });
  ice = await W.iceServers(dawit);
  const t = ice[1]!;
  const expected = createHmac("sha1", "s3cret").update(t.username!).digest("base64");
  check("with a shared secret each person gets a day's relay credentials", t.urls.length === 2 && t.username!.endsWith(`:${dawit.id}`) && Number(t.username!.split(":")[0]) > Date.now() / 1000 && t.credential === expected, t);
  await fun.saveFunConfig(admin, { turnSecret: "", turnUsername: "u", turnCredential: "p" });
  check("or a fixed username and password", (await W.iceServers(dawit))[1]!.username === "u");
  await fun.saveFunConfig(admin, { turnUrls: "", turnUsername: "", turnCredential: "" });

  // ---------------------------------------------------------------- uploaded models
  check("only Admin uploads models", await rejects(M.uploadModel(dawit, "x", tinyGlb())));
  check("only real .glb files", await rejects(M.uploadModel(admin, "x", new TextEncoder().encode("<html>not a model</html>"))));
  const up = await M.uploadModel(admin, "Statue.glb", tinyGlb());
  check("a model uploads and is listed", up.name === "Statue" && (await M.listModels()).some((m) => m.id === up.id));
  const back = await M.readModel(up.id);
  check("and reads back byte for byte", !!back && back.data.subarray(0, 4).toString() === "glTF" && back.data.length === tinyGlb().length);
  check("odd ids read nothing", (await M.readModel("../../etc")) === null);
  const lay = await W.saveWorldLayout(admin, { props: [{ id: "m1", kind: "model", x: 5, z: 5, r: 0, s: 2, color: "#000000", text: "", name: "", lines: [], model: up.id, solid: false, y: 3 } as never, { id: "m2", kind: "model", x: 1, z: 1, r: 0, s: 1, color: "#000000", text: "", name: "", lines: [], model: "javascript:alert(1)" } as never] });
  check("model props keep their model, height and solidity; bad model ids are dropped", lay.props[0]!.model === up.id && lay.props[0]!.y === 3 && lay.props[0]!.solid === false && lay.props[1]!.model === undefined);
  await M.deleteModel(admin, up.id);
  check("Admin removes a model", !(await M.listModels()).some((m) => m.id === up.id));
  check("the play rewards include the new activities", !!(await shop.playReward(dawit, "circuit", 1)) && !!(await shop.playReward(dawit, "penalty", 1)));

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
