"use client";

// Where call sound plays: the loudspeaker, or the earpiece when the phone is held to the ear. Browsers can send sound to
// another output only where they allow choosing one (setSinkId); where they do not, "ear" plays it quietly from the
// same speaker so it is comfortable at the ear. The screen stays on during the call. The choice is remembered per call
// type on this device.
//
// The ear guard (voice calls on phones), so a cheek never ends or mutes a call:
// - In the Android app: the phone's own proximity sensor, through Android (MyseedAndroid.callProximity): at the ear the
//   screen goes off and ignores touches, as in a phone call; the earpiece and loudspeaker are switched for real.
// - Browsers and Telegram cannot read the proximity sensor, so the motion sensor stands in for it (Telegram's own where
//   it has one), as Telegram's calls behave: lifted to the ear, the screen goes dark and ignores touches; lowered, it
//   comes back by itself. Nothing to unlock. A touch as big as a cheek, or several fingers at once, is ignored.

import * as React from "react";
import { EarIcon, Volume2Icon } from "lucide-react";

export type Route = "speaker" | "ear";
type Kind = "voice" | "video";
const KEY = "myseed.call.route";

type SinkEl = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
// The Android app's phone controls (mobile-ops MainActivity).
type NativePhone = { callProximity?: (on: boolean) => boolean; callSpeaker?: (on: boolean) => void };
const nativePhone = (): NativePhone | null => (typeof window === "undefined" ? null : ((window as unknown as { MyseedAndroid?: NativePhone }).MyseedAndroid ?? null));
const touchPhone = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
// Telegram's own motion sensor (Bot API 8.0), where this Telegram has it.
type TgOrientation = { start?: (o: { refresh_rate?: number }) => void; stop?: () => void; beta?: number; gamma?: number };
type TgApp = { DeviceOrientation?: TgOrientation; onEvent?: (e: string, f: () => void) => void; offEvent?: (e: string, f: () => void) => void };
const tgWebApp = (): TgApp | null => (typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TgApp } }).Telegram?.WebApp ?? null));
// Held to the ear: upright and turned sideways towards the head (looking at the screen keeps it fairly flat to the face).
const atEar = (beta: number, gamma: number) => Math.abs(beta) > 55 && Math.abs(beta) < 130 && Math.abs(gamma) > 28;
const EAR = /earpiece|handset|receiver|phone(?!.*speaker)/i;
const SPEAKER = /speaker/i;

function saved(kind: Kind): Route | null {
  try {
    const v = (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Route>)[kind];
    return v === "ear" || v === "speaker" ? v : null;
  } catch {
    return null;
  }
}
function save(kind: Kind, r: Route) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), [kind]: r }));
  } catch {}
}

