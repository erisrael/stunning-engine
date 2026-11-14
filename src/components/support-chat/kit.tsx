"use client";

// The support conversation, drawn like the team chat (Update 1.1): one kit for the customer's widget and the agent's
// desk. Bubbles grouped by sender with day separators, time and read ticks; replies that quote and jump to the
// message; emoji reactions; photos that open full screen; video; voice notes with a waveform, seeking and speed;
// file cards; calls in the timeline; the other side typing. The composer grows with the text, has emoji, takes
// several files with a caption (picked, pasted or dropped) and records voice notes.
import * as React from "react";
import {
  ArrowDownIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  Loader2Icon,
  LockIcon,
  MicIcon,
  PaperclipIcon,
  PauseIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOutgoingIcon,
  PlayIcon,
  ReplyIcon,
  SendIcon,
  SmileIcon,
  SmilePlusIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types and words
// ---------------------------------------------------------------------------

export type KitFile = { id: string; name: string; mime: string; size: number; url: string };
export type KitReaction = { emoji: string; count: number; mine: boolean; who?: string[] };
export type KitQuote = { id: string; author: string; body: string };
export type KitMsg = {
  id: string;
  // out: our side (right); in: the other side; note: an agents-only note; system: a notice in the middle.
  side: "out" | "in" | "note" | "system";
  author: string | null;
  authorKey: string;
  body: string;
  at: string;
  files: KitFile[];
  replyTo: KitQuote | null;
  reactions: KitReaction[];
  status?: "sent" | "seen" | null;
  // Who wrote it (customer, agent, system, note), kept on the element for tests and styling.
  role?: string;
};
export type KitCall = { id: string; at: string; direction: string; kind: string; status: string; durationS: number | null; recordingUrl?: string | null; who?: string | null };

export const KIT_WORDS = {
  today: "Today",
  yesterday: "Yesterday",
  reply: "Reply",
  react: "React",
  replyThis: "Reply to this message",
  reactThis: "React to this message",
  replyingTo: "Replying to",
  cancel: "Cancel",
  typing: (n: string) => `${n} is typing`,
  write: "Write a message",
  send: "Send",
  attach: "Attach files",
  emoji: "Emoji",
  record: "Record a voice note",
  recording: "Recording",
  stopSend: "Send voice note",
  discard: "Discard",
  caption: "Add a caption",
  photo: "Photo",
  voice: "Voice note",
  file: "File",
  download: "Download",
  close: "Close",
  play: "Play",
  pause: "Pause",
  speed: "Playback speed",
  newMessages: "New messages",
  note: "Internal note",
  seen: "Seen",
  sent: "Sent",
  tooBig: (n: string) => `${n} is larger than 10 MB.`,
  mic: "Allow the microphone to record.",
  call: { inbound: "Incoming call", outbound: "Outgoing call", missed: "Missed call", declined: "Declined call", callback: "Call-back requested", ringing: "Ringing…", answered: "In the call" } as Record<string, string>,
  drop: "Drop files to send",
};
export type KitWords = typeof KIT_WORDS;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_SEC = 300;
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EMOJI = "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 😘 😋 😎 🤗 🤔 😐 🙄 😏 😴 😌 😔 😟 😢 😭 😤 😡 😱 😳 🥺 🙏 👍 👎 👏 🙌 💪 👋 🤝 ✌️ 👌 👀 ❤️ 💔 💯 🔥 ✨ 🎉 🎁 ✅ ❌ ⚠️ ❓ ❗ 📱 💳 💰 📚 ✏️ 🎓 📞 ⏰ 📅".split(" ");
// What a file message says when it has no caption (kept for email and old clients; not shown under the file).
const PLACEHOLDER = /^\((a voice note|a photo|a video note|a file: .*|an empty message)\)$/;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;
const NAME_COLORS = ["#7b68ee", "#e2445c", "#0ea5e9", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#be185d"];
const colorOf = (k: string) => NAME_COLORS[[...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NAME_COLORS.length]!;
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string, w: KitWords) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return w.today;
  if (d.toDateString() === y.toDateString()) return w.yesterday;
  return d.toLocaleDateString([], { weekday: Date.now() - d.getTime() < 6 * 864e5 ? "long" : undefined, day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

// Links clickable, text kept as text.
function Text({ text, out }: { text: string; out: boolean }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <p className="break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className={cn("underline underline-offset-2", out ? "text-inherit" : "text-primary")}>
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </p>
  );
}

function Avatar({ name, k }: { name: string; k: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: colorOf(k) }} aria-hidden>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Voice notes
// ---------------------------------------------------------------------------

const BARS = 36;
function pseudoBars(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177) + i;
    return 0.25 + ((h >>> 0) % 1000) / 1400;
  });
}

