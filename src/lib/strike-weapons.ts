// Seed Strike's weapons (made-up names), shared by the game and the server, which checks every online hit against
// these numbers (damage, rate of fire, range).
export type WeaponKey = "pistol" | "smg" | "rifle" | "shotgun" | "marksman";
export const WEAPONS: Record<WeaponKey, { label: string; dmg: number; rpm: number; mag: number; reload: number; spread: number; recoil: number; range: number; pellets: number; auto: boolean; zoom: number }> = {
  pistol: { label: "K9 pistol", dmg: 28, rpm: 320, mag: 12, reload: 1.4, spread: 0.012, recoil: 0.018, range: 60, pellets: 1, auto: false, zoom: 1.2 },
  smg: { label: "Viper SMG", dmg: 18, rpm: 850, mag: 30, reload: 1.9, spread: 0.03, recoil: 0.012, range: 45, pellets: 1, auto: true, zoom: 1.2 },
  rifle: { label: "SR-7 rifle", dmg: 26, rpm: 640, mag: 30, reload: 2.2, spread: 0.016, recoil: 0.016, range: 90, pellets: 1, auto: true, zoom: 1.5 },
  shotgun: { label: "Breacher shotgun", dmg: 12, rpm: 70, mag: 6, reload: 2.6, spread: 0.08, recoil: 0.06, range: 25, pellets: 8, auto: false, zoom: 1.1 },
  marksman: { label: "Longshot marksman", dmg: 70, rpm: 110, mag: 8, reload: 2.4, spread: 0.004, recoil: 0.05, range: 140, pellets: 1, auto: false, zoom: 3 },
};
