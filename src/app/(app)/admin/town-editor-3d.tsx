"use client";

import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergedCatalog } from "@/lib/fun-catalog";
import { buildCity } from "@/components/app/fun/world/city";
import { Physics } from "@/components/app/fun/world/engine";
import { prop } from "@/components/app/fun/world/models";
import { placeModels } from "@/components/app/fun/world/town";
import { signPlane, textSprite, TOON } from "@/components/app/fun/world/toon";

// The town editor's 3D view: Seed Town as people see it, with Admin's additions on top. Drag to turn, right-drag to
// move, wheel to zoom; click the ground to place the chosen thing, click a thing to select it.

export type EditorProp = { id: string; kind: string; x: number; z: number; r: number; s: number; color: string; text: string; name: string; lines: string[]; model?: string; solid?: boolean; y?: number };

export default function TownEditor3D({ props, notice, selected, placing, onSelect, onPlace }: { props: EditorProp[]; notice: string; selected: string | null; placing: boolean; onSelect: (id: string | null) => void; onPlace: (x: number, z: number) => void }) {
  const box = React.useRef<HTMLDivElement>(null);
  const api = React.useRef<{ setProps: (p: EditorProp[], sel: string | null) => void } | null>(null);
  const cb = React.useRef({ onSelect, onPlace, placing });
  cb.current = { onSelect, onPlace, placing };
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    TOON.quality = "medium";
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#bfe3ff");
    scene.add(new THREE.HemisphereLight("#ffffff", "#7ca06a", 1.2));
    const sun = new THREE.DirectionalLight("#fff7e6", 1.4);
    sun.position.set(60, 120, 40);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.5, 1200);
    camera.position.set(0, 170, 190);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2.05;
    const city = buildCity(new Physics(), { name: "Seed Town", departments: ["Team"], residents: [], homes: {}, items: mergedCatalog(null), notice, props: [], meId: "" });
    scene.add(city.root);
    const extra = new THREE.Group();
    scene.add(extra);
    const marker = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 32), new THREE.MeshBasicMaterial({ color: "#dc2626", side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    let gen = 0;
    api.current = {
      setProps: (list, sel) => {
        const g = ++gen;
        extra.clear();
        for (const p of list) {
          let o: THREE.Object3D;
          if (p.kind === "npc") {
            o = new THREE.Group();
            o.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 4, 8), new THREE.MeshLambertMaterial({ color: "#7c3aed" })));
            o.children[0]!.position.y = 0.9;
            const t = textSprite([p.name || "Visitor", p.text || "Character"], { width: 3 });
            t.position.y = 2.6;
            o.add(t);
          } else if (p.kind === "spawn") {
            o = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 24), new THREE.MeshBasicMaterial({ color: "#dc2626", side: THREE.DoubleSide }));
            o.rotation.x = -Math.PI / 2;
          } else if (p.kind === "model") {
            o = new THREE.Group();
            void placeModels(o, null, [{ ...p, x: 0, z: 0, r: 0, s: 1, y: 0 }]).then(() => g !== gen && o.clear());
          } else {
            o = prop(p.kind, p.color, p.text);
            if (p.kind === "billboard" && p.text) {
              const sgn = signPlane(p.text, 6, 2, p.color);
              sgn.position.y = 3;
              o.add(sgn);
            }
          }
          if (p.kind !== "spawn") {
            o.position.set(p.x, p.y ?? 0, p.z);
            o.rotation.y = (p.r * Math.PI) / 180;
            o.scale.setScalar(p.s);
          } else o.position.set(p.x, 0.1, p.z);
          o.userData.propId = p.id;
          o.traverse((c) => (c.userData.propId = p.id));
          extra.add(o);
          if (p.id === sel) (marker.position.set(p.x, 0.15, p.z), (marker.visible = true), marker.scale.setScalar(Math.max(1, p.s * 1.5)));
        }
        if (!sel || !list.some((p) => p.id === sel)) marker.visible = false;
      },
    };
    // Click (not drag): select a thing, or place on the ground.
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let downAt: [number, number] | null = null;
    const down = (e: PointerEvent) => (downAt = [e.clientX, e.clientY]);
    const up = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || e.button !== 0) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(extra, true)[0];
      if (hit && !cb.current.placing) return cb.current.onSelect((hit.object.userData.propId as string) ?? null);
      const pt = ray.ray.intersectPlane(ground, new THREE.Vector3());
      if (pt && cb.current.placing) cb.current.onPlace(Math.round(pt.x * 10) / 10, Math.round(pt.z * 10) / 10);
      else if (!hit) cb.current.onSelect(null);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      city.update(clock.elapsedTime, dt);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // The town is built once; props update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => api.current?.setProps(props, selected), [props, selected]);
  return <div ref={box} className="h-[420px] w-full overflow-hidden rounded-lg border" aria-label="Town in 3D: drag to turn, wheel to zoom, click to place or select" data-town-3d />;
}
