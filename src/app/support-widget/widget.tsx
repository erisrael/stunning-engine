"use client";

// The customer's support panel: conversations, a new question, replies (checked every few seconds), rating the help,
// and calling an agent from the browser (after agreeing to the recording when calls are recorded).
import * as React from "react";
import { ArrowLeftIcon, BookOpenIcon, ExternalLinkIcon, FileIcon, ImageIcon, LinkIcon, Loader2Icon, MessageCircleIcon, PhoneIcon, PlusIcon, SendIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LiveThread, words, type Lang } from "./live-thread";
import { CallButton, CallLayer } from "./calls";
import { ArticleBody, type PublicArticle } from "@/components/help/article-body";

type User = { id: string | null; name: string | null; email: string | null; phone: string | null; hash: string | null; meta?: Record<string, string> };
export type Session = { token: string; customer: { id: string; name: string }; app: { name: string; greeting: string | null; color: string | null }; online: boolean; hours: string; awayMessage: string; recordCalls: boolean; recordingNotice: string; channels?: { web_chat: boolean; telegram: boolean; calls: boolean; sms: boolean }; callEngine?: { engine: "browser" | "phone"; phone: string | null }; content?: WidgetContent };
type Pair = { en: string; am: string };
// The words from Customer support, Content (Update 1.2): welcome, conversation topics, policy and privacy notice.
type WidgetContent = { welcome: Pair; topics: ({ key: string } & Pair)[]; policy: Pair; terms: Pair };
type Update = { id: string; ticket_id: string; number: number; subject: string; body: string; author_kind: string; created_at: string };
type Ticket = { id: string; number: number; subject: string; status: string; updated_at: string; rating: number | null };
type CallRecord = { id: string; ticket_id: string | null; direction: string; kind: string; status: string; started_at: string; ended_at: string | null; duration_s: number | null; recording_id: string | null };

const STATUS: Record<string, string> = { new: "Sent", open: "Being answered", pending: "Waiting for you", on_hold: "On hold", solved: "Solved", closed: "Closed" };

// Telegram's Mini App data: the signed initData (from the page address, or Telegram's script when it is there).
type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void; colorScheme?: string; themeParams?: Record<string, string | undefined> };
// Inside Telegram the app takes Telegram's own colours (light or dark, the person's theme).
function applyTelegramTheme() {
  const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  const t = tg?.themeParams;
  if (!t) return;
  const root = document.documentElement;
  const set = (v: string, c?: string) => c && /^#[0-9a-f]{3,8}$/i.test(c) && root.style.setProperty(v, c);
  set("--background", t.bg_color);
  set("--card", t.secondary_bg_color ?? t.bg_color);
  set("--foreground", t.text_color);
  set("--card-foreground", t.text_color);
  set("--muted-foreground", t.hint_color);
  set("--primary", t.button_color);
  set("--primary-foreground", t.button_text_color);
  if (tg?.colorScheme === "dark") root.classList.add("dark");
}
function telegramInitData(bot: string) {
  const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  if (tg?.initData) return tg.initData;
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
  if (fromHash) return fromHash;
  try {
    return sessionStorage.getItem(`myseed-tg-init:${bot}`) ?? "";
  } catch {
    return "";
  }
}

