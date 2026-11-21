import * as THREE from "three";
import type { Physics } from "./engine";
import type { Interact } from "./city";
import { plain, surface } from "./pbr";
import { signPlane } from "./toon";

// Seed Arcade, on Studio Boulevard across from the studio lot: a hall of arcade cabinets, one per game. Each
// cabinet has side art in its colour, a lit marquee, a control panel with a stick and buttons, and a screen that
// plays a pixel animation (attract mode) until someone walks up and presses E to play. Guests start here.

export const ARCADE_HALL = { x0: -58, x1: -16, z0: 158, z1: 198, door: { x: -16, z: 178 } };
export const ARCADE_GAMES: { key: string; label: string; color: string; art: Art }[] = [
  { key: "snake", label: "SNAKE", color: "#16a34a", art: "snake" },
  { key: "2048", label: "2048", color: "#f59e0b", art: "blocks" },
  { key: "memory", label: "MEMORY", color: "#8b5cf6", art: "cards" },
  { key: "minesweeper", label: "MINES", color: "#64748b", art: "mines" },
  { key: "tictactoe", label: "X AND O", color: "#ef4444", art: "xo" },
  { key: "wordguess", label: "WORDS", color: "#0ea5e9", art: "text" },
  { key: "typing", label: "TYPE RACE", color: "#ec4899", art: "text" },
  { key: "reaction", label: "REFLEX", color: "#22c55e", art: "flash" },
  { key: "chess", label: "CHESS", color: "#a16207", art: "board" },
  { key: "sudoku", label: "SUDOKU", color: "#2563eb", art: "board" },
];
type Art = "snake" | "blocks" | "cards" | "mines" | "xo" | "text" | "flash" | "board";

// A screen: a 64 x 48 canvas drawn in steps (pixel art), scaled up without smoothing.
function screen(art: Art, label: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 48;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const snake: [number, number][] = Array.from({ length: 8 }, (_, i) => [10 - i, 20]);
  let dir: [number, number] = [1, 0];
  let food: [number, number] = [40, 20];
  let f = 0;
  const px = (x: number, y: number, col: string, s = 2) => ((g.fillStyle = col), g.fillRect(x, y, s, s));
  const draw = () => {
    f++;
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, 64, 48);
    if (art === "snake") {
      const [hx, hy] = snake[0]!;
      if (Math.abs(hx - food[0]) + Math.abs(hy - food[1]) < 2) food = [4 + ((f * 13) % 54), 6 + ((f * 7) % 34)];
      if (hx !== food[0]) dir = [Math.sign(food[0] - hx), 0];
      else dir = [0, Math.sign(food[1] - hy)];
      snake.unshift([hx + dir[0], hy + dir[1]]);
      snake.pop();
      for (const [x, y] of snake) px(x, y, color);
      px(food[0], food[1], "#ef4444");
    } else if (art === "blocks") {
      const cols = ["#f59e0b", "#fb923c", "#ef4444", "#facc15"];
      for (let i = 0; i < 16; i++) {
        const x = 8 + (i % 4) * 12, y = 4 + Math.floor(i / 4) * 10 + ((f + i * 3) % 24 < 2 ? 1 : 0);
        if ((i * 7 + Math.floor(f / 6)) % 3) (g.fillStyle = cols[(i + Math.floor(f / 10)) % 4]!), g.fillRect(x, y, 10, 8);
      }
    } else if (art === "cards") {
      for (let i = 0; i < 12; i++) {
        const open = (Math.floor(f / 8) + i) % 6 === 0;
        g.fillStyle = open ? "#fef3c7" : color;
        g.fillRect(4 + (i % 6) * 10, 8 + Math.floor(i / 6) * 16, 8, 12);
        if (open) px(7 + (i % 6) * 10, 13 + Math.floor(i / 6) * 16, "#7c3aed");
      }
    } else if (art === "mines") {
      for (let i = 0; i < 48; i++) {
        const x = 4 + (i % 8) * 7, y = 2 + Math.floor(i / 8) * 7;
        const open = (i * 11 + Math.floor(f / 3)) % 9 < 4;
        g.fillStyle = open ? "#cbd5e1" : "#475569";
        g.fillRect(x, y, 6, 6);
        if (open && i % 5 === 0) px(x + 2, y + 2, "#1d4ed8");
        if (!open && i % 13 === 0) px(x + 2, y + 2, "#ef4444");
      }
    } else if (art === "xo") {
      g.fillStyle = "#f8fafc";
      for (const k of [21, 42]) (g.fillRect(k, 4, 1, 40), g.fillRect(4, k - 4, 56, 1));
      for (let i = 0; i < 9; i++) {
        const v = (Math.floor(f / 10) + i * 5) % 7;
        const cx = 12 + (i % 3) * 20, cy = 8 + Math.floor(i / 3) * 14;
        if (v === 1) for (let k = -3; k <= 3; k++) (px(cx + k, cy + k, "#ef4444", 1), px(cx + k, cy - k, "#ef4444", 1));
        if (v === 2) for (let a = 0; a < 12; a++) px(Math.round(cx + Math.cos(a / 1.9) * 3), Math.round(cy + Math.sin(a / 1.9) * 3), "#38bdf8", 1);
      }
    } else if (art === "flash") {
      g.fillStyle = Math.floor(f / 12) % 2 ? "#16a34a" : "#b91c1c";
      g.fillRect(6, 6, 52, 36);
    } else if (art === "board") {
      for (let i = 0; i < 64; i++) (g.fillStyle = (i + Math.floor(i / 8)) % 2 ? color : "#e7e5e4"), g.fillRect(8 + (i % 8) * 6, 0 + Math.floor(i / 8) * 6, 6, 6);
      px(8 + ((Math.floor(f / 8) % 8) * 6) + 2, 2 + (Math.floor(f / 16) % 8) * 6, "#111827", 2);
    }
    if (art === "text" || f % 40 < 26) {
      g.fillStyle = art === "text" ? color : "#fde047";
      g.font = "bold 9px monospace";
      g.textAlign = "center";
      g.fillText(art === "text" ? label : "PRESS E", 32, art === "text" ? 26 : 45);
    }
    tex.needsUpdate = true;
  };
  draw();
  return { tex, draw };
}

