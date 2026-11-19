"use client";

// The customer's support app: the web widget (the SDK's frame), the mobile apps' web view, and the Telegram Mini App
// (Update 1.2, spec 15). Pages: Home, Start a conversation, a conversation, Conversations (active and history),
// Requests and their details, Calls (calling, an incoming call, the call, call history), FAQ, Notifications, Profile,
// Language and Support information. Inside Telegram the header's Back button and the Main button are Telegram's own,
// presses give haptic feedback, the theme follows Telegram's, and deep links (startapp=, or ?page=) open a page.
import * as React from "react";
import {
  ArrowLeftIcon,
  BellIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  FileIcon,
  HomeIcon,
  ImageIcon,
  InfoIcon,
  LanguagesIcon,
  LinkIcon,
  Loader2Icon,
  MenuIcon,
  MessageCircleIcon,
  MessageCircleQuestionIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOutgoingIcon,
  PaletteIcon,
  PlusIcon,
  SendIcon,
  UserIcon,
  VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LiveThread, words, type Lang } from "./live-thread";
import { CallButton, CallLayer } from "./calls";
import { ArticleBody, type PublicArticle } from "@/components/help/article-body";
import { haptic, startParam, tgWebApp, useBackButton, useMainButton, useTelegram, type TgWebApp } from "./tg";
import { AppearancePage, Group, LOOK_WORDS, Row, Tile, useLook } from "./look";

type User = { id: string | null; name: string | null; email: string | null; phone: string | null; hash: string | null; meta?: Record<string, string> };
export type Session = { token: string; customer: { id: string; name: string; email?: string | null; phone?: string | null; telegram?: boolean }; app: { name: string; greeting: string | null; color: string | null }; online: boolean; hours: string; awayMessage: string; recordCalls: boolean; recordingNotice: string; channels?: { web_chat: boolean; telegram: boolean; calls: boolean; sms: boolean }; callEngine?: { engine: "browser" | "phone"; phone: string | null }; content?: WidgetContent; schedule?: Schedule | null };
// Business hours from Support, Configuration (null when not set).
type Schedule = { days: Record<string, { open: string; close: string } | null>; holidays: { date: string; name: string }[]; status: { open: boolean; holiday: string | null; nextOpen: string | null }; closedMessage: string };
type Pair = { en: string; am: string };
// The words from Customer support, Content (Update 1.2): welcome, conversation topics, policy and privacy notice.
type WidgetContent = { welcome: Pair; topics: ({ key: string } & Pair)[]; policy: Pair; terms: Pair };
type Update = { id: string; ticket_id: string; number: number; subject: string; body: string; author_kind: string; created_at: string };
type Ticket = { id: string; number: number; subject: string; status: string; updated_at: string; rating: number | null };
type CallRecord = { id: string; ticket_id: string | null; direction: string; kind: string; status: string; started_at: string; ended_at: string | null; duration_s: number | null; recording_id: string | null };
type Plain = { key: string; en: string; am: string; open?: boolean };
type RequestRow = { id: string; reference: string; title: string; type: Plain; status: Plain; createdAt: string; updatedAt: string; conversation: { id: string; number: number | null } | null };
type RequestDetail = RequestRow & { resolution: string | null; resolvedAt: string | null; steps: { status: Plain; at: string }[] };
type Profile = { name: string; email: string | null; phone: string | null; source: "telegram" | "visitor" | "app"; canRename: boolean; lang: Lang | null; since: string; counts: { conversations: number; open: number; calls: number; requests: number } };

const STATUS: Record<string, string> = { new: "Sent", open: "Being answered", pending: "Waiting for you", on_hold: "On hold", solved: "Solved", closed: "Closed" };
const CLOSED = ["solved", "closed"];