export function SupportWidget({ appKey: givenKey, initialUser, waitForParent, telegram = null, startCall = false }: { appKey: string; initialUser: User | null; waitForParent: boolean; telegram?: string | null; startCall?: boolean }) {
  // Inside Telegram the key comes with the sign-in.
  const [appKey, setAppKey] = React.useState(givenKey);
  const [user, setUser] = React.useState<User | null>(initialUser);
  const [s, setS] = React.useState<Session | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [calls, setCalls] = React.useState<CallRecord[]>([]);
  const [open, setOpen] = React.useState<string | "new" | null>(null);
  const [tab, setTab] = React.useState<"home" | "chats" | "calls" | "help">("home");
  const [topic, setTopic] = React.useState<string | null>(null);
  const [updates, setUpdates] = React.useState<Update[]>([]);
  React.useEffect(() => {
    if (!telegram) return;
    applyTelegramTheme();
    const t = window.setTimeout(applyTelegramTheme, 1200);
    return () => window.clearTimeout(t);
  }, [telegram]);
  React.useEffect(() => {
    if (s?.token) void api<Update[]>("updates").then((u) => Array.isArray(u) && setUpdates(u)).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.token]);
  // English or Amharic, remembered on this browser.
  const [lang, setLangState] = React.useState<Lang>(() => {
    try {
      return localStorage.getItem("myseed-support-lang") === "am" ? "am" : "en";
    } catch {
      return "en";
    }
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("myseed-support-lang", l);
    } catch {}
  };
  const am = lang === "am";
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

  // Inside Telegram: sign in with Telegram's signed data (kept for this visit, as Telegram may clear the address).
  React.useEffect(() => {
    if (!telegram) return;
    let stop = false;
    const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    // Telegram's script may load after this: tell it again once it is there.
    const later = window.setTimeout(() => {
      const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      w?.ready?.();
      w?.expand?.();
    }, 800);
    (async () => {
      const initData = telegramInitData(telegram);
      if (!initData) return setError(am ? "ይህን ከቴሌግራም ቦቱ ይክፈቱ።" : "Open this from the Telegram bot.");
      try {
        sessionStorage.setItem(`myseed-tg-init:${telegram}`, initData);
      } catch {}
      try {
        const r = await fetch("/api/support/telegram/webapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, bot: telegram }) });
        const j = (await r.json().catch(() => ({}))) as { key?: string; session?: Session; error?: string };
        if (!r.ok || !j.key || !j.session) throw new Error(j.error ?? "Support is not available.");
        if (stop) return;
        setAppKey(j.key);
        setS(j.session);
        const list = await fetch("/api/support/v1/tickets", { headers: { "X-App-Key": j.key, Authorization: `Bearer ${j.session.token}` } }).then((x) => x.json());
        if (!stop && Array.isArray(list)) setTickets(list);
        const history = await fetch("/api/support/v1/calls/history", { headers: { "X-App-Key": j.key, Authorization: `Bearer ${j.session.token}` } }).then((x) => x.json());
        if (!stop && Array.isArray(history)) setCalls(history);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Support is not available.");
      }
    })();
    return () => {
      stop = true;
      window.clearTimeout(later);
    };
    // Once, when opened in Telegram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegram]);

  React.useEffect(() => {
    if (telegram) return;
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
        const [list, history] = await Promise.all([
          api<Ticket[]>("tickets", undefined, session.token),
          api<CallRecord[]>("calls/history", undefined, session.token),
        ]);
        if (!stop) {
          setTickets(list);
          setCalls(history);
        }
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

  const reload = async () => {
    if (!s) return;
    const [nextTickets, nextCalls, nextUpdates] = await Promise.all([api<Ticket[]>("tickets"), api<CallRecord[]>("calls/history"), api<Update[]>("updates").catch(() => [] as Update[])]);
    setTickets(nextTickets);
    setCalls(nextCalls);
    setUpdates(nextUpdates);
  };
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
          <p className="flex-1 font-semibold">{s.app.name} {am ? "ድጋፍ" : "support"}</p>
          <button type="button" className="rounded border border-white/40 px-1.5 py-0.5 text-xs" onClick={() => setLang(am ? "en" : "am")} aria-label={am ? "English" : "Amharic"} data-lang-toggle>
            {am ? "EN" : "አማ"}
          </button>
        </div>
        <p className="text-xs opacity-90">{s.online ? (am ? "መስመር ላይ ነን" : "We are online") : `${am ? "በተለምዶ" : "Usually"}: ${s.hours}`}</p>
      </header>
      {!open && (
        <nav className="grid grid-cols-4 border-b bg-card" aria-label="Support sections">
          {([
            ["home", am ? "መነሻ" : "Home"],
            ["chats", am ? "ውይይቶች" : "Chats"],
            ["calls", am ? "ጥሪዎች" : "Calls"],
            ["help", am ? "እርዳታ" : "Help"],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" className={cn("border-b-2 px-2 py-2 text-xs", tab === key ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground")} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      <CallLayer api={api} s={s}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open === null && tab === "home" && (
          <div className="space-y-3 p-4">
            <p className="text-sm">{s.app.greeting ?? (s.content ? (am ? s.content.welcome.am : s.content.welcome.en) : null) ?? `Hi ${s.customer.name.split(" ")[0]}! How can we help?`}</p>
            {!!s.content?.topics.length && (
              <div className="grid grid-cols-2 gap-1.5" aria-label={am ? "ርዕሶች" : "Topics"}>
                {s.content.topics.map((t) => (
                  <button key={t.key} type="button" className="rounded-lg border bg-card px-2 py-2 text-left text-xs hover:bg-muted" onClick={() => { setTopic(t.key); setTab("chats"); setOpen("new"); }} data-topic={t.key}>
                    {am ? t.am : t.en}
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full text-white" style={{ background: color }} onClick={() => { setTopic(null); setTab("chats"); setOpen("new"); }} data-new-question>
              <PlusIcon /> {am ? "ጥያቄ ይጠይቁ" : "Ask a question"}
            </Button>
            {startCall && (
              <p className="flex items-center gap-2 rounded-lg border border-dashed p-2 text-sm" data-call-prompt>
                <PhoneIcon className="size-4 shrink-0" style={{ color }} /> {am ? "ከድጋፍ ቡድናችን ጋር ለመነጋገር ከታች ይደውሉ።" : "Call our support team below. You talk in this app."}
              </p>
            )}
            <CallButton api={api} s={s} ticketId={null} color={color} onTicket={(id) => (setOpen(id), void reload())} />
            <HelpSearch api={api} onOpen={(id) => { setTab("help"); setOpen(`a:${id}`); }} />
            {telegram && <Resources api={api} am={am} />}
            {updates.length > 0 && (
              <section className="space-y-1 pt-2" aria-label={am ? "ማሳወቂያዎች" : "Updates"} data-updates>
                <p className="text-xs font-medium text-muted-foreground">{am ? "ማሳወቂያዎች" : "Updates"}</p>
                {updates.slice(0, 5).map((u) => (
                  <button key={u.id} type="button" className="block w-full rounded-lg border p-2 text-left text-xs hover:bg-muted" onClick={() => setOpen(u.ticket_id)}>
                    <span className="block text-muted-foreground">#{u.number} · {new Date(u.created_at).toLocaleString(am ? "am-ET" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="line-clamp-2">{u.body}</span>
                  </button>
                ))}
              </section>
            )}
            {tickets.length > 0 && <p className="pt-2 text-xs font-medium text-muted-foreground">{am ? "ውይይቶችዎ" : "Your conversations"}</p>}
            <ul className="space-y-1">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" className="w-full rounded-lg border p-2 text-left text-sm hover:bg-muted" onClick={() => setOpen(t.id)} data-conversation-item>
                    <span className="block truncate font-medium">{t.subject}</span>
                    <span className="text-xs text-muted-foreground">
                      #{t.number} · {words(lang).status[t.status] ?? STATUS[t.status] ?? t.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open === null && tab === "chats" && (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div><p className="font-semibold">{am ? "ውይይቶችዎ" : "Your conversations"}</p><p className="text-xs text-muted-foreground">{am ? "ሙሉ ታሪክዎ እዚህ ይቀመጣል" : "Your full conversation history is kept here."}</p></div>
              <Button size="sm" onClick={() => setOpen("new")}><PlusIcon /> New</Button>
            </div>
            {(["open", "previous"] as const).map((part) => {
              const list = tickets.filter((t) => (part === "open") !== ["solved", "closed"].includes(t.status));
              if (!list.length) return null;
              return (
                <section key={part} className="space-y-2" data-requests={part}>
                  <p className="text-xs font-medium text-muted-foreground">{part === "open" ? (am ? "ክፍት ጥያቄዎች" : "Open requests") : am ? "ያለፉ ውይይቶች" : "Previous conversations"}</p>
                  <ul className="space-y-2">
                    {list.map((t) => <li key={t.id}><button type="button" className="w-full rounded-xl border p-3 text-left hover:bg-muted" onClick={() => setOpen(t.id)} data-conversation-item><span className="flex items-center gap-2"><MessageCircleIcon className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span><span className="text-xs text-muted-foreground">#{t.number}</span></span><span className="mt-1 block text-xs text-muted-foreground">{words(lang).status[t.status] ?? STATUS[t.status] ?? t.status} · {new Date(t.updated_at).toLocaleDateString()}</span></button></li>)}
                  </ul>
                </section>
              );
            })}
            {!tickets.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{am ? "እስካሁን ውይይት የለም።" : "No conversations yet."}</p>}
          </div>
        )}
        {open === null && tab === "calls" && (
          <div className="space-y-3 p-4">
            <div><p className="font-semibold">{am ? "የጥሪ መዝገብ" : "Call records"}</p><p className="text-xs text-muted-foreground">Completed, missed, and requested calls.</p></div>
            <ul className="space-y-2">
              {calls.map((c) => <li key={c.id} className="flex items-center gap-3 rounded-xl border p-3"><PhoneIcon className={cn("size-4", c.status === "missed" ? "text-destructive" : "text-primary")} /><span className="min-w-0 flex-1"><span className="block font-medium">{c.direction === "inbound" ? "Incoming" : "Outgoing"} {c.kind === "web" ? "app call" : "phone call"}</span><span className="text-xs text-muted-foreground">{new Date(c.started_at).toLocaleString()} · {c.status}{c.duration_s ? ` · ${Math.round(c.duration_s / 60)} min` : ""}</span></span></li>)}
              {!calls.length && <li className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No call records yet.</li>}
            </ul>
          </div>
        )}
        {open === null && tab === "help" && (
          <div className="space-y-4 p-4">
            <HelpSearch api={api} onOpen={(id) => setOpen(`a:${id}`)} />
            {s.content && (
              <details className="rounded-lg border p-2 text-xs">
                <summary className="cursor-pointer font-medium">{am ? "የድጋፍ መመሪያ እና ግላዊነት" : "Support policy and privacy"}</summary>
                <p className="mt-2 whitespace-pre-wrap">{am ? s.content.policy.am : s.content.policy.en}</p>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{am ? s.content.terms.am : s.content.terms.en}</p>
              </details>
            )}
          </div>
        )}
        {open === "new" && <NewQuestion api={api} color={color} topic={s.content?.topics.find((t) => t.key === topic) ?? null} am={am} onDone={(id) => (setTopic(null), setOpen(id), void reload())} onArticle={(id) => setOpen(`a:${id}`)} />}
        {open?.startsWith("a:") && <ArticleView api={api} id={open.slice(2)} onAsk={() => setOpen("new")} />}
        {open && open !== "new" && !open.startsWith("a:") && (
          <LiveThread key={open} api={api} appKey={appKey} token={s.token} id={open} color={color} lang={lang} online={s.online} callButton={(reload) => <CallButton api={api} s={s} ticketId={open} color={color} onTicket={reload} />} />
        )}
      </div>
      </CallLayer>
    </div>
  );
}

export type Api = <T>(path: string, body?: unknown) => Promise<T>;

type Resource = { id: string; title: string; kind: string; caption: string | null; fileName: string | null; size: number; url: string | null };
const RES_ICON: Record<string, React.ComponentType<{ className?: string }>> = { video: VideoIcon, image: ImageIcon, pdf: FileIcon, document: FileIcon, link: LinkIcon };

// The bot's resources (videos, PDFs, links the team added in Bot manager), opened here in the support app.
function Resources({ api, am }: { api: Api; am: boolean }) {
  const [list, setList] = React.useState<Resource[] | null>(null);
  React.useEffect(() => void api<Resource[]>("resources").then(setList).catch(() => setList([])), [api]);
  if (!list?.length) return null;
  return (
    <div className="space-y-1.5 pt-2" data-resources>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpenIcon className="size-3.5" /> {am ? "መረጃዎች" : "Resources"}
      </p>
      {list.map((r) => {
        const Icon = RES_ICON[r.kind] ?? FileIcon;
        return (
          <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted" data-resource={r.title}>
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.title}</span>
              {r.caption && <span className="block truncate text-xs text-muted-foreground">{r.caption}</span>}
            </span>
            <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

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
  const [a, setA] = React.useState<PublicArticle | null>(null);
  const [voted, setVoted] = React.useState<boolean | null>(null);
  React.useEffect(() => void api<PublicArticle>(`articles/${id}`).then(setA).catch(() => null), [api, id]);
  if (!a) return <Loader2Icon className="m-6 size-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-3 p-4 text-sm" data-help-article>
      {a.category && <p className="text-xs text-muted-foreground">{a.category}</p>}
      <p className="text-base font-semibold">{a.title}</p>
      <ArticleBody a={a} compact />
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

function NewQuestion({ api, color, topic, am, onDone, onArticle }: { api: Api; color: string; topic: ({ key: string } & Pair) | null; am: boolean; onDone: (id: string) => void; onArticle: (id: string) => void }) {
  const [f, setF] = React.useState({ subject: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const suggested = useArticles(api, `${f.subject} ${f.message}`);
  return (
    <div className="space-y-2 p-4">
      {topic && <p className="text-xs font-medium text-muted-foreground" data-chosen-topic>{am ? topic.am : topic.en}</p>}
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
            const r = await api<{ id: string }>("tickets", { ...f, topic: topic?.key ?? null });
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
