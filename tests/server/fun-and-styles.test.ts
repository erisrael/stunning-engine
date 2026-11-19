// UI styles (each with Light and Dark, Admin's default and allowed list), Fun mode (points from work with rules,
// a daily cap and no double pay, the pet, playlists, scores, the board, moods, Admin's switches) and the
// assistant's voice commands.
import fs from "node:fs";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { audit } from "../../src/server/workflow";
import * as fun from "../../src/server/fun";
import { UI_STYLES, effectiveStyle } from "../../src/lib/ui-styles";
import { appearanceScript } from "../../src/lib/appearance-script";
import { voiceAction } from "../../src/lib/assistant-voice";
import { TUTORIALS } from "../../src/lib/tutorials";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function main() {
  // ---------------------------------------------------------------- UI styles
  const css = fs.readFileSync("src/app/ui-styles.css", "utf8");
  check("seven styles, at least four besides the professional one", UI_STYLES.length === 7 && UI_STYLES.some((s) => s.key === "studio"));
  const palettes = UI_STYLES.filter((s) => s.key !== "studio").every((s) => css.includes(`:root[data-style="${s.key}"]:not([data-preset]):not(.dark)`) && css.includes(`:root[data-style="${s.key}"]:not([data-preset]).dark`));
  check("every style but Studio (the app's own colours) has a Light and a Dark palette", palettes);
  check("no style sets the accent colour, so the person's accent always applies", !/data-style="[a-z]+"[^{]*\{[^}]*--primary\s*:/.test(css));
  check("motion only without reduced motion and outside Lite mode", css.includes("prefers-reduced-motion: no-preference") && (css.match(/data-lite="on"/g) ?? []).length >= 7);
  check("the person's style wins when allowed; else the workspace's; else Studio", effectiveStyle("comic", "zen", []) === "comic" && effectiveStyle("comic", "zen", ["zen", "tactical"]) === "zen" && effectiveStyle("nope", "", []) === "studio");
  const script = appearanceScript("", { style: "tactical", allowed: ["tactical", "zen"] });
  check("the page sets the style before it paints, with Admin's default and list", script.includes('sw="tactical"') && script.includes('SA=["tactical","zen"]') && script.includes("d.dataset.style="));

  // ---------------------------------------------------------------- voice commands
  const v = (t: string) => voiceAction(t);
  check("music by voice", (v("play some jazz") as { cmd: { music: { q: string } } })?.cmd.music.q === "jazz" && (v("Play lofi") as { cmd: { music: { q: string } } })?.cmd.music.q === "lofi" && v("pause the music")?.kind === "fun" && (v("next song") as { cmd: { music: { action: string } } })?.cmd.music.action === "next");
  check("games by voice", (v("let's play chess") as { cmd: { game: string } })?.cmd.game === "chess" && (v("teach me chess") as { cmd: { game: string } })?.cmd.game === "chess-learn" && (v("open sudoku") as { cmd: { game: string } })?.cmd.game === "sudoku");
  check("the look by voice", (v("switch to comic style") as { style: string })?.style === "comic" && (v("use the anime theme") as { style: string })?.style === "sakura" && (v("old school style") as { style: string })?.style === "classic" && (v("dark mode") as { mode: string })?.mode === "dark" && (v("make it green") as { accent: string })?.accent === "green");
  check("reading, reminders, hands-free", v("read this page")?.kind === "read" && (v("remind me in 20 minutes to call the studio") as { minutes: number; what: string })?.minutes === 20 && (v("remind me to stretch in 1 hour") as { minutes: number })?.minutes === 60 && (v("hands free on") as { on: boolean })?.on === true && (v("stop listening") as { on: boolean })?.on === false);
  check("pages and questions are left to the rest of the assistant", v("open handovers") === null && v("how many leave days do I have") === null && v("play the onboarding routine") === null);
  check("guides for the new features", ["t.style", "t.fun", "t.playlist", "t.chess", "t.points", "t.handsfree", "t.chapa.access", "t.support.desk"].every((k) => TUTORIALS.some((t) => t.key === k)));

  // ---------------------------------------------------------------- Fun mode
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const member = await by("dawit@demo.local");
  check("Fun mode is on for everyone by default", !!(await fun.funFor(member)));
  check("only Admin sets Fun mode", await rejects(fun.saveFunConfig(member, { enabled: false })));
  check("a bad text match is refused", await rejects(fun.saveFunConfig(admin, { rules: [{ key: "x", label: "x", action: "submit", summary: "([", points: 1, on: true }] })));
  await fun.saveFunConfig(admin, { dailyCap: 25, feedCost: 10 });

  const p0 = (await fun.pointsOf(member.id)).balance;
  await audit({ actor: member }, { itemId: "item-1", action: "submit", summary: `${member.name} submitted editing` });
  check("submitting a stage earns its points", (await fun.pointsOf(member.id)).balance === p0 + 10);
  await audit({ actor: member }, { itemId: "item-1", action: "submit", summary: `${member.name} submitted editing again` });
  check("the same item pays once a day", (await fun.pointsOf(member.id)).balance === p0 + 10);
  await audit({ actor: member }, { itemId: "t-9", action: "dev.task", summary: `${member.name} updated DEV-9 (Doing to Done)` });
  check("a department task moved to done pays", (await fun.pointsOf(member.id)).balance === p0 + 18);
  await audit({ actor: member }, { itemId: "t-10", action: "dev.task", summary: `${member.name} attached notes.pdf to DEV-10` });
  check("other task changes do not", (await fun.pointsOf(member.id)).balance === p0 + 18);
  await audit({ actor: member }, { itemId: "item-2", action: "submit", summary: "x" });
  await audit({ actor: member }, { itemId: "item-3", action: "submit", summary: "y" });
  check("the daily cap holds", (await fun.pointsOf(member.id)).today === 25, await fun.pointsOf(member.id));
  await audit({ actor: member, source: "import" }, { itemId: "item-4", action: "submit", summary: "z" });
  check("imports never pay", (await fun.pointsOf(member.id)).today === 25);
  check("levels grow with points earned", fun.levelOf(0).level === 1 && fun.levelOf(50).level === 2 && fun.levelOf(149).level === 2 && fun.levelOf(150).level === 3);

  check("no pet until adopted", (await fun.myPet(member)).pet === null);
  check("only real pets", await rejects(fun.adoptPet(member, "unicorn", "x")));
  const pet = await fun.adoptPet(member, "fox", "Kuku");
  check("adopt a pet with a name", pet.pet?.name === "Kuku" && pet.pet.kind === "fox" && pet.pet.happiness > 0);
  const before = (await fun.pointsOf(member.id)).balance;
  await fun.carePet(member, "feed");
  check("food costs points", (await fun.pointsOf(member.id)).balance === before - 10);
  check("levels lock what the pet wears", await rejects(fun.carePet(member, "outfit", "wizard")));
  check("level 1 wears nothing new yet; unlocked things can be worn", fun.levelOf((await fun.pointsOf(member.id)).earned).level < 2 ? await rejects(fun.carePet(member, "outfit", "bow")) : (await fun.carePet(member, "outfit", "bow")).pet?.outfit === "bow");
  check("wearing nothing is always allowed", (await fun.carePet(member, "outfit", "none")).pet?.outfit === "none");

  const plId = await fun.savePlaylist(member, { name: "Focus", tracks: [{ id: "D7KyD", title: "Song", artist: "A", duration: 120, artwork: "javascript:alert(1)" }, { id: "../bad", title: "x" }] });
  const lists = await fun.myPlaylists(member);
  const pl = lists.find((l) => l.id === plId)!;
  check("a playlist keeps clean tracks only", pl.tracks.length === 1 && pl.tracks[0]!.artwork === null);
  check("others cannot change it", await rejects(fun.savePlaylist(admin, { id: plId, name: "Mine now", tracks: [] })));
  check("not shared: others do not see it", !(await fun.myPlaylists(admin)).some((l) => l.id === plId));
  await fun.savePlaylist(member, { id: plId, name: "Focus", tracks: pl.tracks, shared: true });
  check("shared: the team sees it", (await fun.myPlaylists(admin)).some((l) => l.id === plId && !l.mine));
  await fun.deletePlaylist(member, plId);
  check("its owner deletes it", !(await fun.myPlaylists(member)).some((l) => l.id === plId));
  check("stream addresses only for track ids", fun.streamUrl("D7KyD").startsWith("https://api.audius.co/v1/tracks/D7KyD/stream") && (() => { try { fun.streamUrl("a/b"); return false; } catch { return true; } })());

  await fun.saveScore(member, "2048", 512);
  await fun.saveScore(member, "2048", 1024);
  await fun.saveScore(member, "reaction", 300);
  await fun.saveScore(member, "reaction", 250);
  check("best score: highest for points, lowest for times", (await fun.bestScores(member, "2048")).mine === 1024 && (await fun.bestScores(member, "reaction")).mine === 250);
  check("not a score", await rejects(fun.saveScore(member, "2048", -5)));
  const board = await fun.leaderboard(member);
  check("the week's board shows work points only", board.some((b) => b.me && b.points === 25), board);
  await fun.setMood(member, 4);
  const mood = await fun.teamMood(admin);
  check("moods: the team sees the spread, not who", mood.total >= 1 && mood.spread[3]! >= 1 && mood.mine === null && !JSON.stringify(mood).includes(member.name));

  await fun.saveFunConfig(admin, { games: ["chess", "sudoku"], roles: ["finance_manager"] });
  check("Admin limits games", await rejects(fun.saveScore(admin, "2048", 10)));
  check("Admin limits Fun mode to roles", (await fun.funFor(member)) === null);
  await fun.saveFunConfig(admin, { roles: [], games: fun.FUN_GAMES.map((g) => g.key), enabled: false });
  check("Admin turns Fun mode off", (await fun.funFor(member)) === null && (await fun.funHome(member)) === null);
  await fun.saveFunConfig(admin, { enabled: true, points: false });
  await audit({ actor: member }, { itemId: "item-9", action: "item.published", summary: "p" });
  check("points off: work pays nothing", (await fun.pointsOf(member.id)).today === 25);

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
