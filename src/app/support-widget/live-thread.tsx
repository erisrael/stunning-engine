"use client";

// A live conversation in the widget (Update 1.1, phase 12): new messages arrive at once over a live stream (with a
// slow check as a fallback), the agent's typing, "Seen" under the customer's messages, the agent's online state,
// files and voice notes both ways, and English or Amharic (with Latin-to-Ge'ez typing).
import * as React from "react";
import { Loader2Icon, MicIcon, PaperclipIcon, SendIcon, SquareIcon, StarIcon } from "lucide-react";
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
type Msg = { id: string; from: string; name: string; body: string; at: string };
type File = { id: string; message_id: string | null; name: string; mime: string; size: number };
type Live = { stamp: string; status: string; closed: boolean; typing: string | null; read: string | null; online: boolean };
const MAX = 10 * 1024 * 1024;

const toBase64 = (b: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => no(r.error);
    r.readAsDataURL(b);
  });

export function LiveThread({ api, appKey, token, id, color, lang, online: startOnline, callButton }: { api: Api; appKey: string; token: string; id: string; color: string; lang: Lang; online: boolean; callButton?: (reload: () => void) => React.ReactNode }) {
  const w = words(lang);
  const [t, setT] = React.useState<{ id: string; number: number; subject: string; status: string; rating: number | null } | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [live, setLive] = React.useState<Live | null>(null);
  const [text, setText] = React.useState("");
  const [geez, setGeez] = React.useState(lang === "am");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [rec, setRec] = React.useState<{ r: MediaRecorder; chunks: Blob[]; started: number } | null>(null);
  const [secs, setSecs] = React.useState(0);
  const end = React.useRef<HTMLDivElement>(null);
  const lastTyping = React.useRef(0);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const q = `key=${encodeURIComponent(appKey)}&token=${encodeURIComponent(token)}`;

  const load = React.useCallback(async () => {
    const [r, f] = await Promise.all([api<{ ticket: NonNullable<typeof t>; messages: Msg[] }>(`tickets/${id}/messages`), api<File[]>(`tickets/${id}/files`).catch(() => [] as File[])]);
    setT(r.ticket);
    setMsgs(r.messages);
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
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length, live?.typing]);
  // Switching the widget to Amharic turns Latin-to-Ge'ez typing on (it can be turned off below the box).
  React.useEffect(() => setGeez(lang === "am"), [lang]);
  React.useEffect(() => {
    if (!rec) return;
    const i = window.setInterval(() => setSecs(Math.round((Date.now() - rec.started) / 1000)), 500);
    return () => window.clearInterval(i);
  }, [rec]);

  const typed = (v: string) => {
    setText(geez ? geezAsYouType(v) : v);
    if (Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      void api(`tickets/${id}/typing`, {}).catch(() => null);
    }
  };
  const send = async () => {
    const body = geez ? toGeez(text) : text;
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`tickets/${id}/messages`, { body });
      setText("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    }
    setBusy(false);
  };
  const upload = async (blob: Blob, name: string) => {
    if (blob.size > MAX) return setErr(w.tooBig);
    setBusy(true);
    setErr(null);
    try {
      await api(`tickets/${id}/files`, { name, mime: blob.type || "application/octet-stream", data: await toBase64(blob) });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    }
    setBusy(false);
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        void upload(new Blob(chunks, { type: r.mimeType || "audio/webm" }), `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`);
      };
      r.start();
      setSecs(0);
      setRec({ r, chunks, started: Date.now() });
    } catch {
      setErr(w.mic);
    }
  };

  if (!t) return <Loader2Icon className="m-6 size-5 animate-spin text-muted-foreground" />;
  const status = live?.status ?? t.status;
  const done = ["solved", "closed"].includes(status);
  const online = live ? live.online : startOnline;
  const lastMine = [...msgs].reverse().find((m) => m.from === "customer");
  const seen = !!(live?.read && lastMine && live.read >= lastMine.at);
  const fileUrl = (f: File) => `/api/support/v1/files/${f.id}?${q}`;
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
      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-thread>
        {msgs.map((m) => {
          const mine = m.from === "customer";
          const att = files.filter((f) => f.message_id === m.id);
          return (
            <div key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", mine ? "ml-auto text-white" : m.from === "system" ? "mx-auto bg-muted text-xs text-muted-foreground" : "bg-muted")} style={mine ? { background: color } : undefined} data-from={m.from}>
              {m.from === "agent" && <p className="text-xs font-medium">{m.name}</p>}
              {att.length ? null : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {att.map((f) =>
                f.mime.startsWith("audio/") ? (
                  <audio key={f.id} controls src={fileUrl(f)} className="mt-1 h-9 max-w-full" aria-label={w.voice} data-voice-note />
                ) : f.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.id} src={fileUrl(f)} alt={f.name} className="mt-1 max-h-48 rounded" />
                ) : (
                  <a key={f.id} href={fileUrl(f)} target="_blank" rel="noreferrer" className={cn("mt-1 flex items-center gap-1 underline", mine && "text-white")} data-widget-file>
                    <PaperclipIcon className="size-3.5" /> {f.name}
                  </a>
                ),
              )}
              {mine && m.id === lastMine?.id && seen && <p className="mt-0.5 text-right text-[10px] opacity-80" data-seen>{w.seen}</p>}
            </div>
          );
        })}
        {live?.typing && !done && (
          <p className="text-xs text-muted-foreground" data-agent-typing>
            {w.typing(live.typing)}
          </p>
        )}
        <div ref={end} />
      </div>
      {done && t.rating === null && <Rate api={api} id={id} lang={lang} onDone={load} />}
      {status === "closed" ? (
        <p className="border-t p-3 text-center text-xs text-muted-foreground" data-closed>
          {w.closed}
        </p>
      ) : (
        <div className="space-y-2 border-t p-2">
          {!done && callButton?.(() => void load())}
          {err && <p className="text-xs text-[#D93025]">{err}</p>}
          {rec ? (
            <div className="flex items-center gap-2 text-sm" data-recording>
              <span className="size-2 animate-pulse rounded-full bg-[#D93025]" />
              <span className="flex-1 tabular-nums">
                0:{String(secs).padStart(2, "0")}
              </span>
              <Button size="sm" variant="outline" onClick={() => (rec.r.stop(), setRec(null))} aria-label={w.stop}>
                <SquareIcon /> {w.stop}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input ref={fileInput} type="file" className="hidden" onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0], e.target.files[0].name), (e.target.value = ""))} data-widget-file-input />
              <Button size="icon" variant="ghost" aria-label={w.attach} title={w.attach} disabled={busy} onClick={() => fileInput.current?.click()}>
                <PaperclipIcon />
              </Button>
              <Button size="icon" variant="ghost" aria-label={w.record} title={w.record} disabled={busy} onClick={() => void startRec()}>
                <MicIcon />
              </Button>
              <Input aria-label={w.write} placeholder={w.write} value={text} onChange={(e) => typed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && text.trim() && (e.preventDefault(), void send())} />
              <Button size="icon" className="shrink-0 text-white" style={{ background: color }} aria-label={w.send} disabled={busy || !text.trim()} onClick={() => void send()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              </Button>
            </div>
          )}
          {lang === "am" && (
            <label className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={geez} onChange={(e) => setGeez(e.target.checked)} data-geez-toggle />
              {w.geez}
            </label>
          )}
        </div>
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
