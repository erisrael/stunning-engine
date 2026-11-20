"use client";

import * as React from "react";
import Script from "next/script";
import { toast } from "sonner";
import { Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon, SearchIcon, SquareIcon, TargetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { PERSONAS, QUIZ, parseYouTube, personaFrom } from "@/lib/focus";
import type { FocusPrefs } from "@/server/fun";
import { usePlayer } from "./player";
import { PERSONA_ICONS } from "./icons";
import { YouTubeResults, useYouTube, useYtSearch } from "./youtube";

// Focus mode: a timer (focus, then a break), music for the person's persona (free music, or YouTube: their own
// playlists after signing in when Admin set it up, or any playlist link), and the page quietens while focusing
// (notifications hidden, the rest dimmed) when they choose. Finished sessions count and earn points.

type Timer = { phase: "focus" | "break"; endsAt: number | null; left: number; total: number; running: boolean };
type FocusApi = { timer: Timer; start: (minutes: number) => void; pause: () => void; resume: () => void; stop: () => void; prefs: FocusPrefs; setPrefs: (p: FocusPrefs) => void };
const Ctx = React.createContext<FocusApi | null>(null);
export const useFocus = () => React.useContext(Ctx);
const KEY = "myseed.focus.timer";

function chime() {
  try {
    const a = new AudioContext();
    [660, 880, 990].forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, a.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + i * 0.18);
      o.stop(a.currentTime + i * 0.18 + 0.55);
    });
  } catch {}
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = React.useState<Timer>({ phase: "focus", endsAt: null, left: 0, total: 0, running: false });
  const [prefs, setPrefsState] = React.useState<FocusPrefs>({ minutes: 25, breakMinutes: 5 });
  const done = React.useRef(false);
  React.useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(KEY) ?? "null") as Timer | null;
      if (t?.running && t.endsAt && t.endsAt > Date.now()) setTimer(t);
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(timer));
    } catch {}
    const root = document.documentElement;
    const quiet = timer.running && timer.phase === "focus";
    if (quiet && prefs.hideToasts) root.dataset.focusQuiet = "on";
    else delete root.dataset.focusQuiet;
    if (quiet && prefs.dim) root.dataset.focusDim = "on";
    else delete root.dataset.focusDim;
  }, [timer, prefs.hideToasts, prefs.dim]);
  React.useEffect(() => {
    if (!timer.running || !timer.endsAt) return;
    done.current = false;
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.round((timer.endsAt! - Date.now()) / 1000));
      setTimer((x) => ({ ...x, left }));
      if (left === 0 && !done.current) {
        done.current = true;
        chime();
        if (timer.phase === "focus") {
          const mins = Math.round(timer.total / 60);
          void F.completeFocusAction(mins).then((r) => r.ok && toast.success(`Focus session done: ${mins} minutes${r.data?.earned ? `, +${r.data.earned} points` : ""}. Take a break!`, { duration: 12000 }));
          try {
            speechSynthesis.speak(new SpeechSynthesisUtterance("Focus session done. Time for a break."));
          } catch {}
          const b = (prefs.breakMinutes ?? 5) * 60;
          setTimer({ phase: "break", endsAt: Date.now() + b * 1000, left: b, total: b, running: true });
        } else {
          toast("Break over. Ready for the next one?", { duration: 10000 });
          setTimer({ phase: "focus", endsAt: null, left: 0, total: 0, running: false });
        }
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [timer.running, timer.endsAt, timer.phase, timer.total, prefs.breakMinutes]);
  const api: FocusApi = {
    timer,
    prefs,
    setPrefs: setPrefsState,
    start: (minutes) => setTimer({ phase: "focus", endsAt: Date.now() + minutes * 60e3, left: minutes * 60, total: minutes * 60, running: true }),
    pause: () => setTimer((x) => ({ ...x, running: false, endsAt: null })),
    resume: () => setTimer((x) => ({ ...x, running: true, endsAt: Date.now() + x.left * 1000 })),
    stop: () => setTimer({ phase: "focus", endsAt: null, left: 0, total: 0, running: false }),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      {(timer.running || timer.left > 0) && <FocusPill />}
    </Ctx.Provider>
  );
}

