"use client";

import * as React from "react";
import { toast } from "sonner";
import { CaptionsIcon, ChevronDownIcon, HistoryIcon, Loader2Icon, Maximize2Icon, Minimize2Icon, PauseIcon, PictureInPicture2Icon, PlayIcon, SkipBackIcon, SkipForwardIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// YouTube inside the app: the official IFrame Player API (no leaving the app, no tricks around YouTube's ads or
// rules), wrapped in our own player: a mini player in the corner that keeps playing while you work, a bigger one,
// full screen; play and pause, seek, volume, speed, captions, playlists (next and previous), what you watched
// before, and picking up where you stopped. YouTube's own controls (quality, captions language) stay available too.

type Src = { video?: string; list?: string; index?: number; title?: string };
type YtPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, a: boolean): void; getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(v: number): void; getVolume(): number; mute(): void; unMute(): void; isMuted(): boolean; setPlaybackRate(r: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[];
  nextVideo(): void; previousVideo(): void; getPlaylist(): string[] | null; getPlaylistIndex(): number; getVideoData(): { video_id: string; title: string; author: string; isLive?: boolean };
  loadVideoById(o: { videoId: string; startSeconds?: number }): void; loadPlaylist(o: { list: string; listType: "playlist"; index?: number }): void; loadModule(m: string): void; unloadModule(m: string): void; destroy(): void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: Record<string, unknown>) => YtPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Api = { src: Src | null; play: (s: Src) => void; close: () => void; mode: "mini" | "big"; setMode: (m: "mini" | "big") => void; history: Hist[] };
type Hist = { id: string; title: string; author: string; at: number };
const Ctx = React.createContext<Api | null>(null);
export const useYouTube = () => React.useContext(Ctx);
const HKEY = "myseed.yt.history";
const PKEY = "myseed.yt.pos";

let apiPromise: Promise<void> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => (prev?.(), resolve());
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => ((apiPromise = null), reject(new Error("YouTube could not be reached.")));
    document.head.appendChild(s);
  });
  return apiPromise;
}
const readJson = <T,>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d;
  } catch {
    return d;
  }
};
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export function YouTubeProvider({ children }: { children: React.ReactNode }) {
  const [src, setSrc] = React.useState<Src | null>(null);
  const [mode, setMode] = React.useState<"mini" | "big">("big");
  const [history, setHistory] = React.useState<Hist[]>([]);
  React.useEffect(() => setHistory(readJson<Hist[]>(HKEY, [])), []);
  const api: Api = {
    src,
    mode,
    setMode,
    history,
    play: (s) => (setSrc({ ...s }), setMode("big")),
    close: () => setSrc(null),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      {src && <Dock src={src} mode={mode} setMode={setMode} onClose={() => setSrc(null)} onHistory={(h) => setHistory(h)} />}
    </Ctx.Provider>
  );
}

