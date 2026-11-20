import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { funConfig, funFor, levelOf, pointsOf } from "./fun";
import { notify } from "./notifications";
import {
  DEFAULT_HOME,
  DEFAULT_SHOP,
  PLAY_REWARDS,
  isFree,
  mergedCatalog,
  type HomeLayout,
  type Item,
  type Placed,
  type Ride,
  type ShopConfig,
} from "@/lib/fun-catalog";

// Seed Town's shop: points (coins) buy clothes, accessories, furniture, homes, vehicles, pet things and game skins.
// Every price, balance and ownership check happens here; the browser only shows. Spending is a negative row in
// fun_points (source "shop"), so the balance is always the sum of the ledger. Admin can grant coins and items,
// take items back, change prices and add their own colour variants.

const isAdmin = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");
const HEX = /^#[0-9a-f]{6}$/i;

async function needShop(user: AppUser) {
  const c = await funFor(user);
  if (!c) throw new WorkflowError("FORBIDDEN", "Fun mode is off for you.");
  if (!c.shop) throw new WorkflowError("FORBIDDEN", "Admin switched the shop off.");
  return c;
}

// ------------------------------------------------------------------------------------------------- the shelves

let shopCache: { at: number; cfg: ShopConfig } | null = null;
export async function shopConfig(): Promise<ShopConfig> {
  if (shopCache && Date.now() - shopCache.at < 30_000) return shopCache.cfg;
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.funShop'");
  const cfg = { ...DEFAULT_SHOP, ...parseJson<Partial<ShopConfig>>(row?.value ?? "{}", {}) };
  shopCache = { at: Date.now(), cfg };
  return cfg;
}

// With Admin's "everything free" on, every price is 0 (so everything is everyone's: see owns) and, with
// freeLevels, the level locks are lifted.
export async function freeMode() {
  const c = await funConfig();
  return { all: !!c.freeAll, levels: !!c.freeAll && c.freeLevels !== false };
}

export async function catalog() {
  const items = mergedCatalog(await shopConfig());
  const free = await freeMode();
  return free.all ? items.map((i) => ({ ...i, price: 0, level: free.levels ? undefined : i.level })) : items;
}

export async function itemOf(key: string) {
  return (await catalog()).find((i) => i.key === key) ?? null;
}

// Admin: prices, what is on sale and their own variants (a new colour of an existing model).
export async function saveShopConfig(user: AppUser, input: Partial<ShopConfig>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets the shop.");
  const base = mergedCatalog(DEFAULT_SHOP);
  const items: ShopConfig["items"] = {};
  const custom: Item[] = [];
  for (const c of (input.custom ?? []).slice(0, 80)) {
    const from = base.find((b) => b.key === (c as Item & { base?: string }).base) ?? base.find((b) => b.kind === c.kind && b.model === c.model);
    if (!from) throw new WorkflowError("VALIDATION", `"${c.label}" needs an existing model to copy.`);
    const label = String(c.label ?? "").trim().slice(0, 60);
    if (!label) throw new WorkflowError("VALIDATION", "Each new item needs a name.");
    const key = /^custom\.[a-z0-9-]{2,40}$/.test(String(c.key)) ? String(c.key) : `custom.${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || uid().slice(0, 6)}`;
    if (custom.some((x) => x.key === key)) throw new WorkflowError("VALIDATION", `Two items are called ${label}.`);
    custom.push({
      ...from,
      key,
      label,
      custom: true,
      limited: !!c.limited,
      price: Math.max(0, Math.min(100000, Math.round(Number(c.price) || 0))),
      rarity: (["common", "rare", "epic", "legendary"] as const).find((r) => r === c.rarity) ?? from.rarity,
      color: typeof c.color === "string" && HEX.test(c.color) ? c.color : from.color,
      level: Math.max(0, Math.min(50, Math.round(Number(c.level) || 0))) || undefined,
      note: c.note ? String(c.note).slice(0, 160) : undefined,
    });
  }
  const known = new Set([...base.map((b) => b.key), ...custom.map((c) => c.key)]);
  for (const [k, v] of Object.entries(input.items ?? {})) {
    if (!known.has(k)) continue;
    items[k] = { ...(v.price !== undefined ? { price: Math.max(0, Math.min(100000, Math.round(Number(v.price) || 0))) } : {}), ...(v.on !== undefined ? { on: !!v.on } : {}) };
  }
  const next: ShopConfig = { items, custom };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.funShop', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  shopCache = null;
  await audit({ actor: user }, { action: "settings.fun", summary: `${user.name} changed the Seed Town shop` });
  return next;
}

