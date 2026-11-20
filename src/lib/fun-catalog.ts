// Seed Town's shop: everything people can own (clothes, accessories, furniture, homes, vehicles, pet things, game
// skins). Shared by the server (prices, ownership and purchases are checked there) and the browser (pictures in 3D).
// Price 0 means free for everyone. Admin can change prices, take things off the shelves and add their own
// variants (another colour of an existing model) without code: see ShopConfig.

export type ItemKind = "avatar" | "outfit" | "hair" | "acc" | "furniture" | "house" | "vehicle" | "petfood" | "pettoy" | "petwear" | "petskin" | "skin" | "special";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Shop = "clothes" | "accessories" | "furniture" | "homes" | "cars" | "pets" | "general" | "special";
export type AccSlot = "head" | "face" | "neck" | "back" | "ears";

export type Item = {
  // A realistic person (avatar kind), not an anime model.
  realistic?: boolean;
  key: string;
  kind: ItemKind;
  label: string;
  price: number;
  rarity: Rarity;
  shop: Shop;
  note?: string;
  // Level needed to buy (levels grow with everything ever earned).
  level?: number;
  // Accessories: where it goes. Only one per slot.
  slot?: AccSlot;
  // Kept in a stack (food, toys): bought and used up one at a time.
  stack?: boolean;
  // How it looks: the model to build and its colour; game skins carry their colours here.
  model?: string;
  color?: string;
  colors?: string[];
  // Pet food: what it does to the needs (0..100 each).
  effect?: Partial<Record<"hunger" | "fun" | "energy" | "clean" | "health" | "love", number>>;
  // Furniture: footprint in grid cells (1 cell = 0.5 m) and whether people can sit on it.
  size?: [number, number];
  seat?: boolean;
  // Homes: how many pieces of furniture fit, and the interior size in cells.
  capacity?: number;
  room?: [number, number];
  // Vehicles: top speed (m/s), how quickly it turns and how many seats.
  speed?: number;
  handling?: number;
  seats?: number;
  // Limited items: for sale only while true (Admin), e.g. a season.
  limited?: boolean;
  custom?: boolean;
};

const I = (key: string, kind: ItemKind, label: string, price: number, rarity: Rarity, shop: Shop, more: Partial<Item> = {}): Item => ({ key, kind, label, price, rarity, shop, ...more });

