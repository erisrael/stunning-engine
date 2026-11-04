"use client";

// The customer's support panel: conversations, a new question, replies (checked every few seconds), rating the help,
// and calling an agent from the browser (after agreeing to the recording when calls are recorded).
import * as React from "react";
import { ArrowLeftIcon, Loader2Icon, PhoneIcon, PhoneOffIcon, PlusIcon, SendIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type User = { id: string | null; name: string | null; email: string | null; phone: string | null; hash: string | null; meta?: Record<string, string> };
type Session = { token: string; customer: { id: string; name: string }; app: { name: string; greeting: string | null; color: string | null }; online: boolean; hours: string; awayMessage: string; recordCalls: boolean; recordingNotice: string };
type Ticket = { id: string; number: number; subject: string; status: string; updated_at: string; rating: number | null };
type Msg = { id: string; from: string; name: string; body: string; at: string };

const STATUS: Record<string, string> = { new: "Sent", open: "Being answered", pending: "Waiting for you", on_hold: "On hold", solved: "Solved", closed: "Closed" };

export function SupportWidget({ appKey, initialUser, waitForParent }: { appKey: string; initialUser: User | null; waitForParent: boolean }) {
  const [user, setUser] = React.useState<User | null>(initialUser);
  const [s, setS] = React.useState<Session | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [open, setOpen] = React.useState<string | "new" | null>(null);
  const api = React.useCallback(
    async <T,>(path: string, body?: unknown, token = s?.token): Promise<T> => {
      const r = await fetch(`/api/support/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-App-Key": appKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as T & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      return j;
    },
    [appKey, s?.token],
  );

  // Who the customer is: from the address, or from the app around the frame (the SDK).
  React.useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as { type?: string; user?: User };
      if (d?.type === "myseed-support:identify" && d.user) setUser({ id: d.user.id ?? null, name: d.user.name ?? null, email: d.user.email ?? null, phone: d.user.phone ?? null, hash: d.user.hash ?? null, meta: d.user.meta });
    };
    window.addEventListener("message", on);
    if (waitForParent) window.parent?.postMessage({ type: "myseed-support:ready" }, "*");
    return () => window.removeEventListener("message", on);
  }, [waitForParent]);

  React.useEffect(() => {
    if (!appKey) return setError("This support link is missing its app key.");
    if (!user && waitForParent) return;
    let stop = false;
    (async () => {
      try {
        // A visitor who is not signed in keeps one id on this browser, so their conversations stay.
        let id = user?.id ?? null;
        if (!id) {
          try {
            id = localStorage.getItem("myseed-support-visitor") ?? `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem("myseed-support-visitor", id);
          } catch {}
        }
        const session = await api<Session>("identify", { ...(user ?? {}), id }, "");
        if (stop) return;
        setS(session);
        const list = await api<Ticket[]>("tickets", undefined, session.token);
        if (!stop) setTickets(list);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Support is not available.");
      }
    })();
    return () => {
      stop = true;
    };
    // Identify again only when the customer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, user]);

  const reload = async () => s && setTickets(await api<Ticket[]>("tickets"));
  const color = s?.app.color ?? "#1A73E8";
  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!s)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  return (
    <div className="flex h-full flex-col" data-widget>
      <header className="space-y-0.5 px-4 py-3 text-white" style={{ background: color }}>
        <div className="flex items-center gap-2">
          {open && (
            <button type="button" aria-label="Back" onClick={() => (setOpen(null), void reload())}>
              <ArrowLeftIcon className="size-5" />
            </button>
          )}
          <p className="font-semibold">{s.app.name} support</p>
        </div>
        <p className="text-xs opacity-90">{s.online ? "We are online" : `Usually: ${s.hours}`}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open === null && (
          <div className="space-y-3 p-4">
            <p className="text-sm">{s.app.greeting ?? `Hi ${s.customer.name.split(" ")[0]}! How can we help?`}</p>
            <Button className="w-full text-white" style={{ background: color }} onClick={() => setOpen("new")} data-new-question>
              <PlusIcon /> Ask a question
            </Button>
            {s.online && <CallButton api={api} s={s} ticketId={null} color={color} onTicket={(id) => (setOpen(id), void reload())} />}
            <HelpSearch api={api} onOpen={(id) => setOpen(`a:${id}`)} />
            {tickets.length > 0 && <p className="pt-2 text-xs font-medium text-muted-foreground">Your conversations</p>}
            <ul className="space-y-1">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" className="w-full rounded-lg border p-2 text-left text-sm hover:bg-muted" onClick={() => setOpen(t.id)} data-conversation-item>
                    <span className="block truncate font-medium">{t.subject}</span>
                    <span className="text-xs text-muted-foreground">
                      #{t.number} · {STATUS[t.status] ?? t.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open === "new" && <NewQuestion api={api} color={color} onDone={(id) => (setOpen(id), void reload())} onArticle={(id) => setOpen(`a:${id}`)} />}
        {open?.startsWith("a:") && <ArticleView api={api} id={open.slice(2)} onAsk={() => setOpen("new")} />}
        {open && open !== "new" && !open.startsWith("a:") && <Thread key={open} api={api} s={s} id={open} color={color} />}
      </div>
    </div>
  );
}