export function VoiceNote({ url, out, accent, w = KIT_WORDS }: { url: string; out: boolean; accent?: string; w?: KitWords }) {
  const audio = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [rate, setRate] = React.useState(1);
  const [bars, setBars] = React.useState(() => pseudoBars(url));
  const [failed, setFailed] = React.useState(false);
  // The real waveform, read from the recording once (falls back to a steady pattern).
  React.useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const a = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = a.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const peaks = Array.from({ length: BARS }, (_, i) => {
          let m = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 32) m = Math.max(m, Math.abs(data[j]!));
          return m;
        });
        const top = Math.max(0.01, ...peaks);
        if (!off) {
          setBars(peaks.map((p) => 0.15 + (p / top) * 0.85));
          if (!dur && Number.isFinite(a.duration)) setDur(a.duration);
        }
      } catch {
        /* keep the pattern */
      }
    })();
    return () => {
      off = true;
    };
    // Once per recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const total = dur || 0;
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play().catch(() => setFailed(true));
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total));
    setPos(a.currentTime);
  };
  const done = total ? pos / total : 0;
  return (
    <div className="flex w-64 max-w-full items-center gap-2 py-0.5" data-voice-note>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? w.pause : `${w.play} ${w.voice.toLowerCase()}`}
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", out ? "bg-white/25 text-white hover:bg-white/35" : "text-white")}
        style={out ? undefined : { background: accent ?? "var(--primary)" }}
      >
        {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="ml-0.5 size-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onClick={seek} role="slider" aria-label={w.voice} aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(pos)} tabIndex={0} onKeyDown={(e) => audio.current && (e.key === "ArrowRight" ? (audio.current.currentTime += 5) : e.key === "ArrowLeft" ? (audio.current.currentTime -= 5) : null)}>
          {bars.map((b, i) => (
            <span key={i} className={cn("w-[3px] flex-1 rounded-full", i / BARS < done ? (out ? "bg-white" : "") : out ? "bg-white/40" : "bg-muted-foreground/30")} style={{ height: `${Math.round(b * 100)}%`, ...(i / BARS < done && !out ? { background: accent ?? "var(--primary)" } : {}) }} />
          ))}
        </div>
        <div className={cn("flex items-center justify-between text-[11px] tabular-nums", out ? "text-white/80" : "text-muted-foreground")}>
          <span>{failed ? "—" : clock(playing || pos ? pos : total)}</span>
          <button type="button" className={cn("rounded px-1 font-semibold", out ? "hover:bg-white/20" : "hover:bg-muted")} onClick={() => setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1))} aria-label={w.speed} data-voice-speed>
            {rate}×
          </button>
        </div>
      </div>
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        onPlay={(e) => ((e.currentTarget.playbackRate = rate), setPlaying(true))}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setPos(0))}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
        className="hidden"
      />
      <RateSync audio={audio} rate={rate} />
    </div>
  );
}
function RateSync({ audio, rate }: { audio: React.RefObject<HTMLAudioElement | null>; rate: number }) {
  React.useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [audio, rate]);
  return null;
}

// ---------------------------------------------------------------------------
// Photos full screen
// ---------------------------------------------------------------------------

