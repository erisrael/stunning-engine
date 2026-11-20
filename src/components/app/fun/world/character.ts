import * as THREE from "three";
import type { Look } from "@/lib/fun-catalog";
import { animateAvatar, buildAvatar, type Avatar, type Pose } from "./avatar";
import { createVrmAvatar, type VrmAvatar } from "./vrm";
import { createPerson, type PersonAvatar } from "./people";

// One character, two bodies: the detailed model (an anime VRM, or a realistic person), animated from the motion
// library, when it is loaded and the graphics budget allows it; the light drawn figure otherwise (far away, low
// graphics, still loading).
type Detailed = (VrmAvatar | PersonAvatar) & { setLook?: (l: Look) => void; speak?: (v: number) => void };

export class Character {
  readonly group = new THREE.Group();
  private proc: Avatar | null = null;
  private vrm: Detailed | null = null;
  private loading = false;
  private wantVrm = false;
  private dead = false;
  private gen = 0;
  constructor(public look: Look, private detail = true) {
    this.ensureProc();
  }
  get usingVrm() {
    return !!this.vrm && this.wantVrm;
  }
  get height() {
    return this.usingVrm ? this.vrm!.height * this.vrm!.root.scale.y : 1.75;
  }
  private ensureProc() {
    if (this.proc) return;
    this.proc = buildAvatar(this.look.style === "anime" || this.look.style === "realistic" ? { ...this.look, style: "chibi" } : this.look, { detail: this.detail });
    this.group.add(this.proc.root);
  }
  private dropProc() {
    if (!this.proc) return;
    this.group.remove(this.proc.root);
    this.proc = null;
  }
  // Ask for (or give up) the detailed model; it loads in the background.
  setDetailed(on: boolean) {
    const can = on && (this.look.style === "anime" || this.look.style === "realistic");
    this.wantVrm = can;
    if (can && !this.vrm && !this.loading) {
      this.loading = true;
      const g = ++this.gen;
      (this.look.style === "realistic" ? createPerson(this.look.base) : createVrmAvatar(this.look))
        .then((v: Detailed) => {
          this.loading = false;
          if (this.dead || g !== this.gen) return v.dispose();
          this.vrm = v;
          this.group.add(v.root);
          if (this.wantVrm) this.dropProc();
          else v.root.visible = false;
        })
        .catch(() => (this.loading = false));
    }
    if (!can && this.vrm) {
      this.group.remove(this.vrm.root);
      this.vrm.dispose();
      this.vrm = null;
      this.gen++;
    }
    if (!can || !this.vrm) this.ensureProc();
  }
  setLook(l: Look) {
    const baseChanged = l.base !== this.look.base || l.style !== this.look.style;
    this.look = l;
    if (this.vrm && !baseChanged) this.vrm.setLook?.(l);
    else if (this.vrm) {
      this.group.remove(this.vrm.root);
      this.vrm.dispose();
      this.vrm = null;
      this.gen++;
    }
    if (this.proc) {
      this.dropProc();
      this.ensureProc();
    }
    if (this.wantVrm || baseChanged) this.setDetailed(this.wantVrm);
  }
  update(t: number, dt: number, pose: Pose, lookTarget?: THREE.Object3D | null) {
    if (this.vrm && this.wantVrm) this.vrm.update(dt, t, pose, lookTarget);
    else if (this.proc) animateAvatar(this.proc, t, dt, pose);
  }
  // Talking: 0..1 how loud (realistic people move their jaw; anime models their mouth).
  speak(level: number) {
    const v = this.vrm as (Detailed & { vrm?: { expressionManager?: { setValue: (n: string, v: number) => void } } }) | null;
    if (!v) return;
    if (v.speak) v.speak(level);
    else v.vrm?.expressionManager?.setValue("aa", level * 0.8);
  }
  // The thing to hit-test and to show or hide.
  get root(): THREE.Object3D {
    return this.group;
  }
  dispose() {
    this.dead = true;
    this.vrm?.dispose();
    this.vrm = null;
    this.dropProc();
  }
}