type Api = <T>(path: string, body?: unknown) => Promise<T>;

type Found = { id: string; title: string; category: string | null; snippet: string };

// Help articles matching what the customer types (the knowledge base), so many questions answer themselves.
function useArticles(api: Api, q: string) {
  const [found, setFound] = React.useState<Found[]>([]);
  React.useEffect(() => {
    if (q.trim().length < 4) return void setFound([]);
    const t = window.setTimeout(() => void api<Found[]>(`articles?q=${encodeURIComponent(q)}`).then(setFound).catch(() => setFound([])), 400);
    return () => window.clearTimeout(t);
  }, [api, q]);
  return found;
}

function HelpSearch({ api, onOpen }: { api: Api; onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const found = useArticles(api, q);
  return (
    <div className="space-y-1 pt-2" data-help-search>
      <Input aria-label="Search help" placeholder="Search help articles" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.map((a) => (
        <button key={a.id} type="button" className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-muted" onClick={() => onOpen(a.id)} data-help-result>
          <span className="font-medium">{a.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{a.snippet}</span>
        </button>
      ))}
    </div>
  );
}

function ArticleView({ api, id, onAsk }: { api: Api; id: string; onAsk: () => void }) {
  const [a, setA] = React.useState<{ title: string; body: string; category: string | null } | null>(null);
  const [voted, setVoted] = React.useState<boolean | null>(null);
  React.useEffect(() => void api<{ title: string; body: string; category: string | null }>(`articles/${id}`).then(setA).catch(() => null), [api, id]);
  if (!a) return <Loader2Icon className="m-6 size-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-3 p-4 text-sm" data-help-article>
      {a.category && <p className="text-xs text-muted-foreground">{a.category}</p>}
      <p className="text-base font-semibold">{a.title}</p>
      <p className="whitespace-pre-wrap">{a.body}</p>
      {voted === null ? (
        <div className="flex items-center gap-2 border-t pt-2">
          <span className="text-xs">Did this help?</span>
          <Button size="xs" variant="outline" onClick={() => (setVoted(true), void api(`articles/${id}/vote`, { helpful: true }))}>
            Yes
          </Button>
          <Button size="xs" variant="outline" onClick={() => (setVoted(false), void api(`articles/${id}/vote`, { helpful: false }))}>
            No
          </Button>
        </div>
      ) : voted ? (
        <p className="border-t pt-2 text-xs text-muted-foreground">Glad it helped.</p>
      ) : (
        <div className="border-t pt-2">
          <Button size="sm" variant="outline" onClick={onAsk}>
            Ask our team instead
          </Button>
        </div>
      )}
    </div>
  );
}