export function useAudioRoute(active: boolean, kind: Kind, deps: unknown[] = []) {
  const [route, setRoute] = React.useState<Route>("speaker");
  const [outputs, setOutputs] = React.useState<{ ear: string | null; speaker: string | null }>({ ear: null, speaker: null });
  const [near, setNear] = React.useState(false);
  const [sensor, setSensor] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [native, setNative] = React.useState(false);
  const canSink = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  // The outputs this phone or computer has (their names show once the microphone is allowed).
  React.useEffect(() => {
    if (!active) return;
    let gone = false;
    const read = () =>
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((d) => {
          if (gone) return;
          const outs = d.filter((x) => x.kind === "audiooutput");
          setOutputs({ ear: outs.find((o) => EAR.test(o.label))?.deviceId ?? null, speaker: outs.find((o) => SPEAKER.test(o.label))?.deviceId ?? outs.find((o) => o.deviceId === "default")?.deviceId ?? null });
        })
        .catch(() => {});
    void read();
    navigator.mediaDevices?.addEventListener?.("devicechange", read);
    // Voice calls start at the ear, as a phone call does; video calls on the speaker. Unless chosen before.
    setRoute(saved(kind) ?? (kind === "voice" && /Android|iPhone|iPad/i.test(navigator.userAgent) ? "ear" : "speaker"));
    return () => {
      gone = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", read);
    };
  }, [active, kind]);

  // Apply the route to every remote sound in the call.
  React.useEffect(() => {
    if (!active) return;
    const els = [...document.querySelectorAll<SinkEl>("[data-call-audio]")];
    // The Android app switches the phone's own earpiece and loudspeaker.
    try {
      nativePhone()?.callSpeaker?.(route === "speaker");
    } catch {}
    for (const el of els) {
      const id = route === "ear" ? outputs.ear : outputs.speaker;
      if (canSink && id && el.setSinkId) {
        void el.setSinkId(id).catch(() => {});
        el.volume = 1;
      } else el.volume = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, route, outputs, canSink, ...deps]);

  // The proximity sensor, where available: the Android app's (through Android), else the browser's.
  React.useEffect(() => {
    if (!active || kind !== "voice") return;
    const phone = nativePhone();
    if (phone?.callProximity) {
      let ok = false;
      try {
        ok = phone.callProximity(true) !== false;
      } catch {}
      if (ok) {
        setNative(true);
        setSensor(true);
        return () => {
          setNative(false);
          setSensor(false);
          try {
            phone.callProximity?.(false);
          } catch {}
        };
      }
    }
    const w = window as unknown as { ProximitySensor?: new (o?: object) => EventTarget & { start: () => void; stop: () => void; near?: boolean } };
    let stop = () => {};
    if (w.ProximitySensor) {
      try {
        const s = new w.ProximitySensor({ frequency: 4 });
        const on = () => setNear(!!s.near);
        s.addEventListener("reading", on);
        s.addEventListener("error", () => setSensor(false));
        s.start();
        setSensor(true);
        stop = () => (s.removeEventListener("reading", on), s.stop());
      } catch {
        setSensor(false);
      }
    } else {
      // Older browsers: the userproximity event.
      const on = (e: Event) => (setSensor(true), setNear(!!(e as Event & { near?: boolean }).near));
      window.addEventListener("userproximity", on);
      stop = () => window.removeEventListener("userproximity", on);
    }
    return () => stop();
  }, [active, kind]);

  // At the face: the ear, and the screen dark.
  React.useEffect(() => {
    if (near) setRoute("ear");
  }, [near]);

  // The ear guard where there is no proximity sensor (browsers, Telegram): see the top of this file.
  const routeRef = React.useRef(route);
  routeRef.current = route;
  const lockRef = React.useRef<{ why: "ear" | "idle" | "touch" | null; idle?: number }>({ why: null });
  const guard = active && kind === "voice" && !native && !sensor;
  React.useEffect(() => {
    if (!guard || !touchPhone()) {
      setLocked(false);
      return;
    }
    const L = lockRef.current;
    const lock = (why: "ear" | "idle" | "touch") => {
      if (L.why) return;
      L.why = why;
      setLocked(true);
    };
    const open = () => {
      L.why = null;
      setLocked(false);
    };
    // A cheek: a big contact, or several at once. That touch does nothing (the screen does not lock for it).
    const onTouch = (e: TouchEvent) => {
      const big = [...e.touches].some((t) => Math.max(t.radiusX || 0, t.radiusY || 0) > 24);
      if (e.touches.length >= 3 || big) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("touchstart", onTouch, { capture: true, passive: false });
    // The motion sensor: lifted to the ear goes dark; lowered for a moment comes back. If the readings stop while dark
    // (the sensor paused), the screen comes back rather than staying dark.
    let away = 0;
    let lastReading = 0;
    const seen = (beta: number | null | undefined, gamma: number | null | undefined) => {
      if (beta == null || gamma == null) return;
      lastReading = Date.now();
      if (atEar(beta, gamma)) {
        away = 0;
        lock("ear");
      } else if (L.why === "ear") {
        away ||= Date.now();
        if (Date.now() - away > 350) open();
      }
    };
    const stale = window.setInterval(() => L.why && Date.now() - lastReading > 2500 && open(), 1000);
    const onOrient = (e: DeviceOrientationEvent) => seen(e.beta, e.gamma);
    const tg = tgWebApp();
    const tgOrient = tg?.DeviceOrientation;
    const onTg = () => seen(tgOrient?.beta, tgOrient?.gamma);
    const useTg = !!(tgOrient?.start && tg?.onEvent);
    if (useTg) {
      try {
        tgOrient!.start!({ refresh_rate: 200 });
        tg!.onEvent!("deviceOrientationChanged", onTg);
      } catch {}
    } else window.addEventListener("deviceorientation", onOrient);
    // iPhone asks once for motion access, on a tap.
    const ask = () => {
      const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      void D?.requestPermission?.().catch(() => {});
    };
    if (!useTg) document.addEventListener("touchend", ask, { once: true });
    const onUnlock = () => open();
    window.addEventListener("myseed:call-unlock", onUnlock);
    return () => {
      window.clearInterval(stale);
      L.why = null;
      setLocked(false);
      document.removeEventListener("touchstart", onTouch, { capture: true });
      document.removeEventListener("touchend", ask);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("myseed:call-unlock", onUnlock);
      if (useTg)
        try {
          tg?.offEvent?.("deviceOrientationChanged", onTg);
          tgOrient?.stop?.();
        } catch {}
    };
  }, [guard]);

  // The screen stays on during the call.
  React.useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    let lock: { release: () => Promise<void> } | null = null;
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => null);
    void get();
    const vis = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      void lock?.release().catch(() => {});
    };
  }, [active]);

  const toggle = () =>
    setRoute((r) => {
      const next = r === "ear" ? "speaker" : "ear";
      save(kind, next);
      return next;
    });
  return { route, toggle, near: near && kind === "voice", locked: locked && !near, sensor, realOutputs: native || (canSink && !!outputs.ear) };
}

// The switch, for both call screens.
export function RouteToggle({ route, onToggle, realOutputs, className, children }: { route: Route; onToggle: () => void; realOutputs: boolean; className?: string; children?: (icon: React.ReactNode, label: string) => React.ReactNode }) {
  const label = route === "ear" ? "Switch to the loudspeaker" : realOutputs ? "Switch to the earpiece" : "Switch to ear (quieter)";
  const icon = route === "ear" ? <EarIcon /> : <Volume2Icon />;
  if (children) return <>{children(icon, label)}</>;
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={route === "speaker"} onClick={onToggle} className={className} data-audio-route={route}>
      {icon}
    </button>
  );
}

// Dark while the phone is at the face, as a phone's screen turns off in a call; touches do nothing. It goes away by
// itself when the phone is lowered (nothing to unlock).
export function ProximityShade({ near, locked = false }: { near: boolean; locked?: boolean }) {
  if (!near && !locked) return null;
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      data-proximity-shade
      data-locked={locked && !near ? "" : undefined}
      aria-hidden
      className="fixed inset-0 z-[200] touch-none bg-black select-none"
      onPointerDown={stop}
      onClick={stop}
      onContextMenu={stop}
    />
  );
}