// The app's own words, in English and Amharic.
const W = {
  en: {
    home: "Home", chats: "Chats", requests: "Requests", calls: "Calls", more: "More", support: "support", back: "Back",
    online: "We are online", usually: "Usually", ask: "Ask a question", newConv: "New conversation", conversations: "Your conversations", recent: "Recent conversations", seeAll: "See all",
    active: "Active", history: "History", noConv: "No conversations yet.", kept: "Your full conversation history is kept here.",
    reqIntro: "When our team needs another department to act for you (a refund, an account fix), it opens a request. You can follow it here.", noReq: "No requests yet.", openReq: "Open", doneReq: "Finished",
    reqConv: "Open the conversation", reqSteps: "Progress", reqResolution: "Outcome", reqType: "Type", reqOpened: "Opened",
    callTitle: "Call support", callIntro: "Talk to our team in this app. You need a microphone.", callHistory: "Call history", noCalls: "No calls yet.",
    incoming: "Incoming", outgoing: "Outgoing", missed: "Missed", completed: "Completed", requested: "Call-back requested", cancelled: "Cancelled",
    faq: "FAQ", faqIntro: "Answers to the questions we are asked most.", noFaq: "No answers have been published yet.", notifications: "Notifications", noNotes: "Nothing new.", profile: "Profile", language: "Language", info: "Support information",
    name: "Name", email: "Email", phone: "Phone", save: "Save", saved: "Saved", since: "With us since", fromApp: "From your account in the app", fromTg: "From Telegram", sharePhone: "Share", phoneHint: "So we can call you back",
    hours: "Opening hours", status: "Right now", away: "When we are away", channels: "Ways to reach us", policy: "Support policy", privacy: "Privacy", recording: "Call recording",
    chat: "Chat", telegram: "Telegram", phoneCalls: "Calls", sms: "SMS", english: "English", amharic: "Amharic (አማርኛ)", langIntro: "The app and the Telegram bot use this language.",
    topics: "Topics", updates: "Updates", resources: "Resources", searchHelp: "Search help articles", send: "Send",
    closedNow: "We are closed now", opensAt: "We open", holidays: "Coming holidays", closed: "Closed", week: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  am: {
    home: "መነሻ", chats: "ውይይቶች", requests: "ጥያቄዎች", calls: "ጥሪዎች", more: "ተጨማሪ", support: "ድጋፍ", back: "ተመለስ",
    online: "መስመር ላይ ነን", usually: "በተለምዶ", ask: "ጥያቄ ይጠይቁ", newConv: "አዲስ ውይይት", conversations: "ውይይቶችዎ", recent: "የቅርብ ውይይቶች", seeAll: "ሁሉንም ይዩ",
    active: "ክፍት", history: "ታሪክ", noConv: "እስካሁን ውይይት የለም።", kept: "ሙሉ ታሪክዎ እዚህ ይቀመጣል።",
    reqIntro: "ቡድናችን ሌላ ክፍል እንዲሠራልዎ ሲያስፈልግ (ተመላሽ ክፍያ፣ የመለያ ማስተካከያ) ጥያቄ ይከፍታል። እዚህ ይከታተሉት።", noReq: "እስካሁን ጥያቄ የለም።", openReq: "ክፍት", doneReq: "ያለቁ",
    reqConv: "ውይይቱን ይክፈቱ", reqSteps: "ሂደት", reqResolution: "ውጤት", reqType: "ዓይነት", reqOpened: "የተከፈተው",
    callTitle: "ወደ ድጋፍ ይደውሉ", callIntro: "በዚህ መተግበሪያ ውስጥ ከቡድናችን ጋር ይነጋገሩ። ማይክሮፎን ያስፈልጋል።", callHistory: "የጥሪ ታሪክ", noCalls: "እስካሁን ጥሪ የለም።",
    incoming: "ገቢ", outgoing: "ወጪ", missed: "ያመለጠ", completed: "የተጠናቀቀ", requested: "እንዲደወልልዎ የተጠየቀ", cancelled: "የተሰረዘ",
    faq: "ተደጋግመው የሚጠየቁ", faqIntro: "በብዛት ለሚጠየቁ ጥያቄዎች መልሶች።", noFaq: "እስካሁን መልስ አልታተመም።", notifications: "ማሳወቂያዎች", noNotes: "አዲስ ነገር የለም።", profile: "መገለጫ", language: "ቋንቋ", info: "የድጋፍ መረጃ",
    name: "ስም", email: "ኢሜይል", phone: "ስልክ", save: "አስቀምጥ", saved: "ተቀምጧል", since: "ከእኛ ጋር ከ", fromApp: "በመተግበሪያው መለያዎ", fromTg: "ከቴሌግራም", sharePhone: "አጋራ", phoneHint: "መልሰን እንድንደውልልዎ",
    hours: "የሥራ ሰዓት", status: "አሁን", away: "በሌለንበት ጊዜ", channels: "የምናገኝባቸው መንገዶች", policy: "የድጋፍ መመሪያ", privacy: "ግላዊነት", recording: "የጥሪ ቀረጻ",
    chat: "ውይይት", telegram: "ቴሌግራም", phoneCalls: "ጥሪዎች", sms: "ኤስኤምኤስ", english: "English", amharic: "አማርኛ", langIntro: "መተግበሪያውና የቴሌግራም ቦቱ ይህን ቋንቋ ይጠቀማሉ።",
    topics: "ርዕሶች", updates: "ማሳወቂያዎች", resources: "መረጃዎች", searchHelp: "የእርዳታ ጽሑፎችን ይፈልጉ", send: "ላክ",
    closedNow: "አሁን ዝግ ነን", opensAt: "የምንከፈተው", holidays: "የሚመጡ በዓላት", closed: "ዝግ", week: ["ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ", "እሑድ"],
  },
};

const TABS = ["home", "chats", "requests", "calls", "more"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = { home: HomeIcon, chats: MessageCircleIcon, requests: ClipboardListIcon, calls: PhoneIcon, more: MenuIcon };
// The pages a deep link may name (startapp=<page>, or t_<conversation>, r_<request>, a_<article>).
const NAMED = ["home", "chats", "requests", "calls", "more", "new", "faq", "notifications", "profile", "language", "info", "appearance"];
function deepPage(p: string | null | undefined): string | null {
  if (!p) return null;
  if (NAMED.includes(p)) return p;
  const m = /^([tra])_([A-Za-z0-9_-]{3,80})$/.exec(p);
  return m ? `${m[1]}:${m[2]}` : null;
}

function telegramInitData(bot: string) {
  const tg = tgWebApp();
  if (tg?.initData) return tg.initData;
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
  if (fromHash) return fromHash;
  try {
    return sessionStorage.getItem(`myseed-tg-init:${bot}`) ?? "";
  } catch {
    return "";
  }
}
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const when = (iso: string, am: boolean, withTime = true) => new Date(iso).toLocaleString(am ? "am-ET" : "en-GB", { day: "2-digit", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }) });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function SupportWidget({ appKey: givenKey, initialUser, waitForParent, telegram = null, startCall = false, incomingCall = false, page: linkPage = null, preset = null, onSignOut }: { appKey: string; initialUser: User | null; waitForParent: boolean; telegram?: string | null; startCall?: boolean; incomingCall?: boolean; page?: string | null; preset?: { key: string; session: Session } | null; onSignOut?: () => void }) {
  // Inside Telegram the key comes with the sign-in; on the web support app (/support-app) it comes signed in.
  const [appKey, setAppKey] = React.useState(preset?.key ?? givenKey);
  const [user, setUser] = React.useState<User | null>(initialUser);
  const [s, setS] = React.useState<Session | null>(preset?.session ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [calls, setCalls] = React.useState<CallRecord[]>([]);
  const [updates, setUpdates] = React.useState<Update[]>([]);
  const [topic, setTopic] = React.useState<string | null>(null);
  // Pages open over each other; the first is a tab (Home, Chats, Requests, Calls, More).
  const [stack, setStack] = React.useState<string[]>(["home"]);
  const page = stack[stack.length - 1]!;
  const tab = (TABS as readonly string[]).includes(stack[0]!) ? (stack[0] as Tab) : "home";
  const [callBusy, setCallBusy] = React.useState(false);
  const tg = useTelegram(!!telegram);
  // The look the customer chose (theme, accent, text size, corners), on top of Telegram's or the phone's theme.
  const { look, setLook, hex } = useLook(s?.app.color ?? null, !!telegram);
  // English or Amharic, remembered on this browser (and, once chosen on the Language page, for the bot too).
  const [lang, setLangState] = React.useState<Lang>(() => (store.get("myseed-support-lang") === "am" ? "am" : "en"));
  const setLang = (l: Lang) => {
    setLangState(l);
    store.set("myseed-support-lang", l);
  };
  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const am = lang === "am";
  const w = W[lang];
  const api = React.useCallback(
    async <T,>(path: string, body?: unknown, token = s?.token): Promise<T> => {
      const r = await fetch(`/api/support/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-App-Key": appKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as T & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      return j;
    },
    [appKey, s?.token],
  );

  const go = React.useCallback((p: string) => {
    haptic("select");
    setStack((st) => ((TABS as readonly string[]).includes(p) ? [p] : st[st.length - 1] === p ? st : [...st, p]));
  }, []);
  const replace = (p: string) => setStack((st) => [...st.slice(0, -1), p]);

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

  const loadLists = async (key: string, token: string) => {
    const get = <T,>(p: string) => fetch(`/api/support/v1/${p}`, { headers: { "X-App-Key": key, Authorization: `Bearer ${token}` } }).then((x) => (x.ok ? (x.json() as Promise<T>) : null)).catch(() => null);
    const [list, history, ups] = await Promise.all([get<Ticket[]>("tickets"), get<CallRecord[]>("calls/history"), get<Update[]>("updates")]);
    if (Array.isArray(list)) setTickets(list);
    if (Array.isArray(history)) setCalls(history);
    if (Array.isArray(ups)) setUpdates(ups);
  };

  // Inside Telegram: sign in with Telegram's signed data (kept for this visit, as Telegram may clear the address).
  React.useEffect(() => {
    if (!telegram) return;
    let stop = false;
    const tgw = tgWebApp();
    tgw?.ready?.();
    tgw?.expand?.();
    // Telegram's script may load after this: tell it again once it is there.
    const later = window.setTimeout(() => {
      const x = tgWebApp();
      x?.ready?.();
      x?.expand?.();
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
        await loadLists(j.key, j.session.token);
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
    if (!preset) return;
    void loadLists(preset.key, preset.session.token);
    // Once, signed in by the page around it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (telegram || preset) return;
    if (!appKey) return setError("This support link is missing its app key.");
    if (!user && waitForParent) return;
    let stop = false;
    (async () => {
      try {
        // A visitor who is not signed in keeps one id on this browser, so their conversations stay.
        let id = user?.id ?? null;
        if (!id) {
          id = store.get("myseed-support-visitor") ?? `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
          store.set("myseed-support-visitor", id);
        }
        const session = await api<Session>("identify", { ...(user ?? {}), id }, "");
        if (stop) return;
        setS(session);
        await loadLists(appKey, session.token);
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

  // A deep link opens its page once signed in: ?page=, or Telegram's startapp parameter.
  const linked = React.useRef(false);
  React.useEffect(() => {
    if (!s || linked.current) return;
    const p = deepPage(linkPage) ?? deepPage(startParam());
    if (!p) return;
    linked.current = true;
    setStack(p === "home" || (TABS as readonly string[]).includes(p) ? [p] : [p.startsWith("t:") ? "chats" : p.startsWith("r:") ? "requests" : p.startsWith("a:") || ["faq", "notifications", "profile", "language", "info", "appearance"].includes(p) ? "more" : "home", p]);
  }, [s, linkPage, tg]);

  const reload = React.useCallback(async () => {
    if (s) await loadLists(appKey, s.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, appKey]);
  const back = () => {
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    void reload();
  };

  // Notifications not yet seen: support's messages since the Notifications page was last opened.
  const seenKey = s ? `myseed-support-seen:${s.customer.id}` : "";
  const [seenAt, setSeenAt] = React.useState<string>("");
  React.useEffect(() => setSeenAt((seenKey && store.get(seenKey)) || ""), [seenKey]);
  const unseen = updates.filter((u) => u.created_at > seenAt).length;
  React.useEffect(() => {
    if (page !== "notifications" || !seenKey || !updates.length) return;
    const latest = updates[0]!.created_at;
    store.set(seenKey, latest);
    setSeenAt(latest);
  }, [page, seenKey, updates]);

  // Telegram's Back button while a page is open over a tab; its Main button for the page's main action.
  useBackButton(tg, stack.length > 1, back);
  const color = hex;
  const mainText = callBusy ? null : page === "new" ? undefined : page === "home" || page === "chats" ? w.ask : null;
  useMainButton(tg, mainText, () => (setTopic(null), go("new")), { color });

  if (error) return <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!s)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  const own = !!tg; // Telegram shows its own Back and Main buttons
  const title = pageTitle(page, w, s.app.name, am);
  const openTickets = tickets.filter((t) => !CLOSED.includes(t.status));
  const doneTickets = tickets.filter((t) => CLOSED.includes(t.status));
  const ticketRow = (t: Ticket) => (
    <Row
      key={t.id}
      icon={MessageCircleIcon}
      tint={CLOSED.includes(t.status) ? "#8e8e93" : "var(--primary)"}
      label={t.subject}
      sub={<span suppressHydrationWarning>{`#${t.number} · ${words(lang).status[t.status] ?? STATUS[t.status] ?? t.status} · ${when(t.updated_at, am)}`}</span>}
      onClick={() => go(`t:${t.id}`)}
      data-conversation-item
      data-ticket={t.id}
    />
  );
  const askButton = !own && (
    <Button className="h-11 w-full rounded-[calc(var(--radius)+6px)] text-[15px]" onClick={() => (setTopic(null), go("new"))} data-new-question>
      <PlusIcon /> {w.ask}
    </Button>
  );
  const first = s.customer.name.split(" ")[0];
  // The built-in Telegram app is named after its channel; customers see the product's name.
  const brandName = s.app.name === "Telegram" ? "MySeed" : s.app.name;
  const lw = LOOK_WORDS[lang];
  const langButton = (
    <button type="button" className="rounded-full border px-2.5 py-1 text-xs font-medium" onClick={() => setLang(am ? "en" : "am")} aria-label={am ? "English" : "Amharic"} data-lang-toggle>
      {am ? "EN" : "አማ"}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground" data-widget data-page={page}>
      {page === "home" ? (
        <header className="px-4 pt-4 pb-2" data-header="home">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground" aria-hidden>
              {brandName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {brandName} {w.support}
              </p>
              <p className="truncate text-xl leading-tight font-bold">{am ? `ሰላም ${first}` : `Hi ${first}`}</p>
            </div>
            {langButton}
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs" data-online={s.online ? "yes" : "no"}>
            <span className={cn("size-2 rounded-full", s.online ? "bg-emerald-500" : "bg-amber-500")} />
            {s.online ? w.online : `${w.usually}: ${s.hours}`}
          </p>
        </header>
      ) : (
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/85 px-3 py-2.5 backdrop-blur" data-header="page">
          {stack.length > 1 && !own && (
            <button type="button" aria-label={w.back} className="-ml-1 rounded-full p-1.5 text-primary hover:bg-muted" onClick={back}>
              <ArrowLeftIcon className="size-5" />
            </button>
          )}
          <p className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title ?? `${s.app.name} ${w.support}`}</p>
          {langButton}
        </header>
      )}
      <CallLayer api={api} s={s} openedForCall={incomingCall} onBusy={setCallBusy}>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {page === "home" && (
            <div className="space-y-5 px-4 pt-2 pb-6" data-page-home>
              <p className="text-[15px] text-muted-foreground">{s.app.greeting ?? (s.content ? (am ? s.content.welcome.am : s.content.welcome.en) : null) ?? (am ? "በምን እንርዳዎ?" : "How can we help?")}</p>
              {s.schedule && !s.schedule.status.open && (
                <div className="rounded-[calc(var(--radius)+6px)] border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" data-closed-now>
                  <p className="font-medium">
                    {w.closedNow}
                    {s.schedule.status.holiday ? ` · ${s.schedule.status.holiday}` : ""}
                  </p>
                  <p>{s.schedule.closedMessage}</p>
                  {s.schedule.status.nextOpen && (
                    <p className="mt-1" suppressHydrationWarning>
                      {w.opensAt}: {new Date(s.schedule.status.nextOpen).toLocaleString(am ? "am-ET" : "en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" })}
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2" aria-label={am ? "ፈጣን እርምጃዎች" : "Quick actions"} data-quick-actions>
                <Tile icon={PlusIcon} label={w.ask} sub={am ? "በጽሑፍ" : "By message"} onClick={() => (setTopic(null), go("new"))} data-quick="new" />
                {s.channels?.calls !== false && <Tile icon={PhoneIcon} tint="#16a34a" label={w.callTitle} sub={s.online ? w.online : s.hours} onClick={() => go("calls")} data-quick="call" />}
                <Tile icon={MessageCircleIcon} tint="#2563eb" label={w.chats} sub={openTickets.length ? `${openTickets.length} ${w.active.toLowerCase()}` : w.history} onClick={() => go("chats")} data-quick="chats" />
                <Tile icon={BookOpenIcon} tint="#e8590c" label={w.faq} sub={am ? "መልሶች" : "Answers"} onClick={() => go("faq")} data-quick="faq" />
              </div>
              {!!s.content?.topics.length && (
                <section className="space-y-2" aria-label={w.topics}>
                  <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.topics}</p>
                  <div className="flex flex-wrap gap-2">
                    {s.content.topics.map((t) => (
                      <button key={t.key} type="button" className="rounded-full border bg-card px-3 py-1.5 text-sm shadow-xs transition active:scale-[0.97]" onClick={() => (setTopic(t.key), go("new"))} data-topic={t.key}>
                        {am ? t.am : t.en}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {startCall && (
                <p className="flex items-center gap-2 rounded-[calc(var(--radius)+6px)] border border-dashed p-3 text-sm" data-call-prompt>
                  <PhoneIcon className="size-4 shrink-0 text-primary" /> {am ? "ከድጋፍ ቡድናችን ጋር ለመነጋገር ከታች ይደውሉ።" : "Call our support team below. You talk in this app."}
                </p>
              )}
              <CallButton api={api} s={s} ticketId={null} color={color} lang={lang} onTicket={(id) => (go(`t:${id}`), void reload())} />
              <HelpSearch api={api} placeholder={w.searchHelp} onOpen={(id) => go(`a:${id}`)} />
              {updates.length > 0 && (
                <Group
                  title={
                    <span className="flex items-center justify-between">
                      {w.updates}
                      <button type="button" className="text-[11px] font-semibold text-primary normal-case" onClick={() => go("notifications")}>
                        {w.seeAll}
                      </button>
                    </span>
                  }
                  data-updates
                >
                  {updates.slice(0, 3).map((u) => (
                    <Row key={u.id} icon={BellIcon} tint="#f59e0b" label={u.body} sub={<span suppressHydrationWarning>{`#${u.number} · ${when(u.created_at, am)}`}</span>} onClick={() => go(`t:${u.ticket_id}`)} />
                  ))}
                </Group>
              )}
              {tickets.length > 0 && (
                <Group
                  title={
                    <span className="flex items-center justify-between">
                      {w.recent}
                      {tickets.length > 3 && (
                        <button type="button" className="text-[11px] font-semibold text-primary normal-case" onClick={() => go("chats")}>
                          {w.seeAll}
                        </button>
                      )}
                    </span>
                  }
                >
                  {tickets.slice(0, 3).map((t) => ticketRow(t))}
                </Group>
              )}
              {telegram && <Resources api={api} title={w.resources} />}
              {askButton}
            </div>
          )}

          {page === "chats" && (
            <div className="space-y-5 p-4" data-page-chats>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{w.kept}</p>
                {!own && (
                  <Button size="sm" className="rounded-full" onClick={() => (setTopic(null), go("new"))}>
                    <PlusIcon /> {w.newConv}
                  </Button>
                )}
              </div>
              {([["open", w.active, openTickets], ["previous", w.history, doneTickets]] as const).map(([part, label, list]) =>
                list.length ? (
                  <Group key={part} title={`${label} (${list.length})`} data-requests={part}>
                    {list.map((t) => ticketRow(t))}
                  </Group>
                ) : null,
              )}
              {!tickets.length && <Empty icon={MessageCircleIcon} text={w.noConv} />}
            </div>
          )}

          {page === "requests" && <RequestsPage api={api} am={am} w={w} onOpen={(id) => go(`r:${id}`)} />}
          {page.startsWith("r:") && <RequestPage api={api} id={page.slice(2)} am={am} w={w} onConversation={(id) => go(`t:${id}`)} />}

          {page === "calls" && (
            <div className="space-y-4 p-4" data-page-calls>
              <section className="space-y-3 rounded-[calc(var(--radius)+6px)] border bg-card p-4 shadow-xs" data-call-interface>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><PhoneIcon className="size-5" /></span>
                  <p className="text-[17px] font-semibold">{w.callTitle}</p>
                </div>
                <p className="text-xs text-muted-foreground">{s.callEngine?.engine === "phone" ? (s.online ? w.status : s.hours) : w.callIntro}</p>
                <CallButton api={api} s={s} ticketId={null} color={color} lang={lang} onTicket={(id) => (go(`t:${id}`), void reload())} />
              </section>
              <section className="space-y-2" data-call-history>
                <p className="text-xs font-medium text-muted-foreground">{w.callHistory}</p>
                <ul className="space-y-2">
                  {calls.map((c) => {
                    const missed = c.status === "missed" || c.status === "declined";
                    const Icon = missed ? PhoneMissedIcon : c.direction === "inbound" ? PhoneOutgoingIcon : PhoneIncomingIcon;
                    // Inbound to support = the customer called (outgoing for them).
                    const dir = c.direction === "inbound" ? w.outgoing : w.incoming;
                    const state = missed ? w.missed : c.status === "ended" || c.status === "completed" ? w.completed : c.status === "requested" || c.status === "callback" ? w.requested : c.status === "cancelled" ? w.cancelled : c.status;
                    return (
                      <li key={c.id}>
                        <button type="button" disabled={!c.ticket_id} className="flex w-full items-center gap-3 rounded-[calc(var(--radius)+6px)] border bg-card p-3 text-left shadow-xs enabled:active:bg-muted" onClick={() => c.ticket_id && go(`t:${c.ticket_id}`)} data-call-row={c.status}>
                          <Icon className={cn("size-4 shrink-0", missed ? "text-destructive" : "text-primary")} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{dir} · {state}</span>
                            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                              {when(c.started_at, am)}
                              {c.duration_s ? ` · ${mmss(c.duration_s)}` : ""}
                            </span>
                          </span>
                          {c.ticket_id && <ChevronRightIcon className="size-4 text-muted-foreground" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!calls.length && <Empty icon={PhoneIcon} text={w.noCalls} />}
              </section>
            </div>
          )}

          {page === "more" && (
            <nav className="space-y-5 p-4" aria-label={w.more} data-page-more>
              <Group>
                <Row icon={BellIcon} tint="#ef4444" label={w.notifications} badge={unseen} onClick={() => go("notifications")} data-more="notifications" />
                <Row icon={MessageCircleQuestionIcon} tint="#e8590c" label={w.faq} onClick={() => go("faq")} data-more="faq" />
              </Group>
              <Group>
                <Row icon={UserIcon} tint="#2563eb" label={w.profile} sub={s.customer.name} onClick={() => go("profile")} data-more="profile" />
                <Row icon={PaletteIcon} tint="#8b5cf6" label={lw.appearance} onClick={() => go("appearance")} data-more="appearance" />
                <Row icon={LanguagesIcon} tint="#0f8a8a" label={w.language} value={am ? "አማርኛ" : "English"} onClick={() => go("language")} data-more="language" />
              </Group>
              <Group>
                <Row icon={InfoIcon} tint="#64748b" label={w.info} onClick={() => go("info")} data-more="info" />
                {onSignOut && <Row icon={ArrowLeftIcon} tint="#ef4444" label={am ? "ውጣ" : "Sign out"} chevron={false} onClick={onSignOut} data-more="sign-out" />}
              </Group>
            </nav>
          )}
          {page === "appearance" && <AppearancePage look={look} setLook={setLook} am={am} brand={s.app.color} />}

          {page === "faq" && <FaqPage api={api} w={w} onOpen={(id) => go(`a:${id}`)} />}
          {page === "notifications" && (
            <div className="space-y-2 p-4" data-page-notifications>
              {updates.map((u) => (
                <button key={u.id} type="button" className={cn("block w-full rounded-[calc(var(--radius)+6px)] border bg-card p-3 text-left text-sm shadow-xs active:bg-muted", u.created_at > seenAt && "border-primary/50")} onClick={() => go(`t:${u.ticket_id}`)} data-notification>
                  <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                    #{u.number} {u.subject} · {when(u.created_at, am)}
                  </span>
                  <span className="line-clamp-3">{u.body}</span>
                </button>
              ))}
              {!updates.length && <Empty icon={BellIcon} text={w.noNotes} />}
            </div>
          )}
          {page === "profile" && <ProfilePage api={api} w={w} am={am} onLanguage={() => go("language")} />}
          {page === "language" && (
            <LanguagePage
              w={w}
              lang={lang}
              onPick={async (l) => {
                haptic("select");
                setLang(l);
                await api("profile", { lang: l }).catch(() => null);
              }}
            />
          )}
          {page === "info" && <InfoPage s={s} w={w} am={am} />}

          {page === "new" && <NewQuestion api={api} tg={tg} color={color} hideMain={callBusy} topic={s.content?.topics.find((t) => t.key === topic) ?? null} am={am} onDone={(id) => (haptic("success"), setTopic(null), replace(`t:${id}`), void reload())} onArticle={(id) => go(`a:${id}`)} />}
          {page.startsWith("a:") && <ArticleView api={api} id={page.slice(2)} onAsk={() => go("new")} />}
          {page.startsWith("t:") && (
            <LiveThread key={page} api={api} appKey={appKey} token={s.token} id={page.slice(2)} color={color} lang={lang} online={s.online} callButton={(rl) => <CallButton api={api} s={s} ticketId={page.slice(2)} color={color} lang={lang} onTicket={rl} />} />
          )}
        </main>
      </CallLayer>
      {stack.length === 1 && (
        <nav className="grid grid-cols-5 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Support sections">
          {TABS.map((key) => {
            const Icon = TAB_ICON[key];
            const on = tab === key;
            const badge = key === "more" ? unseen : key === "chats" ? openTickets.length : 0;
            return (
              <button key={key} type="button" aria-current={on ? "page" : undefined} className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", on ? "font-semibold text-primary" : "text-muted-foreground")} onClick={() => go(key)} data-tab={key}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-primary/12")}>
                  <Icon className="size-5" />
                </span>
                {w[key]}
                {badge > 0 && <span className="absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-[#D93025] px-1 text-center text-[10px] leading-4 font-semibold text-white">{badge > 9 ? "9+" : badge}</span>}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

type Words = (typeof W)["en"];
function pageTitle(page: string, w: Words, app: string, am = false): string | null {
  if (page === "home") return null;
  if (page === "appearance") return LOOK_WORDS[am ? "am" : "en"].appearance;
  if (page === "new") return w.newConv;
  if (page.startsWith("t:")) return w.conversations;
  if (page.startsWith("r:")) return w.requests;
  if (page.startsWith("a:")) return w.faq;
  const k = page as keyof Words;
  return typeof w[k] === "string" ? (w[k] as string) : app;
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[calc(var(--radius)+6px)] border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Icon className="size-5" />
      {text}
    </div>
  );
}
function Loading() {
  return <Loader2Icon className="m-6 mx-auto size-5 animate-spin text-muted-foreground" />;
}
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let stop = false;
    fn().then((d) => !stop && setData(d), (e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, setData };
}
const tone = (key: string) =>
  ({ received: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", review: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", info: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200", resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", declined: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" })[key] ?? "bg-muted text-muted-foreground";
function StatusPill({ p, am }: { p: Plain; am: boolean }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone(p.key))}>{am ? p.am : p.en}</span>;
}

function RequestsPage({ api, am, w, onOpen }: { api: Api; am: boolean; w: Words; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(() => api<RequestRow[]>("requests"), [api]);
  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!data) return <Loading />;
  const parts = [[w.openReq, data.filter((r) => r.status.open)], [w.doneReq, data.filter((r) => !r.status.open)]] as const;
  return (
    <div className="space-y-4 p-4" data-page-requests>
      <p className="text-xs text-muted-foreground">{w.reqIntro}</p>
      {parts.map(([label, list]) =>
        list.length ? (
          <section key={label} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{label} ({list.length})</p>
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" className="w-full rounded-xl border bg-card p-3 text-left hover:bg-muted" onClick={() => onOpen(r.id)} data-request-item={r.reference}>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                      <StatusPill p={r.status} am={am} />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground" suppressHydrationWarning>
                      {r.reference} · {am ? r.type.am : r.type.en} · {when(r.updatedAt, am)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {!data.length && <Empty icon={ClipboardListIcon} text={w.noReq} />}
    </div>
  );
}

function RequestPage({ api, id, am, w, onConversation }: { api: Api; id: string; am: boolean; w: Words; onConversation: (id: string) => void }) {
  const { data: r, error } = useLoad(() => api<RequestDetail>(`requests/${encodeURIComponent(id)}`), [api, id]);
  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!r) return <Loading />;
  return (
    <div className="space-y-4 p-4" data-request-detail={r.reference}>
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base font-semibold">{r.title}</p>
          <StatusPill p={r.status} am={am} />
        </div>
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          {r.reference} · {w.reqType}: {am ? r.type.am : r.type.en} · {w.reqOpened} {when(r.createdAt, am)}
        </p>
      </div>
      {r.resolution && (
        <section className="space-y-1 rounded-xl border bg-card p-3" data-request-resolution>
          <p className="text-xs font-medium text-muted-foreground">{w.reqResolution}</p>
          <p className="whitespace-pre-wrap text-sm">{r.resolution}</p>
        </section>
      )}
      <section className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{w.reqSteps}</p>
        <ol className="space-y-0 border-l pl-4">
          {r.steps.map((st, i) => (
            <li key={i} className="relative pb-3 text-sm last:pb-0" data-request-step={st.status.key}>
              <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background", i === r.steps.length - 1 ? "bg-primary" : "bg-muted-foreground/40")} />
              <span className="font-medium">{am ? st.status.am : st.status.en}</span>
              <span className="block text-xs text-muted-foreground" suppressHydrationWarning>{when(st.at, am)}</span>
            </li>
          ))}
        </ol>
      </section>
      {r.conversation && (
        <Button variant="outline" className="w-full" onClick={() => onConversation(r.conversation!.id)}>
          <MessageCircleIcon /> {w.reqConv} {r.conversation.number ? `#${r.conversation.number}` : ""}
        </Button>
      )}
    </div>
  );
}

function FaqPage({ api, w, onOpen }: { api: Api; w: Words; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(() => api<Found[]>(`faq?lang=${document.documentElement.lang === "am" ? "am" : "en"}`), [api]);
  return (
    <div className="space-y-3 p-4" data-page-faq>
      <p className="text-xs text-muted-foreground">{w.faqIntro}</p>
      <HelpSearch api={api} placeholder={w.searchHelp} onOpen={onOpen} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon={BookOpenIcon} text={w.noFaq} />}
      {[...new Set((data ?? []).map((a) => a.category ?? ""))].map((cat) => (
        <Group key={cat || "other"} title={cat || w.faq}>
          {(data ?? [])
            .filter((a) => (a.category ?? "") === cat)
            .map((a) => (
              <Row key={a.id} icon={MessageCircleQuestionIcon} label={a.title} sub={a.section ?? undefined} onClick={() => onOpen(a.id)} data-faq-item />
            ))}
        </Group>
      ))}
    </div>
  );
}

function ProfilePage({ api, w, am, onLanguage }: { api: Api; w: Words; am: boolean; onLanguage: () => void }) {
  const { data: p, error, setData } = useLoad(() => api<Profile>("profile"), [api]);
  const [name, setName] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!p) return <Loading />;
  const save = async (body: unknown, path = "profile") => {
    setMsg(null);
    try {
      const r = await api<Profile>(path, body);
      if (path === "profile") setData(r);
      else setData({ ...p, phone });
      haptic("success");
      setMsg(w.saved);
    } catch (e) {
      haptic("error");
      setMsg(e instanceof Error ? e.message : "Could not save.");
    }
  };
  return (
    <div className="space-y-4 p-4" data-page-profile>
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">{p.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {p.source === "telegram" ? w.fromTg : p.source === "app" ? w.fromApp : ""} {p.source !== "visitor" && "·"} {w.since} {when(p.since, am, false)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {([[w.chats, p.counts.conversations], [w.active, p.counts.open], [w.requests, p.counts.requests], [w.calls, p.counts.calls]] as const).map(([l, n]) => (
          <div key={l} className="rounded-xl border bg-card p-2">
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
            <dt className="truncate text-[10px] text-muted-foreground">{l}</dt>
          </div>
        ))}
      </dl>
      <section className="space-y-3 rounded-xl border bg-card p-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{w.name}</span>
          {p.canRename ? (
            <span className="flex gap-2">
              <Input aria-label={w.name} value={name ?? p.name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" disabled={!name || name === p.name} onClick={() => void save({ name })} data-profile-save-name>
                {w.save}
              </Button>
            </span>
          ) : (
            <span className="block">{p.name}</span>
          )}
        </label>
        {p.email && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{w.email}</span>
            <p>{p.email}</p>
          </div>
        )}
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            {w.phone} · {w.phoneHint}
          </span>
          <span className="flex gap-2">
            <Input aria-label={w.phone} type="tel" inputMode="tel" placeholder={p.phone ?? "+251 9…"} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button size="sm" disabled={phone.trim().length < 9} onClick={() => void save({ phone }, "phone")} data-profile-save-phone>
              {w.save}
            </Button>
          </span>
        </label>
        {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
      </section>
      <button type="button" className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-sm hover:bg-muted" onClick={onLanguage}>
        <LanguagesIcon className="size-4 text-primary" />
        <span className="flex-1">{w.language}</span>
        <span className="text-xs text-muted-foreground">{am ? "አማርኛ" : "English"}</span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function LanguagePage({ w, lang, onPick }: { w: Words; lang: Lang; onPick: (l: Lang) => void }) {
  return (
    <div className="space-y-3 p-4" data-page-language>
      <p className="text-xs text-muted-foreground">{w.langIntro}</p>
      <div role="radiogroup" aria-label={w.language} className="space-y-2">
        {([["en", W.en.english], ["am", W.am.amharic]] as const).map(([l, label]) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} className={cn("flex w-full items-center justify-between rounded-xl border bg-card px-3 py-3 text-left text-sm", lang === l && "border-primary ring-1 ring-primary")} onClick={() => onPick(l)} data-language={l}>
            {label}
            <span className={cn("size-4 rounded-full border-2", lang === l ? "border-primary bg-primary" : "border-muted-foreground/40")} />
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoPage({ s, w, am }: { s: Session; w: Words; am: boolean }) {
  const ch = s.channels;
  const ways = ch ? ([["web_chat", w.chat], ["telegram", w.telegram], ["calls", w.phoneCalls], ["sms", w.sms]] as const).filter(([k]) => ch[k]).map(([, l]) => l) : [];
  return (
    <div className="space-y-3 p-4 text-sm" data-page-info>
      <dl className="space-y-3 rounded-xl border bg-card p-3">
        <div>
          <dt className="text-xs text-muted-foreground">{w.status}</dt>
          <dd className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", s.online ? "bg-emerald-500" : "bg-muted-foreground/50")} />
            {s.online ? w.online : `${w.usually}: ${s.hours}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{w.hours}</dt>
          {s.schedule ? (
            <dd data-support-hours>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d, i) => {
                    const h = s.schedule!.days[d];
                    return (
                      <tr key={d} data-hours-day={d}>
                        <td className="py-0.5">{w.week[i]}</td>
                        <td className="py-0.5 text-right tabular-nums">{h ? `${h.open} – ${h.close}` : w.closed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </dd>
          ) : (
            <dd data-support-hours>{s.hours}</dd>
          )}
        </div>
        {!!s.schedule?.holidays.length && (
          <div data-support-holidays>
            <dt className="text-xs text-muted-foreground">{w.holidays}</dt>
            {s.schedule.holidays.map((h) => (
              <dd key={h.date} className="flex justify-between text-xs">
                <span>{h.name}</span>
                <span className="tabular-nums">{h.date}</span>
              </dd>
            ))}
          </div>
        )}
        {!s.online && s.awayMessage && (
          <div>
            <dt className="text-xs text-muted-foreground">{w.away}</dt>
            <dd className="whitespace-pre-wrap">{s.awayMessage}</dd>
          </div>
        )}
        {ways.length > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">{w.channels}</dt>
            <dd>{ways.join(" · ")}</dd>
          </div>
        )}
        {s.callEngine?.engine === "phone" && s.callEngine.phone && (
          <div>
            <dt className="text-xs text-muted-foreground">{w.phone}</dt>
            <dd>
              <a className="text-primary" href={`tel:${s.callEngine.phone.replace(/[^\d+]/g, "")}`}>{s.callEngine.phone}</a>
            </dd>
          </div>
        )}
        {s.recordCalls && (
          <div>
            <dt className="text-xs text-muted-foreground">{w.recording}</dt>
            <dd className="text-xs">{s.recordingNotice}</dd>
          </div>
        )}
      </dl>
      {s.content && (
        <>
          <details className="rounded-xl border bg-card p-3" open>
            <summary className="cursor-pointer font-medium">{w.policy}</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs">{am ? s.content.policy.am : s.content.policy.en}</p>
          </details>
          <details className="rounded-xl border bg-card p-3">
            <summary className="cursor-pointer font-medium">{w.privacy}</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{am ? s.content.terms.am : s.content.terms.en}</p>
          </details>
        </>
      )}
    </div>
  );
}

export type Api = <T>(path: string, body?: unknown) => Promise<T>;

type Resource = { id: string; title: string; kind: string; caption: string | null; fileName: string | null; size: number; url: string | null };
const RES_ICON: Record<string, React.ComponentType<{ className?: string }>> = { video: VideoIcon, image: ImageIcon, pdf: FileIcon, document: FileIcon, link: LinkIcon };

// The bot's resources (videos, PDFs, links the team added in Bot manager), opened here in the support app.
function Resources({ api, title }: { api: Api; title: string }) {
  const [list, setList] = React.useState<Resource[] | null>(null);
  React.useEffect(() => void api<Resource[]>("resources").then(setList).catch(() => setList([])), [api]);
  if (!list?.length) return null;
  return (
    <div className="space-y-1.5 pt-2" data-resources>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpenIcon className="size-3.5" /> {title}
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

type Found = { id: string; title: string; category: string | null; snippet: string; section?: string | null };

// Help articles matching what the customer types (the knowledge base), so many questions answer themselves.
function useArticles(api: Api, q: string) {
  const [found, setFound] = React.useState<Found[]>([]);
  React.useEffect(() => {
    if (q.trim().length < 4) return void setFound([]);
    const t = window.setTimeout(() => void api<Found[]>(`articles?q=${encodeURIComponent(q)}&lang=${document.documentElement.lang === "am" ? "am" : "en"}`).then(setFound).catch(() => setFound([])), 400);
    return () => window.clearTimeout(t);
  }, [api, q]);
  return found;
}

function HelpSearch({ api, onOpen, placeholder = "Search help articles" }: { api: Api; onOpen: (id: string) => void; placeholder?: string }) {
  const [q, setQ] = React.useState("");
  const found = useArticles(api, q);
  return (
    <div className="space-y-1 pt-2" data-help-search>
      <Input aria-label="Search help" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
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
  if (!a) return <Loading />;
  return (
    <div className="space-y-3 p-4 text-sm" data-help-article>
      {a.category && <p className="text-xs text-muted-foreground">{a.category}</p>}
      <p className="text-base font-semibold">{a.title}</p>
      <ArticleBody a={a} compact />
      {voted === null ? (
        <div className="flex items-center gap-2 border-t pt-2">
          <span className="text-xs">Did this help?</span>
          <Button size="xs" variant="outline" onClick={() => (haptic("tap"), setVoted(true), void api(`articles/${id}/vote`, { helpful: true }))}>
            Yes
          </Button>
          <Button size="xs" variant="outline" onClick={() => (haptic("tap"), setVoted(false), void api(`articles/${id}/vote`, { helpful: false }))}>
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

function NewQuestion({ api, tg, color, hideMain, topic, am, onDone, onArticle }: { api: Api; tg: TgWebApp | null; color: string; hideMain: boolean; topic: ({ key: string } & Pair) | null; am: boolean; onDone: (id: string) => void; onArticle: (id: string) => void }) {
  const [f, setF] = React.useState({ subject: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const suggested = useArticles(api, `${f.subject} ${f.message}`);
  const send = async () => {
    if (busy || !f.message.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>("tickets", { ...f, topic: topic?.key ?? null });
      onDone(r.id);
    } catch (e) {
      haptic("error");
      setErr(e instanceof Error ? e.message : "Could not send.");
    }
    setBusy(false);
  };
  // Inside Telegram, Send is Telegram's Main button.
  useMainButton(tg, hideMain ? null : W[am ? "am" : "en"].send, () => void send(), { active: !!f.message.trim(), busy, color });
  return (
    <div className="space-y-2 p-4" data-page-new>
      {topic && <p className="text-xs font-medium text-muted-foreground" data-chosen-topic>{am ? topic.am : topic.en}</p>}
      <Input aria-label="Subject" placeholder={am ? "ርዕስ (አማራጭ)" : "Subject (optional)"} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      <Textarea aria-label="Your question" placeholder={am ? "ምን እንደሚያስፈልግዎ ይንገሩን" : "Tell us what you need"} className="min-h-32" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {suggested.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-2" data-suggested>
          <p className="text-xs text-muted-foreground">{am ? "እነዚህ ሊመልሱት ይችላሉ፦" : "These may answer it:"}</p>
          {suggested.slice(0, 3).map((a) => (
            <button key={a.id} type="button" className="block w-full text-left text-sm text-primary hover:underline" onClick={() => onArticle(a.id)}>
              {a.title}
            </button>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-[#D93025]">{err}</p>}
      {!tg && (
        <Button className="w-full text-white" style={{ background: color }} disabled={busy || !f.message.trim()} onClick={() => void send()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
        </Button>
      )}
    </div>
  );
}
