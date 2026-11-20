// Seed Town's sound: music that changes with the district (CC0 tracks, crossfaded), short recorded effects for the
// interface and pickups (Kenney, CC0), and effects made on the fly with Web Audio for the physical world:
// footsteps by surface, jumps and landings, engines that rev with speed, horns, crashes, kicks, the stadium crowd,
// arrows, splashes and fireworks. Music and effects have their own volume; nothing plays before the first tap.

export type Sfx =
  | "click" | "select" | "open" | "close" | "buy" | "gem" | "error" | "ding" | "levelup" | "toggle" | "talk" | "checkpoint" | "win"
  | "shoot" | "hit" | "miss" | "splash" | "kick" | "goal" | "jump" | "land" | "horn" | "crash" | "whoosh" | "firework" | "swish" | "coin";
export type Surface = "grass" | "hard" | "wood";

const SAMPLES: Partial<Record<Sfx, string>> = {
  click: "click", select: "select", open: "open", close: "close", buy: "confirm", coin: "confirm", gem: "glass", error: "error", ding: "bong", levelup: "maximize", toggle: "toggle", talk: "question", checkpoint: "pluck",
};

// Which music plays where.
export const MUSIC: Record<string, string> = {
  town: "/audio/music/town-theme.mp3",
  calm: "/audio/music/town-1.mp3",
  homes: "/audio/music/town-2.mp3",
  market: "/audio/music/market.mp3",
  office: "/audio/music/castle-town.mp3",
  action: "/audio/music/action-1.mp3",
  race: "/audio/music/action-2.mp3",
  arena: "/audio/music/action-3.mp3",
};
export function musicFor(where: string, activity: string | null) {
  if (activity === "race" || activity === "circuit") return "race";
  if (activity) return "action";
  if (/^Office|Library/.test(where)) return "office";
  if (/Shops/.test(where)) return "market";
  if (/Homes/.test(where)) return "homes";
  if (/Park|Parkour/.test(where)) return "calm";
  if (/Stadium/.test(where)) return "arena";
  if (/Circuit|Ring road/.test(where)) return "race";
  return "town";
}