function Dock({ src, mode, setMode, onClose, onHistory }: { src: Src; mode: "mini" | "big"; setMode: (m: "mini" | "big") => void; onClose: () => void; onHistory: (h: Hist[]) => void }) {
  const holder = React.useRef<HTMLDivElement>(null);
  const shell = React.useRef<HTMLDivElement>(null);
  const player = React.useRef<YtPlayer | null>(null);
  const [ready, setReady] = React.useState(false);
  const [state, setState] = React.useState(-1);
  const [t, setT] = React.useState({ now: 0, dur: 0 });
  const [vol, setVol] = React.useState(80);
  const [mute, setMute] = React.useState(false);
  const [rate, setRate] = React.useState(1);
  const [rates, setRates] = React.useState<number[]>([1]);
  const [info, setInfo] = React.useState<{ title: string; author: string; id: string; live: boolean }>({ title: src.title ?? "", author: "", id: src.video ?? "", live: false });
  const [list, setList] = React.useState<{ n: number; i: number } | null>(null);
  const [cc, setCc] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [showHist, setShowHist] = React.useState(false);
  const [full, setFull] = React.useState(false);

  const remember = React.useCallback(() => {
    const p = player.current;
    if (!p || !info.id || info.live) return;
    try {
      const pos = readJson<Record<string, number>>(PKEY, {});
      const now = p.getCurrentTime?.() ?? 0, dur = p.getDuration?.() ?? 0;
      if (now > 30 && dur - now > 30) pos[info.id] = Math.floor(now);
      else delete pos[info.id];
      const keys = Object.keys(pos);
      if (keys.length > 60) delete pos[keys[0]!];
      localStorage.setItem(PKEY, JSON.stringify(pos));
    } catch {}
  }, [info.id, info.live]);

  // One player for the dock; new sources load into it.
  React.useEffect(() => {
    let dead = false;
    void loadApi()
      .then(() => {
        if (dead || !holder.current || !window.YT) return;
        const el = document.createElement("div");
        holder.current.appendChild(el);
        const start = src.video ? readJson<Record<string, number>>(PKEY, {})[src.video] : undefined;
        player.current = new window.YT.Player(el, {
          width: "100%",
          height: "100%",
          videoId: src.video,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1, origin: window.location.origin, ...(src.list ? { listType: "playlist", list: src.list, index: src.index ?? 0 } : {}), ...(start ? { start } : {}) },
          events: {
            onReady: (e: { target: YtPlayer }) => {
              setReady(true);
              setVol(e.target.getVolume());
              setRates(e.target.getAvailablePlaybackRates?.() ?? [1]);
            },
            onStateChange: (e: { data: number; target: YtPlayer }) => {
              setState(e.data);
              const d = e.target.getVideoData?.();
              if (d?.video_id) {
                setInfo({ title: d.title, author: d.author, id: d.video_id, live: !!d.isLive });
                // History: the latest first, no repeats.
                if (e.data === 1 && d.title) {
                  const h = [{ id: d.video_id, title: d.title, author: d.author, at: Date.now() }, ...readJson<Hist[]>(HKEY, []).filter((x) => x.id !== d.video_id)].slice(0, 30);
                  try {
                    localStorage.setItem(HKEY, JSON.stringify(h));
                  } catch {}
                  onHistory(h);
                }
              }
              const pl = e.target.getPlaylist?.();
              setList(pl?.length ? { n: pl.length, i: e.target.getPlaylistIndex() } : null);
              if (e.data === 2) remember();
            },
            onError: (e: { data: number }) => {
              const why = e.data === 101 || e.data === 150 ? "The video's owner does not allow playing it inside other sites." : e.data === 100 ? "This video was removed or is private." : e.data === 2 ? "That is not a valid video link." : "YouTube could not play this video.";
              setErr(why);
            },
          },
        });
      })
      .catch((e: Error) => setErr(e.message));
    return () => {
      dead = true;
      remember();
      player.current?.destroy();
      player.current = null;
      if (holder.current) holder.current.innerHTML = "";
    };
    // The player is made once; later sources load into it (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) return void (first.current = false);
    const p = player.current;
    if (!p || !ready) return;
    remember();
    setErr(null);
    if (src.list) p.loadPlaylist({ list: src.list, listType: "playlist", index: src.index ?? 0 });
    else if (src.video) p.loadVideoById({ videoId: src.video, startSeconds: readJson<Record<string, number>>(PKEY, {})[src.video] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const p = player.current;
      if (p?.getCurrentTime) setT({ now: p.getCurrentTime(), dur: p.getDuration() });
    }, 500);
    const f = () => setFull(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", f);
    return () => (window.clearInterval(timer), document.removeEventListener("fullscreenchange", f));
  }, []);

  const p = player.current;
  const playing = state === 1;
  const toggle = () => (playing ? p?.pauseVideo() : p?.playVideo());
  const seek = (s: number) => p?.seekTo(Math.max(0, s), true);
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, select")) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") (e.preventDefault(), toggle());
    else if (k === "j" || k === "arrowleft") seek(t.now - (k === "j" ? 10 : 5));
    else if (k === "l" || k === "arrowright") seek(t.now + (k === "l" ? 10 : 5));
    else if (k === "m") (mute ? p?.unMute() : p?.mute(), setMute(!mute));
    else if (k === "f") void (full ? document.exitFullscreen() : shell.current?.requestFullscreen());
    else if (k === "n") p?.nextVideo();
    else if (k === "p") p?.previousVideo();
  };
  return (
    <div
      ref={shell}
      tabIndex={0}
      onKeyDown={onKey}
      className={cn(
        "fixed z-[70] flex flex-col overflow-hidden rounded-xl border bg-[#0b0b0f] text-white shadow-2xl outline-none no-print",
        full ? "inset-0 rounded-none" : mode === "mini" ? "bottom-20 left-3 w-72 md:bottom-4 md:left-[calc(var(--sidebar-width,16rem)+0.75rem)]" : "right-3 bottom-3 w-[min(640px,calc(100vw-1.5rem))] sm:right-[440px]",
      )}
      role="region"
      aria-label="YouTube player"
      data-youtube-dock={mode}
    >
      <div className={cn("relative w-full bg-black", full ? "min-h-0 flex-1" : "aspect-video")}>
        <div ref={holder} className="absolute inset-0 [&>iframe]:size-full" data-youtube-player />
        {(!ready || state === 3) && !err && <Loader2Icon className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/70" />}
        {err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 p-4 text-center text-sm">
            <p>{err}</p>
            {info.id && <a className="text-xs underline" href={`https://www.youtube.com/watch?v=${info.id}`} target="_blank" rel="noreferrer">Watch it on YouTube instead</a>}
          </div>
        )}
      </div>
      <div className="space-y-1 p-2 text-xs">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" data-youtube-title>{info.title || "YouTube"}</p>
            <p className="truncate text-white/60">{info.author}{list ? ` · video ${list.i + 1} of ${list.n}` : ""}{info.live ? " · live" : ""}</p>
          </div>
          <button type="button" aria-label={mode === "mini" ? "Bigger player" : "Mini player"} title={mode === "mini" ? "Bigger player" : "Mini player"} onClick={() => setMode(mode === "mini" ? "big" : "mini")} className="rounded p-1 hover:bg-white/10" data-youtube-size>
            {mode === "mini" ? <PictureInPicture2Icon className="size-4" /> : <ChevronDownIcon className="size-4" />}
          </button>
          <button type="button" aria-label={full ? "Leave full screen" : "Full screen"} onClick={() => void (full ? document.exitFullscreen() : shell.current?.requestFullscreen())} className="rounded p-1 hover:bg-white/10">{full ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}</button>
          <button type="button" aria-label="Close the player" onClick={() => (remember(), onClose())} className="rounded p-1 hover:bg-white/10" data-youtube-close><XIcon className="size-4" /></button>
        </div>
        {!info.live && (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-white/70">{clock(t.now)}</span>
            <input type="range" min={0} max={Math.max(1, t.dur)} step={1} value={Math.min(t.now, t.dur)} onChange={(e) => seek(Number(e.target.value))} className="h-1 flex-1 accent-[#ff0033]" aria-label="Seek" />
            <span className="tabular-nums text-white/70">{clock(t.dur)}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {list && <button type="button" aria-label="Previous video" onClick={() => p?.previousVideo()} className="rounded p-1 hover:bg-white/10"><SkipBackIcon className="size-4" /></button>}
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle} className="rounded-full bg-white p-1.5 text-black" data-youtube-toggle>{playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}</button>
          {list && <button type="button" aria-label="Next video" onClick={() => p?.nextVideo()} className="rounded p-1 hover:bg-white/10"><SkipForwardIcon className="size-4" /></button>}
          <button type="button" aria-label={mute ? "Unmute" : "Mute"} onClick={() => (mute ? p?.unMute() : p?.mute(), setMute(!mute))} className="ml-1 rounded p-1 hover:bg-white/10">{mute ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}</button>
          <input type="range" min={0} max={100} value={vol} onChange={(e) => (setVol(Number(e.target.value)), p?.setVolume(Number(e.target.value)), mute && (p?.unMute(), setMute(false)))} className="w-16 accent-white sm:w-20" aria-label="Volume" />
          <select value={rate} onChange={(e) => (setRate(Number(e.target.value)), p?.setPlaybackRate(Number(e.target.value)))} className="ml-auto h-6 rounded bg-white/10 px-1" aria-label="Speed">
            {rates.map((r) => <option key={r} value={r} className="text-black">{r}x</option>)}
          </select>
          <button type="button" aria-label="Captions" aria-pressed={cc} title="Captions (when the video has them)" onClick={() => (cc ? p?.unloadModule("captions") : p?.loadModule("captions"), setCc(!cc))} className={cn("rounded p-1 hover:bg-white/10", cc && "bg-white/20")}><CaptionsIcon className="size-4" /></button>
          {mode === "big" && <button type="button" aria-label="What you watched" onClick={() => setShowHist(!showHist)} className={cn("rounded p-1 hover:bg-white/10", showHist && "bg-white/20")}><HistoryIcon className="size-4" /></button>}
        </div>
        {showHist && mode === "big" && <HistoryList onPick={(id) => window.dispatchEvent(new CustomEvent("myseed-yt", { detail: { video: id } }))} />}
      </div>
    </div>
  );
}

