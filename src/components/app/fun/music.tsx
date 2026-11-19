"use client";

import * as React from "react";
import { toast } from "sonner";
import { ListMusicIcon, Loader2Icon, MicVocalIcon, MusicIcon, PauseIcon, PlayIcon, PlusIcon, Repeat1Icon, RepeatIcon, SearchIcon, ShareIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon, Trash2Icon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import type { Track } from "@/server/fun";
import { clock, usePlayer } from "./player";

type Playlist = { id: string; name: string; mine: boolean; owner: string; shared: boolean; tracks: Track[] };
type Lyrics = { title: string; artist: string; instrumental: boolean; synced: { at: number; text: string }[] | null; plain: string | null } | null;

// The cover, trying the mirror hosts in turn when one fails, then a note icon.
function Art({ t, size = 40 }: { t: Track | null; size?: number }) {
  const urls = t?.artwork ? [t.artwork, ...(t.artworkAlt ?? [])] : [];
  const [n, setN] = React.useState(0);
  React.useEffect(() => setN(0), [t?.id]);
  return urls[n] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={urls[n]} alt="" width={size} height={size} loading="lazy" onError={() => setN((x) => x + 1)} className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary" style={{ width: size, height: size }}>
      <MusicIcon className="size-4" />
    </span>
  );
}

