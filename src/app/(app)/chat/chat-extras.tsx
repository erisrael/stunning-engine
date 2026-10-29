"use client";

// Chat additions: attachments and voice messages, reactions, polls, stickers and GIFs, calls, channels.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3Icon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  HashIcon,
  ImageIcon,
  Loader2Icon,
  MegaphoneIcon,
  MicIcon,
  PaperclipIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SmileIcon,
  SquareIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/app/multi-select";
import {
  closePollAction,
  createChannelAction,
  createPollAction,
  inviteLinkAction,
  joinChatAction,
  prepareUploadAction,
  publicChannelsAction,
  reactAction,
  searchGifsAction,
  sendMessageAction,
  setChannelVisibilityAction,
  voicePlayedAction,
  votePollAction,
  type Gif,
} from "@/app/actions/chat";
import type { ChatGroupSummary, ChatMessage } from "@/server/chat";
import { decryptBytes, encryptBytes, encryptText } from "@/lib/e2e";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Emoji, stickers and GIFs
// ---------------------------------------------------------------------------

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "✅"];

const EMOJI = (
  "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 😘 😋 😜 🤪 🤗 🤭 🤔 🤐 😐 😏 😒 🙄 😬 😌 😔 😴 😷 🤒 🥵 🥶 🤯 🥳 😎 🤓 😕 😟 😮 😲 😳 🥺 😢 😭 😱 😤 😡 " +
  "👍 👎 👌 ✌️ 🤞 🤝 👏 🙌 👐 🙏 💪 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✅ ❌ ⚠️ ❓ ❗ 🔥 ⭐ 🌟 ✨ 🎉 🎊 🎁 🏆 🥇 📌 📎 📚 📝 ✏️ 📅 ⏰ 💡 🎬 🎥 🎙️ 🎧 💻 📱 ☕ 🍕 🌍"
).split(" ");

// Stickers are sent on their own and shown large.
const STICKERS = (
  "👍 👏 🙏 🎉 🔥 💯 ❤️ 😂 🤣 😍 🥳 😎 🤩 😇 🤗 🤔 🙄 😴 😭 😱 🤯 😤 🥺 🫡 🫶 👌 💪 🚀 🏆 ⭐ ✅ ☕ 🍰 🎂 🎬 🎙️ 📚 💡 🌻 🐣"
).split(" ");

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

// One to three emoji alone are shown as a sticker.
export function isJumbo(text: string) {
  const t = text.trim();
  if (!t || !EMOJI_ONLY.test(t)) return false;
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length <= 3;
}

const GIF_HOST = /^https:\/\/(media\d?\.giphy\.com|i\.giphy\.com)\/\S+\.(gif|webp)(\?\S*)?$/i;

export function gifUrl(text: string) {
  const t = text.trim();
  return GIF_HOST.test(t) ? t : null;
}