export const CATALOG: Item[] = [
  // ---------------------------------------------------------------- anime characters (VRM models, rigged; see VRM_BASES)
  I("avatar.kai", "avatar", "Kai", 0, "common", "clothes", { model: "kai" }),
  I("avatar.mei", "avatar", "Mei", 0, "common", "clothes", { model: "mei" }),
  I("avatar.aoi", "avatar", "Aoi", 0, "common", "clothes", { model: "aoi" }),
  I("avatar.shibu", "avatar", "Shibu", 0, "common", "clothes", { model: "shibu" }),
  I("avatar.bibi", "avatar", "Bibi", 120, "rare", "clothes", { model: "bibi" }),
  I("avatar.vita", "avatar", "Vita", 150, "rare", "clothes", { model: "vita" }),
  I("avatar.shino", "avatar", "Shino", 180, "epic", "clothes", { model: "shino" }),
  I("avatar.victoria", "avatar", "Victoria", 200, "epic", "clothes", { model: "victoria" }),
  I("avatar.fumiriya", "avatar", "Fumiriya", 220, "epic", "clothes", { model: "fumiriya" }),
  I("avatar.seed", "avatar", "Seed-san", 400, "legendary", "special", { model: "seed", level: 4, note: "The android with the jet pack." }),
  // Realistic people (Microsoft Rocketbox avatars, MIT; models/people), free for everyone.
  I("avatar.rb_m01", "avatar", "Daniel", 0, "common", "clothes", { model: "rb_m01", realistic: true }),
  I("avatar.rb_m05", "avatar", "Samuel", 0, "common", "clothes", { model: "rb_m05", realistic: true }),
  I("avatar.rb_m08", "avatar", "Michael", 0, "common", "clothes", { model: "rb_m08", realistic: true }),
  I("avatar.rb_m12", "avatar", "Robert", 0, "common", "clothes", { model: "rb_m12", realistic: true }),
  I("avatar.rb_f01", "avatar", "Hana", 0, "common", "clothes", { model: "rb_f01", realistic: true }),
  I("avatar.rb_f04", "avatar", "Sara", 0, "common", "clothes", { model: "rb_f04", realistic: true }),
  I("avatar.rb_f08", "avatar", "Ruth", 0, "common", "clothes", { model: "rb_f08", realistic: true }),
  I("avatar.rb_f12", "avatar", "Lidya", 0, "common", "clothes", { model: "rb_f12", realistic: true }),

  // ---------------------------------------------------------------- outfits (the clothes shop)
  I("outfit.tee", "outfit", "T-shirt and jeans", 0, "common", "clothes", { model: "tee" }),
  I("outfit.hoodie", "outfit", "Hoodie", 0, "common", "clothes", { model: "hoodie" }),
  I("outfit.office", "outfit", "Office shirt and tie", 0, "common", "clothes", { model: "office" }),
  I("outfit.sailor", "outfit", "Sailor uniform", 60, "common", "clothes", { model: "sailor" }),
  I("outfit.jacket", "outfit", "Bomber jacket", 80, "common", "clothes", { model: "jacket" }),
  I("outfit.dress", "outfit", "Summer dress", 80, "common", "clothes", { model: "dress" }),
  I("outfit.sport", "outfit", "Track suit", 90, "rare", "clothes", { model: "sport" }),
  I("outfit.suit", "outfit", "Smart suit", 150, "rare", "clothes", { model: "suit" }),
  I("outfit.adventurer", "outfit", "Adventurer coat", 220, "epic", "clothes", { model: "adventurer", level: 3 }),
  I("outfit.festival", "outfit", "Festival robe", 260, "epic", "clothes", { model: "robe", level: 4 }),
  I("outfit.mage", "outfit", "Star mage cloak", 420, "legendary", "special", { model: "mage", level: 6 }),
  I("outfit.knight", "outfit", "Knight armour", 480, "legendary", "special", { model: "knight", level: 7 }),

  // ---------------------------------------------------------------- hair styles (free; colour is free too)
  I("hair.short", "hair", "Short", 0, "common", "clothes", { model: "short" }),
  I("hair.spiky", "hair", "Spiky", 0, "common", "clothes", { model: "spiky" }),
  I("hair.bob", "hair", "Bob", 0, "common", "clothes", { model: "bob" }),
  I("hair.long", "hair", "Long", 0, "common", "clothes", { model: "long" }),
  I("hair.ponytail", "hair", "Ponytail", 0, "common", "clothes", { model: "ponytail" }),
  I("hair.twintails", "hair", "Twin tails", 40, "common", "clothes", { model: "twintails" }),
  I("hair.buns", "hair", "Space buns", 40, "common", "clothes", { model: "buns" }),
  I("hair.messy", "hair", "Messy hero", 60, "rare", "clothes", { model: "messy" }),
  I("hair.bald", "hair", "Shaved", 0, "common", "clothes", { model: "bald" }),

  // ---------------------------------------------------------------- accessories
  I("acc.cap", "acc", "Cap", 0, "common", "accessories", { slot: "head", model: "cap" }),
  I("acc.beanie", "acc", "Beanie", 0, "common", "accessories", { slot: "head", model: "beanie", color: "#ef4444" }),
  I("acc.crown", "acc", "Crown", 0, "common", "accessories", { slot: "head", model: "crown", color: "#facc15" }),
  I("acc.halo", "acc", "Halo", 0, "common", "accessories", { slot: "head", model: "halo", color: "#fde047" }),
  I("acc.horns", "acc", "Horns", 0, "common", "accessories", { slot: "head", model: "horns", color: "#dc2626" }),
  I("acc.catears", "acc", "Cat ears", 50, "common", "accessories", { slot: "head", model: "catears" }),
  I("acc.headphones", "acc", "Headphones", 70, "rare", "accessories", { slot: "head", model: "headphones", color: "#111827" }),
  I("acc.witch", "acc", "Witch hat", 90, "rare", "accessories", { slot: "head", model: "witch", color: "#4c1d95" }),
  I("acc.flowers", "acc", "Flower crown", 60, "common", "accessories", { slot: "head", model: "flowers", color: "#f472b6" }),
  I("acc.glasses", "acc", "Round glasses", 30, "common", "accessories", { slot: "face", model: "glasses", color: "#1f2937" }),
  I("acc.shades", "acc", "Sunglasses", 60, "rare", "accessories", { slot: "face", model: "shades", color: "#7c3aed" }),
  I("acc.mask", "acc", "Fox mask", 120, "epic", "accessories", { slot: "face", model: "foxmask", color: "#f8fafc" }),
  I("acc.necklace", "acc", "Gold chain", 80, "rare", "accessories", { slot: "neck", model: "chain", color: "#eab308" }),
  I("acc.scarf", "acc", "Scarf", 40, "common", "accessories", { slot: "neck", model: "scarf", color: "#dc2626" }),
  I("acc.earrings", "acc", "Earrings", 35, "common", "accessories", { slot: "ears", model: "earrings", color: "#e5e7eb" }),
  I("acc.backpack", "acc", "Backpack", 50, "common", "accessories", { slot: "back", model: "backpack", color: "#2563eb" }),
  I("acc.guitar", "acc", "Guitar", 140, "rare", "accessories", { slot: "back", model: "guitar", color: "#b45309" }),
  I("acc.cape", "acc", "Hero cape", 160, "epic", "accessories", { slot: "back", model: "cape", color: "#b91c1c" }),
  I("acc.wings", "acc", "Angel wings", 350, "legendary", "special", { slot: "back", model: "wings", color: "#f8fafc", level: 5 }),
  I("acc.dragonwings", "acc", "Dragon wings", 400, "legendary", "special", { slot: "back", model: "wings", color: "#7f1d1d", level: 6 }),

  // ---------------------------------------------------------------- homes (the property agent)
  I("house.cottage", "house", "Starter cottage", 0, "common", "homes", { model: "cottage", capacity: 16, room: [16, 12] }),
  I("house.apartment", "house", "City loft", 300, "rare", "homes", { model: "loft", capacity: 26, room: [20, 14] }),
  I("house.modern", "house", "Modern house", 650, "epic", "homes", { model: "modern", capacity: 36, room: [22, 16], level: 3 }),
  I("house.villa", "house", "Garden villa", 1200, "legendary", "homes", { model: "villa", capacity: 50, room: [26, 18], level: 5 }),
  I("house.castle", "house", "Tiny castle", 2000, "legendary", "special", { model: "castle", capacity: 60, room: [26, 20], level: 8 }),

  // ---------------------------------------------------------------- furniture
  I("furn.chair", "furniture", "Wooden chair", 0, "common", "furniture", { model: "chair", size: [2, 2], seat: true, stack: true, color: "#a16207" }),
  I("furn.table", "furniture", "Table", 0, "common", "furniture", { model: "table", size: [4, 3], stack: true, color: "#92400e" }),
  I("furn.bed", "furniture", "Bed", 0, "common", "furniture", { model: "bed", size: [4, 6], stack: true, color: "#60a5fa" }),
  I("furn.sofa", "furniture", "Sofa", 60, "common", "furniture", { model: "sofa", size: [6, 3], seat: true, stack: true, color: "#64748b" }),
  I("furn.armchair", "furniture", "Armchair", 40, "common", "furniture", { model: "armchair", size: [3, 3], seat: true, stack: true, color: "#b45309" }),
  I("furn.plant", "furniture", "Potted plant", 15, "common", "furniture", { model: "plant", size: [2, 2], stack: true, color: "#16a34a" }),
  I("furn.lamp", "furniture", "Floor lamp", 20, "common", "furniture", { model: "lamp", size: [1, 1], stack: true, color: "#fde68a" }),
  I("furn.rug", "furniture", "Round rug", 25, "common", "furniture", { model: "rug", size: [6, 6], stack: true, color: "#c084fc" }),
  I("furn.shelf", "furniture", "Bookshelf", 45, "common", "furniture", { model: "shelf", size: [4, 1], stack: true, color: "#78350f" }),
  I("furn.desk", "furniture", "Work desk", 50, "common", "furniture", { model: "desk", size: [4, 2], stack: true, color: "#e5e7eb" }),
  I("furn.tv", "furniture", "Big TV", 90, "rare", "furniture", { model: "tv", size: [4, 1], stack: true, color: "#111827" }),
  I("furn.painting", "furniture", "Painting", 35, "common", "furniture", { model: "painting", size: [3, 1], stack: true, color: "#f59e0b" }),
  I("furn.aquarium", "furniture", "Aquarium", 140, "rare", "furniture", { model: "aquarium", size: [4, 2], stack: true, color: "#38bdf8" }),
  I("furn.piano", "furniture", "Piano", 220, "epic", "furniture", { model: "piano", size: [4, 3], seat: true, stack: true, color: "#0f172a" }),
  I("furn.fireplace", "furniture", "Fireplace", 180, "epic", "furniture", { model: "fireplace", size: [4, 2], stack: true, color: "#9ca3af" }),
  I("furn.arcade", "furniture", "Arcade cabinet", 260, "epic", "furniture", { model: "arcade", size: [2, 2], stack: true, color: "#7c3aed" }),
  I("furn.tree", "furniture", "Indoor tree", 70, "rare", "furniture", { model: "tree", size: [3, 3], stack: true, color: "#15803d" }),
  I("furn.throne", "furniture", "Golden throne", 600, "legendary", "special", { model: "throne", size: [3, 3], seat: true, stack: true, color: "#eab308", level: 6 }),

  // ---------------------------------------------------------------- vehicles (the dealership)
  I("car.bike", "vehicle", "City bicycle", 0, "common", "cars", { model: "bike", color: "#22c55e", speed: 9, handling: 2.6, seats: 1 }),
  I("car.scooter", "vehicle", "Scooter", 120, "common", "cars", { model: "scooter", color: "#f43f5e", speed: 13, handling: 2.4, seats: 1 }),
  I("car.hatch", "vehicle", "Hatchback", 300, "rare", "cars", { model: "hatch", color: "#3b82f6", speed: 18, handling: 1.8, seats: 2 }),
  I("car.moto", "vehicle", "Motorbike", 420, "rare", "cars", { model: "moto", color: "#111827", speed: 24, handling: 2.2, seats: 1, level: 2 }),
  I("car.jeep", "vehicle", "Off-roader", 550, "epic", "cars", { model: "jeep", color: "#65a30d", speed: 19, handling: 1.6, seats: 2, level: 3 }),
  I("car.sports", "vehicle", "Sports car", 900, "epic", "cars", { model: "sports", color: "#f97316", speed: 30, handling: 2.0, seats: 2, level: 4 }),
  I("car.cart", "vehicle", "Golf cart", 200, "common", "cars", { model: "cart", color: "#f8fafc", speed: 11, handling: 2.0, seats: 2 }),
  I("car.hover", "vehicle", "Hover car", 1800, "legendary", "special", { model: "hover", color: "#06b6d4", speed: 34, handling: 2.4, seats: 2, level: 8 }),
  // Cars with their own driving numbers (see world/cars.ts SPECS): drawn bodies, and two licensed 3D models.
  I("car.sedan", "vehicle", "Seed Aurora sedan", 450, "rare", "cars", { model: "sedan", color: "#1f3a5f", speed: 62, handling: 2, seats: 4, note: "Rear-wheel drive, 150 kW, six gears. Comfortable and quick." }),
  I("car.suv", "vehicle", "Seed Atlas SUV", 700, "epic", "cars", { model: "suv", color: "#4b5563", speed: 64, handling: 1.7, seats: 5, level: 2, note: "All-wheel drive, 230 kW, eight gears; heavy (2,150 kg), leans in corners." }),
  I("car.pickup", "vehicle", "Seed Ridge pickup", 600, "rare", "cars", { model: "pickup", color: "#7c2d12", speed: 53, handling: 1.6, seats: 2, level: 2, note: "Rear-wheel drive, 190 kW. Slides on gravel." }),
  I("car.supercar", "vehicle", "Vortex V12", 2400, "legendary", "special", { model: "supercar", color: "#b91c1c", speed: 94, handling: 2.3, seats: 2, level: 6, note: "560 kW, rear-wheel drive, downforce. Game numbers (a made-up car)." }),
  I("car.gt911", "vehicle", "Porsche 911 Carrera 4S", 2000, "legendary", "cars", { model: "gt911", color: "#9ca3af", speed: 85, handling: 2.3, seats: 2, level: 5, note: "Real 3D model (Lionsharp Studios, CC BY-SA 4.0). Real-world numbers: 331 kW, all-wheel drive, 8-speed, 1,565 kg, 306 km/h. The name and design belong to their maker." }),
  I("car.concept", "vehicle", "Darmstadt Concept", 1500, "epic", "cars", { model: "concept", color: "#9f1239", speed: 80, handling: 2.2, seats: 2, level: 4, note: "Real 3D model (Khronos glTF sample, CC BY 4.0) with a full interior. Game numbers: 260 kW, rear-wheel drive." }),
  I("car.f2", "vehicle", "Seed F2 single-seater", 3000, "legendary", "special", { model: "f2", color: "#1d4ed8", speed: 89, handling: 2.6, seats: 1, level: 7, note: "A Formula 2 style racing car (our own design): 455 kW, 795 kg, big downforce. Best on the Grand Prix circuit." }),

  // ---------------------------------------------------------------- pets (food, toys, things to wear, skins)
  I("food.fish", "petfood", "Fresh fish", 15, "common", "pets", { stack: true, model: "fish", effect: { hunger: 45, love: 10 } }),
  I("food.berries", "petfood", "Berry bowl", 12, "common", "pets", { stack: true, model: "berries", effect: { hunger: 30, health: 15 } }),
  I("food.smoothie", "petfood", "Energy smoothie", 18, "common", "pets", { stack: true, model: "smoothie", effect: { hunger: 15, energy: 50 } }),
  I("food.cake", "petfood", "Party cake", 30, "rare", "pets", { stack: true, model: "cake", effect: { hunger: 40, fun: 30, love: 20, health: -5 } }),
  I("food.salad", "petfood", "Veggie salad", 14, "common", "pets", { stack: true, model: "salad", effect: { hunger: 25, health: 30 } }),
  I("toy.ball", "pettoy", "Bouncy ball", 20, "common", "pets", { model: "ball", color: "#ef4444" }),
  I("toy.yarn", "pettoy", "Ball of yarn", 20, "common", "pets", { model: "yarn", color: "#a855f7" }),
  I("toy.frisbee", "pettoy", "Frisbee", 35, "rare", "pets", { model: "frisbee", color: "#f59e0b" }),
  I("petwear.collar", "petwear", "Collar with a bell", 25, "common", "pets", { model: "collar", color: "#dc2626" }),
  I("petwear.bandana", "petwear", "Bandana", 30, "common", "pets", { model: "bandana", color: "#2563eb" }),
  I("petwear.scarf", "petwear", "Winter scarf", 30, "common", "pets", { model: "scarf", color: "#16a34a" }),
  I("petwear.wings", "petwear", "Tiny wings", 160, "epic", "pets", { model: "wings", color: "#f8fafc" }),
  I("petskin.gold", "petskin", "Golden coat", 250, "epic", "pets", { color: "#facc15" }),
  I("petskin.galaxy", "petskin", "Galaxy coat", 400, "legendary", "special", { color: "#4c1d95", colors: ["#4c1d95", "#db2777", "#22d3ee"] }),
  I("petskin.snow", "petskin", "Snow coat", 120, "rare", "pets", { color: "#f8fafc" }),

  // ---------------------------------------------------------------- game skins (the corner shop)
  I("skin.snake.classic", "skin", "Snake: Nokia classic", 0, "common", "general", { model: "snake", colors: ["#43523d", "#c7f0d8"] }),
  I("skin.snake.green", "skin", "Snake: Garden", 0, "common", "general", { model: "snake", colors: ["#34a853", "#8ef5a8", "#0f1a14"] }),
  I("skin.snake.neon", "skin", "Snake: Neon", 40, "rare", "general", { model: "snake", colors: ["#22d3ee", "#f0abfc", "#0b0420"] }),
  I("skin.snake.sunset", "skin", "Snake: Sunset", 40, "rare", "general", { model: "snake", colors: ["#fb923c", "#f43f5e", "#1e1b4b"] }),
  I("skin.snake.rainbow", "skin", "Snake: Rainbow", 90, "epic", "general", { model: "snake", colors: ["rainbow", "#ffffff", "#111827"] }),
  I("skin.snake.gold", "skin", "Snake: Gold", 150, "legendary", "special", { model: "snake", colors: ["#eab308", "#fef08a", "#1c1917"] }),
  I("skin.2048.neon", "skin", "2048: Neon tiles", 40, "rare", "general", { model: "2048", colors: ["neon"] }),
  I("skin.2048.pastel", "skin", "2048: Pastel tiles", 30, "common", "general", { model: "2048", colors: ["pastel"] }),
  I("skin.cards.space", "skin", "Memory: Space cards", 30, "common", "general", { model: "memory", colors: ["#1e1b4b", "#a78bfa"] }),

  // ---------------------------------------------------------------- special
  I("special.trophy", "special", "Golden trophy", 500, "legendary", "special", { model: "trophy", color: "#eab308", note: "Shows next to your name in town." }),
  I("special.firework", "special", "Firework", 25, "rare", "general", { stack: true, model: "firework", note: "Light it in town for everyone to see." }),
];