function Lightbox({ images, index, onClose, w }: { images: KitFile[]; index: number; onClose: () => void; w: KitWords }) {
  const [i, setI] = React.useState(index);
  const img = images[i]!;
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(images.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [images.length, onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label={img.name} data-lightbox onClick={onClose}>
      <div className="flex items-center gap-2 p-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate">{img.name}</span>
        <span className="text-white/60 tabular-nums">
          {i + 1} / {images.length}
        </span>
        <a href={img.url} download={img.name} className="rounded-full p-2 hover:bg-white/15" aria-label={w.download}>
          <DownloadIcon className="size-5" />
        </a>
        <button type="button" className="rounded-full p-2 hover:bg-white/15" onClick={onClose} aria-label={w.close}>
          <XIcon className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {i > 0 && (
          <button type="button" className="absolute left-3 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={(e) => (e.stopPropagation(), setI(i - 1))} aria-label="Previous">
            <ChevronLeftIcon className="size-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {i < images.length - 1 && (
          <button type="button" className="absolute right-3 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={(e) => (e.stopPropagation(), setI(i + 1))} aria-label="Next">
            <ChevronRightIcon className="size-6" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A message
// ---------------------------------------------------------------------------

function Attachments({ m, out, accent, w, onImage }: { m: KitMsg; out: boolean; accent?: string; w: KitWords; onImage: (f: KitFile) => void }) {
  const images = m.files.filter((f) => /^image\//.test(f.mime));
  const rest = m.files.filter((f) => !/^image\//.test(f.mime));
  return (
    <>
      {images.length > 0 && (
        <div className={cn("mb-1 grid gap-1", images.length > 1 && "grid-cols-2")}>
          {images.map((f) => (
            <button key={f.id} type="button" className="block overflow-hidden rounded-xl" onClick={() => onImage(f)} aria-label={`${w.photo}: ${f.name}`} data-chat-image>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} loading="lazy" className={cn("w-full object-cover", images.length > 1 ? "aspect-square" : "max-h-72")} />
            </button>
          ))}
        </div>
      )}
      {rest.map((f) =>
        /^audio\//.test(f.mime) ? (
          <VoiceNote key={f.id} url={f.url} out={out} accent={accent} w={w} />
        ) : /^video\//.test(f.mime) ? (
          <video key={f.id} src={f.url} controls preload="metadata" className="mb-1 max-h-72 w-72 max-w-full rounded-xl bg-black" data-chat-video />
        ) : (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" download={f.name} className={cn("mb-1 flex w-64 max-w-full items-center gap-2 rounded-xl p-2", out ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70")} data-chat-file>
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", out ? "bg-white/20" : "bg-primary/10 text-primary")}>
              {/pdf|text|word|document/.test(f.mime) ? <FileTextIcon className="size-4" /> : <FileIcon className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{f.name}</span>
              <span className={cn("block text-[11px]", out ? "text-white/75" : "text-muted-foreground")}>{fmtSize(f.size)}</span>
            </span>
            <DownloadIcon className="size-4 shrink-0 opacity-70" />
          </a>
        ),
      )}
    </>
  );
}

function Bubble({ m, grouped, accent, w, onReply, onReact, onImage, highlight }: { m: KitMsg; grouped: boolean; accent?: string; w: KitWords; onReply?: (m: KitMsg) => void; onReact?: (m: KitMsg, emoji: string) => void; onImage: (f: KitFile) => void; highlight: boolean }) {
  const [picker, setPicker] = React.useState(false);
  const out = m.side === "out";
  const note = m.side === "note";
  const caption = m.files.length && PLACEHOLDER.test(m.body.trim()) ? "" : m.body;
  const jumbo = !m.files.length && !m.replyTo && caption.length <= 12 && EMOJI_ONLY.test(caption) && caption.trim().length > 0;
  const bg = out ? (accent ?? "var(--primary)") : undefined;
  return (
    <div id={`sc-${m.id}`} className={cn("flex flex-col rounded-xl transition-colors duration-700", !grouped && "mt-2", highlight && "bg-primary/15")} data-msg={m.role ?? (note ? "note" : m.side)} data-from={m.role ?? m.side} data-chat-msg={m.id}>
      <div className={cn("group flex items-end gap-2", out || note ? "justify-end" : "justify-start")}>
        {!out && !note && <span className="w-8 shrink-0">{!grouped && <Avatar name={m.author ?? "?"} k={m.authorKey} />}</span>}
        {(out || note) && (
          <Actions m={m} w={w} onReply={onReply} onReact={onReact ? () => setPicker((p) => !p) : undefined} />
        )}
        {jumbo ? (
          <div className="px-1 text-5xl leading-tight" title={time(m.at)} data-jumbo>
            {caption}
            <span className="ml-1 align-bottom text-[10px] text-muted-foreground">{time(m.at)}</span>
          </div>
        ) : (
          <div
            className={cn(
              "relative max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-xs sm:max-w-[72%]",
              out ? "rounded-br-md text-white" : note ? "rounded-br-md border border-[#F9AB00]/50 bg-[#F9AB00]/10" : "rounded-bl-md border bg-card",
            )}
            style={bg ? { background: bg } : undefined}
          >
            {note && (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-[#B06000] dark:text-[#FDD663]">
                <LockIcon className="size-3" /> {w.note}
                {m.author ? ` · ${m.author}` : ""}
              </p>
            )}
            {!out && !note && !grouped && m.author && (
              <p className="text-xs font-semibold" style={{ color: colorOf(m.authorKey) }}>
                {m.author}
              </p>
            )}
            {out && !grouped && m.author && <p className="text-[11px] font-semibold text-white/85">{m.author}</p>}
            {m.replyTo && (
              <button
                type="button"
                className={cn("my-1 block w-full rounded-md border-l-2 py-0.5 pl-2 text-left text-xs", out ? "border-white/60 bg-white/10" : "border-primary bg-primary/5")}
                onClick={() => {
                  const el = document.getElementById(`sc-${m.replyTo!.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.dispatchEvent(new CustomEvent("sc-flash", { bubbles: true }));
                }}
                data-quote
              >
                <span className={cn("block font-medium", out ? "text-white" : "text-primary")}>{m.replyTo.author}</span>
                <span className={cn("block truncate", out ? "text-white/80" : "text-muted-foreground")}>{PLACEHOLDER.test(m.replyTo.body) ? m.replyTo.body.slice(1, -1) : m.replyTo.body}</span>
              </button>
            )}
            <Attachments m={m} out={out} accent={accent} w={w} onImage={onImage} />
            {caption && <Text text={caption} out={out} />}
            <span className={cn("float-right mt-0.5 ml-2 flex items-center gap-0.5 text-[10px] tabular-nums", out ? "text-white/75" : "text-muted-foreground")}>
              {time(m.at)}
              {out && m.status && (m.status === "seen" ? <CheckCheckIcon className="size-3.5 text-sky-200" aria-label={w.seen} data-seen /> : <CheckIcon className="size-3.5" aria-label={w.sent} />)}
            </span>
          </div>
        )}
        {!out && !note && <Actions m={m} w={w} onReply={onReply} onReact={onReact ? () => setPicker((p) => !p) : undefined} />}
      </div>
      {picker && onReact && (
        <div className={cn("mt-1 flex gap-0.5 self-start rounded-full border bg-popover p-1 shadow-md", out || note ? "self-end" : "ml-10")} data-react-bar>
          {QUICK.map((e) => (
            <button key={e} type="button" className="rounded-full px-1.5 py-0.5 text-lg hover:bg-muted" onClick={() => (onReact(m, e), setPicker(false))} aria-label={`${w.react} ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
      {m.reactions.length > 0 && (
        <div className={cn("mt-0.5 flex flex-wrap gap-1", out || note ? "justify-end" : "ml-10")} data-reactions>
          {m.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              disabled={!onReact}
              onClick={() => onReact?.(m, r.emoji)}
              title={r.who?.join(", ")}
              className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs", r.mine ? "border-primary/50 bg-primary/10" : "bg-card")}
              data-reaction={r.emoji}
            >
              <span>{r.emoji}</span>
              {r.count > 1 && <span className="tabular-nums">{r.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Actions({ m, w, onReply, onReact }: { m: KitMsg; w: KitWords; onReply?: (m: KitMsg) => void; onReact?: () => void }) {
  if (!onReply && !onReact) return null;
  return (
    <span className="flex shrink-0 gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60">
      {onReact && (
        <button type="button" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onReact} aria-label={w.reactThis} title={w.react}>
          <SmilePlusIcon className="size-4" />
        </button>
      )}
      {onReply && (
        <button type="button" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onReply(m)} aria-label={w.replyThis} title={w.reply} data-reply-to={m.id}>
          <ReplyIcon className="size-4" />
        </button>
      )}
    </span>
  );
}

function CallItem({ c, w }: { c: KitCall; w: KitWords }) {
  const missed = ["missed", "declined", "failed"].includes(c.status);
  const Icon = missed ? PhoneMissedIcon : c.direction === "outbound" ? PhoneOutgoingIcon : PhoneIncomingIcon;
  const label = c.status === "callback" ? w.call.callback! : missed ? (w.call[c.status] ?? w.call.missed!) : c.status === "ringing" ? w.call.ringing! : c.status === "answered" ? w.call.answered! : c.direction === "outbound" ? w.call.outbound! : w.call.inbound!;
  return (
    <div className="my-2 flex justify-center" data-chat-call={c.status}>
      <div className="flex max-w-full items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-sm shadow-xs">
        <span className={cn("flex size-8 items-center justify-center rounded-full", missed ? "bg-[#D93025]/10 text-[#D93025]" : "bg-primary/10 text-primary")}>
          <Icon className="size-4" />
        </span>
        <span>
          <span className="block font-medium">
            {label}
            {c.kind === "phone" ? " · phone" : ""}
          </span>
          <span className="block text-xs text-muted-foreground">
            {time(c.at)}
            {c.durationS ? ` · ${clock(c.durationS)}` : ""}
            {c.who ? ` · ${c.who}` : ""}
          </span>
        </span>
        {c.recordingUrl && <audio controls preload="none" src={c.recordingUrl} className="h-8 w-48" data-recording-player />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

export function ChatTimeline({
  messages,
  calls = [],
  accent,
  typing,
  words: w = KIT_WORDS,
  onReply,
  onReact,
  onDropFiles,
  className,
  empty,
}: {
  messages: KitMsg[];
  calls?: KitCall[];
  accent?: string;
  typing?: string | null;
  words?: KitWords;
  onReply?: (m: KitMsg) => void;
  onReact?: (m: KitMsg, emoji: string) => void;
  onDropFiles?: (files: File[]) => void;
  className?: string;
  empty?: React.ReactNode;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [unseen, setUnseen] = React.useState(0);
  const [light, setLight] = React.useState<number | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const images = React.useMemo(() => messages.flatMap((m) => m.files.filter((f) => /^image\//.test(f.mime))), [messages]);
  const items = React.useMemo(() => [...messages.map((m) => ({ kind: "m" as const, at: m.at, m })), ...calls.map((c) => ({ kind: "c" as const, at: c.at, c }))].sort((a, b) => a.at.localeCompare(b.at)), [messages, calls]);
  const count = items.length;
  const last = React.useRef(count);
  // Stay at the end while the reader is there; otherwise count what came in.
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (atBottom || last.current === 0) el.scrollTop = el.scrollHeight;
    else if (count > last.current) setUnseen((u) => u + count - last.current);
    last.current = count;
    // Only when the list grows or someone types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, typing]);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const f = (e: Event) => {
      const id = (e.target as HTMLElement).id?.replace(/^sc-/, "");
      if (id) {
        setFlash(id);
        setTimeout(() => setFlash(null), 1200);
      }
    };
    el.addEventListener("sc-flash", f);
    return () => el.removeEventListener("sc-flash", f);
  }, []);
  const toEnd = () => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };
  return (
    <div
      className={cn("relative min-h-0 flex-1", className)}
      onDragOver={onDropFiles ? (e) => (e.preventDefault(), setDrag(true)) : undefined}
      onDragLeave={onDropFiles ? () => setDrag(false) : undefined}
      onDrop={
        onDropFiles
          ? (e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files.length) onDropFiles([...e.dataTransfer.files]);
            }
          : undefined
      }
    >
      <div
        ref={box}
        className="h-full overflow-y-auto bg-[var(--chat-wallpaper)] px-3 py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const b = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setAtBottom(b);
          if (b) setUnseen(0);
        }}
        data-thread
        data-conversation
      >
        {!items.length && empty}
        {items.map((it, i) => {
          const prev = items[i - 1];
          const newDay = !prev || dayKey(prev.at) !== dayKey(it.at);
          const sep = newDay ? (
            <div key={`d-${it.at}`} className="sticky top-1 z-10 my-2 flex justify-center">
              <span className="rounded-full bg-card/90 px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs backdrop-blur">{dayLabel(it.at, w)}</span>
            </div>
          ) : null;
          if (it.kind === "c")
            return (
              <React.Fragment key={`c-${it.c.id}`}>
                {sep}
                <CallItem c={it.c} w={w} />
              </React.Fragment>
            );
          const m = it.m;
          if (m.side === "system")
            return (
              <React.Fragment key={m.id}>
                {sep}
                <div className="my-2 flex justify-center" data-msg={m.role ?? "system"} data-from={m.role ?? "system"} data-chat-msg={m.id}>
                  <span className="max-w-[90%] rounded-full bg-card/90 px-3 py-1 text-center text-xs text-muted-foreground shadow-xs">{m.body}</span>
                </div>
              </React.Fragment>
            );
          const pm = prev?.kind === "m" ? prev.m : null;
          const grouped = !newDay && !!pm && pm.side === m.side && pm.authorKey === m.authorKey && Date.parse(m.at) - Date.parse(pm.at) < 5 * 60e3;
          return (
            <React.Fragment key={m.id}>
              {sep}
              <Bubble m={m} grouped={grouped} accent={accent} w={w} onReply={m.side === "note" && onReply ? undefined : onReply} onReact={onReact} onImage={(f) => setLight(images.findIndex((x) => x.id === f.id))} highlight={flash === m.id} />
            </React.Fragment>
          );
        })}
        {typing && (
          <div className="mt-2 flex items-end gap-2" data-typing>
            <span className="w-8" />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-3 py-2.5 shadow-xs" aria-label={w.typing(typing)} title={w.typing(typing)}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </div>
            <span className="pb-1 text-[11px] text-muted-foreground">{w.typing(typing)}</span>
          </div>
        )}
      </div>
      {!atBottom && (
        <button type="button" onClick={toEnd} className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs shadow-md" data-to-end>
          <ArrowDownIcon className="size-3.5" />
          {unseen > 0 ? `${unseen} ${w.newMessages.toLowerCase()}` : ""}
        </button>
      )}
      {drag && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
          <PaperclipIcon className="mr-2 size-4" /> {w.drop}
        </div>
      )}
      {light !== null && light >= 0 && images[light] && <Lightbox images={images} index={light} onClose={() => setLight(null)} w={w} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

export type ComposerHandle = { addFiles: (files: File[]) => void; focus: () => void };

export const Composer = React.forwardRef<
  ComposerHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: (text: string) => Promise<void> | void;
    onFiles?: (files: File[], caption: string) => Promise<void> | void;
    onVoice?: (blob: Blob, seconds: number) => Promise<void> | void;
    onTyping?: () => void;
    replyTo?: KitQuote | null;
    onCancelReply?: () => void;
    disabled?: boolean;
    accent?: string;
    words?: KitWords;
    placeholder?: string;
    label?: string;
    sendLabel?: string;
    tone?: "note";
    onError?: (message: string) => void;
    above?: React.ReactNode;
  }
>(function Composer({ value, onChange, onSend, onFiles, onVoice, onTyping, replyTo, onCancelReply, disabled, accent, words: w = KIT_WORDS, placeholder, label, sendLabel, tone, onError, above }, ref) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [emoji, setEmoji] = React.useState(false);
  const [rec, setRec] = React.useState<{ r: MediaRecorder; started: number } | null>(null);
  const [secs, setSecs] = React.useState(0);
  const cancelled = React.useRef(false);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  const previews = React.useMemo(() => files.map((f) => (/^image\//.test(f.type) ? URL.createObjectURL(f) : null)), [files]);
  React.useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  const add = React.useCallback(
    (list: File[]) => {
      if (!onFiles) return;
      const ok = list.filter((f) => {
        if (f.size > MAX_BYTES) onError?.(w.tooBig(f.name));
        return f.size <= MAX_BYTES;
      });
      setFiles((cur) => [...cur, ...ok].slice(0, 10));
      area.current?.focus();
    },
    [onFiles, onError, w],
  );
  React.useImperativeHandle(ref, () => ({ addFiles: add, focus: () => area.current?.focus() }), [add]);
  // The box grows with the text, up to about eight lines.
  React.useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);
  React.useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = (Date.now() - rec.started) / 1000;
      setSecs(s);
      if (s >= MAX_VOICE_SEC) rec.r.stop();
    }, 250);
    return () => clearInterval(t);
  }, [rec]);
  React.useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);
  // The emoji panel closes on a click anywhere else.
  const emojiBox = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!emoji) return;
    const close = (e: MouseEvent) => !emojiBox.current?.contains(e.target as Node) && setEmoji(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emoji]);

  const send = async () => {
    if (busy || disabled) return;
    const text = value.trim();
    if (!text && !files.length) return;
    setEmoji(false);
    setBusy(true);
    try {
      if (files.length && onFiles) {
        await onFiles(files, text);
        setFiles([]);
      } else await onSend(text);
      onChange("");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not send.");
    }
    setBusy(false);
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        const sec = (Date.now() - started) / 1000;
        if (cancelled.current || sec < 0.8 || !onVoice) return;
        setBusy(true);
        try {
          await onVoice(new Blob(chunks, { type: (r.mimeType || "audio/webm").split(";")[0] }), Math.round(sec));
        } catch (e) {
          onError?.(e instanceof Error ? e.message : "Could not send.");
        }
        setBusy(false);
      };
      r.start(250);
      setSecs(0);
      setRec({ r, started });
    } catch {
      onError?.(w.mic);
    }
  };
  const insert = (e: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? value.length;
    onChange(value.slice(0, at) + e + value.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  };
  const empty = !value.trim() && !files.length;
  return (
    <div
      className={cn("space-y-1.5 border-t bg-background p-2", tone === "note" && "bg-[#F9AB00]/5")}
      onPaste={(e) => {
        const list = [...e.clipboardData.files];
        if (list.length && onFiles) (e.preventDefault(), add(list));
      }}
      onDragOver={onFiles ? (e) => e.preventDefault() : undefined}
      onDrop={onFiles ? (e) => (e.preventDefault(), add([...e.dataTransfer.files])) : undefined}
      data-composer
    >
      {above}
      {replyTo && (
        <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-2 py-1 text-xs" data-replying>
          <ReplyIcon className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-primary">
              {w.replyingTo} {replyTo.author}
            </span>
            <span className="block truncate text-muted-foreground">{PLACEHOLDER.test(replyTo.body) ? replyTo.body.slice(1, -1) : replyTo.body}</span>
          </span>
          <button type="button" onClick={onCancelReply} aria-label={w.cancel} className="rounded-full p-1 hover:bg-muted">
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" data-pending-files>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative shrink-0">
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]!} alt={f.name} className="size-16 rounded-lg border object-cover" />
              ) : (
                <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-lg border bg-muted p-1 text-center">
                  {/^audio\//.test(f.type) ? <MicIcon className="size-4" /> : <FileIcon className="size-4" />}
                  <span className="w-full truncate text-[9px]">{f.name}</span>
                </div>
              )}
              <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 shadow-sm" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${w.discard} ${f.name}`}>
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {rec ? (
        <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-1.5" data-recording>
          <span className="size-2.5 animate-pulse rounded-full bg-[#D93025]" />
          <span className="text-sm tabular-nums">{clock(secs)}</span>
          <span className="flex-1 truncate text-xs text-muted-foreground">{w.recording}…</span>
          <button type="button" className="rounded-full p-2 hover:bg-muted" onClick={() => ((cancelled.current = true), rec.r.stop())} aria-label={w.discard}>
            <Trash2Icon className="size-4" />
          </button>
          <button type="button" className="flex size-9 items-center justify-center rounded-full text-white" style={{ background: accent ?? "var(--primary)" }} onClick={() => rec.r.stop()} aria-label={w.stopSend}>
            <SquareIcon className="size-3.5 fill-current" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          {onFiles && (
            <>
              <input ref={picker} type="file" multiple className="hidden" onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ""))} data-chat-file-input />
              <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" disabled={disabled || busy} onClick={() => picker.current?.click()} aria-label={w.attach} title={w.attach}>
                <PaperclipIcon className="size-5" />
              </button>
            </>
          )}
          <div ref={emojiBox} className="relative flex min-w-0 flex-1 items-end rounded-2xl border bg-card focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              ref={area}
              rows={1}
              value={value}
              disabled={disabled}
              aria-label={files.length ? w.caption : (label ?? placeholder ?? w.write)}
              placeholder={files.length ? w.caption : (placeholder ?? w.write)}
              className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              onChange={(e) => (onChange(e.target.value), onTyping?.())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className="m-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEmoji((x) => !x)} aria-label={w.emoji} aria-expanded={emoji} title={w.emoji}>
              <SmileIcon className="size-4" />
            </button>
            {emoji && (
              <div className="absolute right-0 bottom-full z-30 mb-2 grid w-72 grid-cols-8 gap-0.5 rounded-xl border bg-popover p-2 shadow-lg" data-emoji-picker>
                {EMOJI.map((e) => (
                  <button key={e} type="button" className="rounded-md p-1 text-lg hover:bg-muted" onClick={() => insert(e)} aria-label={e}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {empty && onVoice ? (
            <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" disabled={disabled || busy} onClick={() => void startRec()} aria-label={w.record} title={w.record}>
              {busy ? <Loader2Icon className="size-5 animate-spin" /> : <MicIcon className="size-5" />}
            </button>
          ) : (
            <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50" style={{ background: tone === "note" ? "#B06000" : (accent ?? "var(--primary)") }} disabled={disabled || busy || empty} onClick={() => void send()} aria-label={sendLabel ?? w.send} title={sendLabel ?? w.send} data-chat-send>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