function HistoryList({ onPick }: { onPick: (id: string) => void }) {
  const h = readJson<Hist[]>(HKEY, []);
  return (
    <div className="max-h-32 overflow-y-auto rounded bg-white/5 p-1">
      {h.length ? h.map((x) => (
        <button key={x.id} type="button" onClick={() => onPick(x.id)} className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-white/10">
          {x.title} <span className="text-white/50">· {x.author}</span>
        </button>
      )) : <p className="text-white/50">Nothing watched yet.</p>}
    </div>
  );
}

// Anything can ask the player to play (the history list, the assistant): a "myseed-yt" event.
export function YouTubeEvents() {
  const yt = useYouTube();
  React.useEffect(() => {
    const on = (e: Event) => yt?.play((e as CustomEvent<Src>).detail);
    window.addEventListener("myseed-yt", on);
    return () => window.removeEventListener("myseed-yt", on);
  }, [yt]);
  return null;
}

// Search results to pick from (Admin's key on the server, or the person's YouTube sign-in in the browser).
export type YtResult = { id: string; title: string; channel: string; thumb: string; live: boolean; playlist?: boolean };
export function YouTubeResults({ items, onPick }: { items: YtResult[]; onPick: (r: YtResult) => void }) {
  if (!items.length) return null;
  return (
    <div className="grid max-h-72 gap-1 overflow-y-auto" data-youtube-results>
      {items.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r)} className="flex items-center gap-2 rounded-lg p-1 text-left text-xs hover:bg-muted">
          {r.thumb ? <img src={r.thumb} alt="" className="h-12 w-20 shrink-0 rounded object-cover" loading="lazy" /> : <span className="h-12 w-20 shrink-0 rounded bg-muted" />}
          <span className="min-w-0">
            <span className="line-clamp-2 font-medium">{r.title}</span>
            <span className="text-muted-foreground">{r.channel}{r.live ? " · live" : ""}{r.playlist ? " · playlist" : ""}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function useYtSearch(serverSearch: boolean, token: string | null) {
  const [busy, setBusy] = React.useState(false);
  const [items, setItems] = React.useState<YtResult[]>([]);
  const search = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      if (serverSearch) {
        const { youtubeSearchAction } = await import("@/app/actions/fun");
        const r = await youtubeSearchAction(q);
        if (!r.ok) throw new Error(r.error);
        setItems((r.data ?? []) as YtResult[]);
      } else if (token) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&type=video&safeSearch=moderate&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("YouTube did not answer the search.");
        const j = (await res.json()) as { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; liveBroadcastContent?: string; thumbnails?: { medium?: { url: string } } } }[] };
        setItems((j.items ?? []).map((i) => ({ id: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails?.medium?.url ?? "", live: i.snippet.liveBroadcastContent === "live" })));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };
  return { busy, items, search, clear: () => setItems([]) };
}

export function YtButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return <Button size="xs" variant="outline" onClick={onClick} className={className}>{children}</Button>;
}