export const SHOPS: Record<Shop, { label: string; keeper: string; line: string }> = {
  clothes: { label: "Threads", keeper: "Mika", line: "New looks every season. Try anything on!" },
  accessories: { label: "Shiny Things", keeper: "Rei", line: "A little sparkle goes a long way." },
  furniture: { label: "Nest Home", keeper: "Hana", line: "Make your place feel like home." },
  homes: { label: "Town Homes", keeper: "Mr. Abebe", line: "Looking for a bigger place? I have just the house." },
  cars: { label: "Aether Motors", keeper: "Kai", line: "Every car here drives off the lot today." },
  pets: { label: "Paws & Treats", keeper: "Selam", line: "Treats, toys and coats for your best friend." },
  general: { label: "Corner Shop", keeper: "Tomas", line: "Game skins, fireworks and little things." },
  special: { label: "Star Vault", keeper: "Luna", line: "Rare things for the very best of the team." },
};

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Common", color: "#94a3b8" },
  rare: { label: "Rare", color: "#3b82f6" },
  epic: { label: "Epic", color: "#a855f7" },
  legendary: { label: "Legendary", color: "#f59e0b" },
};

// Admin's changes to the shelves (cfg.funShop): a price or off for any item, and their own variants of an
// existing model in another colour.
export type ShopConfig = {
  items: Record<string, { price?: number; on?: boolean }>;
  custom: Item[];
};
export const DEFAULT_SHOP: ShopConfig = { items: {}, custom: [] };

