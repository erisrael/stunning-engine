import type { WeaponKey } from "./strike-weapons";

// Seed Core's agents: our own characters, each with two powers bought or refilled every round (Q and E) and an
// ultimate (X) that charges with kills, deaths, plants and defuses. Shared by the game and its menus.

export type AgentKey = "vesper" | "kestrel" | "lula" | "abeba" | "tsehay" | "zemen";
export type AbilityKey = "smoke" | "step" | "nightfall" | "flash" | "recon" | "hunt" | "wall" | "trip" | "lockdown" | "mend" | "slow" | "renew" | "blaze" | "dash" | "sunburst" | "updraft" | "blink" | "precision";
export type AbilityDef = { key: AbilityKey; name: string; note: string; charges: number; cost: number };
export type Agent = { key: AgentKey; name: string; role: "Controller" | "Initiator" | "Sentinel" | "Support" | "Duelist"; color: string; person: number; bio: string; q: AbilityDef; e: AbilityDef; x: AbilityDef & { points: number } };

export const AGENTS: Record<AgentKey, Agent> = {
  vesper: {
    key: "vesper", name: "Vesper", role: "Controller", color: "#7c3aed", person: 1,
    bio: "Takes the sight lines away: smoke, a step through the shadows, night over a whole site.",
    q: { key: "smoke", name: "Smoke screen", note: "A smoke where you aim (up to 35 m): nobody sees through it for 14 s.", charges: 2, cost: 150 },
    e: { key: "step", name: "Shadow step", note: "Steps 7 m ahead in a blink.", charges: 1, cost: 0 },
    x: { key: "nightfall", name: "Nightfall", note: "A wide smoke where you aim for 18 s; enemies inside move slowly.", charges: 1, cost: 0, points: 7 },
  },
  kestrel: {
    key: "kestrel", name: "Kestrel", role: "Initiator", color: "#0ea5e9", person: 4,
    bio: "Finds them first: a flare to blind, a dart to see through walls, a sweep of the whole map.",
    q: { key: "flash", name: "Flare", note: "Bursts where you aim: enemies looking at it are blinded for up to 2.5 s.", charges: 2, cost: 200 },
    e: { key: "recon", name: "Recon dart", note: "Shows enemies within 30 m of where it lands for 5 s, through walls.", charges: 1, cost: 0 },
    x: { key: "hunt", name: "Hunter's eye", note: "Shows every enemy for 6 s.", charges: 1, cost: 0, points: 7 },
  },
  lula: {
    key: "lula", name: "Lula", role: "Sentinel", color: "#16a34a", person: 5,
    bio: "Holds ground: a wall that stops bullets, a tripwire, a lockdown nobody walks out of quickly.",
    q: { key: "wall", name: "Barrier", note: "A wall 6 m wide in front of you for 20 s: it stops people and bullets.", charges: 1, cost: 300 },
    e: { key: "trip", name: "Tripwire", note: "Set where you aim: an enemy who walks over it is shown and slowed.", charges: 1, cost: 0 },
    x: { key: "lockdown", name: "Lockdown", note: "Around you (12 m) for 8 s: enemies move slowly and are shown.", charges: 1, cost: 0, points: 7 },
  },
  abeba: {
    key: "abeba", name: "Abeba", role: "Support", color: "#f59e0b", person: 6,
    bio: "Keeps the team standing: mends wounds, slows a push, brings everyone back to full.",
    q: { key: "mend", name: "Mend", note: "Heals you by 60 over 3 s.", charges: 1, cost: 200 },
    e: { key: "slow", name: "Slow field", note: "A field where you aim: enemies in it move at half speed for 7 s.", charges: 2, cost: 0 },
    x: { key: "renew", name: "Second wind", note: "Full health and armour for you and team mates within 15 m.", charges: 1, cost: 0, points: 7 },
  },
  tsehay: {
    key: "tsehay", name: "Tsehay", role: "Duelist", color: "#ef4444", person: 0,
    bio: "Goes in first: a blaze in their eyes, a dash past the corner, a burst of fire nobody stands up to.",
    q: { key: "blaze", name: "Blaze", note: "A quick flash just ahead of you: enemies looking at it are blinded.", charges: 2, cost: 250 },
    e: { key: "dash", name: "Dash", note: "Dashes 8 m the way you face.", charges: 1, cost: 0 },
    x: { key: "sunburst", name: "Sunburst", note: "10 s: faster fire, more damage, almost no recoil.", charges: 1, cost: 0, points: 8 },
  },
  zemen: {
    key: "zemen", name: "Zemen", role: "Duelist", color: "#14b8a6", person: 3,
    bio: "Is where you least expect: up on the high ground, behind your line, one shot at a time.",
    q: { key: "updraft", name: "Updraft", note: "Throws you up high (onto boxes and ledges).", charges: 2, cost: 150 },
    e: { key: "blink", name: "Blink", note: "Appears where you aim, up to 14 m away.", charges: 1, cost: 0 },
    x: { key: "precision", name: "Precision", note: "Your next five shots deal 150 damage.", charges: 1, cost: 0, points: 7 },
  },
};
export const AGENT_KEYS = Object.keys(AGENTS) as AgentKey[];

// What can be bought in the buy phase (credits): weapons and armour; the K9 pistol is always free.
export type BuyItem = { key: string; label: string; cost: number; weapon?: WeaponKey; armor?: number };
export const CORE_BUY: BuyItem[] = [
  { key: "revolver", label: "Marshal .357", cost: 800, weapon: "revolver" },
  { key: "smg", label: "Viper SMG", cost: 1600, weapon: "smg" },
  { key: "shotgun", label: "Breacher shotgun", cost: 1850, weapon: "shotgun" },
  { key: "rifle", label: "SR-7 rifle", cost: 2900, weapon: "rifle" },
  { key: "heavy", label: "Raider AR", cost: 2900, weapon: "heavy" },
  { key: "marksman", label: "Longshot marksman", cost: 4700, weapon: "marksman" },
  { key: "light", label: "Light armour (25)", cost: 400, armor: 25 },
  { key: "full", label: "Heavy armour (50)", cost: 1000, armor: 50 },
];
// Credits: a start, a win, a loss (more after losses in a row), a kill, a plant.
export const ECON = { start: 800, win: 3000, loss: 1900, lossStep: 500, lossMax: 2900, kill: 200, plant: 300, cap: 9000 };
export const CORE_TIMES = { buy: 15, firstBuy: 20, live: 100, fuse: 40, end: 4, plant: 3.5, defuse: 6, win: 7, half: 6 };
