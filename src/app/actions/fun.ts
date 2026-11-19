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
export async function adoptPetAction(kind: string, name: string) {
  return wrap(async () => fun.adoptPet(await requireViewer(), kind, name), quiet);
}
export async function carePetAction(act: "feed" | "play" | "pet" | "outfit", outfit?: string) {
  return wrap(async () => fun.carePet(await requireViewer(), act, outfit), quiet);
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