export function mergedCatalog(cfg: ShopConfig | null | undefined): (Item & { on: boolean })[] {
  const c = cfg ?? DEFAULT_SHOP;
  const base = CATALOG.map((i) => ({ ...i, price: c.items[i.key]?.price ?? i.price, on: c.items[i.key]?.on ?? !i.limited }));
  const custom = (c.custom ?? []).map((i) => ({ ...i, custom: true, price: c.items[i.key]?.price ?? i.price, on: c.items[i.key]?.on ?? true }));
  return [...base, ...custom];
}

export const itemByKey = (key: string, cfg?: ShopConfig | null) => mergedCatalog(cfg).find((i) => i.key === key) ?? null;

// Free things everyone has without buying.
export const isFree = (i: Pick<Item, "price">) => i.price <= 0;

// Character design: an anime-style body (or the old blocky one), sliders for proportions, hair, eyes, an outfit
// and up to one accessory per slot. Colours are free.
export type Look = {
  // anime: a VRM character (base); chibi: the drawn figure built from shapes; blocky: the first, square style.
  style: "anime" | "chibi" | "blocky" | "realistic";
  base: string;
  tintHair: boolean;
  tintEyes: boolean;
  tintClothes: boolean;
  body: "slim" | "broad";
  skin: string;
  hair: string;
  hairStyle: string;
  eyes: string;
  eyeShape: "round" | "sharp" | "sleepy" | "sparkle";
  face: "smile" | "cool" | "wink" | "calm" | "grin" | "pout";
  outfit: string;
  shirt: string;
  pants: string;
  shoes: string;
  // Head slot (kept as "hat" so older looks still load): none or an accessory model.
  hat: string;
  acc: string[];
  height: number;
  head: number;
  arms: number;
  legs: number;
  shoulders: number;
};

