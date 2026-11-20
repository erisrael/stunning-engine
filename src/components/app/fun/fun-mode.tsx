"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowLeftIcon, TargetIcon, Gamepad2Icon, HeartIcon, Loader2Icon, MusicIcon, PawPrintIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { PlayerProvider, usePlayer } from "./player";
import { MusicTab, NowPlaying } from "./music";
import { GAME_ICONS } from "./icons";
import { FocusProvider, FocusTab, useFocus } from "./focus";
import { YouTubeEvents, YouTubeProvider } from "./youtube";

// Fun mode: a side window (like the assistant's) with music, games, a pet and morale boosters. Opened from the top
// bar's gamepad, from the assistant ("play some jazz", "open chess"), or with Alt+F. It stays mounted once opened,
// so music, games and timers carry on while switching tabs; music keeps playing with the window closed.

export const FUN_EVENT = "myseed-fun";
export type FunCommand = {
  open?: boolean | "focus" | "music" | "games" | "pet" | "boost";
  // Start a focus session (minutes; true: the person's usual length).
  focus?: number | true;
  close?: boolean;
  toggle?: boolean;
  game?: string;
  music?: { action: "play" | "pause" | "toggle" | "next" | "prev" | "stop"; q?: string };
};
export function funCommand(c: FunCommand) {
  window.dispatchEvent(new CustomEvent<FunCommand>(FUN_EVENT, { detail: c }));
}

const Loading = () => <p className="py-8 text-center text-sm text-muted-foreground"><Loader2Icon className="inline size-4 animate-spin" /> Loading…</p>;
const ChessGame = dynamic(() => import("./chess").then((m) => m.ChessGame), { ssr: false, loading: Loading });
const ChessLearn = dynamic(() => import("./chess").then((m) => m.ChessLearn), { ssr: false, loading: Loading });
const Sudoku = dynamic(() => import("./sudoku").then((m) => m.Sudoku), { ssr: false, loading: Loading });
const G = (k: "Game2048" | "Snake" | "Memory" | "Minesweeper" | "TicTacToe" | "WordGuess" | "Typing" | "Reaction") => dynamic(() => import("./games").then((m) => m[k]), { ssr: false, loading: Loading });
const SeedTown = dynamic(() => import("./world").then((m) => m.SeedTown), { ssr: false, loading: Loading });
const GAMES: Record<string, React.ComponentType> = {
  world: SeedTown,
  chess: ChessGame,
  "chess-learn": ChessLearn,
  sudoku: Sudoku,
  "2048": G("Game2048"),
  snake: G("Snake"),
  memory: G("Memory"),
  minesweeper: G("Minesweeper"),
  tictactoe: G("TicTacToe"),
  wordguess: G("WordGuess"),
  typing: G("Typing"),
  reaction: G("Reaction"),
};

const PetTab = dynamic(() => import("./pet").then((m) => m.PetTab), { ssr: false, loading: Loading });
const RoamingPet = dynamic(() => import("./pet-roam").then((m) => m.RoamingPet), { ssr: false });

// The pet on the screen loads (with 3D) only when someone switched it on in the Pet tab.
function PetGate() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    try {
      setOn(localStorage.getItem("myseed.pet.roam") === "1");
    } catch {}
    const t = (e: Event) => setOn(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("myseed-pet-roam", t);
    return () => window.removeEventListener("myseed-pet-roam", t);
  }, []);
  return on ? <RoamingPet /> : null;
}
const BoostTab = dynamic(() => import("./boost").then((m) => m.BoostTab), { ssr: false, loading: Loading });

type Home = NonNullable<Extract<Awaited<ReturnType<typeof F.funHomeAction>>, { ok: true }>["data"]>;
type Tab = "focus" | "music" | "games" | "pet" | "boost";
const STORE = "myseed.fun.window";

const inHours = (from: string, to: string) => {
  if (!from || !to) return true;
  const d = new Date();
  const now = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return from <= to ? now >= from && now < to : now >= from || now < to;
};

// standalone: the installed Fun app (/fun): the window fills the page and is always open.
export function FunMode({ standalone = false }: { standalone?: boolean }) {
  return (
    <PlayerProvider>
      <YouTubeProvider>
        <YouTubeEvents />
        <FocusProvider>
          <FunWindow standalone={standalone} />
          <PetGate />
        </FocusProvider>
      </YouTubeProvider>
    </PlayerProvider>
  );
}