function NewQuestion({ api, color, onDone, onArticle }: { api: Api; color: string; onDone: (id: string) => void; onArticle: (id: string) => void }) {
  const [f, setF] = React.useState({ subject: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const suggested = useArticles(api, `${f.subject} ${f.message}`);
  return (
    <div className="space-y-2 p-4">
      <Input aria-label="Subject" placeholder="Subject (optional)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      <Textarea aria-label="Your question" placeholder="Tell us what you need" className="min-h-32" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {suggested.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-2" data-suggested>
          <p className="text-xs text-muted-foreground">These may answer it:</p>
          {suggested.slice(0, 3).map((a) => (
            <button key={a.id} type="button" className="block w-full text-left text-sm text-primary hover:underline" onClick={() => onArticle(a.id)}>
              {a.title}
            </button>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-[#D93025]">{err}</p>}
      <Button
        className="w-full text-white"
        style={{ background: color }}
        disabled={busy || !f.message.trim()}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ id: string }>("tickets", f);
            onDone(r.id);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not send.");
          }
          setBusy(false);
        }}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
      </Button>
    </div>
  );
}

function Thread({ api, s, id, color }: { api: Api; s: Session; id: string; color: string }) {
  const [t, setT] = React.useState<{ id: string; number: number; subject: string; status: string; rating: number | null } | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const end = React.useRef<HTMLDivElement>(null);
  const load = React.useCallback(async () => {
    const r = await api<{ ticket: NonNullable<typeof t>; messages: Msg[] }>(`tickets/${id}/messages`);
    setT(r.ticket);
    setMsgs(r.messages);
  }, [api, id]);
  React.useEffect(() => {
    void load();
    const i = window.setInterval(() => void load().catch(() => {}), 4000);
    return () => window.clearInterval(i);
  }, [load]);
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length]);
  if (!t) return <Loader2Icon className="m-6 size-5 animate-spin text-muted-foreground" />;
  const done = ["solved", "closed"].includes(t.status);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2 text-sm">
        <p className="font-medium">{t.subject}</p>
        <p className="text-xs text-muted-foreground">
          #{t.number} · {STATUS[t.status] ?? t.status}
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-thread>
        {msgs.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.from === "customer" ? "ml-auto text-white" : m.from === "system" ? "mx-auto bg-muted text-xs text-muted-foreground" : "bg-muted")} style={m.from === "customer" ? { background: color } : undefined} data-from={m.from}>
            {m.from === "agent" && <p className="text-xs font-medium">{m.name}</p>}
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {done && t.rating === null && <Rate api={api} id={id} onDone={load} />}
      {t.status !== "closed" && (
        <div className="space-y-2 border-t p-2">
          {s.online && !done && <CallButton api={api} s={s} ticketId={id} color={color} onTicket={() => void load()} />}
          <div className="flex gap-2">
            <Input aria-label="Message" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && text.trim() && (e.preventDefault(), document.getElementById("widget-send")?.click())} />
            <Button
              id="widget-send"
              size="icon"
              className="text-white"
              style={{ background: color }}
              aria-label="Send"
              disabled={busy || !text.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`tickets/${id}/messages`, { body: text });
                  setText("");
                  await load();
                } catch {}
                setBusy(false);
              }}
            >
              <SendIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Rate({ api, id, onDone }: { api: Api; id: string; onDone: () => void }) {
  const [r, setR] = React.useState(0);
  const [c, setC] = React.useState("");
  return (
    <div className="space-y-2 border-t p-3 text-sm" data-rate>
      <p>How was the help?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => setR(n)}>
            <StarIcon className={cn("size-6", n <= r ? "fill-[#F9AB00] text-[#F9AB00]" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      {r > 0 && (
        <div className="flex gap-2">
          <Input aria-label="Comment" placeholder="Anything to add? (optional)" value={c} onChange={(e) => setC(e.target.value)} />
          <Button size="sm" onClick={async () => (await api(`tickets/${id}/rating`, { rating: r, comment: c }), onDone())}>
            Rate
          </Button>
        </div>
      )}
    </div>
  );
}

async function gathered(pc: RTCPeerConnection, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && (window.clearTimeout(t), resolve()));
  });
}

type Ivr = { on: boolean; message: string; lang: string; audio: string | null; music: boolean; repeatSec: number; position: boolean };

// What the caller hears until an agent answers: the recording Admin uploaded, or the message spoken in their browser,
// with their place in line, then soft hold music; repeated. It stops the moment the call is answered or ends.
function useWaitingMessage(active: boolean) {
  const cfg = React.useRef<Ivr | null>(null);
  const [position, setPosition] = React.useState<number | null>(null);
  const said = React.useRef(0);
  const ctx = React.useRef<AudioContext | null>(null);
  const tune = React.useRef<number | null>(null);
  const player = React.useRef<HTMLAudioElement | null>(null);
  const stopAll = React.useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    if (tune.current) window.clearInterval(tune.current);
    tune.current = null;
    player.current?.pause();
    player.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    said.current = 0;
  }, []);
  // Soft hold music: a slow chord pattern from the browser, no file needed.
  const music = React.useCallback(() => {
    if (tune.current || !cfg.current?.music) return;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ac = (ctx.current ??= new C());
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    const play = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = notes[i++ % notes.length]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 1);
    };
    play();
    tune.current = window.setInterval(play, 1000);
  }, []);
  const speak = React.useCallback(
    (pos: number | null) => {
      const c = cfg.current;
      if (!c?.on) return;
      said.current = Date.now();
      if (tune.current) window.clearInterval(tune.current);
      tune.current = null;
      if (c.audio) {
        const a = (player.current ??= new Audio(c.audio));
        a.currentTime = 0;
        a.onended = () => music();
        void a.play().catch(() => music());
        return;
      }
      const synth = window.speechSynthesis;
      if (!synth) return music();
      const text = `${c.message}${c.position && pos && pos > 1 ? ` You are number ${pos} in line.` : ""}`;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = c.lang;
      u.rate = 0.95;
      u.onend = () => music();
      u.onerror = () => music();
      synth.cancel();
      synth.speak(u);
    },
    [music],
  );
  React.useEffect(() => {
    if (!active) stopAll();
    return () => stopAll();
  }, [active, stopAll]);
  const update = (ivr: Ivr | null, pos: number | null) => {
    cfg.current = ivr;
    setPosition(pos);
    if (!ivr?.on || !active) return;
    if (!said.current || Date.now() - said.current > ivr.repeatSec * 1000) speak(pos);
  };
  return { update, position };
}