// ------------------------------------------------------------------------------------------------- what people own

type ItemRow = { id: string; user_id: string; item: string; qty: number; data: string; source: string; created_at: string };

export async function ownedRows(userId: string) {
  return all<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND qty > 0 ORDER BY created_at", userId);
}

// Owned: free, or in the person's things.
export async function owns(userId: string, key: string) {
  const item = await itemOf(key);
  if (item && isFree(item)) return true;
  return !!(await get("SELECT id FROM fun_items WHERE user_id = ? AND item = ? AND qty > 0", userId, key));
}
export async function ownedQty(userId: string, key: string) {
  return Number((await get<{ qty: number }>("SELECT qty FROM fun_items WHERE user_id = ? AND item = ?", userId, key))?.qty ?? 0);
}

async function giveItem(userId: string, item: Item, qty: number, source: string, data?: Record<string, unknown>) {
  const now = nowIso();
  const cur = await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", userId, item.key);
  if (cur) await run("UPDATE fun_items SET qty = ?, updated_at = ? WHERE id = ?", item.stack ? cur.qty + qty : Math.max(1, cur.qty), now, cur.id);
  else await run("INSERT INTO fun_items (id, user_id, item, qty, data, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("fi_"), userId, item.key, item.stack ? qty : 1, JSON.stringify(data ?? {}), source, now, now);
}

// Everything the shop and the inventory show: the person's coins and level, and what they own.
export async function wallet(user: AppUser) {
  await needShop(user);
  const pts = await pointsOf(user.id);
  const rows = await ownedRows(user.id);
  const ride = (await get<{ ride: string | null }>("SELECT ride FROM fun_avatars WHERE user_id = ?", user.id))?.ride ?? null;
  return {
    coins: pts.balance,
    level: levelOf(pts.earned),
    owned: rows.map((r) => ({ key: r.item, qty: r.qty, data: parseJson<Record<string, unknown>>(r.data, {}), since: r.created_at, source: r.source })),
    ride,
    free: (await freeMode()).all,
  };
}

export async function shopFor(user: AppUser) {
  const c = await needShop(user);
  return { items: (await catalog()).filter((i) => i.on || isFree(i)), wallet: await wallet(user), playCoins: c.playCoins };
}

// Buy: on sale, the level is reached, not owned already (unless it stacks), enough coins. One transaction.
export async function buy(user: AppUser, key: string, qty = 1) {
  await needShop(user);
  const item = await itemOf(key);
  if (!item || !item.on) throw new WorkflowError("VALIDATION", "That is not for sale.");
  const n = item.stack ? Math.max(1, Math.min(20, Math.round(Number(qty) || 1))) : 1;
  // Free things are everyone's already; free food and fireworks are simply taken (they never run out anyway).
  if (isFree(item) && !item.stack) throw new WorkflowError("VALIDATION", `${item.label} is free: it is already yours.`);
  if (isFree(item)) {
    await giveItem(user.id, item, n, "free");
    return wallet(user);
  }
  const pts = await pointsOf(user.id);
  const lvl = levelOf(pts.earned).level;
  if (item.level && lvl < item.level) throw new WorkflowError("VALIDATION", `${item.label} unlocks at level ${item.level}; you are level ${lvl}.`);
  if (!item.stack && (await ownedQty(user.id, key)) > 0) throw new WorkflowError("VALIDATION", `You already own ${item.label}.`);
  const cost = item.price * n;
  await tx(async () => {
    const bal = (await pointsOf(user.id)).balance;
    if (bal < cost) throw new WorkflowError("VALIDATION", `${item.label} costs ${cost} coins; you have ${bal}. Work and town activities earn coins.`);
    await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'shop', ?, ?)", uid("fp_"), user.id, -cost, `Bought ${n > 1 ? `${n} x ` : ""}${item.label}`, `buy:${key}`, nowIso());
    await giveItem(user.id, item, n, "shop");
  });
  return wallet(user);
}

