"use client";

// A live conversation in the widget (Update 1.1, phase 12): new messages arrive at once over a live stream (with a
// slow check as a fallback), the agent's typing, "Seen" under the customer's messages, the agent's online state,
// files and voice notes both ways, and English or Amharic (with Latin-to-Ge'ez typing).
import * as React from "react";
import { Loader2Icon, StarIcon } from "lucide-react";
import { ChatTimeline, Composer, KIT_WORDS, type ComposerHandle, type KitMsg, type KitReaction, type KitWords } from "@/components/support-chat/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { geezAsYouType, toGeez } from "@/lib/geez";

export type Lang = "en" | "am";
const WORDS = {
  en: {
    write: "Write a message",
    send: "Send",
    typing: (n: string) => `${n} is typing…`,
    seen: "Seen",
    online: "Online",
    away: "Away",
    attach: "Send a file",
    record: "Record a voice note",
    stop: "Stop and send",
    geez: "Type Amharic in Latin letters (selam → ሰላም)",
    voice: "Voice note",
    closed: "This conversation is closed. Start a new one if you need more help.",
    rateQ: "How was the help?",
    rate: "Rate",
    comment: "Anything to add? (optional)",
    tooBig: "The file is larger than 10 MB.",
    mic: "Allow the microphone to record.",
    status: { new: "Sent", open: "Being answered", pending: "Waiting for you", on_hold: "On hold", solved: "Solved", closed: "Closed" } as Record<string, string>,
  },
  am: {
    write: "መልዕክት ይጻፉ",
    send: "ላክ",
    typing: (n: string) => `${n} እየጻፈ ነው…`,
    seen: "ታይቷል",
    online: "መስመር ላይ",
    away: "የለም",
    attach: "ፋይል ላክ",
    record: "የድምፅ መልዕክት ይቅዱ",
    stop: "አቁምና ላክ",
    geez: "አማርኛን በላቲን ፊደል ይጻፉ (selam → ሰላም)",
    voice: "የድምፅ መልዕክት",
    closed: "ይህ ውይይት ተዘግቷል። ተጨማሪ እርዳታ ከፈለጉ አዲስ ይጀምሩ።",
    rateQ: "እርዳታው እንዴት ነበር?",
    rate: "ደረጃ ይስጡ",
    comment: "የሚጨምሩት አለ? (አማራጭ)",
    tooBig: "ፋይሉ ከ10 ሜጋባይት ይበልጣል።",
    mic: "ለመቅዳት ማይክሮፎኑን ይፍቀዱ።",
    status: { new: "ተልኳል", open: "እየተመለሰ ነው", pending: "እርስዎን እየጠበቀ", on_hold: "ቆሟል", solved: "ተፈቷል", closed: "ተዘግቷል" } as Record<string, string>,
  },
};
export const words = (l: Lang) => WORDS[l];

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Quote = { id: string; name?: string; author?: string; body: string };
type Msg = { id: string; from: string; name: string; body: string; at: string; replyTo: { id: string; author: string; body: string } | null; reactions: KitReaction[] };
type FileRow = { id: string; message_id: string | null; name: string; mime: string; size: number };
type Call = { id: string; direction: string; kind: string; status: string; at: string; durationS: number | null };
type Live = { stamp: string; status: string; closed: boolean; typing: string | null; read: string | null; online: boolean };

// The chat kit's words in Amharic.
const KIT_AM: KitWords = {
  ...KIT_WORDS,
  today: "ዛሬ",
  yesterday: "ትናንት",
  reply: "መልስ",
  react: "ስሜት ይግለጹ",
  replyThis: "ለዚህ መልዕክት ይመልሱ",
  reactThis: "ለዚህ መልዕክት ስሜት ይግለጹ",
  replyingTo: "ለ",
  cancel: "ይቅር",
  typing: (n: string) => `${n} እየጻፈ ነው`,
  write: "መልዕክት ይጻፉ",
  send: "ላክ",
  attach: "ፋይሎች ያያይዙ",
  emoji: "ስሜት ገላጭ",
  record: "የድምፅ መልዕክት ይቅዱ",
  recording: "እየተቀዳ ነው",
  stopSend: "የድምፅ መልዕክቱን ላክ",
  discard: "ሰርዝ",
  caption: "መግለጫ ያክሉ",
  photo: "ፎቶ",
  voice: "የድምፅ መልዕክት",
  file: "ፋይል",
  download: "አውርድ",
  close: "ዝጋ",
  play: "አጫውት",
  pause: "ለአፍታ አቁም",
  speed: "ፍጥነት",
  newMessages: "አዲስ መልዕክቶች",
  seen: "ታይቷል",
  sent: "ተልኳል",
  tooBig: (n: string) => `${n} ከ10 ሜጋባይት ይበልጣል።`,
  mic: "ለመቅዳት ማይክሮፎኑን ይፍቀዱ።",
  call: { inbound: "ገቢ ጥሪ", outbound: "ወጪ ጥሪ", missed: "ያመለጠ ጥሪ", declined: "ያልተቀበሉት ጥሪ", callback: "መልሰው እንዲደውሉ ተጠይቋል", ringing: "እየጠራ ነው…", answered: "በጥሪ ላይ" },
  drop: "ለመላክ ፋይሎችን እዚህ ይጣሉ",
};