export function EmojiPicker({ onEmoji, onSticker, onGif, side = "top" }: { onEmoji: (e: string) => void; onSticker?: (e: string) => void; onGif?: (g: Gif) => void; side?: "top" | "bottom" }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [gifs, setGifs] = React.useState<{ configured: boolean; list: Gif[] } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const search = React.useCallback(async (term: string) => {
    setLoading(true);
    const r = await searchGifsAction(term);
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    setGifs({ configured: r.data!.configured, list: r.data!.gifs });
  }, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full" aria-label="Emoji, stickers and GIFs" title="Emoji, stickers and GIFs">
          <SmileIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-80 p-2">
        <Tabs defaultValue="emoji" onValueChange={(v) => v === "gif" && !gifs && void search("")}>
          <TabsList className="w-full">
            <TabsTrigger value="emoji">Emoji</TabsTrigger>
            {onSticker && <TabsTrigger value="sticker">Stickers</TabsTrigger>}
            {onGif && <TabsTrigger value="gif">GIF</TabsTrigger>}
          </TabsList>
          <TabsContent value="emoji" className="mt-2 grid max-h-60 grid-cols-9 gap-0.5 overflow-y-auto">
            {EMOJI.map((e) => (
              <button key={e} type="button" className="rounded p-1 text-xl hover:bg-muted" onClick={() => onEmoji(e)}>
                {e}
              </button>
            ))}
          </TabsContent>
          {onSticker && (
            <TabsContent value="sticker" className="mt-2 grid max-h-60 grid-cols-5 gap-1 overflow-y-auto">
              {STICKERS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-lg p-1 text-4xl transition-transform hover:scale-110 hover:bg-muted"
                  onClick={() => {
                    onSticker(e);
                    setOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </TabsContent>
          )}
          {onGif && (
            <TabsContent value="gif" className="mt-2 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void search(q);
                }}
              >
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs" className="h-8" />
              </form>
              {loading && <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />}
              {gifs && !gifs.configured && <p className="p-2 text-xs text-muted-foreground">GIFs are not set up. An administrator adds a free GIPHY key as GIPHY_API_KEY in the hosting settings.</p>}
              {gifs?.configured && (
                <div className="grid max-h-60 grid-cols-2 gap-1 overflow-y-auto">
                  {gifs.list.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="overflow-hidden rounded-md hover:opacity-80"
                      onClick={() => {
                        onGif(g);
                        setOpen(false);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.preview} alt={g.title} className="h-24 w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                  {!gifs.list.length && <p className="col-span-2 p-2 text-xs text-muted-foreground">No GIFs found.</p>}
                </div>
              )}
              {gifs?.configured && <p className="text-right text-[10px] text-muted-foreground">Powered by GIPHY</p>}
            </TabsContent>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export function ReactionBar({ m, viewerId, names, mine, onChanged }: { m: ChatMessage; viewerId: string; names: Record<string, string>; mine: boolean; onChanged: (patch: Partial<ChatMessage>) => void }) {
  if (!m.reactions.length) return null;
  return (
    <div className={cn("mt-0.5 flex flex-wrap gap-1", mine ? "justify-end pr-1" : "pl-10")}>
      {m.reactions.map((r) => {
        const me = r.userIds.includes(viewerId);
        return (
          <button
            key={r.emoji}
            type="button"
            title={r.userIds.map((u) => names[u] ?? "Someone").join(", ")}
            className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-xs", me ? "border-primary/50 bg-primary/10" : "bg-card hover:bg-muted")}
            onClick={() => toggleReaction(m, r.emoji, viewerId, onChanged)}
          >
            <span>{r.emoji}</span>
            <span className="tabular text-muted-foreground">{r.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

export async function toggleReaction(m: ChatMessage, emoji: string, viewerId: string, onChanged: (patch: Partial<ChatMessage>) => void) {
  // Shown at once; the server answer follows.
  const existing = m.reactions.find((r) => r.emoji === emoji);
  const had = !!existing?.userIds.includes(viewerId);
  const reactions = had
    ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== viewerId) } : r)).filter((r) => r.userIds.length)
    : existing
      ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, viewerId] } : r))
      : [...m.reactions, { emoji, userIds: [viewerId] }];
  onChanged({ reactions });
  const res = await reactAction(m.id, emoji);
  if (!res.ok) {
    toast.error(res.error);
    onChanged({ reactions: m.reactions });
  }
}

export function QuickReact({ m, viewerId, mine, onChanged }: { m: ChatMessage; viewerId: string; mine: boolean; onChanged: (patch: Partial<ChatMessage>) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className={cn("size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100", mine && "order-first")} aria-label="React">
          <SmileIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align={mine ? "end" : "start"} className="flex w-auto gap-0.5 rounded-full p-1">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            className="rounded-full p-1 text-xl transition-transform hover:scale-125"
            onClick={() => {
              setOpen(false);
              void toggleReaction(m, e, viewerId, onChanged);
            }}
          >
            {e}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Files and voice messages
// ---------------------------------------------------------------------------

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function fmtClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// File messages in direct chats carry the file name inside the encrypted text.
export function fileText(m: ChatMessage): { name: string | null; caption: string } {
  if (m.file?.encrypted) {
    try {
      const j = JSON.parse(m.body) as { name?: string; caption?: string };
      return { name: j.name ?? null, caption: j.caption ?? "" };
    } catch {
      return { name: null, caption: "" };
    }
  }
  return { name: m.file?.name ?? null, caption: m.body };
}

// Loads a file for display: direct link for plain files, download and decrypt for encrypted ones.
function useFileUrl(m: ChatMessage, cryptoKey: CryptoKey | null, enabled: boolean) {
  const f = m.file!;
  const [state, setState] = React.useState<{ url: string | null; error: string | null; loading: boolean }>({ url: f.encrypted ? null : `/api/chat/files/${f.id}`, error: null, loading: false });
  React.useEffect(() => {
    if (!f.encrypted || !enabled || f.gone) return;
    if (!cryptoKey) return setState({ url: null, error: "Locked", loading: false });
    let live = true;
    let url: string | null = null;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      try {
        const r = await fetch(`/api/chat/files/${f.id}`);
        if (!r.ok) throw new Error(r.status === 410 ? "Expired" : "Could not load");
        const plain = await decryptBytes(cryptoKey, await r.arrayBuffer());
        url = URL.createObjectURL(new Blob([plain], { type: f.mime }));
        if (live) setState({ url, error: null, loading: false });
      } catch (err) {
        if (live) setState({ url: null, error: err instanceof Error ? err.message : "Could not load", loading: false });
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [f.id, f.encrypted, f.mime, f.gone, cryptoKey, enabled]);
  return state;
}

export function Attachment({ m, mine, viewerId, cryptoKey, onChanged }: { m: ChatMessage; mine: boolean; viewerId: string; cryptoKey: CryptoKey | null; onChanged: (patch: Partial<ChatMessage>) => void }) {
  const f = m.file!;
  const { name } = fileText(m);
  if (f.gone)
    return (
      <span className={cn("flex items-center gap-1.5 italic", mine ? "text-white/75" : "text-muted-foreground")}>
        {f.kind === "voice" ? <MicIcon className="size-3.5" /> : <FileIcon className="size-3.5" />}
        {f.kind === "voice" ? "Voice message expired" : "File removed"}
      </span>
    );
  if (f.kind === "voice") return <VoicePlayer m={m} mine={mine} viewerId={viewerId} cryptoKey={cryptoKey} onChanged={onChanged} />;
  if (f.kind === "image") return <ImageAttachment m={m} name={name} cryptoKey={cryptoKey} />;
  return <FileAttachment m={m} mine={mine} name={name} cryptoKey={cryptoKey} />;
}

function ImageAttachment({ m, name, cryptoKey }: { m: ChatMessage; name: string | null; cryptoKey: CryptoKey | null }) {
  const { url, error, loading } = useFileUrl(m, cryptoKey, true);
  if (loading || (!url && !error)) return <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-black/10"><Loader2Icon className="size-5 animate-spin opacity-60" /></div>;
  if (error) return <span className="text-xs opacity-75">Image: {error}</span>;
  return (
    <a href={url!} target="_blank" rel="noreferrer" download={name ?? undefined} className="mb-1 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url!} alt={name ?? "Image"} className="max-h-72 max-w-full rounded-lg object-contain" />
    </a>
  );
}

function FileAttachment({ m, mine, name, cryptoKey }: { m: ChatMessage; mine: boolean; name: string | null; cryptoKey: CryptoKey | null }) {
  const f = m.file!;
  const [want, setWant] = React.useState(false);
  const { url, error, loading } = useFileUrl(m, cryptoKey, want);
  React.useEffect(() => {
    // Encrypted files are downloaded once they have been decrypted.
    if (want && f.encrypted && url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = name ?? "file";
      a.click();
      setWant(false);
    }
  }, [want, url, f.encrypted, name]);
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", mine ? "bg-white/20" : "bg-primary/10 text-primary")}>
        {loading ? <Loader2Icon className="size-4 animate-spin" /> : <FileIcon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name ?? "File"}</span>
        <span className={cn("block text-[11px]", mine ? "text-white/75" : "text-muted-foreground")}>
          {fmtSize(f.size)}
          {error && ` · ${error}`}
        </span>
      </span>
      <DownloadIcon className="size-4 shrink-0 opacity-70" />
    </>
  );
  const cls = cn("mb-1 flex w-64 max-w-full items-center gap-2 rounded-xl p-2 text-left", mine ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70");
  return f.encrypted ? (
    <button type="button" className={cls} onClick={() => setWant(true)}>
      {body}
    </button>
  ) : (
    <a href={`/api/chat/files/${f.id}`} download={name ?? undefined} className={cls}>
      {body}
    </a>
  );
}

function VoicePlayer({ m, mine, viewerId, cryptoKey, onChanged }: { m: ChatMessage; mine: boolean; viewerId: string; cryptoKey: CryptoKey | null; onChanged: (patch: Partial<ChatMessage>) => void }) {
  const f = m.file!;
  const [load, setLoad] = React.useState(false);
  const { url, error, loading } = useFileUrl(m, cryptoKey, load);
  const audio = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!f.expiresAt || !f.firstPlayedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [f.expiresAt, f.firstPlayedAt]);
  const left = f.firstPlayedAt && f.expiresAt ? (new Date(f.expiresAt).getTime() - now) / 1000 : null;
  React.useEffect(() => {
    if (load && url && audio.current && !playing) void audio.current.play().catch(() => undefined);
    // Only when the file becomes available after asking to play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, load]);

  const toggle = async () => {
    if (!url || !audio.current) return setLoad(true);
    if (playing) audio.current.pause();
    else await audio.current.play().catch(() => toast.error("Could not play this voice message."));
  };
  const onPlay = async () => {
    setPlaying(true);
    if (m.authorId !== viewerId && !f.firstPlayedAt) {
      const r = await voicePlayedAction(f.id);
      if (r.ok && r.data) onChanged({ file: { ...f, firstPlayedAt: new Date().toISOString(), expiresAt: r.data } });
    }
  };
  if (left !== null && left <= 0)
    return (
      <span className={cn("flex items-center gap-1.5 italic", mine ? "text-white/75" : "text-muted-foreground")}>
        <MicIcon className="size-3.5" /> Voice message expired
      </span>
    );
  const total = f.durationSec ?? 0;
  return (
    <div className="mb-1 flex w-60 max-w-full items-center gap-2">
      <Button size="icon" variant={mine ? "secondary" : "default"} className="size-9 shrink-0 rounded-full" onClick={toggle} aria-label={playing ? "Pause" : "Play voice message"} disabled={loading}>
        {loading ? <Loader2Icon className="animate-spin" /> : playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className={cn("h-1.5 overflow-hidden rounded-full", mine ? "bg-white/30" : "bg-muted")}>
          <div className={cn("h-full", mine ? "bg-white" : "bg-primary")} style={{ width: `${total ? Math.min(100, (pos / total) * 100) : 0}%` }} />
        </div>
        <p className={cn("mt-1 text-[11px]", mine ? "text-white/80" : "text-muted-foreground")}>
          {fmtClock(playing || pos ? pos : total)}
          {error ? ` · ${error}` : left !== null ? ` · disappears in ${fmtClock(left)}` : m.authorId === viewerId ? " · disappears 10 min after it is played" : " · plays once for 10 min"}
        </p>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={onPlay}
          onPause={() => setPlaying(false)}
          onEnded={() => (setPlaying(false), setPos(0))}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          className="hidden"
        />
      )}
    </div>
  );
}

// Encrypts (direct chats), uploads and sends a file or voice message.
export async function sendAttachment(input: {
  group: ChatGroupSummary;
  blob: Blob;
  name: string;
  kind: "file" | "voice" | "image";
  caption?: string;
  durationSec?: number | null;
  cryptoKey: CryptoKey | null;
  replyToId?: string | null;
}) {
  const direct = input.group.kind === "direct";
  if (direct && !input.cryptoKey) throw new Error("Unlock secure chat first.");
  const raw = await input.blob.arrayBuffer();
  const bytes = direct ? await encryptBytes(input.cryptoKey!, raw) : new Uint8Array(raw);
  const mime = input.blob.type || "application/octet-stream";
  const prep = await prepareUploadAction({ groupId: input.group.id, name: input.name, mime, size: bytes.byteLength, kind: input.kind, encrypted: direct, durationSec: input.durationSec ?? null });
  if (!prep.ok) throw new Error(prep.error);
  const { fileId, storage, uploadUrl } = prep.data!;
  const up = await fetch(uploadUrl, {
    method: storage === "supabase" ? "PUT" : "POST",
    headers: { "Content-Type": direct ? "application/octet-stream" : mime },
    body: bytes as BodyInit,
  });
  if (!up.ok) throw new Error(`Upload failed (${up.status}).`);
  const text = direct ? JSON.stringify({ name: input.name, caption: input.caption ?? "" }) : (input.caption ?? "");
  const body = direct ? await encryptText(input.cryptoKey!, text) : text;
  const sent = await sendMessageAction({ groupId: input.group.id, body, encrypted: direct, kind: input.kind === "voice" ? "voice" : "file", meta: { fileId }, replyToId: input.replyToId ?? null });
  if (!sent.ok) throw new Error(sent.error);
}

export function AttachButton({ group, cryptoKey, onSent }: { group: ChatGroupSummary; cryptoKey: CryptoKey | null; onSent: () => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<File[] | null>(null);
  const [caption, setCaption] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      for (const [i, file] of pending.entries())
        await sendAttachment({ group, blob: file, name: file.name, kind: /^image\/(png|jpe?g|gif|webp)$/.test(file.type) ? "image" : "file", caption: i === 0 ? caption.trim() : "", cryptoKey });
      setPending(null);
      setCaption("");
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, 10);
          if (files.length) setPending(files);
          e.target.value = "";
        }}
      />
      <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full" onClick={() => ref.current?.click()} aria-label="Attach files" title="Attach files">
        <PaperclipIcon />
      </Button>
      <Dialog open={!!pending} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {pending?.length === 1 ? "file" : `${pending?.length} files`}</DialogTitle>
            <DialogDescription>{group.kind === "direct" ? "Files are encrypted on this device before upload." : "Everyone in this chat can open them."}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {pending?.map((f) => (
              <li key={f.name + f.size} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-sm">
                {f.type.startsWith("image/") ? <ImageIcon className="size-4 shrink-0" /> : <FileIcon className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span>
              </li>
            ))}
          </ul>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={send}>
              {busy && <Loader2Icon className="animate-spin" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const MAX_VOICE_SEC = 300;

export function VoiceRecorder({ group, cryptoKey, onSent, onRecording }: { group: ChatGroupSummary; cryptoKey: CryptoKey | null; onSent: () => void; onRecording: (on: boolean) => void }) {
  const [state, setState] = React.useState<"idle" | "recording" | "sending">("idle");
  const [sec, setSec] = React.useState(0);
  const rec = React.useRef<MediaRecorder | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const started = React.useRef(0);
  const cancelled = React.useRef(false);
  React.useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSec(s);
      if (s >= MAX_VOICE_SEC) rec.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [state]);
  React.useEffect(() => onRecording(state !== "idle"), [state, onRecording]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = (Date.now() - started.current) / 1000;
        if (cancelled.current || duration < 0.8) return setState("idle");
        setState("sending");
        try {
          const blob = new Blob(chunks.current, { type: (r.mimeType || "audio/webm").split(";")[0] });
          await sendAttachment({ group, blob, name: `voice-${new Date().toISOString().slice(0, 19)}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`, kind: "voice", durationSec: Math.round(duration), cryptoKey });
          onSent();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not send the voice message.");
        } finally {
          setState("idle");
        }
      };
      rec.current = r;
      started.current = Date.now();
      setSec(0);
      r.start(250);
      setState("recording");
    } catch {
      toast.error("Microphone access was not allowed.");
    }
  };

  if (state === "idle")
    return (
      <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full" onClick={start} aria-label="Record a voice message" title="Record a voice message (disappears 10 minutes after it is played)">
        <MicIcon />
      </Button>
    );
  return (
    <div className="flex flex-1 items-center gap-2 rounded-2xl bg-muted/60 px-3 py-1.5">
      <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
      <span className="text-sm tabular">{fmtClock(sec)}</span>
      <span className="flex-1 truncate text-xs text-muted-foreground">{state === "sending" ? "Sending..." : `Recording (up to ${MAX_VOICE_SEC / 60} min)`}</span>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full"
        disabled={state === "sending"}
        onClick={() => {
          cancelled.current = true;
          rec.current?.stop();
        }}
        aria-label="Cancel"
      >
        <Trash2Icon />
      </Button>
      <Button size="icon" className="size-9 rounded-full" disabled={state === "sending"} onClick={() => rec.current?.stop()} aria-label="Send voice message">
        {state === "sending" ? <Loader2Icon className="animate-spin" /> : <SquareIcon className="fill-current" />}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

export function PollDialog({ groupId, onClose, onSent }: { groupId: string; onClose: () => void; onSent: () => void }) {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [multiple, setMultiple] = React.useState(false);
  const [anonymous, setAnonymous] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const filled = options.filter((o) => o.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which day suits the studio session?" />
          </div>
          <div className="space-y-1.5">
            <Label>Options</Label>
            {options.map((o, i) => (
              <div key={i} className="flex gap-1">
                <Input value={o} onChange={(e) => setOptions((x) => x.map((v, j) => (j === i ? e.target.value : v)))} placeholder={`Option ${i + 1}`} />
                {options.length > 2 && (
                  <Button size="icon" variant="ghost" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} aria-label="Remove option">
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button size="xs" variant="ghost" onClick={() => setOptions((x) => [...x, ""])}>
                <PlusIcon /> Add option
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={multiple} onCheckedChange={setMultiple} /> Allow several answers
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={anonymous} onCheckedChange={setAnonymous} /> Anonymous (votes are counted, names are not shown)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !question.trim() || filled.length < 2}
            onClick={async () => {
              setBusy(true);
              const r = await createPollAction({ groupId, question, options: filled, multiple, anonymous });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              onClose();
              onSent();
            }}
          >
            Send poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PollCard({ m, mine, names, canClose, onChanged }: { m: ChatMessage; mine: boolean; names: Record<string, string>; canClose: boolean; onChanged: (patch: Partial<ChatMessage>) => void }) {
  const poll = m.poll!;
  const [choice, setChoice] = React.useState<string[]>(poll.mine);
  React.useEffect(() => setChoice(poll.mine), [poll.mine]);
  const voted = poll.mine.length > 0;
  const vote = async (ids: string[]) => {
    const r = await votePollAction(m.id, ids);
    if (!r.ok) return toast.error(r.error);
    onChanged({ poll: { ...poll, mine: ids } });
  };
  return (
    <div className="mb-1 w-72 max-w-full space-y-2">
      <p className={cn("flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase", mine ? "text-white/80" : "text-primary")}>
        <BarChart3Icon className="size-3" /> {poll.anonymous ? "Anonymous poll" : "Poll"}
        {poll.multiple && " · several answers"}
        {poll.closed && " · closed"}
      </p>
      <p className="font-medium">{poll.question}</p>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
          const on = choice.includes(o.id);
          const showResults = voted || poll.closed;
          return (
            <button
              key={o.id}
              type="button"
              disabled={poll.closed}
              title={o.voters.map((v) => names[v] ?? "Someone").join(", ") || undefined}
              onClick={() => {
                if (poll.multiple) setChoice((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]));
                else void vote(on && voted ? [] : [o.id]);
              }}
              className={cn("relative block w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-sm", mine ? "border-white/30" : "border-border", poll.closed && "cursor-default")}
            >
              {showResults && <span className={cn("absolute inset-y-0 left-0", mine ? "bg-white/20" : "bg-primary/10")} style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center gap-2">
                {poll.multiple ? <Checkbox checked={on} className="pointer-events-none" /> : <span className={cn("size-3.5 rounded-full border", on && (mine ? "border-white bg-white" : "border-primary bg-primary"))} />}
                <span className="flex-1">{o.text}</span>
                {showResults && <span className="text-xs tabular opacity-80">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className={cn("flex items-center gap-2 text-[11px]", mine ? "text-white/80" : "text-muted-foreground")}>
        <span className="flex-1">{poll.total} {poll.total === 1 ? "vote" : "votes"}</span>
        {poll.multiple && !poll.closed && (
          <Button size="xs" variant={mine ? "secondary" : "outline"} onClick={() => vote(choice)} disabled={JSON.stringify([...choice].sort()) === JSON.stringify([...poll.mine].sort())}>
            Vote
          </Button>
        )}
        {canClose && (
          <Button
            size="xs"
            variant="ghost"
            className={mine ? "text-white hover:bg-white/20" : ""}
            onClick={async () => {
              const r = await closePollAction(m.id, !poll.closed);
              if (!r.ok) return toast.error(r.error);
              onChanged({ poll: { ...poll, closed: !poll.closed } });
            }}
          >
            {poll.closed ? "Reopen" : "Close poll"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

const MEET = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?\S*)?$/i;

export function CallCard({ url, mine, provider }: { url: string; mine: boolean; provider: string }) {
  const valid = /^https:\/\/(meet\.jit\.si|meet\.google\.com)\//.test(url);
  return (
    <div className={cn("mb-1 flex w-64 max-w-full items-center gap-2 rounded-xl p-2", mine ? "bg-white/15" : "bg-muted")}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", mine ? "bg-white/25" : "bg-primary/15 text-primary")}>
        <VideoIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Video call</span>
        <span className={cn("block truncate text-[11px]", mine ? "text-white/75" : "text-muted-foreground")}>{provider === "meet" ? "Google Meet" : "Jitsi Meet"}</span>
      </span>
      {valid && (
        <Button size="xs" variant={mine ? "secondary" : "default"} asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Join
          </a>
        </Button>
      )}
    </div>
  );
}

export function CallButton({ group, cryptoKey, onSent }: { group: ChatGroupSummary; cryptoKey: CryptoKey | null; onSent: () => void }) {
  const [meetOpen, setMeetOpen] = React.useState(false);
  const [link, setLink] = React.useState("");
  const send = async (url: string, provider: "jitsi" | "meet") => {
    const direct = group.kind === "direct";
    if (direct && !cryptoKey) return toast.error("Unlock secure chat first.");
    const body = direct ? await encryptText(cryptoKey!, url) : url;
    const r = await sendMessageAction({ groupId: group.id, body, encrypted: direct, kind: "call", meta: { provider } });
    if (!r.ok) return toast.error(r.error);
    onSent();
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" title="Start a call" aria-label="Start a call">
            <PhoneIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={async () => {
              const room = `https://meet.jit.si/Myseed-${crypto.getRandomValues(new Uint32Array(2)).join("")}`;
              window.open(room, "_blank", "noopener");
              await send(room, "jitsi");
            }}
          >
            <VideoIcon /> Start a video call (Jitsi, free)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              window.open("https://meet.google.com/new", "_blank", "noopener");
              setMeetOpen(true);
            }}
          >
            <VideoIcon /> Start a Google Meet and share the link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={meetOpen} onOpenChange={setMeetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your Google Meet</DialogTitle>
            <DialogDescription>Google Meet opened in a new tab with your Google account. Copy the meeting link from there and paste it here.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={link} onChange={(e) => setLink(e.target.value.trim())} placeholder="https://meet.google.com/abc-defg-hij" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!MEET.test(link)}
              onClick={async () => {
                await send(link, "meet");
                setLink("");
                setMeetOpen(false);
              }}
            >
              Share link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Channels and invite links
// ---------------------------------------------------------------------------

const COLORS = ["#0ea5e9", "#7b68ee", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

export function NewChannelDialog({ directory, viewerId, onClose, onCreated }: { directory: { id: string; name: string }[]; viewerId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(COLORS[0]);
  const [visibility, setVisibility] = React.useState<"public" | "private">("public");
  const [members, setMembers] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MegaphoneIcon className="size-4" /> New channel
          </DialogTitle>
          <DialogDescription>Only channel admins post; everyone else reads and reacts. You are the first admin and can add more from Channel info.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Announcements" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")} style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={visibility === "public"} onCheckedChange={(v) => setVisibility(v ? "public" : "private")} />
            <span>
              Public
              <span className="block text-xs text-muted-foreground">Anyone in the workspace can find and join it. Private channels need an invitation or the invite link.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label>Add people now (optional)</Label>
            <MultiSelect label="Choose people" options={directory.filter((p) => p.id !== viewerId).map((p) => ({ value: p.id, label: p.name }))} value={members} onChange={setMembers} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await createChannelAction({ name, description, color, visibility, memberIds: members });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              onClose();
              onCreated(r.data as string);
            }}
          >
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DiscoverChannelsDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = React.useState<{ id: string; name: string; description: string | null; color: string | null; members: number }[] | null>(null);
  React.useEffect(() => {
    void publicChannelsAction().then((r) => (r.ok ? setList(r.data ?? []) : toast.error(r.error)));
  }, []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find channels</DialogTitle>
          <DialogDescription>Public channels you have not joined yet.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {!list && (
            <li className="p-4 text-center">
              <Loader2Icon className="mx-auto size-4 animate-spin" />
            </li>
          )}
          {list?.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: c.color ?? "#0ea5e9" }}>
                <HashIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {Number(c.members)} members{c.description ? ` · ${c.description}` : ""}
                </span>
              </span>
              <Button
                size="sm"
                onClick={async () => {
                  const r = await joinChatAction({ groupId: c.id });
                  if (!r.ok) return toast.error(r.error);
                  onClose();
                  router.push(`/chat?g=${c.id}`);
                  router.refresh();
                }}
              >
                Join
              </Button>
            </li>
          ))}
          {list && !list.length && <li className="p-4 text-center text-sm text-muted-foreground">No public channels to join.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function InviteSection({ group, inviteToken, visibility, onChanged }: { group: ChatGroupSummary; inviteToken: string | null; visibility: string; onChanged: () => void }) {
  const [token, setToken] = React.useState(inviteToken);
  React.useEffect(() => setToken(inviteToken), [inviteToken]);
  const link = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/chat/join/${token}` : null;
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Invitations</h3>
      {group.kind === "channel" && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={visibility === "public"}
            onCheckedChange={async (v) => {
              const r = await setChannelVisibilityAction(group.id, v ? "public" : "private");
              if (!r.ok) return toast.error(r.error);
              onChanged();
            }}
          />
          <span>
            Public channel
            <span className="block text-xs text-muted-foreground">Listed in Find channels for everyone.</span>
          </span>
        </label>
      )}
      {link ? (
        <div className="flex gap-1">
          <Input readOnly value={link} className="h-8 text-xs" onFocus={(e) => e.target.select()} />
          <Button size="icon-sm" variant="outline" aria-label="Copy link" onClick={() => (navigator.clipboard?.writeText(link), toast.success("Link copied"))}>
            <CopyIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="New link"
            title="Make a new link (the old one stops working)"
            onClick={async () => {
              const r = await inviteLinkAction(group.id, true);
              if (!r.ok) return toast.error(r.error);
              setToken(r.data as string);
              toast.success("New link made; the old one no longer works");
            }}
          >
            <RefreshCwIcon />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await inviteLinkAction(group.id);
            if (!r.ok) return toast.error(r.error);
            setToken(r.data as string);
          }}
        >
          Make an invite link
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Anyone signed in to this workspace who opens the link joins as a member.</p>
    </section>
  );
}