// Use up one of a stack (pet food, fireworks). With everything free they never run out.
export async function useOne(userId: string, key: string) {
  if ((await freeMode()).all) return;
  const r = await run("UPDATE fun_items SET qty = qty - 1, updated_at = ? WHERE user_id = ? AND item = ? AND qty > 0", nowIso(), userId, key);
  if (!r.changes) throw new WorkflowError("VALIDATION", "You have none left. The shop has more.");
}

// Light a firework in town (everyone sees it); one at a time.
export async function lightFirework(user: AppUser) {
  await needShop(user);
  await useOne(user.id, "special.firework");
  return wallet(user);
}

// ------------------------------------------------------------------------------------------------- vehicles

export async function rideOf(userId: string) {
  const r = await get<{ ride: string | null }>("SELECT ride FROM fun_avatars WHERE user_id = ?", userId);
  const key = r?.ride ?? "car.bike";
  const row = await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", userId, key);
  return { key, ...parseJson<Ride>(row?.data ?? "{}", {}) };
}

// Choose the vehicle to ride, its paint and rims.
export async function setRide(user: AppUser, key: string, look?: Ride) {
  await needShop(user);
  const item = await itemOf(key);
  if (!item || item.kind !== "vehicle") throw new WorkflowError("VALIDATION", "Not a vehicle.");
  if (!(await owns(user.id, key))) throw new WorkflowError("VALIDATION", `Buy ${item.label} at Aether Motors first.`);
  const now = nowIso();
  await run("INSERT INTO fun_avatars (user_id, look, updated_at, ride) VALUES (?, '{}', ?, ?) ON CONFLICT (user_id) DO UPDATE SET ride = excluded.ride, updated_at = excluded.updated_at", user.id, now, key);
  if (look) {
    const cur = await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", user.id, key);
    const data: Ride = { ...parseJson<Ride>(cur?.data ?? "{}", {}) };
    if (look.paint && HEX.test(look.paint)) data.paint = look.paint;
    if (look.rims && HEX.test(look.rims)) data.rims = look.rims;
    if (cur) await run("UPDATE fun_items SET data = ?, updated_at = ? WHERE id = ?", JSON.stringify(data), now, cur.id);
    else await run("INSERT INTO fun_items (id, user_id, item, qty, data, source, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 'free', ?, ?)", uid("fi_"), user.id, key, JSON.stringify(data), now, now);
  }
  return wallet(user);
}

const upgradeCost = (item: Item, level: number) => Math.max(60, Math.round(item.price * 0.3)) * level;

// Engine upgrades (levels 1 to 3, each faster), paid in coins.
export async function upgradeRide(user: AppUser, key: string) {
  await needShop(user);
  const item = await itemOf(key);
  if (!item || item.kind !== "vehicle") throw new WorkflowError("VALIDATION", "Not a vehicle.");
  if (!(await owns(user.id, key))) throw new WorkflowError("VALIDATION", "You do not own that vehicle.");
  await tx(async () => {
    let row = await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", user.id, key);
    if (!row) {
      await giveItem(user.id, item, 1, "free");
      row = (await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", user.id, key))!;
    }
    const data = parseJson<Ride>(row.data, {});
    const level = data.level ?? 1;
    if (level >= 3) throw new WorkflowError("VALIDATION", "It is fully upgraded.");
    const cost = (await freeMode()).all ? 0 : upgradeCost(item, level);
    const bal = (await pointsOf(user.id)).balance;
    if (bal < cost) throw new WorkflowError("VALIDATION", `The upgrade costs ${cost} coins; you have ${bal}.`);
    if (cost > 0) await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'shop', ?, ?)", uid("fp_"), user.id, -cost, `Upgraded ${item.label} to level ${level + 1}`, `upgrade:${key}`, nowIso());
    await run("UPDATE fun_items SET data = ?, updated_at = ? WHERE id = ?", JSON.stringify({ ...data, level: level + 1 }), nowIso(), row.id);
  });
  return wallet(user);
}

// ------------------------------------------------------------------------------------------------- homes

