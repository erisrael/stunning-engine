"use client";

import * as React from "react";
import type { Track } from "@/server/fun";

// The music player behind Fun mode: one <audio> for the whole app (it lives in the app layout, so music keeps
// playing while moving between pages and with the Fun window closed). Tracks stream from Audius.
export const streamOf = (id: string) => `https://api.audius.co/v1/tracks/${id}/stream?app_name=myseed_ops`;

type Repeat = "off" | "all" | "one";
export type PlayerApi = {
  queue: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: Repeat;
  playList: (tracks: Track[], start?: number) => void;
  enqueue: (t: Track) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  setShuffle: (v: boolean) => void;
  setRepeat: (r: Repeat) => void;
  stop: () => void;
};

const Ctx = React.createContext<PlayerApi | null>(null);
export const usePlayer = () => React.useContext(Ctx);

const VOL_KEY = "myseed.fun.volume";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = React.useState<Track[]>([]);
  const [index, setIndex] = React.useState(-1);
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVol] = React.useState(0.8);
  const [shuffle, setShuffle] = React.useState(false);
  const [repeat, setRepeat] = React.useState<Repeat>("off");
  const state = React.useRef({ queue, index, shuffle, repeat });
  state.current = { queue, index, shuffle, repeat };

  const load = React.useCallback((q: Track[], i: number) => {
    const a = audio.current;
    const t = q[i];
    if (!a || !t) return;
    setLoading(true);
    a.src = streamOf(t.id);
    a.play().catch(() => setPlaying(false));
  }, []);

  const next = React.useCallback(() => {
    const { queue: q, index: i, shuffle: sh, repeat: rp } = state.current;
    if (!q.length) return;
    let n = sh ? Math.floor(Math.random() * q.length) : i + 1;
    if (n >= q.length) {
      if (rp !== "all") return void setPlaying(false);
      n = 0;
    }
    setIndex(n);
    load(q, n);
  }, [load]);

  React.useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    try {
      const v = Number(localStorage.getItem(VOL_KEY));
      if (v >= 0 && v <= 1 && localStorage.getItem(VOL_KEY) !== null) (a.volume = v), setVol(v);
      else a.volume = 0.8;
    } catch {}
    audio.current = a;
    const on = (e: string, f: () => void) => a.addEventListener(e, f);
    on("play", () => setPlaying(true));
    on("pause", () => setPlaying(false));
    on("playing", () => setLoading(false));
    on("waiting", () => setLoading(true));
    on("timeupdate", () => setTime(a.currentTime));
    on("durationchange", () => setDuration(Number.isFinite(a.duration) ? a.duration : 0));
    on("error", () => {
      setLoading(false);
      setPlaying(false);
    });
    on("ended", () => {
      if (state.current.repeat === "one") {
        a.currentTime = 0;
        void a.play();
      } else next();
    });
    return () => {
      a.pause();
      a.src = "";
    };
  }, [next]);

  const current = index >= 0 ? (queue[index] ?? null) : null;

  // The device's own media keys and lock-screen controls.
  React.useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, artwork: current.artwork ? [{ src: current.artwork, sizes: "480x480" }] : [] });
    navigator.mediaSession.setActionHandler("play", () => void audio.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => api.prev());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, next]);

  const api: PlayerApi = {
    queue,
    index,
    current,
    playing,
    loading,
    time,
    duration,
    volume,
    shuffle,
    repeat,
    playList: (tracks, start = 0) => {
      if (!tracks.length) return;
      setQueue(tracks);
      setIndex(start);
      load(tracks, start);
    },
    enqueue: (t) => {
      setQueue((q) => (q.some((x) => x.id === t.id) ? q : [...q, t]));
      if (index < 0) {
        setQueue([t]);
        setIndex(0);
        load([t], 0);
      }
    },
    toggle: () => {
      const a = audio.current;
      if (!a || !current) return;
      if (a.paused) void a.play();
      else a.pause();
    },
    pause: () => audio.current?.pause(),
    next,
    prev: () => {
      const a = audio.current;
      if (a && a.currentTime > 4) return void (a.currentTime = 0);
      const p = Math.max(0, index - 1);
      setIndex(p);
      load(queue, p);
    },
    seek: (s) => {
      if (audio.current) audio.current.currentTime = s;
    },
    setVolume: (v) => {
      const x = Math.max(0, Math.min(1, v));
      setVol(x);
      if (audio.current) audio.current.volume = x;
      try {
        localStorage.setItem(VOL_KEY, String(x));
      } catch {}
    },
    setShuffle,
    setRepeat,
    stop: () => {
      const a = audio.current;
      if (a) (a.pause(), (a.src = ""));
      setQueue([]);
      setIndex(-1);
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
