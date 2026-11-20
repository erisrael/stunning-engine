"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as fun from "@/server/fun";

// Fun mode (src/server/fun.ts). Nothing here changes pages, so no page is refreshed (revalidate: false), except
// Admin's settings.
const quiet = { revalidate: false } as const;

export async function funHomeAction() {
  return wrap(async () => fun.funHome(await requireViewer()), quiet);
}
export async function searchMusicAction(q: string) {
  return wrap(async () => fun.searchMusic(await requireViewer(), q), quiet);
}
export async function lyricsAction(artist: string, title: string, duration?: number) {
  return wrap(async () => fun.lyrics(await requireViewer(), artist, title, duration), quiet);
}
export async function playlistsAction() {
  return wrap(async () => fun.myPlaylists(await requireViewer()), quiet);
}
export async function savePlaylistAction(input: { id?: string | null; name: string; tracks: Partial<fun.Track>[]; shared?: boolean }) {
  return wrap(async () => fun.savePlaylist(await requireViewer(), input), quiet);
}
export async function deletePlaylistAction(id: string) {
  return wrap(async () => fun.deletePlaylist(await requireViewer(), id), quiet);
}
export async function petAction() {
  return wrap(async () => fun.myPet(await requireViewer()), quiet);
}
export async function switchPetAction(id: string) {
  return wrap(async () => fun.switchPet(await requireViewer(), id), quiet);
}
export async function adoptPetAction(kind: string, name: string) {
  return wrap(async () => fun.adoptPet(await requireViewer(), kind, name), quiet);
}
export async function carePetAction(act: fun.PetAct, arg?: string) {
  return wrap(async () => fun.carePet(await requireViewer(), act, arg), quiet);
}
export async function saveScoreAction(game: string, score: number, meta?: Record<string, unknown>) {
  return wrap(async () => fun.saveScore(await requireViewer(), game, score, meta), quiet);
}
export async function bestScoresAction(game: string) {
  return wrap(async () => fun.bestScores(await requireViewer(), game), quiet);
}
export async function leaderboardAction(days = 7) {
  return wrap(async () => fun.leaderboard(await requireViewer(), days), quiet);
}
export async function pointsLogAction() {
  return wrap(async () => fun.myPointsLog(await requireViewer()), quiet);
}
export async function moodAction(mood?: number) {
  return wrap(async () => (mood ? fun.setMood(await requireViewer(), mood) : fun.teamMood(await requireViewer())), quiet);
}
export async function saveFunConfigAction(input: Partial<fun.FunConfig>) {
  return wrap(async () => fun.saveFunConfig(await requireViewer(), input));
}
export async function chessPuzzleAction(kind: "daily" | "next") {
  return wrap(async () => fun.chessPuzzle(await requireViewer(), kind), quiet);
}
export async function saveFocusAction(input: { persona?: string | null; prefs?: import("@/server/fun").FocusPrefs }) {
  return wrap(async () => fun.saveFocus(await requireViewer(), input), quiet);
}
export async function completeFocusAction(minutes: number) {
  return wrap(async () => fun.completeFocus(await requireViewer(), minutes), quiet);
}
export async function worldHomeAction() {
  return wrap(async () => (await import("@/server/fun-world")).worldHome(await requireViewer()), quiet);
}
export async function worldRosterAction() {
  return wrap(async () => (await import("@/server/fun-world")).roster(await requireViewer()), quiet);
}
export async function saveLookAction(look: Partial<import("@/server/fun-world").Look>) {
  return wrap(async () => (await import("@/server/fun-world")).saveLook(await requireViewer(), look), quiet);
}
export async function savePresetAction(name: string, look: Partial<import("@/lib/fun-catalog").Look> | null) {
  return wrap(async () => (await import("@/server/fun-world")).savePreset(await requireViewer(), name, look), quiet);
}
export async function reportPlayerAction(id: string, reason: string) {
  return wrap(async () => (await import("@/server/fun-world")).reportPlayer(await requireViewer(), id, reason), quiet);
}
export async function worldLayoutAction() {
  return wrap(async () => (await requireViewer(), (await import("@/server/fun-world")).worldLayout()), quiet);
}
export async function saveWorldLayoutAction(input: Partial<import("@/server/fun-world").WorldLayout>) {
  return wrap(async () => (await import("@/server/fun-world")).saveWorldLayout(await requireViewer(), input));
}
export async function youtubeSearchAction(q: string, kind: "video" | "playlist" = "video") {
  return wrap(async () => fun.youtubeSearch(await requireViewer(), q, kind), quiet);
}

// The shop (src/server/fun-shop.ts): prices, balances and ownership are all checked on the server.
const shop = () => import("@/server/fun-shop");
export async function shopAction() {
  return wrap(async () => (await shop()).shopFor(await requireViewer()), quiet);
}
export async function walletAction() {
  return wrap(async () => (await shop()).wallet(await requireViewer()), quiet);
}
export async function buyAction(key: string, qty = 1) {
  return wrap(async () => (await shop()).buy(await requireViewer(), key, qty), quiet);
}
export async function setRideAction(key: string, look?: import("@/lib/fun-catalog").Ride) {
  return wrap(async () => (await shop()).setRide(await requireViewer(), key, look), quiet);
}
export async function upgradeRideAction(key: string) {
  return wrap(async () => (await shop()).upgradeRide(await requireViewer(), key), quiet);
}
export async function saveHomeAction(input: Partial<import("@/lib/fun-catalog").HomeLayout>) {
  return wrap(async () => (await shop()).saveHome(await requireViewer(), input), quiet);
}
export async function upgradeHomeAction() {
  return wrap(async () => (await shop()).upgradeHome(await requireViewer()), quiet);
}
export async function visitHomeAction(ownerId: string) {
  return wrap(async () => {
    const v = await requireViewer();
    const s = await shop();
    if (!(await s.mayVisit(v, ownerId))) return null;
    return s.homeOf(ownerId);
  }, quiet);
}
export async function playRewardAction(activity: string, amount: number) {
  return wrap(async () => (await shop()).playReward(await requireViewer(), activity, amount), quiet);
}
export async function saveShopConfigAction(input: Partial<import("@/lib/fun-catalog").ShopConfig>) {
  return wrap(async () => (await shop()).saveShopConfig(await requireViewer(), input));
}
export async function adminEconomyAction(personId?: string | null) {
  return wrap(async () => (await shop()).adminEconomy(await requireViewer(), personId), quiet);
}
export async function grantCoinsAction(toId: string, amount: number, note: string) {
  return wrap(async () => (await shop()).grantCoins(await requireViewer(), toId, amount, note), quiet);
}
export async function grantItemAction(toId: string, key: string, qty = 1, note = "") {
  return wrap(async () => (await shop()).grantItem(await requireViewer(), toId, key, qty, note), quiet);
}
export async function revokeItemAction(fromId: string, key: string) {
  return wrap(async () => (await shop()).revokeItem(await requireViewer(), fromId, key), quiet);
}
export async function grantUpgradeAction(toId: string, what: string) {
  return wrap(async () => (await shop()).grantUpgrade(await requireViewer(), toId, what), quiet);
}