export async function homeOf(userId: string): Promise<HomeLayout> {
  const r = await get<{ layout: string }>("SELECT layout FROM fun_homes WHERE user_id = ?", userId);
  return { ...DEFAULT_HOME, ...parseJson<Partial<HomeLayout>>(r?.layout ?? "{}", {}) };
}

// Homes of many people at once (for the town).
export async function homesOf(userIds: string[]) {
  const out = new Map<string, HomeLayout>();
  if (!userIds.length) return out;
  const rows = await all<{ user_id: string; layout: string }>(`SELECT user_id, layout FROM fun_homes WHERE user_id IN (${userIds.map(() => "?").join(",")})`, ...userIds);
  for (const id of userIds) out.set(id, { ...DEFAULT_HOME });
  for (const r of rows) out.set(r.user_id, { ...DEFAULT_HOME, ...parseJson<Partial<HomeLayout>>(r.layout, {}) });
  return out;
}

const houseCapacity = (item: Item, level: number) => (item.capacity ?? 16) + (level - 1) * 10;

// Save the home: a house the person owns, colours, and furniture they own enough of, inside the room, not overlapping.
export async function saveHome(user: AppUser, input: Partial<HomeLayout>) {
  await needShop(user);
  const cur = await homeOf(user.id);
  const houseKey = input.house ?? cur.house;
  const house = await itemOf(houseKey);
  if (!house || house.kind !== "house") throw new WorkflowError("VALIDATION", "Not a house.");
  if (!(await owns(user.id, houseKey))) throw new WorkflowError("VALIDATION", `Buy ${house.label} from Town Homes first.`);
  const level = cur.level ?? 1;
  const [rw, rd] = house.room ?? [16, 12];
  const items: Placed[] = [];
  const counts = new Map<string, number>();
  const cat = await catalog();
  const taken = new Set<string>();
  for (const p of (input.items ?? cur.items).slice(0, 200)) {
    const it = cat.find((c) => c.key === p.key && c.kind === "furniture");
    if (!it) throw new WorkflowError("VALIDATION", "Only furniture goes inside.");
    const r = ((Math.round(Number(p.r) || 0) % 4) + 4) % 4;
    const [w, d] = it.size ?? [2, 2];
    const [fw, fd] = r % 2 ? [d, w] : [w, d];
    const x = Math.round(Number(p.x)), z = Math.round(Number(p.z));
    if (!(x >= 0 && z >= 0 && x + fw <= rw && z + fd <= rd)) throw new WorkflowError("VALIDATION", `${it.label} does not fit there.`);
    // Rugs lie under things; everything else needs its own floor.
    if (it.model !== "rug") {
      for (let i = x; i < x + fw; i++)
        for (let j = z; j < z + fd; j++) {
          if (taken.has(`${i},${j}`)) throw new WorkflowError("VALIDATION", `${it.label} overlaps something else.`);
          taken.add(`${i},${j}`);
        }
    }
    counts.set(it.key, (counts.get(it.key) ?? 0) + 1);
    items.push({ key: it.key, x, z, r });
  }
  if (items.length > houseCapacity(house, level)) throw new WorkflowError("VALIDATION", `${house.label} holds ${houseCapacity(house, level)} pieces; upgrade it for more room.`);
  for (const [k, n] of counts) {
    const it = cat.find((c) => c.key === k)!;
    if (isFree(it)) continue;
    const have = await ownedQty(user.id, k);
    if (have < n) throw new WorkflowError("VALIDATION", `You have ${have} ${it.label}${have === 1 ? "" : "s"}; buy more at Nest Home.`);
  }
  const access = (["everyone", "invited", "private"] as const).find((a) => a === (input.access ?? cur.access)) ?? "everyone";
  const guests = (input.guests ?? cur.guests).filter((g) => typeof g === "string").slice(0, 50);
  const next: HomeLayout = {
    house: houseKey,
    wall: input.wall && HEX.test(input.wall) ? input.wall : cur.wall,
    floor: input.floor && HEX.test(input.floor) ? input.floor : cur.floor,
    items,
    access,
    guests,
    level,
  };
  await run("INSERT INTO fun_homes (user_id, layout, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at", user.id, JSON.stringify(next), nowIso());
  return next;
}