export class TownAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private noise: AudioBuffer | null = null;
  private tracks: { el: HTMLAudioElement; gain: GainNode; key: string }[] = [];
  private engine: { o: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private crowd: { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private want = "";
  musicVolume = 0.5;
  sfxVolume = 0.7;
  duck = false;

  // The browser lets sound start only after the person taps or presses a key.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfxGain = c.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.duck ? 0 : this.musicVolume;
    this.musicGain.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.want) this.setMusic(this.want);
  }
  get ready() {
    return !!this.ctx;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicGain.gain.setTargetAtTime(this.duck ? 0 : music, this.ctx.currentTime, 0.3);
  }
  // Quieter music while the Fun player or a voice chat is on.
  setDuck(on: boolean) {
    this.duck = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0 : this.musicVolume, this.ctx.currentTime, 0.5);
  }

  // ------------------------------------------------------------------------------------------------- music

  setMusic(key: string) {
    this.want = key;
    if (!this.ctx || !MUSIC[key] || this.tracks[0]?.key === key) return;
    const c = this.ctx;
    const el = new Audio(MUSIC[key]);
    el.loop = true;
    el.crossOrigin = "anonymous";
    const src = c.createMediaElementSource(el);
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.musicGain);
    void el.play().catch(() => {});
    gain.gain.setTargetAtTime(1, c.currentTime, 1.2);
    // The old track fades out, then stops.
    for (const t of this.tracks) {
      t.gain.gain.setTargetAtTime(0, c.currentTime, 0.8);
      const old = t;
      window.setTimeout(() => (old.el.pause(), (old.el.src = "")), 4000);
    }
    this.tracks = [{ el, gain, key }];
  }

  // ------------------------------------------------------------------------------------------------- effects

  private load(name: string) {
    let p = this.buffers.get(name);
    if (!p) {
      p = fetch(`/audio/sfx/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }
  // Volume falls off with distance (metres) when given.
  play(s: Sfx, opts: { distance?: number; rate?: number; volume?: number } = {}) {
    const c = this.ctx;
    if (!c || !this.sfxVolume) return;
    const fall = opts.distance === undefined ? 1 : Math.max(0, 1 - opts.distance / 40);
    if (fall <= 0) return;
    const vol = (opts.volume ?? 1) * fall;
    const sample = SAMPLES[s];
    if (sample) {
      void this.load(sample).then((buf) => {
        if (!buf || !this.ctx) return;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = opts.rate ?? 1;
        const g = c.createGain();
        g.gain.value = vol * 0.8;
        src.connect(g).connect(this.sfxGain);
        src.start();
      });
      return;
    }
    const t = c.currentTime;
    switch (s) {
      case "shoot":
      case "whoosh":
        this.noiseBurst(t, 0.25, 900, 3000, vol * 0.35, "bandpass");
        break;
      case "hit":
        this.tone(t, 160, 0.12, "sine", vol * 0.5, 60);
        this.noiseBurst(t, 0.05, 2000, 2000, vol * 0.2, "highpass");
        break;
      case "miss":
        this.tone(t, 220, 0.25, "triangle", vol * 0.15, 140);
        break;
      case "splash":
        this.noiseBurst(t, 0.6, 600, 200, vol * 0.4, "lowpass");
        break;
      case "kick":
        this.tone(t, 120, 0.12, "sine", vol * 0.7, 45);
        this.noiseBurst(t, 0.04, 1800, 1800, vol * 0.3, "bandpass");
        break;
      case "jump":
        this.noiseBurst(t, 0.12, 400, 1200, vol * 0.12, "bandpass");
        break;
      case "land":
        this.tone(t, 90, 0.1, "sine", vol * 0.35, 50);
        this.noiseBurst(t, 0.08, 300, 300, vol * 0.2, "lowpass");
        break;
      case "horn":
        this.tone(t, 330, 0.45, "square", vol * 0.12);
        this.tone(t, 415, 0.45, "square", vol * 0.1);
        break;
      case "crash":
        this.noiseBurst(t, 0.5, 2500, 300, vol * 0.5, "lowpass");
        this.tone(t, 70, 0.3, "sawtooth", vol * 0.2, 40);
        break;
      case "swish":
        this.noiseBurst(t, 0.3, 3000, 6000, vol * 0.25, "highpass");
        break;
      case "goal":
        this.tone(t, 220, 1.4, "sawtooth", vol * 0.12);
        this.tone(t, 277, 1.4, "sawtooth", vol * 0.1);
        this.cheer(vol);
        break;
      case "firework":
        this.tone(t, 900, 0.6, "sine", vol * 0.08, 200);
        this.noiseBurst(t + 0.6, 0.9, 3000, 400, vol * 0.5, "lowpass");
        for (let i = 0; i < 8; i++) this.noiseBurst(t + 0.8 + Math.random() * 0.6, 0.04, 5000, 5000, vol * 0.15, "highpass");
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, f, 0.2, "triangle", vol * 0.2));
        break;
    }
  }
  // A crowd cheering: noise shaped like voices, swelling then fading.
  cheer(vol = 1) {
    const c = this.ctx;
    if (!c || !this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 0.7;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + 3.1);
  }
  // A footstep: soft thud on grass, a sharper tap on floors and roads, hollow on wood.
  step(surface: Surface, run: boolean) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const v = (run ? 0.18 : 0.12) * (0.85 + Math.random() * 0.3);
    if (surface === "grass") this.noiseBurst(t, 0.09, 700 + Math.random() * 300, 400, v * 1.2, "lowpass");
    else if (surface === "wood") (this.tone(t, 180 + Math.random() * 30, 0.07, "triangle", v * 0.8, 120), this.noiseBurst(t, 0.03, 2500, 2500, v * 0.4, "bandpass"));
    else (this.noiseBurst(t, 0.04, 3200 + Math.random() * 800, 3200, v, "bandpass"), this.tone(t, 110, 0.05, "sine", v * 0.6, 70));
  }
  // The stadium's crowd murmur while I am there.
  setCrowd(level: number) {
    const c = this.ctx;
    if (!c || !this.noise) return;
    if (level > 0 && !this.crowd) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 600;
      f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfxGain);
      src.start();
      this.crowd = { src, f, g };
    }
    if (this.crowd) this.crowd.g.gain.setTargetAtTime(level * 0.06, c.currentTime, 0.5);
    if (level <= 0 && this.crowd) {
      const cr = this.crowd;
      this.crowd = null;
      window.setTimeout(() => cr.src.stop(), 1500);
    }
  }
  // An engine whose pitch follows the speed (two detuned saws through a filter).
  setEngine(on: boolean, speed = 0, kind = "car") {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.engine) {
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = "sawtooth";
      o2.type = "square";
      f.type = "lowpass";
      f.frequency.value = 500;
      g.gain.value = 0;
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.sfxGain);
      o.start();
      o2.start();
      this.engine = { o, o2, f, g };
    }
    if (this.engine) {
      const e = this.engine, t = c.currentTime;
      const bike = kind === "bike";
      const base = bike ? 0 : kind === "moto" || kind === "scooter" ? 70 : 45;
      e.o.frequency.setTargetAtTime(base + speed * (bike ? 0 : 4.5), t, 0.08);
      e.o2.frequency.setTargetAtTime((base + speed * 4.5) * 0.5 + 3, t, 0.08);
      e.f.frequency.setTargetAtTime(400 + speed * 60, t, 0.1);
      e.g.gain.setTargetAtTime(on && !bike ? 0.05 + Math.min(0.06, speed * 0.003) : 0, t, 0.15);
    }
    if (!on && this.engine) {
      const e = this.engine;
      this.engine = null;
      window.setTimeout(() => (e.o.stop(), e.o2.stop()), 600);
    }
  }

  private tone(t: number, f: number, dur: number, type: OscillatorType, vol: number, to?: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private noiseBurst(t: number, dur: number, f0: number, f1: number, vol: number, type: BiquadFilterType) {
    const c = this.ctx!;
    if (!this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  dispose() {
    for (const t of this.tracks) (t.el.pause(), (t.el.src = ""));
    this.tracks = [];
    this.setEngine(false);
    this.setCrowd(0);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