// A cabinet: body, side art, a lit marquee, the screen, the control panel. Faces -x (the hall's centre) by default.
function cabinet(game: (typeof ARCADE_GAMES)[number]) {
  const g = new THREE.Group();
  const body = plain("#15121d", { rough: 0.5, metal: 0.2 });
  const side = plain(game.color, { rough: 0.45, emissive: game.color, emissiveIntensity: 0.25 });
  const part = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  part(body, 0.78, 1.0, 0.8, 0, 0.5, 0);
  part(body, 0.78, 0.95, 0.5, 0, 1.45, -0.15);
  for (const sx of [-0.4, 0.4]) part(side, 0.03, 1.95, 0.85, sx, 0.98, -0.02);
  // The control panel, tilted, with a stick and four buttons.
  part(plain("#24202f", { rough: 0.6 }), 0.76, 0.06, 0.32, 0, 1.03, 0.36, 0.35);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), plain("#111", { rough: 0.4 }));
  stick.position.set(-0.18, 1.12, 0.36);
  g.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), plain("#ef4444", { rough: 0.3 }));
  knob.position.set(-0.18, 1.18, 0.36);
  g.add(knob);
  ["#ef4444", "#facc15", "#22c55e", "#3b82f6"].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), plain(c, { rough: 0.3, emissive: c, emissiveIntensity: 0.4 }));
    b.position.set(0.04 + (i % 2) * 0.09, 1.09 + Math.floor(i / 2) * 0.02, 0.32 + Math.floor(i / 2) * 0.07);
    b.rotation.x = 0.35;
    g.add(b);
  });
  // The screen (pixel animation) behind a bezel, the marquee on top.
  const sc = screen(game.art, game.label, game.color);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: sc.tex, toneMapped: false }));
  scr.position.set(0, 1.5, 0.105);
  scr.rotation.x = -0.12;
  g.add(scr);
  const marquee = signPlane(game.label, 0.74, 0.2, "#0b0b12", game.color);
  marquee.position.set(0, 2.05, 0.11);
  g.add(marquee);
  part(body, 0.78, 0.08, 0.6, 0, 2.18, -0.05);
  return { group: g, draw: sc.draw };
}

