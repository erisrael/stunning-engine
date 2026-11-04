"use client";

// Where call sound plays: the loudspeaker, or the earpiece when the phone is held to the ear. Browsers can send sound to
// another output only where they allow choosing one (setSinkId); where they do not, "ear" plays it quietly from the
// same speaker so it is comfortable at the ear. The proximity sensor, where the browser gives access to it, switches to
// the ear and darkens the screen while the phone is at the face (so the cheek presses nothing). The screen stays on
// during the call. The choice is remembered per call type on this device.

import * as React from "react";
import { EarIcon, Volume2Icon } from "lucide-react";

export type Route = "speaker" | "ear";
type Kind = "voice" | "video";
const KEY = "myseed.call.route";

type SinkEl = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
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
    for (const el of els) {
      const id = route === "ear" ? outputs.ear : outputs.speaker;
      if (canSink && id && el.setSinkId) {
        void el.setSinkId(id).catch(() => {});
        el.volume = 1;
      } else el.volume = route === "ear" ? 0.25 : 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, route, outputs, canSink, ...deps]);

  // The proximity sensor, where available.
  React.useEffect(() => {
    if (!active || kind !== "voice") return;
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
  return { route, toggle, near: near && kind === "voice", sensor, realOutputs: canSink && !!outputs.ear };
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

// Dark while the phone is at the face; touches do nothing.
export function ProximityShade({ near }: { near: boolean }) {
  if (!near) return null;
  return <div data-proximity-shade aria-hidden className="fixed inset-0 z-[200] bg-black" onPointerDown={(e) => e.preventDefault()} />;
}