// May this person go inside that home?
export async function mayVisit(user: AppUser, ownerId: string) {
  if (user.id === ownerId || isAdmin(user)) return true;
  const h = await homeOf(ownerId);
  return h.access === "everyone" || (h.access === "invited" && h.guests.includes(user.id));
}

// Bigger homes hold more: each upgrade adds ten pieces of furniture (up to level 3).
export async function upgradeHome(user: AppUser) {
  await needShop(user);
  const cur = await homeOf(user.id);
  const house = (await itemOf(cur.house))!;
  if ((cur.level ?? 1) >= 3) throw new WorkflowError("VALIDATION", "Your home is fully upgraded.");
  const cost = (await freeMode()).all ? 0 : upgradeCost(house, cur.level ?? 1);
  await tx(async () => {
    const bal = (await pointsOf(user.id)).balance;
    if (bal < cost) throw new WorkflowError("VALIDATION", `The upgrade costs ${cost} coins; you have ${bal}.`);
    if (cost > 0) await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'shop', 'upgrade:home', ?)", uid("fp_"), user.id, -cost, `Upgraded ${house.label} to level ${(cur.level ?? 1) + 1}`, nowIso());
    await run("INSERT INTO fun_homes (user_id, layout, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at", user.id, JSON.stringify({ ...cur, level: (cur.level ?? 1) + 1 }), nowIso());
  });
  return homeOf(user.id);
}

// ------------------------------------------------------------------------------------------------- playing earns a little

// Coins for town activities and mini-games, within Admin's daily cap for play (work has its own cap). The score
// is the person's own report, so each activity pays a small amount at most once every 20 seconds.
export async function playReward(user: AppUser, activity: string, amount: number) {
  const c = await funFor(user);
  if (!c || !c.points) return { coins: 0, left: 0 };
  // A mode of an activity ("archery-wind") pays as the activity.
  const rule = PLAY_REWARDS[activity] ?? PLAY_REWARDS[activity.split("-")[0]!];
  if (!rule) throw new WorkflowError("VALIDATION", "Unknown activity.");
  const day = nowIso().slice(0, 10);
  const today = Number((await get<{ n: number }>("SELECT COALESCE(SUM(points), 0) AS n FROM fun_points WHERE user_id = ? AND source = 'play' AND substr(created_at, 1, 10) = ?", user.id, day))?.n ?? 0);
  const left = Math.max(0, c.playCoins - today);
  const want = Math.max(0, Math.min(rule.max, Math.round(rule.per * (Number(amount) || 0))));
  if (!want || !left) return { coins: 0, left };
  const last = await get<{ created_at: string }>("SELECT created_at FROM fun_points WHERE user_id = ? AND source = 'play' AND ref = ? ORDER BY created_at DESC LIMIT 1", user.id, `play:${activity}`);
  if (last && Date.now() - Date.parse(last.created_at) < 20_000) return { coins: 0, left };
  const coins = Math.min(want, left);
  await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'play', ?, ?)", uid("fp_"), user.id, coins, rule.label, `play:${activity}`, nowIso());
  return { coins, left: left - coins };
}

// ------------------------------------------------------------------------------------------------- Admin

export async function grantCoins(user: AppUser, toId: string, amount: number, note: string) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin gives coins.");
  const n = Math.round(Number(amount));
  if (!n || Math.abs(n) > 100000) throw new WorkflowError("VALIDATION", "Give between 1 and 100000 coins (negative takes them back).");
  const to = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ? AND active = 1", toId);
  if (!to) throw new WorkflowError("VALIDATION", "Choose a person.");
  const reason = (note.trim() || (n > 0 ? "A gift from Admin" : "Taken back by Admin")).slice(0, 120);
  await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'grant', ?, ?)", uid("fp_"), to.id, n, reason, `grant:${user.id}`, nowIso());
  await audit({ actor: user }, { action: "fun.grant", summary: `${user.name} gave ${to.name} ${n} coins: ${reason}` });
  if (n > 0) await notify([to.id], { type: "discussion", title: `You received ${n} coins`, body: reason, link: "/fun" }, nowIso(), user.id).catch(() => {});
  return pointsOf(to.id);
}