export const DEFAULT_LOOK: Look = {
  style: "anime",
  base: "kai",
  tintHair: false,
  tintEyes: false,
  tintClothes: false,
  body: "slim",
  skin: "#f2c9a0",
  hair: "#2b1b0e",
  hairStyle: "short",
  eyes: "#3b82f6",
  eyeShape: "round",
  face: "smile",
  outfit: "hoodie",
  shirt: "#4f46e5",
  pants: "#1f2937",
  shoes: "#f8fafc",
  hat: "none",
  acc: [],
  height: 0,
  head: 0,
  arms: 0,
  legs: 0,
  shoulders: 0,
};

// Anime characters: VRM models in public/models/avatars (VRoid Project sample models released for free use and
// redistribution, Seed-san by VirtualCast under the VRM Public License, the twist sample by pixiv). Credits in
// public/models/CREDITS.txt.
export const PEOPLE_BASES = CATALOG.filter((i) => i.kind === "avatar" && i.realistic).map((i) => ({ key: i.model!, item: i.key, label: i.label, file: `/models/people/${i.model}.glb` }));
export const VRM_BASES = CATALOG.filter((i) => i.kind === "avatar" && !i.realistic).map((i) => ({ key: i.model!, item: i.key, label: i.label, file: `/models/avatars/${i.model}.vrm` }));
export const HAIR_STYLES = CATALOG.filter((i) => i.kind === "hair");
export const OUTFITS = CATALOG.filter((i) => i.kind === "outfit");
export const ACCESSORIES = CATALOG.filter((i) => i.kind === "acc");
export const HEAD_MODELS = ["none", ...ACCESSORIES.filter((a) => a.slot === "head").map((a) => a.model!)];

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, Math.round(v * 100) / 100)) : d);

