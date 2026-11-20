"use client";

import type { FunActions } from "./actions";

// The guest arcade's versions of the Fun actions: nothing goes to the server and nothing about the company is read.
// A guest owns everything (it is all free in the arcade), keeps best scores and coins in this browser only, and
// town folk remember them here too. Garages, homes, AI answers and anything else that needs an account say so.

type Store = { coins: number; best: Record<string, number>; ride: string | null; look: Record<string, unknown> | null; npc: Record<string, unknown>; presets: { name: string; look: unknown }[] };
const KEY = "myseed.arcade.guest";
const load = (): Store => {
  try {
    return { coins: 0, best: {}, ride: null, look: null, npc: {}, presets: [], ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Store>) };
  } catch {
    return { coins: 0, best: {}, ride: null, look: null, npc: {}, presets: [] };
  }
};
const save = (s: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};
const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const no = (error = "Sign in with a Myseed account for that.") => Promise.resolve({ ok: false as const, error });
// Lower is better for times (races, reactions, typing errors), as on the server.
const LOWER = /^(world:gp|reaction|sudoku|minesweeper|memory)/;

export function guestActions(items: { key: string }[], home: unknown): FunActions {
  const wallet = () => {
    const s = load();
    return { coins: s.coins, level: 1, owned: items.map((i) => ({ key: i.key, qty: 1, data: {}, since: "", source: "free" })), ride: s.ride, free: true };
  };
  const best = (game: string) => {
    const s = load();
    return { mine: s.best[game] ?? null, top: [], lowerIsBetter: LOWER.test(game) };
  };
  const impl: Record<string, (...a: never[]) => Promise<unknown>> = {
    // The town, with the look the guest designed and the car they chose last time (kept in this browser).
    worldHomeAction: () => {
      const s = load();
      const h = home as { look?: Record<string, unknown> } & Record<string, unknown>;
      return ok({ ...h, look: s.look ? { ...(h.look ?? {}), ...s.look } : h.look, ride: s.ride ? { key: s.ride } : (h.ride ?? null) });
    },
    walletAction: () => ok(wallet()),
    shopAction: () => ok({ items, wallet: wallet(), playCoins: false }),
    buyAction: () => ok(wallet()),
    setRideAction: ((key: string) => {
      const s = load();
      s.ride = key;
      save(s);
      return ok(wallet());
    }) as never,
    saveLookAction: ((look: Record<string, unknown>) => {
      const s = load();
      s.look = { ...(s.look ?? {}), ...look };
      save(s);
      return ok(s.look);
    }) as never,
    savePresetAction: ((name: string, look: unknown) => {
      const s = load();
      s.presets = s.presets.filter((p) => p.name !== name);
      if (look) s.presets.push({ name, look });
      save(s);
      return ok(s.presets);
    }) as never,
    bestScoresAction: ((game: string) => ok(best(game))) as never,
    saveScoreAction: ((game: string, score: number) => {
      const s = load();
      const old = s.best[game];
      if (old === undefined || (LOWER.test(game) ? score < old : score > old)) s.best[game] = score;
      save(s);
      return ok(best(game));
    }) as never,
    playRewardAction: ((_what: string, amount: number) => {
      const s = load();
      const coins = Math.max(0, Math.min(50, Math.round(Number(amount) || 0)));
      s.coins += coins;
      save(s);
      return ok({ coins, balance: s.coins });
    }) as never,
    npcQuestDoneAction: () => {
      const s = load();
      s.coins += 10;
      save(s);
      return ok({ coins: 10 });
    },
    npcMemoryAction: ((id: string) => ok(load().npc[id] ?? null)) as never,
    npcTalkedAction: ((id: string, input: { topic?: string; quest?: unknown }) => {
      const s = load();
      const m = (s.npc[id] as { met: number; topics: string[]; quest: unknown; last: string } | undefined) ?? { met: 0, topics: [], quest: null, last: "" };
      if (input.topic === "hello") m.met++;
      else if (input.topic && !m.topics.includes(input.topic)) m.topics = [...m.topics, input.topic].slice(-12);
      if (input.quest !== undefined) m.quest = input.quest;
      m.last = new Date().toISOString();
      s.npc[id] = m;
      save(s);
      return ok(m);
    }) as never,
    pointsLogAction: () => ok([]),
    reportPlayerAction: () => ok(true),
  };
  return new Proxy({} as FunActions, {
    get: (_t, k) => impl[k as string] ?? (() => no()),
  });
}

// The look a guest chose in the designer, kept in this browser.
export function guestLook<T>(fallback: T): T {
  const l = load().look;
  return l ? ({ ...fallback, ...l } as T) : fallback;
}