export function buildArcadeHall(ph: Physics, interacts: Interact[]) {
  const group = new THREE.Group();
  group.name = "arcade-hall";
  const { x0, x1, z0, z1, door } = ARCADE_HALL;
  const H = 6;
  const wallM = surface("plaster", { tint: "#3b3150" });
  const floorM = surface("tiles", { tint: "#3c3a48" });
  const add = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  add(floorM, x1 - x0, 0.1, z1 - z0, cx, 0.05, cz);
  add(plain("#1d1828", { rough: 0.9 }), x1 - x0 + 0.6, 0.4, z1 - z0 + 0.6, cx, H + 0.2, cz);
  // Walls (the door on the boulevard side, glass on either side of it).
  add(wallM, x1 - x0, H, 0.4, cx, H / 2, z0);
  add(wallM, x1 - x0, H, 0.4, cx, H / 2, z1);
  add(wallM, 0.4, H, z1 - z0, x0, H / 2, cz);
  ph.sized(cx, H / 2, z0, x1 - x0, H, 0.4, "bldg");
  ph.sized(cx, H / 2, z1, x1 - x0, H, 0.4, "bldg");
  ph.sized(x0, H / 2, cz, 0.4, H, z1 - z0, "bldg");
  for (const [a, b] of [[z0, door.z - 2], [door.z + 2, z1]] as const) {
    add(wallM, 0.4, H, b - a, x1, H / 2, (a + b) / 2);
    ph.sized(x1, H / 2, (a + b) / 2, 0.4, H, b - a, "bldg");
  }
  add(wallM, 0.4, H - 3.2, 4, x1, 3.2 + (H - 3.2) / 2, door.z);
  // The sign over the door and neon strips along the walls.
  const sign = signPlane("SEED ARCADE", 10, 1.8, "#14091f", "#f0abfc");
  sign.position.set(x1 + 0.3, H + 1.2, door.z);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  for (const [w, x, z, c] of [[x1 - x0 - 1, cx, z0 + 0.25, "#ec4899"], [x1 - x0 - 1, cx, z1 - 0.25, "#22d3ee"]] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.06), plain(c, { rough: 0.3, emissive: c, emissiveIntensity: 3 }));
    strip.position.set(x, H - 0.6, z);
    group.add(strip);
  }
  // A light inside so the hall is lit day and night.
  const glow = new THREE.PointLight("#c4b5fd", 25, 40, 1.4);
  glow.position.set(cx, H - 1, cz);
  group.add(glow);
  // The prize counter at the back.
  add(plain("#2a2238", { rough: 0.6 }), 1.2, 1.1, 10, x0 + 1.4, 0.55, cz);
  ph.sized(x0 + 1.4, 0.55, cz, 1.2, 1.1, 10, "bldg");
  // Cabinets: two rows facing each other down the middle of the hall.
  const draws: (() => void)[] = [];
  ARCADE_GAMES.forEach((game, i) => {
    const row = i % 2, k = Math.floor(i / 2);
    const x = x0 + 8 + k * 6, z = row === 0 ? z0 + 2.2 : z1 - 2.2;
    const cab = cabinet(game);
    cab.group.position.set(x, 0, z);
    cab.group.rotation.y = row === 0 ? 0 : Math.PI;
    group.add(cab.group);
    draws.push(cab.draw);
    ph.sized(x, 1.1, z, 0.85, 2.2, 0.9, "bldg");
    interacts.push({ id: `arcade-${game.key}`, x, y: 0, z: row === 0 ? z + 1.3 : z - 1.3, r: 1.2, label: `Play ${game.label}`, kind: "arcade", data: { game: game.key } } as Interact);
  });
  // The screens animate a few times a second (pixel art moves in steps).
  let acc = 0;
  const update = (dt: number) => {
    acc += dt;
    if (acc < 0.12) return;
    acc = 0;
    for (const d of draws) d();
  };
  return { group, update, spawn: { x: x1 - 3, z: door.z, ry: -Math.PI / 2 } };
}
