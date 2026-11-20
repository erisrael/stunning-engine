// Voice in Seed Town: voices go straight between browsers (WebRTC); the town's server only passes the introductions
// along (offers, answers, network candidates) with the position updates. Two modes: nearby (everyone close enough,
// placed in space: louder and to the side they stand on, fading out with distance) and rooms (everyone in the same
// room at full volume, wherever they are in town). Each voice has its own volume and can be muted locally; a level
// meter shows who is speaking.

type Signal = { t: "offer" | "answer"; sdp: string } | { t: "ice"; c: RTCIceCandidateInit } | { t: "bye" };
type Peer = {
  pc: RTCPeerConnection;
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode | null;
  panner: PannerNode;
  gain: GainNode;
  analyser: AnalyserNode;
  queue: RTCIceCandidateInit[];
  state: string;
  level: number;
};

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
export const NEAR_RANGE = 40;

export class VoiceMesh {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private peers = new Map<string, Peer>();
  private myAnalyser: AnalyserNode | null = null;
  private buf = new Float32Array(256);
  volumes = new Map<string, number>();
  muted = false;
  deafened = new Set<string>();
  outbox: { to: string; d: Signal }[] = [];
  constructor(private myId: string, private onChange: () => void, private ice: RTCIceServer[] = DEFAULT_ICE) {}

  get on() {
    return !!this.stream;
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.myAnalyser = this.ctx.createAnalyser();
    this.myAnalyser.fftSize = 512;
    src.connect(this.myAnalyser);
    this.setMuted(this.muted);
    this.onChange();
  }

  stop() {
    for (const id of [...this.peers.keys()]) this.drop(id, true);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onChange();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
    this.onChange();
  }

  // Who to be connected to now; the lower id makes the offer so both sides never offer at once.
  setTargets(ids: Set<string>) {
    if (!this.stream) return;
    for (const id of ids) if (!this.peers.has(id) && this.myId < id) void this.call(id);
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.drop(id, true);
  }

  private peer(id: string) {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: this.ice.length ? this.ice : DEFAULT_ICE });
    const ctx = this.ctx!;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.refDistance = 1;
    panner.maxDistance = NEAR_RANGE;
    panner.rolloffFactor = 0;
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    panner.connect(gain).connect(ctx.destination);
    // Chrome only plays a remote stream through Web Audio while a (muted) element also holds it.
    const el = new Audio();
    el.muted = true;
    el.autoplay = true;
    p = { pc, el, src: null, panner, gain, analyser, queue: [], state: "new", level: 0 };
    const peer = p;
    for (const t of this.stream!.getTracks()) pc.addTrack(t, this.stream!);
    pc.onicecandidate = (e) => e.candidate && this.outbox.push({ to: id, d: { t: "ice", c: e.candidate.toJSON() } });
    pc.ontrack = (e) => {
      const s = e.streams[0] ?? new MediaStream([e.track]);
      el.srcObject = s;
      void el.play().catch(() => {});
      peer.src?.disconnect();
      peer.src = ctx.createMediaStreamSource(s);
      peer.src.connect(peer.analyser);
      peer.src.connect(peer.panner);
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      peer.state = pc.connectionState;
      if (pc.connectionState === "failed") {
        // Try again once from scratch.
        this.drop(id, false);
      }
      this.onChange();
    };
    this.peers.set(id, p);
    return p;
  }

  private async call(id: string) {
    const p = this.peer(id);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.outbox.push({ to: id, d: { t: "offer", sdp: offer.sdp ?? "" } });
  }

  async handle(from: string, d: Signal) {
    if (!this.stream) {
      if (d.t === "offer") this.outbox.push({ to: from, d: { t: "bye" } });
      return;
    }
    try {
      if (d.t === "bye") return this.drop(from, false);
      if (d.t === "offer") {
        const p = this.peer(from);
        await p.pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
        for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        this.outbox.push({ to: from, d: { t: "answer", sdp: ans.sdp ?? "" } });
      } else if (d.t === "answer") {
        const p = this.peers.get(from);
        if (!p || p.pc.signalingState !== "have-local-offer") return;
        await p.pc.setRemoteDescription({ type: "answer", sdp: d.sdp });
        for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      } else if (d.t === "ice") {
        const p = this.peers.get(from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(d.c).catch(() => {});
        else p.queue.push(d.c);
      }
    } catch {
      this.drop(from, true);
    }
  }

  private drop(id: string, tell: boolean) {
    const p = this.peers.get(id);
    if (!p) return;
    if (tell) this.outbox.push({ to: id, d: { t: "bye" } });
    p.pc.close();
    p.src?.disconnect();
    p.gain.disconnect();
    p.el.srcObject = null;
    this.peers.delete(id);
    this.onChange();
  }

  // Each frame: where I am and where they are (nearby mode places voices in space; rooms are flat), volumes.
  place(me: { x: number; y: number; z: number; heading: number }, others: Map<string, { x: number; y: number; z: number }>, mode: "near" | "room") {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
    if (l.positionX) {
      l.positionX.value = me.x;
      l.positionY.value = me.y + 1.6;
      l.positionZ.value = me.z;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
    for (const [id, p] of this.peers) {
      const o = others.get(id);
      const vol = this.deafened.has(id) ? 0 : (this.volumes.get(id) ?? 1);
      if (mode === "near" && o) {
        const d = Math.hypot(o.x - me.x, o.z - me.z);
        const fall = Math.max(0, 1 - d / NEAR_RANGE);
        p.gain.gain.value = vol * fall * fall;
        p.panner.positionX.value = o.x;
        p.panner.positionY.value = o.y + 1.6;
        p.panner.positionZ.value = o.z;
      } else {
        p.gain.gain.value = vol;
        p.panner.positionX.value = me.x + fx;
        p.panner.positionY.value = me.y + 1.6;
        p.panner.positionZ.value = me.z + fz;
      }
    }
  }

  private rms(a: AnalyserNode) {
    a.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i]! * this.buf[i]!;
    return Math.sqrt(s / this.buf.length);
  }
  // Who is speaking right now (and me).
  speaking() {
    const out = new Set<string>();
    if (this.myAnalyser && !this.muted && this.rms(this.myAnalyser) > 0.02) out.add(this.myId);
    for (const [id, p] of this.peers) if (p.src && this.rms(p.analyser) > 0.02) out.add(id);
    return out;
  }
  status() {
    return [...this.peers.entries()].map(([id, p]) => ({ id, state: p.state }));
  }
  take() {
    return this.outbox.splice(0, 30);
  }
}