function FunWindow({ standalone = false }: { standalone?: boolean }) {
  const player = usePlayer();
  const focus = useFocus();
  const [open, setOpen] = React.useState(standalone);
  const [mounted, setMounted] = React.useState(standalone);
  const [tab, setTab] = React.useState<Tab>("music");
  const [seen, setSeen] = React.useState<Set<Tab>>(new Set(["music"]));
  const [game, setGame] = React.useState<string | null>(null);
  const [home, setHome] = React.useState<Home | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [musicQuery, setMusicQuery] = React.useState<string | null>(null);
  const pending = React.useRef<FunCommand["music"] | null>(null);

  const loadHome = React.useCallback(async () => {
    const r = await F.funHomeAction();
    if (!r.ok) return void setError(r.error ?? "Fun mode could not open.");
    if (!r.data) return void setError("Admin has switched Fun mode off for you.");
    setHome(r.data);
  }, []);
  const show = React.useCallback(
    (t?: Tab) => {
      setMounted(true);
      setOpen(true);
      if (t) (setTab(t), setSeen((s) => new Set(s).add(t)));
      else setSeen((s) => new Set(s).add(tab));
      if (!home) void loadHome();
    },
    [home, loadHome],
  );
  // The installed app opens straight into the window.
  React.useEffect(() => {
    if (standalone) void loadHome();
  }, [standalone, loadHome]);
  const pickTab = (t: Tab) => (setTab(t), setSeen((s) => new Set(s).add(t)));

  // Commands from the top bar, the assistant and the keyboard.
  React.useEffect(() => {
    const on = (e: Event) => {
      const c = (e as CustomEvent<FunCommand>).detail ?? {};
      if (c.close) return setOpen(false);
      if (c.toggle) return open ? setOpen(false) : show();
      if (c.focus) {
        show("focus");
        focus?.start(c.focus === true ? (focus.prefs.minutes ?? 25) : c.focus);
      }
      if (c.game) {
        show("games");
        setGame(c.game);
      } else if (c.open) show(c.open === true ? undefined : c.open);
      if (c.music) {
        const m = c.music;
        if (m.action === "play" && m.q) {
          show("music");
          setMusicQuery(m.q);
          pending.current = m;
          void F.searchMusicAction(m.q).then((r) => r.ok && r.data?.length && player?.playList(r.data, 0));
        } else if (m.action === "play" || m.action === "toggle") player?.current ? player.toggle() : (show("music"), void F.searchMusicAction("lofi").then((r) => r.ok && r.data?.length && player?.playList(r.data, 0)));
        else if (m.action === "pause") player?.pause();
        else if (m.action === "next") player?.next();
        else if (m.action === "prev") player?.prev();
        else if (m.action === "stop") player?.stop();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "f" || e.key === "F")) (e.preventDefault(), open ? setOpen(false) : show());
    };
    window.addEventListener(FUN_EVENT, on);
    window.addEventListener("keydown", key);
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? "{}") as { tab?: Tab };
      if (s.tab) setTab(s.tab);
    } catch {}
    return () => (window.removeEventListener(FUN_EVENT, on), window.removeEventListener("keydown", key));
  }, [open, show, player, focus]);
  React.useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ tab }));
    } catch {}
  }, [tab]);

  const gamesOpen = home ? inHours(home.config.gamesFrom, home.config.gamesTo) : true;
  const Game = game ? GAMES[game] : null;
  const tabs: [Tab, string, React.ReactNode, boolean][] = [
    ["focus", "Focus", <TargetIcon key="f" />, !!home?.config.focus],
    ["music", "Music", <MusicIcon key="m" />, !!home?.config.music],
    ["games", "Games", <Gamepad2Icon key="g" />, !!home?.config.games.length],
    ["pet", "Pet", <PawPrintIcon key="p" />, !!home?.config.pet],
    ["boost", "Boost", <HeartIcon key="b" />, true],
  ];
  return (
    <>
      {/* Music keeps playing with the window closed: a small player at the bottom left. */}
      {!open && player?.current && (
        <div className="fixed bottom-20 left-3 z-40 w-64 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur md:bottom-4 md:left-[calc(var(--sidebar-width,16rem)+0.75rem)] no-print" data-fun-mini>
          <button type="button" className="absolute -top-2 -right-2 rounded-full border bg-background p-0.5" aria-label="Open Fun mode" onClick={() => show("music")}>
            <SparklesIcon className="size-3.5 text-primary" />
          </button>
          <NowPlaying compact />
        </div>
      )}
      {mounted && (
        <aside
          aria-label="Fun mode"
          hidden={!open}
          className={standalone ? "mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col rounded-t-2xl border bg-background shadow-xl" : "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[420px] no-print"}
          data-fun-window
        >
          <header className="flex items-center gap-2 border-b px-3 py-2">
            {game ? (
              <Button size="icon" variant="ghost" className="size-8" aria-label="Back to the games" onClick={() => setGame(null)}>
                <ArrowLeftIcon />
              </Button>
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7eb6] via-[#9334E6] to-[#4285F4] text-white">
                <SparklesIcon className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{game ? (home?.config.games.find((g) => g.key === game)?.label ?? "Game") : "Fun mode"}</p>
              {home?.config.points && (
                <p className="text-[11px] text-muted-foreground">
                  Level {home.level.level} · {home.points.balance} points · +{home.points.today} today
                </p>
              )}
            </div>
            {!standalone && (
              <Button size="xs" variant="ghost" asChild title="Myseed Fun as its own app: install it from that page">
                <a href="/fun" target="_blank" rel="noreferrer" data-fun-open-app>Open as app</a>
              </Button>
            )}
            {!standalone && (
              <Button size="icon" variant="ghost" className="size-8" aria-label="Close Fun mode" title="Close (Alt+F)" onClick={() => setOpen(false)}>
                <XIcon />
              </Button>
            )}
          </header>
          {!game && (
            <nav className="flex border-b" role="tablist" aria-label="Fun mode">
              {tabs.filter((t) => t[3]).map(([k, label, icon]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pickTab(k)} className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs [&_svg]:size-4", tab === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} data-fun-tab={k}>
                  {icon} {label}
                </button>
              ))}
            </nav>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {error ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
            ) : !home ? (
              <Loading />
            ) : game && Game ? (
              gamesOpen ? <Game /> : <p className="text-sm text-muted-foreground">Games are open from {home.config.gamesFrom} to {home.config.gamesTo}.</p>
            ) : (
              <>
                {seen.has("focus") && home.config.focus && home.focus && (
                  <div hidden={tab !== "focus"}>
                    <FocusTab initial={home.focus} youtubeOn={home.config.youtube} clientId={home.config.youtubeClientId} serverSearch={!!home.config.youtubeSearch} />
                  </div>
                )}
                {seen.has("music") && home.config.music && (
                  <div hidden={tab !== "music"}>
                    <MusicTab lyricsOn={home.config.lyrics} playlistsOn={home.config.playlists} initialQuery={musicQuery} key={musicQuery ?? ""} />
                  </div>
                )}
                {tab === "games" && (
                  <div className="space-y-2" data-fun-games>
                    <GameSoundToggle />
                    {!gamesOpen && <p className="rounded-lg bg-muted p-2 text-xs">Games are open from {home.config.gamesFrom} to {home.config.gamesTo}. Music and the rest stay open.</p>}
                    <div className="grid grid-cols-2 gap-2">
                      {home.config.games.map((g) => (
                        <button key={g.key} type="button" disabled={!gamesOpen} onClick={() => setGame(g.key)} className="flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50" data-fun-game={g.key}>
                          {React.createElement(GAME_ICONS[g.key] ?? GAME_ICONS.chess!, { className: "size-7 text-primary" })}
                          <span className="text-sm font-medium">{g.label}</span>
                          <span className="text-[11px] text-muted-foreground">{g.note}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {seen.has("pet") && home.config.pet && <div hidden={tab !== "pet"}><PetTab /></div>}
                {seen.has("boost") && <div hidden={tab !== "boost"}><BoostTab home={home} /></div>}
              </>
            )}
          </div>
          {player?.current && (tab !== "music" || game) && (
            <div className="border-t p-2">
              <NowPlaying compact />
            </div>
          )}
        </aside>
      )}
    </>
  );
}

// The top bar's button.
export function FunLauncher() {
  return (
    <Button size="icon" variant="ghost" className="rounded-full" aria-label="Fun mode: music, games and your pet" title="Fun mode (Alt+F)" onClick={() => funCommand({ toggle: true })} data-fun-launcher>
      <Gamepad2Icon />
    </Button>
  );
}

// Game sounds on or off (remembered on this device).
function GameSoundToggle() {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    try {
      setOn(localStorage.getItem("myseed.games.sound") !== "off");
    } catch {}
  }, []);
  return (
    <label className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
      Game sounds
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); try { localStorage.setItem("myseed.games.sound", e.target.checked ? "on" : "off"); } catch {} }} aria-label="Game sounds" data-game-sounds />
    </label>
  );
}