// Now playing: cover, controls, the seek bar, volume, shuffle and repeat. compact: the strip under the window.
export function NowPlaying({ compact = false, onLyrics }: { compact?: boolean; onLyrics?: () => void }) {
  const p = usePlayer();
  if (!p?.current) return null;
  const t = p.current;
  return (
    <div className={cn("space-y-2", compact ? "" : "rounded-xl border bg-card p-3")} data-now-playing>
      <div className="flex items-center gap-3">
        <Art t={t} size={compact ? 36 : 56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t.title}</p>
          <p className="truncate text-xs text-muted-foreground">{t.artist}</p>
        </div>
        {compact && (
          <span className="flex items-center">
            <Button size="icon" variant="ghost" className="size-8" aria-label={p.playing ? "Pause" : "Play"} onClick={p.toggle}>
              {p.loading ? <Loader2Icon className="animate-spin" /> : p.playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Next song" onClick={p.next}>
              <SkipForwardIcon />
            </Button>
          </span>
        )}
      </div>
      {!compact && (
        <>
          <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span>{clock(p.time)}</span>
            <input type="range" min={0} max={p.duration || t.duration || 1} step={1} value={p.time} onChange={(e) => p.seek(Number(e.target.value))} className="h-1 flex-1 accent-[var(--primary)]" aria-label="Position in the song" />
            <span>{clock(p.duration || t.duration)}</span>
          </div>
          <div className="flex items-center justify-between">
            <Button size="icon" variant={p.shuffle ? "secondary" : "ghost"} className="size-8" aria-label="Shuffle" aria-pressed={p.shuffle} onClick={() => p.setShuffle(!p.shuffle)}>
              <ShuffleIcon />
            </Button>
            <Button size="icon" variant="ghost" className="size-9" aria-label="Previous song" onClick={p.prev}>
              <SkipBackIcon />
            </Button>
            <Button size="icon" className="size-11 rounded-full" aria-label={p.playing ? "Pause" : "Play"} onClick={p.toggle} data-fun-play>
              {p.loading ? <Loader2Icon className="animate-spin" /> : p.playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button size="icon" variant="ghost" className="size-9" aria-label="Next song" onClick={p.next}>
              <SkipForwardIcon />
            </Button>
            <Button size="icon" variant={p.repeat !== "off" ? "secondary" : "ghost"} className="size-8" aria-label={`Repeat: ${p.repeat}`} onClick={() => p.setRepeat(p.repeat === "off" ? "all" : p.repeat === "all" ? "one" : "off")}>
              {p.repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={p.volume ? "Mute" : "Unmute"} onClick={() => p.setVolume(p.volume ? 0 : 0.8)} className="text-muted-foreground">
              {p.volume ? <Volume2Icon className="size-4" /> : <VolumeXIcon className="size-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} className="h-1 flex-1 accent-[var(--primary)]" aria-label="Volume" />
            {onLyrics && (
              <Button size="xs" variant="outline" onClick={onLyrics} data-fun-lyrics-open>
                <MicVocalIcon /> Lyrics
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Free music from Audius.</p>
        </>
      )}
    </div>
  );
}

// Lyrics from LRCLIB; synced lines follow the song.
function LyricsView({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const t = p?.current ?? null;
  const [ly, setLy] = React.useState<Lyrics | "loading">("loading");
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!t) return;
    setLy("loading");
    void F.lyricsAction(t.artist, t.title, t.duration).then((r) => setLy(r.ok ? (r.data ?? null) : null));
  }, [t]);
  const lines = ly && ly !== "loading" ? ly.synced : null;
  const at = lines && p ? lines.findLastIndex((l) => l.at <= p.time + 0.25) : -1;
  React.useEffect(() => {
    box.current?.querySelector(`[data-line="${at}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [at]);
  return (
    <div className="space-y-2" data-fun-lyrics>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Lyrics</p>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Back
        </Button>
      </div>
      <div ref={box} className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl bg-muted/50 p-3 text-center">
        {ly === "loading" ? (
          <p className="text-sm text-muted-foreground"><Loader2Icon className="inline size-4 animate-spin" /> Looking for the words…</p>
        ) : !ly ? (
          <p className="text-sm text-muted-foreground">No lyrics found for this song.</p>
        ) : ly.instrumental ? (
          <p className="text-sm text-muted-foreground">Instrumental: no words.</p>
        ) : lines?.length ? (
          lines.map((l, i) => (
            <p key={i} data-line={i} className={cn("text-sm transition-all", i === at ? "scale-105 font-semibold text-primary" : "text-muted-foreground")}>
              {l.text || "♪"}
            </p>
          ))
        ) : (
          <p className="text-sm whitespace-pre-line">{ly.plain}</p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Lyrics from LRCLIB.</p>
    </div>
  );
}

export function MusicTab({ lyricsOn, playlistsOn, initialQuery }: { lyricsOn: boolean; playlistsOn: boolean; initialQuery?: string | null }) {
  const p = usePlayer();
  const [q, setQ] = React.useState(initialQuery ?? "");
  const [moods, setMoods] = React.useState<{ key: string; label: string; q: string }[]>([]);
  const [results, setResults] = React.useState<Track[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<"browse" | "lyrics" | "queue" | "lists">("browse");
  const [lists, setLists] = React.useState<Playlist[]>([]);
  const [openList, setOpenList] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState<Track | null>(null);

  const search = React.useCallback(async (query: string) => {
    setBusy(true);
    const r = await F.searchMusicAction(query);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setResults(r.data ?? []);
  }, []);
  const loadLists = React.useCallback(async () => {
    if (!playlistsOn) return;
    const r = await F.playlistsAction();
    if (r.ok) setLists(r.data ?? []);
  }, [playlistsOn]);
  React.useEffect(() => {
    void search(initialQuery ?? "");
    void loadLists();
    void F.funHomeAction().then((r) => r.ok && r.data && setMoods(r.data.moods));
  }, [search, loadLists, initialQuery]);

  const save = async (pl: { id?: string | null; name: string; tracks: Track[]; shared?: boolean }, done?: string) => {
    const r = await F.savePlaylistAction(pl);
    if (!r.ok) return void toast.error(r.error);
    if (done) toast.success(done);
    await loadLists();
    return r.data;
  };

  if (view === "lyrics") return <LyricsView onClose={() => setView("browse")} />;
  const list = lists.find((l) => l.id === openList);
  return (
    <div className="space-y-3" data-fun-music>
      <NowPlaying onLyrics={lyricsOn ? () => setView("lyrics") : undefined} />
      <div className="flex gap-1 rounded-full bg-muted p-0.5 text-xs" role="tablist" aria-label="Music">
        {(
          [
            ["browse", "Find music"],
            ["queue", `Up next${p?.queue.length ? ` (${p.queue.length})` : ""}`],
            ...(playlistsOn ? [["lists", "Playlists"]] : []),
          ] as [typeof view, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => (setView(k), setOpenList(null))} className={cn("flex-1 rounded-full px-2 py-1", view === k ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>

      {view === "browse" && (
        <>
          <form className="relative" onSubmit={(e) => (e.preventDefault(), void search(q))}>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, artists, genres" aria-label="Search music" className="h-9 rounded-full pl-8" />
          </form>
          <div className="flex flex-wrap gap-1">
            {moods.map((m) => (
              <button key={m.key} type="button" className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted" onClick={() => (setQ(m.q), void search(m.q))}>
                {m.label}
              </button>
            ))}
          </div>
          {!q && results && <p className="text-xs font-medium text-muted-foreground">Trending now</p>}
          <TrackList tracks={results} busy={busy} onPlay={(i) => p?.playList(results ?? [], i)} onQueue={(t) => (p?.enqueue(t), toast.success("Added to Up next"))} onAdd={playlistsOn ? setAdding : undefined} />
        </>
      )}

      {view === "queue" && (
        <TrackList
          tracks={p?.queue ?? []}
          activeId={p?.current?.id}
          onPlay={(i) => p?.playList(p.queue, i)}
          empty="Nothing up next. Play a song or a playlist."
          onAdd={playlistsOn ? setAdding : undefined}
        />
      )}

      {view === "lists" && !list && (
        <div className="space-y-2" data-fun-playlists>
          <form
            className="flex gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (!name) return;
              const id = await save({ name, tracks: [] }, "Playlist made");
              if (id) setOpenList(id);
              e.currentTarget?.reset();
            }}
          >
            <Input name="name" placeholder="New playlist name" aria-label="New playlist name" className="h-8" />
            <Button size="sm" type="submit">
              <PlusIcon /> Make
            </Button>
          </form>
          {p?.queue.length ? (
            <Button size="xs" variant="outline" onClick={() => void save({ name: `Mix ${new Date().toLocaleDateString()}`, tracks: p.queue }, "Up next saved as a playlist")}>
              Save Up next as a playlist
            </Button>
          ) : null}
          {lists.length === 0 && <p className="text-sm text-muted-foreground">No playlists yet.</p>}
          {lists.map((l) => (
            <button key={l.id} type="button" onClick={() => setOpenList(l.id)} className="flex w-full items-center gap-3 rounded-lg border p-2 text-left hover:bg-muted/60" data-playlist={l.name}>
              <Art t={l.tracks[0] ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {l.tracks.length} songs{!l.mine ? ` · by ${l.owner}` : l.shared ? " · shared with the team" : ""}
                </span>
              </span>
              <ListMusicIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {view === "lists" && list && (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={() => setOpenList(null)}>
              ← Playlists
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{list.name}</span>
            <Button size="xs" disabled={!list.tracks.length} onClick={() => p?.playList(list.tracks, 0)}>
              <PlayIcon /> Play
            </Button>
            {list.mine && (
              <>
                <Button size="icon" variant={list.shared ? "secondary" : "ghost"} className="size-7" title={list.shared ? "Shared with the team: stop sharing" : "Share with the team"} aria-label="Share with the team" onClick={() => void save({ ...list, shared: !list.shared }, list.shared ? "No longer shared" : "Shared with the team")}>
                  <ShareIcon />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive"
                  aria-label="Delete the playlist"
                  onClick={async () => {
                    if (!window.confirm(`Delete "${list.name}"?`)) return;
                    const r = await F.deletePlaylistAction(list.id);
                    if (!r.ok) return void toast.error(r.error);
                    setOpenList(null);
                    void loadLists();
                  }}
                >
                  <Trash2Icon />
                </Button>
              </>
            )}
          </div>
          <TrackList
            tracks={list.tracks}
            activeId={p?.current?.id}
            onPlay={(i) => p?.playList(list.tracks, i)}
            onRemove={list.mine ? (i) => void save({ ...list, tracks: list.tracks.filter((_, j) => j !== i) }) : undefined}
            empty="Empty. Find music and press + to add songs."
          />
        </div>
      )}

      {adding && (
        <div className="rounded-lg border bg-popover p-2 shadow-md" data-fun-add-to>
          <p className="mb-1 truncate text-xs">Add "{adding.title}" to</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {lists.filter((l) => l.mine).map((l) => (
              <button
                key={l.id}
                type="button"
                className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted"
                onClick={async () => {
                  await save({ ...l, tracks: [...l.tracks.filter((x) => x.id !== adding.id), adding] }, `Added to ${l.name}`);
                  setAdding(null);
                }}
              >
                {l.name}
              </button>
            ))}
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-sm text-primary hover:bg-muted"
              onClick={async () => {
                const name = window.prompt("Name of the new playlist");
                if (!name?.trim()) return;
                await save({ name, tracks: [adding] }, `Added to ${name}`);
                setAdding(null);
              }}
            >
              + New playlist
            </button>
          </div>
          <Button size="xs" variant="ghost" className="mt-1" onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function TrackList({ tracks, busy, activeId, onPlay, onQueue, onAdd, onRemove, empty = "Nothing found." }: { tracks: Track[] | null; busy?: boolean; activeId?: string; onPlay: (i: number) => void; onQueue?: (t: Track) => void; onAdd?: (t: Track) => void; onRemove?: (i: number) => void; empty?: string }) {
  if (busy || !tracks) return <p className="py-6 text-center text-sm text-muted-foreground"><Loader2Icon className="inline size-4 animate-spin" /> Loading music…</p>;
  if (!tracks.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-0.5" data-fun-tracks>
      {tracks.map((t, i) => (
        <li key={`${t.id}-${i}`} className={cn("group flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/60", t.id === activeId && "bg-primary/10")}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onPlay(i)} aria-label={`Play ${t.title}`} data-track={t.title}>
            <Art t={t} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{t.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t.artist} · {clock(t.duration)}
              </span>
            </span>
          </button>
          {onQueue && (
            <Button size="icon" variant="ghost" className="size-7 opacity-70 group-hover:opacity-100" aria-label={`Play ${t.title} next`} title="Add to Up next" onClick={() => onQueue(t)}>
              <ListMusicIcon />
            </Button>
          )}
          {onAdd && (
            <Button size="icon" variant="ghost" className="size-7 opacity-70 group-hover:opacity-100" aria-label={`Add ${t.title} to a playlist`} title="Add to a playlist" onClick={() => onAdd(t)}>
              <PlusIcon />
            </Button>
          )}
          {onRemove && (
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label={`Remove ${t.title}`} onClick={() => onRemove(i)}>
              <Trash2Icon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