export async function grantItem(user: AppUser, toId: string, key: string, qty = 1, note = "") {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin gives items.");
  const item = await itemOf(key);
  if (!item) throw new WorkflowError("VALIDATION", "Unknown item.");
  const to = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ? AND active = 1", toId);
  if (!to) throw new WorkflowError("VALIDATION", "Choose a person.");
  await giveItem(to.id, item, Math.max(1, Math.min(100, Math.round(qty))), "grant");
  // A home or vehicle upgrade from Admin comes as the item at a higher level.
  await audit({ actor: user }, { action: "fun.grant", summary: `${user.name} gave ${to.name} ${item.label}${note ? `: ${note}` : ""}` });
  await notify([to.id], { type: "discussion", title: `You received ${item.label}`, body: note || "A gift from Admin. Find it in your things in Seed Town.", link: "/fun" }, nowIso(), user.id).catch(() => {});
  return ownedRows(to.id);
}

export async function revokeItem(user: AppUser, fromId: string, key: string) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin takes items back.");
  await run("DELETE FROM fun_items WHERE user_id = ? AND item = ?", fromId, key);
  await audit({ actor: user }, { action: "fun.grant", summary: `${user.name} took ${key} back` });
  return ownedRows(fromId);
}

// Admin upgrades: a person's home or vehicle one level up, free.
export async function grantUpgrade(user: AppUser, toId: string, what: "home" | string) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin gives upgrades.");
  if (what === "home") {
    const h = await homeOf(toId);
    await run("INSERT INTO fun_homes (user_id, layout, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at", toId, JSON.stringify({ ...h, level: Math.min(3, (h.level ?? 1) + 1) }), nowIso());
  } else {
    const item = await itemOf(what);
    if (!item || item.kind !== "vehicle") throw new WorkflowError("VALIDATION", "Choose a home or a vehicle.");
    let row = await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", toId, what);
    if (!row) {
      await giveItem(toId, item, 1, "grant");
      row = (await get<ItemRow>("SELECT * FROM fun_items WHERE user_id = ? AND item = ?", toId, what))!;
    }
    const d = parseJson<Ride>(row.data, {});
    await run("UPDATE fun_items SET data = ?, updated_at = ? WHERE id = ?", JSON.stringify({ ...d, level: Math.min(3, (d.level ?? 1) + 1) }), nowIso(), row.id);
  }
  await audit({ actor: user }, { action: "fun.grant", summary: `${user.name} upgraded ${what} for a colleague` });
  await notify([toId], { type: "discussion", title: what === "home" ? "Your home was upgraded" : "Your vehicle was upgraded", body: "A gift from Admin.", link: "/fun" }, nowIso(), user.id).catch(() => {});
  return true;
}

// Admin: who has what, and the coin history (work, play, shop, grants).
export async function adminEconomy(user: AppUser, personId?: string | null) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sees the economy.");
  const people = await all<{ id: string; name: string; balance: number }>(
    "SELECT u.id, u.name, COALESCE(SUM(f.points), 0) AS balance FROM users u LEFT JOIN fun_points f ON f.user_id = u.id WHERE u.active = 1 GROUP BY u.id, u.name ORDER BY u.name LIMIT 500",
  );
  const log = await all<{ name: string; points: number; reason: string; source: string; created_at: string }>(
    `SELECT u.name AS name, f.points, f.reason, f.source, f.created_at FROM fun_points f JOIN users u ON u.id = f.user_id ${personId ? "WHERE f.user_id = ?" : "WHERE f.source <> 'work'"} ORDER BY f.created_at DESC LIMIT 100`,
    ...(personId ? [personId] : []),
  );
  const owned = personId ? (await ownedRows(personId)).map((r) => ({ key: r.item, qty: r.qty, source: r.source, data: parseJson<Record<string, unknown>>(r.data, {}) })) : [];
  return { people: people.map((p) => ({ ...p, balance: Number(p.balance) })), log: log.map((l) => ({ ...l, points: Number(l.points) })), owned, home: personId ? await homeOf(personId) : null, shop: await shopConfig(), config: { playCoins: (await funConfig()).playCoins } };
}
