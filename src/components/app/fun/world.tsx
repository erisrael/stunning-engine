"use client";

import * as React from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { HandIcon, Maximize2Icon, MessageCircleIcon, Minimize2Icon, PaletteIcon, SendIcon, UsersIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import type { Look, Resident, Status } from "@/server/fun-world";
import { useScores } from "./shell";

// Seed Town: a small 3D world (three.js). Department workspaces with a desk for each colleague, a row of homes, a
// plaza with gems to collect. Colleagues stand at their desk while working and at home when away, with their status
// and the day's progress over their head. People in the world walk, chat and wave together. Keyboard (WASD or
// arrows, Space to jump), mouse drag to look around, and on phones a joystick, a jump button and drag to look.

const STATUS: Record<Status, { label: string; color: string; emoji: string }> = {
  working: { label: "Working", color: "#22c55e", emoji: "💻" },
  idle: { label: "Idle", color: "#eab308", emoji: "💤" },
  break: { label: "On a break", color: "#38bdf8", emoji: "☕" },
  online: { label: "Online", color: "#22c55e", emoji: "🟢" },
  left: { label: "Gone home", color: "#94a3b8", emoji: "🏠" },
  leave: { label: "On leave", color: "#a855f7", emoji: "🧳" },
  absent: { label: "Absent", color: "#ef4444", emoji: "❗" },
  away: { label: "Away", color: "#94a3b8", emoji: "🌙" },
};
const AT_DESK: Status[] = ["working", "idle", "online"];
const DEPT_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171", "#84cc16", "#e879f9", "#2dd4bf", "#facc15"];

type Home = { look: Look; chat: boolean; name: string; residents: Resident[]; seesAbsence: boolean; departments: string[] };
type Live = [string, string, number, number, number, number, string, string, Look];

// ------------------------------------------------------------------------------------------------- building blocks

function label(text: string[], opts: { bar?: number; color?: string; bubble?: boolean } = {}) {
  const c = document.createElement("canvas");
  const w = 512, h = opts.bubble ? 160 : 150;
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  if (opts.bubble) {
    g.fillStyle = "rgba(255,255,255,.95)";
    g.strokeStyle = "#111";
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 40, 26);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 18, h - 33);
    g.lineTo(w / 2, h - 8);
    g.lineTo(w / 2 + 18, h - 33);
    g.fill();
    g.fillStyle = "#111";
    g.font = "bold 34px system-ui, sans-serif";
    const t = text[0]!.length > 46 ? `${text[0]!.slice(0, 44)}…` : text[0]!;
    const lines = t.length > 23 ? [t.slice(0, t.lastIndexOf(" ", 23) > 5 ? t.lastIndexOf(" ", 23) : 23), t.slice(t.lastIndexOf(" ", 23) > 5 ? t.lastIndexOf(" ", 23) + 1 : 23)] : [t];
    lines.forEach((l, i) => g.fillText(l, w / 2, 60 + i * 40 - (lines.length - 1) * 16));
  } else {
    g.fillStyle = "rgba(15,23,42,.72)";
    g.beginPath();
    g.roundRect(56, 4, w - 112, opts.bar !== undefined ? 112 : 64, 18);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 36px system-ui, sans-serif";
    g.fillText(text[0]!, w / 2, 46);
    if (text[1]) {
      g.font = "28px system-ui, sans-serif";
      g.fillStyle = opts.color ?? "#e2e8f0";
      g.fillText(text[1], w / 2, 82);
    }
    if (opts.bar !== undefined) {
      g.fillStyle = "rgba(255,255,255,.25)";
      g.fillRect(96, 94, w - 192, 12);
      g.fillStyle = opts.bar >= 60 ? "#22c55e" : opts.bar >= 25 ? "#eab308" : "#ef4444";
      g.fillRect(96, 94, ((w - 192) * Math.max(4, opts.bar)) / 100, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(3.2, (3.2 * h) / w, 1);
  return s;
}

function faceTexture(look: Look) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = look.skin;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#111";
  if (look.face === "cool") g.fillRect(12, 22, 40, 9);
  else {
    g.fillRect(18, 22, 7, look.face === "wink" ? 3 : 8);
    g.fillRect(39, 22, 7, look.face === "calm" ? 3 : 8);
  }
  g.lineWidth = 3;
  g.strokeStyle = "#111";
  g.beginPath();
  if (look.face === "calm") (g.moveTo(24, 44), g.lineTo(40, 44));
  else g.arc(32, 38, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// A blocky character: head, body, arms, legs and a hat, in the person's colours.
function character(look: Look) {
  const root = new THREE.Group();
  const m = (color: string) => new THREE.MeshLambertMaterial({ color });
  const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], y: number, x = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, y, 0);
    root.add(b);
    return b;
  };
  const skin = m(look.skin);
  const legL = box(0.42, 0.9, 0.42, m(look.pants), 0.45, -0.24);
  const legR = box(0.42, 0.9, 0.42, m(look.pants), 0.45, 0.24);
  box(1, 1, 0.55, m(look.shirt), 1.4);
  const armL = box(0.34, 0.95, 0.34, skin, 1.4, -0.68);
  const armR = box(0.34, 0.95, 0.34, skin, 1.4, 0.68);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(look) });
  box(0.8, 0.8, 0.8, [skin, skin, m(look.hair), skin, faceMat, skin], 2.3);
  if (look.hat === "cap") (box(0.86, 0.22, 0.86, m(look.shirt), 2.78), box(0.6, 0.08, 0.4, m(look.shirt), 2.7).position.set(0, 2.7, 0.55));
  else if (look.hat === "beanie") box(0.86, 0.36, 0.86, m("#ef4444"), 2.82);
  else if (look.hat === "crown") {
    box(0.84, 0.24, 0.84, m("#facc15"), 2.82);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) box(0.16, 0.22, 0.16, m("#facc15"), 3.02).position.set(x!, 3.02, z!);
  } else if (look.hat === "halo") {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: "#fde047" }));
    h.rotation.x = Math.PI / 2;
    h.position.y = 3.05;
    root.add(h);
  } else if (look.hat === "horns") for (const x of [-0.3, 0.3]) box(0.14, 0.3, 0.14, m("#dc2626"), 2.85, x);
  else box(0.84, 0.16, 0.84, m(look.hair), 2.76);
  root.userData = { legL, legR, armL, armR };
  return root;
}