// A look from anything (a saved row, a request): unknown values fall back to the defaults. Ownership of paid
// things is checked on the server, not here.
export function cleanLook(l: Partial<Look> | null | undefined): Look {
  const c = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  const hairs = HAIR_STYLES.map((h) => h.model!);
  const outfits = OUTFITS.map((o) => o.model!);
  const accModels = ACCESSORIES.filter((a) => a.slot !== "head").map((a) => a.key);
  // One accessory per slot.
  const slots = new Set<string>();
  const acc = (Array.isArray(l?.acc) ? l!.acc : [])
    .filter((k): k is string => typeof k === "string" && accModels.includes(k))
    .filter((k) => {
      const s = ACCESSORIES.find((a) => a.key === k)!.slot!;
      if (slots.has(s)) return false;
      slots.add(s);
      return true;
    });
  return {
    style: l?.style === "blocky" ? "blocky" : l?.style === "chibi" ? "chibi" : l?.style === "realistic" ? "realistic" : "anime",
    base: l?.style === "realistic" ? pick(l?.base, PEOPLE_BASES.map((p) => p.key), "rb_m01") : pick(l?.base, CATALOG.filter((i) => i.kind === "avatar" && !i.realistic).map((i) => i.model!), "kai"),
    tintHair: !!l?.tintHair,
    tintEyes: !!l?.tintEyes,
    tintClothes: !!l?.tintClothes,
    body: l?.body === "broad" ? "broad" : "slim",
    skin: c(l?.skin, DEFAULT_LOOK.skin),
    hair: c(l?.hair, DEFAULT_LOOK.hair),
    hairStyle: pick(l?.hairStyle, hairs, "short"),
    eyes: c(l?.eyes, DEFAULT_LOOK.eyes),
    eyeShape: pick(l?.eyeShape, ["round", "sharp", "sleepy", "sparkle"] as const, "round"),
    face: pick(l?.face, ["smile", "cool", "wink", "calm", "grin", "pout"] as const, "smile"),
    outfit: pick(l?.outfit, outfits, "hoodie"),
    shirt: c(l?.shirt, DEFAULT_LOOK.shirt),
    pants: c(l?.pants, DEFAULT_LOOK.pants),
    shoes: c(l?.shoes, DEFAULT_LOOK.shoes),
    hat: pick(l?.hat, HEAD_MODELS, "none"),
    acc,
    height: num(l?.height),
    head: num(l?.head),
    arms: num(l?.arms),
    legs: num(l?.legs),
    shoulders: num(l?.shoulders),
  };
}