const toBase64 = (b: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => no(r.error);
    r.readAsDataURL(b);
  });

export function LiveThread({ api, appKey, token, id, color, lang, online: startOnline, callButton }: { api: Api; appKey: string; token: string; id: string; color: string; lang: Lang; online: boolean; callButton?: (reload: () => void) => React.ReactNode }) {
  const w = words(lang);
  const kw = lang === "am" ? KIT_AM : KIT_WORDS;
  const [t, setT] = React.useState<{ id: string; number: number; subject: string; status: string; rating: number | null } | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [calls, setCalls] = React.useState<Call[]>([]);
  const [files, setFiles] = React.useState<FileRow[]>([]);
  const [live, setLive] = React.useState<Live | null>(null);
  const [text, setText] = React.useState("");
  const [geez, setGeez] = React.useState(lang === "am");
  const [err, setErr] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState<Quote | null>(null);
  const composer = React.useRef<ComposerHandle>(null);
  const lastTyping = React.useRef(0);
  const q = `key=${encodeURIComponent(appKey)}&token=${encodeURIComponent(token)}`;

  const load = React.useCallback(async () => {
    const [r, f] = await Promise.all([api<{ ticket: NonNullable<typeof t>; messages: Msg[]; calls?: Call[] }>(`tickets/${id}/messages`), api<FileRow[]>(`tickets/${id}/files`).catch(() => [] as FileRow[])]);
    setT(r.ticket);
    setMsgs(r.messages);
    setCalls(r.calls ?? []);
    setFiles(f);
    void api(`tickets/${id}/read`, {}).catch(() => null);
  }, [api, id]);

  // The live stream: reload when its stamp changes. A slow check stays as a fallback.
  React.useEffect(() => {
    void load().catch(() => null);
    let stamp = "";
    const es = typeof EventSource !== "undefined" ? new EventSource(`/api/support/v1/tickets/${id}/live?${q}`) : null;
    if (es)
      es.onmessage = (e) => {
        const v = JSON.parse(e.data) as Live;
        setLive(v);
        if (v.stamp !== stamp) {
          if (stamp) void load().catch(() => null);
          stamp = v.stamp;
        }
      };
    const slow = window.setInterval(() => void load().catch(() => null), es ? 30_000 : 4000);
    return () => {
      es?.close();
      window.clearInterval(slow);
    };
  }, [id, q, load]);
  // Switching the widget to Amharic turns Latin-to-Ge'ez typing on (it can be turned off below the box).
  React.useEffect(() => setGeez(lang === "am"), [lang]);

  const typed = (v: string) => {
    setText(geez ? geezAsYouType(v) : v);
    if (Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      void api(`tickets/${id}/typing`, {}).catch(() => null);
    }
  };
  const sendText = async (body: string) => {
    const b = geez ? toGeez(body) : body;
    if (!b.trim()) return;
    setErr(null);
    await api(`tickets/${id}/messages`, { body: b, replyTo: reply?.id ?? null });
    setReply(null);
    await load();
  };
  const upload = async (blob: Blob, name: string, caption = "") => {
    await api(`tickets/${id}/files`, { name, mime: blob.type || "application/octet-stream", data: await toBase64(blob), caption, replyTo: reply?.id ?? null });
  };
  const sendFiles = async (list: File[], caption: string) => {
    setErr(null);
    // The caption goes with the first file.
    for (const [i, f] of list.entries()) await upload(f, f.name, i === 0 ? (geez ? toGeez(caption) : caption) : "");
    setReply(null);
    await load();
  };
  const sendVoice = async (blob: Blob) => {
    setErr(null);
    await upload(blob, `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
    setReply(null);
    await load();
  };
  const react = async (m: KitMsg, emoji: string) => {
    await api(`tickets/${id}/messages/${m.id}/react`, { emoji }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    await load();
  };

  if (!t) return <Loader2Icon className="m-6 size-5 animate-spin text-muted-foreground" />;
  const status = live?.status ?? t.status;
  const done = ["solved", "closed"].includes(status);
  const online = live ? live.online : startOnline;
  const fileUrl = (f: FileRow) => `/api/support/v1/files/${f.id}?${q}`;
  const kitMsgs: KitMsg[] = msgs.map((m) => ({
    id: m.id,
    side: m.from === "customer" ? "out" : m.from === "system" ? "system" : "in",
    author: m.from === "customer" ? null : m.name,
    authorKey: m.from === "agent" ? `a:${m.name}` : m.from,
    body: m.body,
    at: m.at,
    files: files.filter((f) => f.message_id === m.id).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: fileUrl(f) })),
    replyTo: m.replyTo,
    reactions: m.reactions ?? [],
    status: m.from === "customer" ? (live?.read && live.read >= m.at ? "seen" : "sent") : null,
    role: m.from,
  }));
  return (
    <div className="flex h-full flex-col" data-live-thread>
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{t.subject}</p>
          <p className="text-xs text-muted-foreground">
            #{t.number} · {w.status[status] ?? status}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" data-agent-presence={online ? "online" : "away"}>
          <span className={cn("size-2 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          {online ? w.online : w.away}
        </span>
      </div>
      <ChatTimeline
        messages={kitMsgs}
        calls={calls.map((c) => ({ ...c }))}
        accent={color}
        typing={!done ? live?.typing : null}
        words={kw}
        onReply={status === "closed" ? undefined : (m) => setReply({ id: m.id, author: m.side === "out" ? (lang === "am" ? "እርስዎ" : "You") : (m.author ?? ""), body: m.body })}
        onReact={status === "closed" ? undefined : (m, e) => void react(m, e)}
        onDropFiles={status === "closed" ? undefined : (list) => composer.current?.addFiles(list)}
      />
      {live?.typing && !done && (
        <p className="sr-only" data-agent-typing>
          {w.typing(live.typing)}
        </p>
      )}
      {done && t.rating === null && <Rate api={api} id={id} lang={lang} onDone={load} />}
      {status === "closed" ? (
        <p className="border-t p-3 text-center text-xs text-muted-foreground" data-closed>
          {w.closed}
        </p>
      ) : (
        <>
          <Composer
            ref={composer}
            value={text}
            onChange={typed}
            onSend={sendText}
            onFiles={sendFiles}
            onVoice={sendVoice}
            replyTo={reply ? { id: reply.id, author: reply.author ?? "", body: reply.body } : null}
            onCancelReply={() => setReply(null)}
            accent={color}
            words={kw}
            onError={setErr}
            above={
              <>
                {!done && callButton?.(() => void load())}
                {err && <p className="text-xs text-[#D93025]">{err}</p>}
              </>
            }
          />
          {lang === "am" && (
            <label className="flex items-center gap-1.5 px-3 pb-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={geez} onChange={(e) => setGeez(e.target.checked)} data-geez-toggle />
              {w.geez}
            </label>
          )}
        </>
      )}
    </div>
  );
}

function Rate({ api, id, lang, onDone }: { api: Api; id: string; lang: Lang; onDone: () => void }) {
  const w = words(lang);
  const [r, setR] = React.useState(0);
  const [c, setC] = React.useState("");
  return (
    <div className="space-y-2 border-t p-3 text-sm" data-rate>
      <p>{w.rateQ}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => setR(n)}>
            <StarIcon className={cn("size-6", n <= r ? "fill-[#F9AB00] text-[#F9AB00]" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      {r > 0 && (
        <div className="flex gap-2">
          <Input aria-label="Comment" placeholder={w.comment} value={c} onChange={(e) => setC(e.target.value)} />
          <Button size="sm" onClick={async () => (await api(`tickets/${id}/rating`, { rating: r, comment: c }), onDone())}>
            {w.rate}
          </Button>
        </div>
      )}
    </div>
  );
}