// A plain red play mark for YouTube links (no brand logo).
function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4", className)}>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
      <path d="M10 9l5 3-5 3z" fill="#fff" />
    </svg>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// A small timer at the top of the page while a session runs.
function FocusPill() {
  const f = useFocus()!;
  const t = f.timer;
  return (
    <div className="fixed top-2 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-sm shadow-lg backdrop-blur no-print" data-focus-pill>
      <TargetIcon className={cn("size-4", t.phase === "focus" ? "text-primary" : "text-[#188038]")} />
      <span className="font-medium">{t.phase === "focus" ? "Focus" : "Break"}</span>
      <span className="tabular-nums">{clock(t.left)}</span>
      <button type="button" aria-label={t.running ? "Pause" : "Resume"} onClick={t.running ? f.pause : f.resume} className="rounded-full p-0.5 hover:bg-muted">
        {t.running ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
      </button>
      <button type="button" aria-label="Stop" onClick={f.stop} className="rounded-full p-0.5 hover:bg-muted">
        <SquareIcon className="size-3.5" />
      </button>
    </div>
  );
}

type GTokenClient = { requestAccessToken: () => void };
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }) => GTokenClient } } };
  }
}

export function FocusTab({ initial, youtubeOn, clientId, serverSearch = false }: { initial: { persona: string | null; prefs: FocusPrefs; sessions: number; minutes: number }; youtubeOn: boolean; clientId: string; serverSearch?: boolean }) {
  const f = useFocus()!;
  const player = usePlayer();
  const [persona, setPersona] = React.useState(initial.persona);
  const [quiz, setQuiz] = React.useState<number[] | null>(initial.persona ? null : []);
  const [stats, setStats] = React.useState({ sessions: initial.sessions, minutes: initial.minutes });
  const ytp = useYouTube();
  const [link, setLink] = React.useState("");
  const [q, setQ] = React.useState("");
  const [token, setToken] = React.useState<string | null>(null);
  const [mine, setMine] = React.useState<{ id: string; title: string; count?: number }[] | null>(null);
  const yts = useYtSearch(serverSearch, token);
  const canSearch = serverSearch || !!token;
  // Videos and playlists play in the player inside the app (it keeps playing while you work).
  const setYt = (y: { list?: string; video?: string; title?: string }) => ytp?.play(y);
  const prefs = f.prefs;
  React.useEffect(() => {
    f.setPrefs({ minutes: 25, breakMinutes: 5, ...initial.prefs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const p = PERSONAS.find((x) => x.key === persona) ?? null;
  const save = async (input: { persona?: string | null; prefs?: FocusPrefs }) => {
    const r = await F.saveFocusAction(input);
    if (!r.ok) return void toast.error(r.error);
    if (r.data) (f.setPrefs(r.data.prefs), setStats({ sessions: r.data.sessions, minutes: r.data.minutes }));
  };
  const signIn = () => {
    const g = window.google?.accounts?.oauth2;
    if (!g) return void toast.error("Google sign-in is still loading. Try again in a moment.");
    g.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      callback: async (r) => {
        if (!r.access_token) return void toast.error("YouTube sign-in was cancelled.");
        setToken(r.access_token);
        const res = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50", { headers: { Authorization: `Bearer ${r.access_token}` } });
        if (!res.ok) return void toast.error("YouTube did not share your playlists.");
        const j = (await res.json()) as { items?: { id: string; snippet: { title: string }; contentDetails: { itemCount: number } }[] };
        setMine([{ id: "LL", title: "Liked videos" }, ...(j.items ?? []).map((i) => ({ id: i.id, title: i.snippet.title, count: i.contentDetails.itemCount }))]);
      },
    }).requestAccessToken();
  };

  if (quiz) {
    const i = quiz.length;
    if (i < QUIZ.length) {
      const q = QUIZ[i]!;
      return (
        <div className="space-y-3" data-focus-quiz>
          <p className="text-xs text-muted-foreground">Find your focus persona · {i + 1} of {QUIZ.length}</p>
          <p className="text-base font-semibold">{q.q}</p>
          <div className="grid gap-1.5">
            {q.answers.map((a, k) => (
              <button key={k} type="button" className="rounded-lg border p-2.5 text-left text-sm hover:border-primary hover:bg-primary/5" onClick={() => setQuiz([...quiz, k])}>
                {a.label}
              </button>
            ))}
          </div>
          {persona && <Button size="xs" variant="ghost" onClick={() => setQuiz(null)}>Keep my persona</Button>}
        </div>
      );
    }
    const found = personaFrom(quiz);
    return (
      <div className="space-y-3 text-center" data-focus-result>
        <p className="flex justify-center">{React.createElement(PERSONA_ICONS[found.key]!, { className: "size-14 text-primary" })}</p>
        <p className="text-lg font-semibold">You are a {found.label}</p>
        <p className="text-sm text-muted-foreground">{found.about}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={async () => { setPersona(found.key); setQuiz(null); await save({ persona: found.key, prefs: { ...prefs, minutes: found.minutes, breakMinutes: found.breakMinutes } }); }}>That&apos;s me</Button>
          <Button variant="outline" onClick={() => setQuiz([])}>Try again</Button>
        </div>
      </div>
    );
  }

  const t = f.timer;
  const pct = t.total ? Math.round(((t.total - t.left) / t.total) * 100) : 0;
  return (
    <div className="space-y-4" data-focus-tab>
      {clientId && youtubeOn && <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />}
      <section className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-primary/15 to-transparent p-4">
        <div className="relative flex size-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${pct * 3.6}deg, color-mix(in oklab, var(--primary) 15%, transparent) 0)` }}>
          <div className="flex size-[124px] flex-col items-center justify-center rounded-full bg-background">
            <span className="text-3xl font-semibold tabular-nums">{t.total ? clock(t.left) : `${prefs.minutes ?? 25}:00`}</span>
            <span className="text-xs text-muted-foreground">{t.total ? (t.phase === "focus" ? "Focusing" : "Break") : "Ready"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!t.total ? (
            <Button onClick={() => f.start(prefs.minutes ?? 25)} data-focus-start>
              <PlayIcon /> Start focus
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={t.running ? f.pause : f.resume}>{t.running ? <PauseIcon /> : <PlayIcon />} {t.running ? "Pause" : "Resume"}</Button>
              <Button variant="ghost" onClick={f.stop}><SquareIcon /> Stop</Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {[15, 25, 45, 50, 90].map((m) => (
            <button key={m} type="button" onClick={() => void save({ prefs: { ...prefs, minutes: m } })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", prefs.minutes === m && "border-primary bg-primary/10 font-medium")}>{m} min</button>
          ))}
          <label className="flex items-center gap-1 text-xs">
            break
            <select value={prefs.breakMinutes ?? 5} onChange={(e) => void save({ prefs: { ...prefs, breakMinutes: Number(e.target.value) } })} className="h-6 rounded border bg-background px-1" aria-label="Break length">
              {[3, 5, 10, 15, 20].map((b) => <option key={b} value={b}>{b} min</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">{stats.sessions} sessions · {Math.round(stats.minutes / 60 * 10) / 10} hours focused</p>
      </section>

      <section className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex items-center justify-between gap-2 rounded-lg border p-2">Hide notifications while focusing <Switch checked={!!prefs.hideToasts} onCheckedChange={(v) => void save({ prefs: { ...prefs, hideToasts: v } })} aria-label="Hide notifications while focusing" /></label>
        <label className="flex items-center justify-between gap-2 rounded-lg border p-2">Dim the menus while focusing <Switch checked={!!prefs.dim} onCheckedChange={(v) => void save({ prefs: { ...prefs, dim: v } })} aria-label="Dim the menus while focusing" /></label>
      </section>

      {p && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-primary">{React.createElement(PERSONA_ICONS[p.key]!, { className: "size-7" })}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.about}</p>
            </div>
            <Button size="xs" variant="ghost" onClick={() => setQuiz([])}><RotateCcwIcon /> Retake</Button>
          </div>
          <p className="text-xs font-medium">Recommended for you</p>
          <div className="flex flex-wrap gap-1">
            {p.music.map((m) => (
              <Button key={m.q} size="xs" variant="outline" onClick={async () => { const r = await F.searchMusicAction(m.q); if (r.ok && r.data?.length) player?.playList(r.data, 0); else toast.error("No music found right now."); }} data-focus-music={m.q}>
                <PlayIcon /> {m.label}
              </Button>
            ))}
          </div>
          {youtubeOn && (
            <div className="flex flex-wrap gap-1">
              {p.youtube.map((y) =>
                y.video ? (
                  <Button key={y.label} size="xs" variant="outline" onClick={() => (player?.pause(), setYt({ video: y.video, title: y.label }))} data-focus-yt={y.video}><YoutubeIcon className="text-[#ff0000]" /> {y.label}</Button>
                ) : canSearch ? (
                  <Button key={y.label} size="xs" variant="outline" onClick={() => (setQ(y.search), void yts.search(y.search))}><SearchIcon /> {y.label}</Button>
                ) : null,
              )}
            </div>
          )}
        </section>
      )}

      {youtubeOn && (
        <section className="space-y-2" data-focus-youtube>
          <p className="flex items-center gap-1 text-xs font-medium"><YoutubeIcon className="size-4 text-[#ff0000]" /> YouTube</p>
          {clientId ? (
            mine ? (
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {mine.map((pl) => (
                  <button key={pl.id} type="button" onClick={() => (player?.pause(), setYt({ list: pl.id }))} className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted">
                    {pl.title}{pl.count !== undefined ? ` · ${pl.count}` : ""}
                  </button>
                ))}
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={signIn} data-youtube-signin><YoutubeIcon className="text-[#ff0000]" /> Sign in to YouTube for your playlists</Button>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground">Paste a YouTube playlist or video link. It plays here, in the player at the side, with your YouTube account when you are signed in to YouTube in this browser.</p>
          )}
          {canSearch && (
            <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), void yts.search(q))}>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YouTube" aria-label="Search YouTube" className="h-8" data-youtube-search />
              <Button size="sm" type="submit" variant="outline" disabled={yts.busy}>{yts.busy ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}</Button>
            </form>
          )}
          <YouTubeResults items={yts.items} onPick={(r) => (player?.pause(), setYt(r.playlist ? { list: r.id, title: r.title } : { video: r.id, title: r.title }))} />
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const y = parseYouTube(link); if (!y) return void toast.error("That is not a YouTube link."); player?.pause(); setYt(y); if (y.list) void save({ prefs: { ...prefs, youtube: [...(prefs.youtube ?? []).filter((x) => x.id !== y.list), { id: y.list, title: `Playlist ${y.list.slice(0, 8)}` }] } }); setLink(""); }}>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…" aria-label="YouTube link" className="h-8" />
            <Button size="sm" type="submit">Play</Button>
          </form>
          {(prefs.youtube ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(prefs.youtube ?? []).map((y) => (
                <button key={y.id} type="button" onClick={() => (player?.pause(), setYt({ list: y.id }))} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{y.title}</button>
              ))}
            </div>
          )}
          {(ytp?.history.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">Watched lately</p>
              <div className="flex flex-wrap gap-1">
                {ytp!.history.slice(0, 6).map((h) => <button key={h.id} type="button" onClick={() => setYt({ video: h.id, title: h.title })} className="max-w-48 truncate rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{h.title}</button>)}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