// Calling an agent: the browser asks for the microphone, the call rings in the desk, and the agent answers there.
function CallButton({ api, s, ticketId, color, onTicket }: { api: Api; s: Session; ticketId: string | null; color: string; onTicket: (id: string) => void }) {
  const [state, setState] = React.useState<"idle" | "consent" | "ringing" | "live" | "ended">("idle");
  const [agree, setAgree] = React.useState(false);
  const [info, setInfo] = React.useState<string | null>(null);
  const [secs, setSecs] = React.useState(0);
  const ref = React.useRef<{ pc?: RTCPeerConnection; mic?: MediaStream; poll?: number; timer?: number; callId?: string }>({});
  const audio = React.useRef<HTMLAudioElement>(null);
  const waiting = useWaitingMessage(state === "ringing");
  const stop = React.useCallback(
    async (tell: boolean) => {
      const p = ref.current;
      if (p.poll) window.clearInterval(p.poll);
      if (p.timer) window.clearInterval(p.timer);
      p.mic?.getTracks().forEach((t) => t.stop());
      p.pc?.close();
      if (tell && p.callId) await api(`calls/${p.callId}/end`, {}).catch(() => {});
      setState("ended");
    },
    [api],
  );
  React.useEffect(() => () => void stop(false), [stop]);
  const start = async () => {
    setInfo(null);
    try {
      const ice = await api<{ iceServers: RTCIceServer[] }>("ice");
      const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      Object.assign(ref.current, { pc, mic });
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));
      pc.ontrack = (e) => audio.current && (audio.current.srcObject = e.streams[0] ?? null);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      setState("ringing");
      const r = await api<{ callId: string; ticketId: string }>("calls", { ticketId, offer: JSON.stringify(pc.localDescription), consent: s.recordCalls ? agree : true });
      ref.current.callId = r.callId;
      if (!ticketId) onTicket(r.ticketId);
      ref.current.poll = window.setInterval(async () => {
        const k = await api<{ status: string; answer: string | null; agent: string | null; position?: number; ivr?: Ivr | null }>(`calls/${r.callId}`).catch(() => null);
        if (!k) return;
        if (k.status === "ringing") waiting.update(k.ivr ?? null, k.position ?? null);
        if (k.status === "answered" && k.answer && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(JSON.parse(k.answer) as RTCSessionDescriptionInit);
          setInfo(k.agent ? `You are talking with ${k.agent}` : null);
          setState("live");
          ref.current.timer = window.setInterval(() => setSecs((x) => x + 1), 1000);
        }
        if (["ended", "missed", "declined"].includes(k.status)) {
          setInfo(k.status === "missed" ? "Nobody could answer. We will write to you here." : "The call has ended.");
          await stop(false);
        }
      }, 1500);
    } catch (e) {
      setInfo(e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message) ? "Allow the microphone to call us." : e instanceof Error ? e.message : "The call could not start.");
      await stop(false);
    }
  };
  if (state === "idle")
    return (
      <Button variant="outline" className="w-full" onClick={() => (s.recordCalls ? setState("consent") : void start())} data-call-us>
        <PhoneIcon /> Call us
      </Button>
    );
  if (state === "consent")
    return (
      <div className="space-y-2 rounded-lg border p-2 text-xs" data-call-consent>
        <p>{s.recordingNotice}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree
        </label>
        <div className="flex gap-2">
          <Button size="sm" className="text-white" style={{ background: color }} disabled={!agree} onClick={() => void start()}>
            <PhoneIcon /> Call
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2 text-sm" data-call-state={state}>
      <audio ref={audio} autoPlay />
      <span className="flex-1">{state === "ringing" ? (waiting.position && waiting.position > 1 ? `Calling… you are number ${waiting.position} in line` : "Calling… please hold") : state === "live" ? `${info ?? "Connected"} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : (info ?? "Call ended")}</span>
      {state === "ended" ? (
        <Button size="sm" variant="ghost" onClick={() => (setState("idle"), setSecs(0))}>
          OK
        </Button>
      ) : (
        <Button size="sm" variant="destructive" onClick={() => void stop(true)}>
          <PhoneOffIcon /> End
        </Button>
      )}
    </div>
  );
}
