import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// The picture after the scene is drawn, by graphics level: Low and Medium draw straight to the screen (filmic tone
// mapping only); High adds bloom (lamps, lit windows, headlights) and SMAA; Ultra and the desktop app add ambient
// occlusion (contact shadows in corners and under things). Each level keeps its frame time in budget.

export type PostLevel = "off" | "bloom" | "full";

export class Post {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ao: GTAOPass | null = null;
  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    level: PostLevel,
    w: number,
    h: number,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    if (level === "off") return;
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (level === "full") {
      this.ao = new GTAOPass(scene, camera, w, h);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1, samples: 12 });
      this.composer.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
  }
  // Brighter glow at night (lamps), a little by day (sun on glass).
  setNight(n: number) {
    if (this.bloom) (this.bloom.strength = 0.18 + n * 0.55), (this.bloom.threshold = 0.95 - n * 0.25);
    this.renderer.toneMappingExposure = 1.0 + n * 0.25;
  }
  setPixelRatio(r: number) {
    this.composer?.setPixelRatio(r);
  }
  setSize(w: number, h: number) {
    this.composer?.setSize(w, h);
    this.ao?.setSize(w, h);
  }
  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  get active() {
    return !!this.composer;
  }
  dispose() {
    this.composer?.dispose();
    this.ao?.dispose();
    this.bloom?.dispose();
  }
}