// The catalog keys a look uses (for the ownership check).
export function lookItems(l: Look): string[] {
  const keys = [...l.acc];
  if (l.style === "anime" || l.style === "realistic") keys.push(`avatar.${l.base}`);
  const outfit = OUTFITS.find((o) => o.model === l.outfit);
  if (outfit) keys.push(outfit.key);
  const hair = HAIR_STYLES.find((h) => h.model === l.hairStyle);
  if (hair) keys.push(hair.key);
  const head = ACCESSORIES.find((a) => a.slot === "head" && a.model === l.hat);
  if (head) keys.push(head.key);
  return keys;
}

// A house: which home, its walls and floor, and the furniture placed in it (grid cells, rotation in quarter turns).
export type Placed = { key: string; x: number; z: number; r: number };
export type HomeLayout = { house: string; wall: string; floor: string; items: Placed[]; access: "everyone" | "invited" | "private"; guests: string[]; level: number };
export const DEFAULT_HOME: HomeLayout = { house: "house.cottage", wall: "#fef3c7", floor: "#d6a77a", items: [{ key: "furn.bed", x: 2, z: 2, r: 0 }, { key: "furn.table", x: 9, z: 6, r: 0 }, { key: "furn.chair", x: 7, z: 6, r: 1 }], access: "everyone", guests: [], level: 1 };

// A vehicle someone owns: its paint and how far it is upgraded (1 to 3: faster each level).
export type Ride = { paint?: string; rims?: string; level?: number };

// Coins for playing in town and in the games (on top of what work earns), within a daily cap Admin sets.
export const PLAY_REWARDS: Record<string, { label: string; per: number; max: number }> = {
  archery: { label: "Archery", per: 1, max: 15 },
  quest: { label: "A task for someone in town", per: 1, max: 20 },
  gp: { label: "Grand Prix", per: 5, max: 25 },
  strike: { label: "Seed Strike", per: 1, max: 20 },
  gallery: { label: "Target gallery", per: 1, max: 15 },
  hoops: { label: "Hoops", per: 2, max: 12 },
  parkour: { label: "Parkour course", per: 10, max: 10 },
  race: { label: "Race", per: 10, max: 15 },
  circuit: { label: "Seed Circuit", per: 5, max: 20 },
  penalty: { label: "Penalties", per: 2, max: 10 },
  fishing: { label: "Fishing", per: 3, max: 12 },
  gems: { label: "Gem hunt", per: 1, max: 15 },
  treasure: { label: "Treasure chest", per: 20, max: 20 },
  game: { label: "Mini-games", per: 2, max: 10 },
};
