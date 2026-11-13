"use client";

import { SupportIcon } from "@/lib/support-icons";
// The help center customers see: pick what the problem is about, read the answers, and if that does not help, ask.
// A request is followed here with a private link kept in this browser; inside Telegram the customer is known by
// Telegram, so the bot chat and this page are one conversation.

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, InboxIcon, Loader2Icon, MessageCircleQuestionIcon, SearchIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { helpAskAction, helpMessagesAction, helpReplyAction, helpTelegramAction, helpTicketsAction } from "@/app/actions/help-public";
import { cn } from "@/lib/utils";

type Cat = { key: string; labelEn: string; labelAm: string; hintEn: string; hintAm: string; icon: string; kbCategory: string | null; selfHelp: boolean };
type Art = { id: string; title: string; category: string | null; snippet: string; views: number };
type Home = { open: boolean; hours: string; categories: Cat[]; articles: Art[] };
type Ticket = { id: string; number: number; subject: string; status: string; category: string | null; updated_at: string };
type Msg = { id: string; author_kind: string; author: string | null; body: string; created_at: string };
type View = { kind: "home" } | { kind: "cat"; key: string } | { kind: "ask"; key: string | null } | { kind: "mine" } | { kind: "ticket"; id: string };

const KEY = "myseed.help.token";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const keep = (t: string) => {
  try {
    localStorage.setItem(KEY, t);
  } catch {}
};
const STATUS: Record<string, [string, string]> = {
  new: ["Received", "ደርሷል"],
  open: ["We are on it", "በሂደት ላይ"],
  pending: ["Waiting for you", "እርስዎን በመጠባበቅ ላይ"],
  on_hold: ["On hold", "ቆሟል"],
  solved: ["Solved", "ተፈቷል"],
  closed: ["Closed", "ተዘግቷል"],
};
type TgApp = { initData?: string; ready?: () => void; expand?: () => void; colorScheme?: string };
const tgApp = () => (typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TgApp } }).Telegram?.WebApp ?? null));