function animate(ch: THREE.Group, t: number, moving: boolean, emote: string) {
  const { legL, legR, armL, armR } = ch.userData as Record<string, THREE.Mesh>;
  const s = moving ? Math.sin(t * 10) * 0.6 : 0;
  legL!.rotation.x = s;
  legR!.rotation.x = -s;
  armL!.rotation.x = -s;
  armR!.rotation.x = s;
  armL!.rotation.z = 0;
  armR!.rotation.z = 0;
  if (emote === "wave") armR!.rotation.z = 2.6 + Math.sin(t * 12) * 0.4;
  if (emote === "cheer") (armL!.rotation.z = -2.8), (armR!.rotation.z = 2.8);
  if (emote === "dance") (armL!.rotation.z = -1.4 + Math.sin(t * 8)), (armR!.rotation.z = 1.4 + Math.sin(t * 8)), (ch.rotation.y += 0.08);
}

// ------------------------------------------------------------------------------------------------- the world

export function SeedTown({ big = false }: { big?: boolean }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [home, setHome] = React.useState<Home | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [card, setCard] = React.useState<Resident | null>(null);
  const [people, setPeople] = React.useState(false);
  const [dress, setDress] = React.useState(false);
  const [say, setSay] = React.useState("");
  const [full, setFull] = React.useState(false);
  const [gems, setGems] = React.useState(0);
  const [online, setOnline] = React.useState(0);
  const api = React.useRef<{ say: (t: string) => void; emote: (e: string) => void; restyle: (l: Look) => void; goTo: (id: string) => void; joy: (x: number, y: number) => void; jump: () => void; look: (dx: number, dy: number) => void } | null>(null);
  const { best, report } = useScores("world");
  // The saved look, kept out of state so saving it never rebuilds the world.
  const lookRef = React.useRef<Look | null>(null);

  React.useEffect(() => {
    void F.worldHomeAction().then((r) => (r.ok && r.data ? setHome(r.data as Home) : setError(r.ok ? "Seed Town is not available." : (r.error ?? "Could not open Seed Town."))));
  }, []);

  React.useEffect(() => {
    const el = box.current;
    if (!el || !home) return;
    const W = () => el.clientWidth, H = () => el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(W(), H());
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#bfe3ff");
    scene.fog = new THREE.Fog("#bfe3ff", 60, 140);
    const camera = new THREE.PerspectiveCamera(60, W() / H(), 0.1, 300);
    scene.add(new THREE.HemisphereLight("#ffffff", "#7ca06a", 1.1));
    const sun = new THREE.DirectionalLight("#ffffff", 1.2);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat("#86c96b"));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(12, 40), mat("#d6d3d1"));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    scene.add(plaza);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 80), mat("#e7e5e4"));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.015, 0);
    scene.add(path);
    const sign = label([home.name, "Workspaces ↑   Homes ↓"]);
    sign.position.set(0, 4.5, 0);
    scene.add(sign);
    // A fountain in the plaza.
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 24), mat("#a8a29e"));
    fountain.position.set(0, 0.4, 0);
    scene.add(fountain);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 24), new THREE.MeshLambertMaterial({ color: "#38bdf8", transparent: true, opacity: 0.85 }));
    water.position.set(0, 0.82, 0);
    scene.add(water);
    // Trees.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, r = 70 + (i % 5) * 6;
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.6), mat("#78350f"));
      trunk.position.set(Math.cos(a) * r, 1, Math.sin(a) * r);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), mat(i % 3 ? "#15803d" : "#16a34a"));
      top.position.set(Math.cos(a) * r, 3.2, Math.sin(a) * r);
      scene.add(trunk, top);
    }

    // Department workspaces in a row to the north; a desk for each colleague.
    const depts = home.departments.length ? home.departments : ["Team"];
    const deskSpot = new Map<string, THREE.Vector3>();
    const zoneW = 14;
    depts.forEach((d, i) => {
      const x0 = (i - (depts.length - 1) / 2) * (zoneW + 2);
      const color = DEPT_COLORS[i % DEPT_COLORS.length]!;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(zoneW, 0.2, 12), mat(color));
      floor.position.set(x0, 0.1, -30);
      scene.add(floor);
      for (const [w, dpt, x, z] of [[zoneW, 0.3, x0, -36], [0.3, 12, x0 - zoneW / 2, -30], [0.3, 12, x0 + zoneW / 2, -30]] as const) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2, dpt), mat("#f8fafc"));
        wall.position.set(x, 1, z);
        scene.add(wall);
      }
      const l = label([d, "Workspace"]);
      l.position.set(x0, 5, -36);
      scene.add(l);
      const team = home.residents.filter((r) => r.dept === d);
      team.forEach((r, k) => {
        const dx = x0 - zoneW / 2 + 2.2 + (k % 5) * 2.4, dz = -33 + Math.floor(k / 5) * 3;
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1), mat("#a16207"));
        desk.position.set(dx, 0.65, dz);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.08), new THREE.MeshBasicMaterial({ color: AT_DESK.includes(r.status) ? "#38bdf8" : "#1f2937" }));
        screen.position.set(dx, 1.45, dz - 0.3);
        scene.add(desk, screen);
        deskSpot.set(r.id, new THREE.Vector3(dx, 0, dz + 1.1));
      });
    });

    // Homes in rows to the south.
    const homeSpot = new Map<string, THREE.Vector3>();
    home.residents.slice(0, 60).forEach((r, i) => {
      const col = i % 10, row = Math.floor(i / 10);
      const hx = (col - 4.5) * 9, hz = 30 + row * 10;
      const color = DEPT_COLORS[(i * 7) % DEPT_COLORS.length]!;
      const house = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 4.4), mat("#fef3c7"));
      house.position.set(hx, 1.7, hz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 2.2, 4), mat(color));
      roof.position.set(hx, 4.5, hz);
      roof.rotation.y = Math.PI / 4;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), mat("#7c2d12"));
      door.position.set(hx, 0.95, hz - 2.25);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: ["left", "away", "leave"].includes(r.status) ? "#fde68a" : "#334155" }));
      lamp.position.set(hx + 1.6, 2.2, hz - 2.25);
      scene.add(house, roof, door, lamp);
      const n = label([r.name.split(" ")[0]!]);
      n.scale.multiplyScalar(0.8);
      n.position.set(hx, 6.4, hz);
      scene.add(n);
      homeSpot.set(r.id, new THREE.Vector3(hx + 2.8, 0, hz - 2.6));
    });

    // Gems to collect in the plaza and around it.
    const gemMat = new THREE.MeshLambertMaterial({ color: "#a855f7", emissive: "#6d28d9" });
    const gemList: THREE.Mesh[] = [];
    const placeGem = (g: THREE.Mesh) => {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 22;
      g.position.set(Math.cos(a) * r, 1, Math.sin(a) * r);
      g.visible = true;
    };
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), gemMat);
      placeGem(g);
      scene.add(g);
      gemList.push(g);
    }

    // Colleagues where they are now.
    type Avatar = { id: string; obj: THREE.Group; tag: THREE.Sprite; bubble: THREE.Sprite | null; bubbleText: string; target: THREE.Vector3; ry: number; moving: boolean; emote: string; resident?: Resident; live: boolean };
    const avatars = new Map<string, Avatar>();
    const tagFor = (r: Resident | null, name: string) => (r ? label([name, `${STATUS[r.status].emoji} ${STATUS[r.status].label}`], { bar: r.progress, color: STATUS[r.status].color }) : label([name, "In town"], { color: "#86efac" }));
    const addAvatar = (id: string, name: string, look: Look, at: THREE.Vector3, r: Resident | null, live: boolean) => {
      const obj = character(look);
      obj.position.copy(at);
      const tag = tagFor(r, name);
      tag.position.set(0, 3.9, 0);
      obj.add(tag);
      if (r && (r.status === "absent" || r.status === "leave")) obj.traverse((o) => o instanceof THREE.Mesh && ((o.material as THREE.MeshLambertMaterial).transparent = true, ((o.material as THREE.MeshLambertMaterial).opacity = 0.45)));
      obj.userData.id = id;
      scene.add(obj);
      const a: Avatar = { id, obj, tag, bubble: null, bubbleText: "", target: at.clone(), ry: 0, moving: false, emote: "", resident: r ?? undefined, live };
      avatars.set(id, a);
      return a;
    };
    const residentById = new Map(home.residents.map((r) => [r.id, r]));
    const spotOf = (r: Resident) => (AT_DESK.includes(r.status) ? deskSpot.get(r.id) : r.status === "break" ? new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16) : homeSpot.get(r.id)) ?? new THREE.Vector3((Math.random() - 0.5) * 20, 0, 14);
    for (const r of home.residents) if (!r.me) addAvatar(r.id, r.name, r.look, spotOf(r), r, false);

    // Me.
    const meR = home.residents.find((r) => r.me) ?? null;
    let myLook = home.look;
    let me = addAvatar("me", "You", myLook, new THREE.Vector3(0, 0, 8), meR, true);
    // My position lives on its own, so a new look (a new character) keeps where I am.
    const pos = new THREE.Vector3(0, 0, 8);
    let vy = 0, heading = Math.PI, yaw = Math.PI, pitch = 0.45, myEmote = "", emoteUntil = 0;
    const keys = new Set<string>();
    const joy = { x: 0, y: 0 };

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
        if (e.type === "keydown") keys.add(k);
        else keys.delete(k);
      }
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    el.tabIndex = 0;

    // Drag to look around; tap an avatar to see who it is.
    let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
    const ray = new THREE.Raycaster();
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== renderer.domElement) return;
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      el.focus();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      yaw -= dx * 0.008;
      pitch = Math.max(0.1, Math.min(1.2, pitch + dy * 0.005));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        const rect = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = ray.intersectObjects([...avatars.values()].filter((a) => a.id !== "me").map((a) => a.obj), true)[0];
        let o: THREE.Object3D | null = hit?.object ?? null;
        while (o && !o.userData.id) o = o.parent;
        const id = o?.userData.id as string | undefined;
        const r = id ? residentById.get(id) : null;
        if (r) setCard(r);
        else if (id) setCard({ id, name: avatars.get(id)?.tag ? (o?.userData.name ?? "Someone") : "Someone", dept: "", status: "online", progress: 0, look: myLook, me: false });
      }
      drag = null;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const setBubble = (a: Avatar, text: string) => {
      if (a.bubbleText === text) return;
      if (a.bubble) (a.obj.remove(a.bubble), a.bubble.material.map?.dispose(), a.bubble.material.dispose());
      a.bubble = null;
      a.bubbleText = text;
      if (text) {
        a.bubble = label([text], { bubble: true });
        a.bubble.position.set(0, 5.4, 0);
        a.obj.add(a.bubble);
      }
    };
    let mySay = "", mySayAt = 0;
    api.current = {
      say: (t) => {
        mySay = t;
        mySayAt = Date.now();
        setBubble(me, t);
        void fetch("/api/fun/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: pos.x, z: pos.z, ry: heading, say: t }) }).then(async (r) => !r.ok && toast.error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Not sent."));
      },
      emote: (e) => {
        myEmote = e;
        emoteUntil = Date.now() + 3000;
        if (e === "jump" && pos.y <= 0.001) vy = 9;
        void fetch("/api/fun/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: pos.x, z: pos.z, ry: heading, emote: e }) });
      },
      restyle: (l) => {
        myLook = l;
        scene.remove(me.obj);
        avatars.delete("me");
        me = addAvatar("me", "You", l, pos.clone(), meR, true);
      },
      goTo: (id) => {
        const a = avatars.get(id);
        if (a) (pos.copy(a.obj.position).add(new THREE.Vector3(0, 0, 3)), (yaw = Math.PI));
      },
      joy: (x, y) => ((joy.x = x), (joy.y = y)),
      jump: () => {
        if (pos.y <= 0.001) vy = 9;
      },
      look: (dx, dy) => ((yaw -= dx * 0.01), (pitch = Math.max(0.1, Math.min(1.2, pitch + dy * 0.006)))),
    };

    // Talking with the world: my position out, everyone in town back, five times a second.
    let stop = false;
    let sending = false;
    const syncNow = async () => {
      if (stop || sending || document.visibilityState !== "visible") return;
      sending = true;
      try {
        const r = await fetch("/api/fun/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: Math.round(pos.x * 100) / 100, z: Math.round(pos.z * 100) / 100, ry: Math.round(heading * 100) / 100, mv: keys.size || joy.x || joy.y ? 1 : 0 }) });
        if (r.ok) {
          const d = (await r.json()) as { p: Live[] };
          const seen = new Set<string>();
          for (const [id, name, x, z, ry, mv, sayText, emote, look] of d.p) {
            seen.add(id);
            let a = avatars.get(id);
            const res = residentById.get(id) ?? null;
            if (!a || !a.live) {
              if (a) (scene.remove(a.obj), avatars.delete(id));
              a = addAvatar(id, name, look, new THREE.Vector3(x, 0, z), res, true);
              a.obj.userData.name = name;
            }
            a.target.set(x, 0, z);
            a.ry = ry;
            a.moving = !!mv;
            a.emote = emote;
            setBubble(a, sayText);
          }
          // Someone who left town goes back to their desk or home.
          for (const a of [...avatars.values()]) if (a.live && a.id !== "me" && !seen.has(a.id)) {
            scene.remove(a.obj);
            avatars.delete(a.id);
            const res = residentById.get(a.id);
            if (res) addAvatar(res.id, res.name, res.look, spotOf(res), res, false);
          }
          setOnline(d.p.length + 1);
        }
      } catch {}
      sending = false;
    };
    const syncTimer = window.setInterval(() => void syncNow(), 200);
    // The roster (who is working, progress) every half minute.
    const rosterTimer = window.setInterval(async () => {
      const r = await F.worldRosterAction();
      if (!r.ok || !r.data) return;
      for (const res of r.data.residents) {
        residentById.set(res.id, res);
        const a = avatars.get(res.me ? "me" : res.id);
        if (!a) continue;
        a.obj.remove(a.tag);
        a.tag.material.map?.dispose();
        a.tag = tagFor(res, res.me ? "You" : res.name);
        a.tag.position.set(0, 3.9, 0);
        a.obj.add(a.tag);
        if (!a.live) a.target.copy(spotOf(res));
      }
    }, 30000);

    let collected = 0;
    const clock = new THREE.Clock();
    let raf = 0;
    const tmp = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      // Walking: keys or the joystick, relative to where the camera looks.
      let fx = 0, fz = 0;
      if (keys.has("w") || keys.has("arrowup")) fz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) fz += 1;
      if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
      if (keys.has("d") || keys.has("arrowright")) fx += 1;
      fx += joy.x;
      fz += joy.y;
      if (keys.has(" ") && pos.y <= 0.001) vy = 9;
      const len = Math.hypot(fx, fz);
      const moving = len > 0.1;
      if (moving) {
        const sx = fx / Math.max(1, len), sz = fz / Math.max(1, len);
        const dir = new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw - Math.PI);
        pos.addScaledVector(dir, 9 * dt);
        heading = Math.atan2(dir.x, dir.z);
        pos.x = Math.max(-110, Math.min(110, pos.x));
        pos.z = Math.max(-110, Math.min(110, pos.z));
      }
      vy -= 25 * dt;
      pos.y = Math.max(0, pos.y + vy * dt);
      if (pos.y === 0) vy = Math.max(vy, 0);
      me.obj.position.copy(pos);
      me.obj.rotation.y = heading;
      animate(me.obj, t, moving, Date.now() < emoteUntil ? myEmote : "");
      if (mySay && Date.now() - mySayAt > 7000) (mySay = ""), setBubble(me, "");
      // Gems.
      for (const g of gemList) {
        g.rotation.y += dt * 2;
        g.position.y = 1 + Math.sin(t * 2 + g.position.x) * 0.2;
        if (g.visible && g.position.distanceTo(tmp.set(pos.x, 1, pos.z)) < 1.3) {
          g.visible = false;
          collected++;
          setGems(collected);
          window.setTimeout(() => placeGem(g), 6000);
        }
      }
      // Everyone else glides to where they are.
      for (const a of avatars.values()) {
        if (a.id === "me") continue;
        const d = a.obj.position.distanceTo(a.target);
        if (d > 0.05) {
          const step = Math.min(d, (a.live ? 12 : 4) * dt);
          tmp.subVectors(a.target, a.obj.position).normalize();
          a.obj.position.addScaledVector(tmp, step);
          if (!a.live) a.obj.rotation.y = Math.atan2(tmp.x, tmp.z);
        }
        if (a.live) a.obj.rotation.y = a.ry;
        animate(a.obj, t, a.live ? a.moving : d > 0.05, a.emote);
      }
      water.rotation.y += dt * 0.3;
      // The camera behind me.
      const cd = 11;
      camera.position.set(pos.x + Math.sin(yaw) * cd * Math.cos(pitch), pos.y + 2 + Math.sin(pitch) * cd, pos.z + Math.cos(yaw) * cd * Math.cos(pitch));
      camera.lookAt(pos.x, pos.y + 2, pos.z);
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(W(), H());
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      stop = true;
      if (collected) void report(collected);
      cancelAnimationFrame(raf);
      window.clearInterval(syncTimer);
      window.clearInterval(rosterTimer);
      ro.disconnect();
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry?.dispose();
          // A head has one material per side: dispose each one and its picture.
          for (const m of ([] as (THREE.Material & { map?: THREE.Texture | null })[]).concat(o.material as never)) {
            m.map?.dispose?.();
            m.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  React.useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  if (error) return <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>;
  if (!home) return <p className="py-8 text-center text-sm text-muted-foreground">Building {"Seed Town"}…</p>;
  const counts = home.residents.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  return (
    <div className={cn("space-y-2", full && "bg-background")} data-game="world">
      <div className={cn("relative overflow-hidden rounded-xl border bg-[#bfe3ff] outline-none", big ? "h-[70vh]" : "h-[420px]", full && "h-screen rounded-none")} id="seed-town">
        <div ref={box} className="absolute inset-0" aria-label="Seed Town: walk with WASD or the arrow keys, Space to jump, drag to look around" data-world-canvas />
        {/* Top bar: who is here, gems, people, dress up, full screen. */}
        <div className="pointer-events-none absolute top-2 right-2 left-2 flex items-start justify-between gap-2 text-xs">
          <span className="pointer-events-auto rounded-full bg-black/55 px-2.5 py-1 font-medium text-white">🟢 {online} in town · 💎 {gems}</span>
          <span className="pointer-events-auto flex gap-1">
            <Button size="icon" variant="secondary" className="size-8 rounded-full bg-white/85" aria-label="People" title="Who is where" onClick={() => setPeople(!people)} data-world-people>
              <UsersIcon />
            </Button>
            <Button size="icon" variant="secondary" className="size-8 rounded-full bg-white/85" aria-label="Customize my character" title="Customize my character" onClick={() => setDress(true)} data-world-dress>
              <PaletteIcon />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-8 rounded-full bg-white/85"
              aria-label={full ? "Leave full screen" : "Full screen"}
              onClick={() => (full ? void document.exitFullscreen() : void document.getElementById("seed-town")?.requestFullscreen?.())}
            >
              {full ? <Minimize2Icon /> : <Maximize2Icon />}
            </Button>
          </span>
        </div>
        {/* Emotes. */}
        <div className="absolute right-2 bottom-24 flex flex-col gap-1 sm:bottom-2">
          {[["wave", "👋"], ["cheer", "🙌"], ["dance", "💃"], ["jump", "⬆️"]].map(([k, e]) => (
            <button key={k} type="button" onClick={() => api.current?.emote(k!)} className="size-9 rounded-full bg-white/85 text-lg shadow" aria-label={k} data-emote={k}>
              {e}
            </button>
          ))}
        </div>
        <TouchControls api={api} />
        {people && (
          <div className="absolute top-12 right-2 bottom-2 w-60 overflow-y-auto rounded-lg bg-background/95 p-2 text-xs shadow-lg" data-world-panel>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-semibold">Who is where</p>
              <button type="button" aria-label="Close" onClick={() => setPeople(false)}><XIcon className="size-4" /></button>
            </div>
            <p className="mb-2 text-muted-foreground">{Object.entries(counts).map(([k, n]) => `${STATUS[k as Status].emoji} ${n} ${STATUS[k as Status].label.toLowerCase()}`).join(" · ")}</p>
            {(["working", "online", "idle", "break", ...(home.seesAbsence ? (["absent", "leave"] as Status[]) : []), "left", "away"] as Status[]).map((st) => {
              const list = home.residents.filter((r) => r.status === st);
              if (!list.length) return null;
              return (
                <div key={st} className="mb-2">
                  <p className="font-medium" style={{ color: STATUS[st].color }}>{STATUS[st].emoji} {STATUS[st].label} ({list.length})</p>
                  {list.map((r) => (
                    <button key={r.id} type="button" className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted" onClick={() => (api.current?.goTo(r.id), setCard(r))}>
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-muted-foreground">{r.progress}%</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {card && (
          <div className="absolute bottom-2 left-1/2 w-64 -translate-x-1/2 rounded-xl bg-background/95 p-3 text-sm shadow-lg" data-world-card>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{card.name}</p>
                <p className="text-xs text-muted-foreground">{card.dept}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setCard(null)}><XIcon className="size-4" /></button>
            </div>
            <p className="mt-1 text-xs" style={{ color: STATUS[card.status].color }}>{STATUS[card.status].emoji} {STATUS[card.status].label}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${card.progress}%` }} /></div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Today&apos;s progress {card.progress}%</p>
            <div className="mt-2 flex gap-1">
              <Button size="xs" variant="outline" onClick={() => api.current?.emote("wave")}><HandIcon /> Wave</Button>
              <Button size="xs" variant="outline" asChild><a href="/chat"><MessageCircleIcon /> Message</a></Button>
            </div>
          </div>
        )}
        {dress && <DressUp look={lookRef.current ?? home.look} onClose={() => setDress(false)} onSaved={(l) => ((lookRef.current = l), api.current?.restyle(l))} />}
      </div>
      {home.chat && (
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (say.trim()) (api.current?.say(say.trim()), setSay("")); }}>
          <Input value={say} onChange={(e) => setSay(e.target.value)} maxLength={120} placeholder="Say something to everyone nearby" aria-label="Say something" className="h-9" data-world-say />
          <Button size="sm" type="submit" aria-label="Say"><SendIcon /></Button>
        </form>
      )}
      <p className="text-[11px] text-muted-foreground">
        Walk: WASD or arrows (joystick on phones) · Jump: Space · Look: drag · Tap someone to see them · Collect 💎 in the plaza. Workspaces are north, homes south.
      </p>
      {best?.mine ? <p className="text-[11px] text-muted-foreground">Your best: {best.mine} gems in one visit.</p> : null}
    </div>
  );
}

// Phones and tablets: a joystick on the left, a jump button, and dragging anywhere else turns the camera.
function TouchControls({ api }: { api: React.RefObject<{ joy: (x: number, y: number) => void; jump: () => void } | null> }) {
  const [knob, setKnob] = React.useState<{ x: number; y: number } | null>(null);
  const base = React.useRef<HTMLDivElement>(null);
  const id = React.useRef<number | null>(null);
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    setKnob({ x, y });
    api.current?.joy(x, y);
  };
  return (
    <>
      <div
        ref={base}
        className="absolute bottom-4 left-4 size-28 touch-none rounded-full border-2 border-white/70 bg-black/20 sm:hidden"
        onPointerDown={(e) => ((id.current = e.pointerId), e.currentTarget.setPointerCapture(e.pointerId), set(e))}
        onPointerMove={(e) => id.current === e.pointerId && set(e)}
        onPointerUp={() => ((id.current = null), setKnob(null), api.current?.joy(0, 0))}
        onPointerCancel={() => ((id.current = null), setKnob(null), api.current?.joy(0, 0))}
        aria-label="Move"
        data-world-joystick
      >
        <span className="absolute size-12 rounded-full bg-white/85 shadow" style={{ left: `calc(50% - 1.5rem + ${(knob?.x ?? 0) * 2.2}rem)`, top: `calc(50% - 1.5rem + ${(knob?.y ?? 0) * 2.2}rem)` }} />
      </div>
      <button type="button" className="absolute right-14 bottom-6 size-14 rounded-full bg-white/85 text-xl font-bold shadow sm:hidden" onPointerDown={() => api.current?.jump()} aria-label="Jump">
        ⤒
      </button>
    </>
  );
}

const HATS: [Look["hat"], string][] = [["none", "Hair"], ["cap", "🧢 Cap"], ["beanie", "🧶 Beanie"], ["crown", "👑 Crown"], ["halo", "😇 Halo"], ["horns", "😈 Horns"]];
const FACES: [Look["face"], string][] = [["smile", "🙂"], ["cool", "😎"], ["wink", "😉"], ["calm", "😐"]];
const SKINS = ["#f9d7b5", "#f2c9a0", "#d9a07a", "#b97d55", "#8d5a3b", "#5c3a26"];

function DressUp({ look, onClose, onSaved }: { look: Look; onClose: () => void; onSaved: (l: Look) => void }) {
  const [l, setL] = React.useState(look);
  const [busy, setBusy] = React.useState(false);
  const color = (k: "shirt" | "pants" | "hair", label: string) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <input type="color" value={l[k]} onChange={(e) => setL({ ...l, [k]: e.target.value })} aria-label={label} className="h-7 w-12 cursor-pointer rounded border" />
    </label>
  );
  return (
    <div className="absolute inset-2 overflow-y-auto rounded-xl bg-background/97 p-3 text-sm shadow-xl" data-world-dressup>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold">Your character</p>
        <button type="button" aria-label="Close" onClick={onClose}><XIcon className="size-4" /></button>
      </div>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs">Skin</p>
          <div className="flex gap-1">{SKINS.map((s) => <button key={s} type="button" aria-label={`Skin ${s}`} onClick={() => setL({ ...l, skin: s })} className={cn("size-7 rounded-full border-2", l.skin === s ? "border-primary" : "border-transparent")} style={{ background: s }} />)}</div>
        </div>
        {color("shirt", "Shirt")}
        {color("pants", "Trousers")}
        {color("hair", "Hair")}
        <div>
          <p className="mb-1 text-xs">On the head</p>
          <div className="flex flex-wrap gap-1">{HATS.map(([k, t]) => <button key={k} type="button" onClick={() => setL({ ...l, hat: k })} className={cn("rounded-full border px-2 py-0.5 text-xs", l.hat === k && "border-primary bg-primary/10")}>{t}</button>)}</div>
        </div>
        <div>
          <p className="mb-1 text-xs">Face</p>
          <div className="flex gap-1">{FACES.map(([k, t]) => <button key={k} type="button" onClick={() => setL({ ...l, face: k })} className={cn("rounded-full border px-2 py-0.5 text-lg", l.face === k && "border-primary bg-primary/10")} aria-label={k}>{t}</button>)}</div>
        </div>
      </div>
      <Button
        className="mt-3 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await F.saveLookAction(l);
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          onSaved(r.data!);
          onClose();
          toast.success("Looking good!");
        }}
        data-world-save-look
      >
        Save my look
      </Button>
    </div>
  );
}
