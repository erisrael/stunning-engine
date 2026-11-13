"use client";

// The customer's support panel: conversations, a new question, replies (checked every few seconds), rating the help,
// and calling an agent from the browser (after agreeing to the recording when calls are recorded).
import * as React from "react";
import { ArrowLeftIcon, Loader2Icon, PlusIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LiveThread, words, type Lang } from "./live-thread";
import { CallButton, CallLayer } from "./calls";

type User = { id: string | null; name: string | null; email: string | null; phone: string | null; hash: string | null; meta?: Record<string, string> };
export type Session = { token: string; customer: { id: string; name: string }; app: { name: string; greeting: string | null; color: string | null }; online: boolean; hours: string; awayMessage: string; recordCalls: boolean; recordingNotice: string; channels?: { web_chat: boolean; telegram: boolean; calls: boolean; sms: boolean }; callEngine?: { engine: "browser" | "phone"; phone: string | null } };
type Ticket = { id: string; number: number; subject: string; status: string; updated_at: string; rating: number | null };

const STATUS: Record<string, string> = { new: "Sent", open: "Being answered", pending: "Waiting for you", on_hold: "On hold", solved: "Solved", closed: "Closed" };

export function SupportWidget({ appKey, initialUser, waitForParent }: { appKey: string; initialUser: User | null; waitForParent: boolean }) {
  const [user, setUser] = React.useState<User | null>(initialUser);
  const [s, setS] = React.useState<Session | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [open, setOpen] = React.useState<string | "new" | null>(null);
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
          <p className="flex-1 font-semibold">{s.app.name} {am ? "ድጋፍ" : "support"}</p>
          <button type="button" className="rounded border border-white/40 px-1.5 py-0.5 text-xs" onClick={() => setLang(am ? "en" : "am")} aria-label={am ? "English" : "Amharic"} data-lang-toggle>
            {am ? "EN" : "አማ"}
          </button>
        </div>
        <p className="text-xs opacity-90">{s.online ? (am ? "መስመር ላይ ነን" : "We are online") : `${am ? "በተለምዶ" : "Usually"}: ${s.hours}`}</p>
      </header>
      <CallLayer api={api} s={s}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open === null && (
          <div className="space-y-3 p-4">
            <p className="text-sm">{s.app.greeting ?? `Hi ${s.customer.name.split(" ")[0]}! How can we help?`}</p>
            <Button className="w-full text-white" style={{ background: color }} onClick={() => setOpen("new")} data-new-question>
              <PlusIcon /> {am ? "ጥያቄ ይጠይቁ" : "Ask a question"}
            </Button>
            <CallButton api={api} s={s} ticketId={null} color={color} onTicket={(id) => (setOpen(id), void reload())} />
            <HelpSearch api={api} onOpen={(id) => setOpen(`a:${id}`)} />
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
        {open === "new" && <NewQuestion api={api} color={color} onDone={(id) => (setOpen(id), void reload())} onArticle={(id) => setOpen(`a:${id}`)} />}
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