export function HelpCenter({ home, brand, startCategory }: { home: Home; brand: string; startCategory: string | null }) {
  const [am, setAm] = React.useState(false);
  const [view, setView] = React.useState<View>(startCategory && home.categories.some((c) => c.key === startCategory) ? { kind: "cat", key: startCategory } : { kind: "home" });
  const [token, setToken] = React.useState<string | null>(null);
  const [inTelegram, setInTelegram] = React.useState(false);
  const [q, setQ] = React.useState("");
  const T = (en: string, amh: string) => (am ? amh : en);
  const cat = (key: string | null) => home.categories.find((c) => c.key === key) ?? null;

  React.useEffect(() => {
    setToken(read());
    // Inside Telegram: sign in with Telegram's signed data, once the bridge script is there.
    let tries = 0;
    const t = setInterval(async () => {
      const app = tgApp();
      if (app?.initData || ++tries > 20) clearInterval(t);
      if (!app?.initData) return;
      app.ready?.();
      app.expand?.();
      setInTelegram(true);
      const r = await helpTelegramAction(app.initData);
      if (r.ok && r.data) {
        keep(r.data.token);
        setToken(r.data.token);
      }
    }, 150);
    return () => clearInterval(t);
  }, []);

  const needle = q.trim().toLowerCase();
  const found = needle.length > 1 ? home.articles.filter((a) => `${a.title} ${a.snippet} ${a.category ?? ""}`.toLowerCase().includes(needle)).slice(0, 12) : [];

  return (
    <div className="min-h-dvh bg-muted/30" data-help-center>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          {view.kind !== "home" ? (
            <Button size="icon-sm" variant="ghost" aria-label={T("Back", "ተመለስ")} onClick={() => setView(view.kind === "ticket" ? { kind: "mine" } : { kind: "home" })}>
              <ArrowLeftIcon />
            </Button>
          ) : (
            <MessageCircleQuestionIcon className="size-5 text-primary" />
          )}
          <span className="font-semibold">
            {brand} {T("help center", "የእርዳታ ማዕከል")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {token && (
              <Button size="sm" variant="ghost" onClick={() => setView({ kind: "mine" })} data-help-mine>
                <InboxIcon /> {T("My requests", "ጥያቄዎቼ")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAm(!am)} aria-label="Language">
              {am ? "EN" : "አማ"}
            </Button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {!home.open && <p className="rounded-lg border bg-background p-3 text-sm">{T("Requests are closed right now. The answers below are still here.", "ጥያቄዎች ለጊዜው ዝግ ናቸው። ከታች ያሉት መልሶች ግን አሉ።")}</p>}

        {view.kind === "home" && (
          <>
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-11 bg-background pl-9 text-base" placeholder={T("Search the answers", "መልሶችን ይፈልጉ")} aria-label={T("Search the answers", "መልሶችን ይፈልጉ")} />
            </div>
            {needle.length > 1 ? (
              <ArticleList list={found} empty={T("Nothing found. Choose a topic below or ask us.", "ምንም አልተገኘም። ከታች ርዕስ ይምረጡ ወይም ይጠይቁን።")} />
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-help-categories>
              {home.categories.map((c) => (
                <button key={c.key} type="button" onClick={() => setView(c.selfHelp ? { kind: "cat", key: c.key } : { kind: "ask", key: c.key })} className="flex flex-col items-start gap-1 rounded-xl border bg-background p-3 text-left transition hover:border-primary/50 hover:shadow-sm" data-help-category={c.key}>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground"><SupportIcon name={c.icon} className="size-5" /></span>
                  <span className="font-medium">{am ? c.labelAm : c.labelEn}</span>
                  <span className="text-xs text-muted-foreground">{am ? c.hintAm : c.hintEn}</span>
                </button>
              ))}
            </div>
            {home.articles.length > 0 && !needle && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">{T("Most read", "በብዛት የተነበቡ")}</h2>
                <ArticleList list={home.articles.slice(0, 5)} empty="" />
              </section>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {T("Our team answers", "ቡድናችን የሚመልሰው")}: {home.hours}
            </p>
          </>
        )}

        {view.kind === "cat" &&
          (() => {
            const c = cat(view.key);
            if (!c) return null;
            const list = c.kbCategory ? home.articles.filter((a) => (a.category ?? "").toLowerCase() === c.kbCategory!.toLowerCase()) : home.articles.slice(0, 8);
            return (
              <section className="space-y-3" data-help-cat={c.key}>
                <h1 className="text-xl font-semibold">
                  <SupportIcon name={c.icon} className="inline size-4" /> {am ? c.labelAm : c.labelEn}
                </h1>
                <ArticleList list={list} empty={T("No answers here yet.", "እስካሁን እዚህ መልስ የለም።")} />
                <div className="rounded-xl border bg-background p-4 text-center">
                  <p className="text-sm">{T("Did not find your answer?", "መልስዎን አላገኙም?")}</p>
                  <Button className="mt-2" disabled={!home.open} onClick={() => setView({ kind: "ask", key: c.key })}>
                    {T("Still need help? Ask us", "አሁንም እርዳታ ይፈልጋሉ? ይጠይቁን")}
                  </Button>
                </div>
              </section>
            );
          })()}

        {view.kind === "ask" && (
          <AskForm
            am={am}
            category={cat(view.key)}
            categories={home.categories}
            token={token}
            inTelegram={inTelegram}
            onSent={(t, id) => {
              keep(t);
              setToken(t);
              setView({ kind: "ticket", id });
            }}
          />
        )}

        {view.kind === "mine" && token && <MyRequests am={am} token={token} cats={home.categories} onOpen={(id) => setView({ kind: "ticket", id })} onNew={() => setView({ kind: "ask", key: null })} />}
        {view.kind === "ticket" && token && <Thread am={am} token={token} id={view.id} />}
      </main>
    </div>
  );
}

function ArticleList({ list, empty }: { list: Art[]; empty: string }) {
  if (!list.length) return empty ? <p className="rounded-lg border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background" data-help-articles>
      {list.map((a) => (
        <li key={a.id}>
          <Link href={`/help/${a.id}`} className="block px-4 py-3 hover:bg-muted/50">
            <span className="block font-medium">{a.title}</span>
            <span className="line-clamp-2 text-sm text-muted-foreground">{a.snippet}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AskForm({ am, category, categories, token, inTelegram, onSent }: { am: boolean; category: Cat | null; categories: Cat[]; token: string | null; inTelegram: boolean; onSent: (token: string, ticketId: string) => void }) {
  const T = (en: string, amh: string) => (am ? amh : en);
  const [f, setF] = React.useState({ name: "", phone: "", email: "", category: category?.key ?? "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const known = !!token;
  return (
    <form
      className="space-y-3 rounded-xl border bg-background p-4"
      data-help-ask
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await helpAskAction({ token, name: f.name, phone: f.phone || null, email: f.email || null, category: f.category || null, message: f.message });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        onSent(r.data!.token, r.data!.ticketId);
      }}
    >
      <h1 className="text-xl font-semibold">{T("Ask us", "ይጠይቁን")}</h1>
      {!known && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Input required aria-label={T("Your name", "ስምዎ")} placeholder={T("Your name", "ስምዎ")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input aria-label={T("Phone", "ስልክ")} placeholder={T("Phone, e.g. 0911 234567", "ስልክ፣ ለምሳሌ 0911 234567")} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input aria-label={T("Email", "ኢሜይል")} placeholder={T("Email (optional)", "ኢሜይል (አማራጭ)")} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
      )}
      {known && <p className="text-xs text-muted-foreground">{inTelegram ? T("We will answer here and in the Telegram chat.", "እዚህ እና በቴሌግራም ውይይቱ እንመልሳለን።") : T("We know you from your earlier request.", "ከቀድሞ ጥያቄዎ እናውቅዎታለን።")}</p>}
      <select aria-label={T("Topic", "ርዕስ")} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
        <option value="">{T("Choose a topic", "ርዕስ ይምረጡ")}</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            <SupportIcon name={c.icon} className="inline size-4" /> {am ? c.labelAm : c.labelEn}
          </option>
        ))}
      </select>
      <Textarea required rows={5} className="max-h-[40vh] overflow-y-auto [field-sizing:fixed]" aria-label={T("Your question", "ጥያቄዎ")} placeholder={T("Tell us what happened. For payments, give the date, the amount and how you paid.", "ምን እንደተፈጠረ ይንገሩን። ለክፍያ ቀኑን፣ መጠኑን እና እንዴት እንደከፈሉ ይጥቀሱ።")} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || f.message.trim().length < 5}>
        {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {T("Send", "ላክ")}
      </Button>
    </form>
  );
}

function MyRequests({ am, token, cats, onOpen, onNew }: { am: boolean; token: string; cats: Cat[]; onOpen: (id: string) => void; onNew: () => void }) {
  const T = (en: string, amh: string) => (am ? amh : en);
  const [rows, setRows] = React.useState<Ticket[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    void helpTicketsAction(token).then((r) => (r.ok ? setRows(r.data!.tickets) : setError(r.error)));
  }, [token]);
  if (error) return <p className="rounded-lg border bg-background p-4 text-sm">{error}</p>;
  if (!rows) return <Loader2Icon className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <section className="space-y-3" data-help-requests>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{T("My requests", "ጥያቄዎቼ")}</h1>
        <Button size="sm" onClick={onNew}>
          {T("New request", "አዲስ ጥያቄ")}
        </Button>
      </div>
      {!rows.length && <p className="text-sm text-muted-foreground">{T("No requests yet.", "እስካሁን ጥያቄ የለም።")}</p>}
      <ul className="divide-y overflow-hidden rounded-xl border bg-background">
        {rows.map((t) => {
          const c = cats.find((x) => x.key === t.category);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50" data-help-request={t.number}>
                <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {c ? <SupportIcon name={c.icon} className="mr-1 inline size-3.5" /> : null}
                  {t.subject}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", ["solved", "closed"].includes(t.status) ? "bg-muted text-muted-foreground" : t.status === "pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary")}>{STATUS[t.status]?.[am ? 1 : 0] ?? t.status}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Thread({ am, token, id }: { am: boolean; token: string; id: string }) {
  const T = (en: string, amh: string) => (am ? amh : en);
  const [d, setD] = React.useState<{ ticket: { number: number; subject: string; status: string }; messages: Msg[] } | null>(null);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    const r = await helpMessagesAction(token, id);
    if (r.ok) setD(r.data!);
    else setError(r.error);
  }, [token, id]);
  React.useEffect(() => {
    void load();
    // New answers show up while the page is open.
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);
  if (error && !d) return <p className="rounded-lg border bg-background p-4 text-sm">{error}</p>;
  if (!d) return <Loader2Icon className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <section className="space-y-3" data-help-thread={d.ticket.number}>
      <div>
        <p className="font-mono text-xs text-muted-foreground">#{d.ticket.number}</p>
        <h1 className="text-lg font-semibold">{d.ticket.subject}</h1>
        <p className="text-sm text-muted-foreground">{STATUS[d.ticket.status]?.[am ? 1 : 0] ?? d.ticket.status}</p>
      </div>
      <div className="space-y-2">
        {d.messages.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", m.author_kind === "customer" ? "ml-auto bg-primary/10" : m.author_kind === "system" ? "mx-auto bg-muted text-xs text-muted-foreground" : "border bg-background")} data-help-msg={m.author_kind}>
            <p className="mb-0.5 text-xs text-muted-foreground">
              {m.author_kind === "customer" ? T("You", "እርስዎ") : m.author} · {new Date(m.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
      {d.ticket.status !== "closed" && (
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await helpReplyAction(token, id, body);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            setBody("");
            setError(null);
            await load();
          }}
        >
          <Textarea rows={2} className="max-h-40 flex-1 overflow-y-auto bg-background [field-sizing:fixed]" aria-label={T("Your message", "መልዕክትዎ")} placeholder={T("Write a message", "መልዕክት ይጻፉ")} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" disabled={busy || !body.trim()} aria-label={T("Send", "ላክ")}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          </Button>
        </form>
      )}
      {error && d && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
