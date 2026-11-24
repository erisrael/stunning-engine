"use client";
import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, HistoryIcon, LanguagesIcon, Loader2Icon, PlusIcon, SendIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/server/support-content";
import * as A from "@/app/actions/support-content";

// Customer support › Content (Update 1.2, Phase 5): every word the Telegram bot and the Mini App say. Items are
// grouped by kind; each key has a version per language. A change is a draft until it is published; publishing keeps
// a version that can be restored. The bot reads the published text at once, with no deployment.

type Data = Awaited<ReturnType<typeof import("@/server/support-content").listSupportContent>>;
const LANG_NAMES: Record<string, string> = { en: "English", am: "Amharic", om: "Afaan Oromo", ti: "Tigrinya", so: "Somali" };
const langName = (l: string) => LANG_NAMES[l] ?? l;
const ACTIONS = [
  ["start", "Start a conversation (topics)"],
  ["requests", "My support requests"],
  ["history", "Previous conversations"],
  ["faq", "Search the FAQ"],
  ["contact", "Contact support"],
  ["language", "Choose the language"],
];

export function SupportContentManager({ bots }: { bots: { key: string; name: string }[] }) {
  const [bot, setBot] = React.useState(bots[0]?.key ?? "default");
  const [data, setData] = React.useState<Data | null>(null);
  const [error, setError] = React.useState("");
  const [kind, setKind] = React.useState("menu");
  const [lang, setLang] = React.useState("en");
  const [editing, setEditing] = React.useState<{ item: ContentItem | null; key: string; kind: string; lang: string; body: string; action: string } | null>(null);
  const [history, setHistory] = React.useState<ContentItem | null>(null);
  const load = React.useCallback(async () => {
    const r = await A.supportContentAction(bot);
    if (r.ok) (setData(r.data!), setError(""));
    else setError(r.error);
  }, [bot]);
  React.useEffect(() => void load(), [load]);

  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!data) return <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading content…</StatusStrip>;

  const ofKind = data.items.filter((i) => i.kind === kind);
  const keys = [...new Set(ofKind.sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)).map((i) => i.key))];
  const counts = Object.fromEntries(data.kinds.map((k) => [k.key, new Set(data.items.filter((i) => i.kind === k.key).map((i) => i.key)).size]));
  const changed = data.items.filter((i) => i.changed).length;
  const move = async (i: number, d: number) => {
    const next = [...keys];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    const r = await A.reorderSupportContentAction(bot, kind, next);
    if (!r.ok) toast.error(r.error);
    await load();
  };
  const startNew = () => setEditing({ item: null, key: kind === "command" ? "cmd." : `${kind}.`, kind, lang, body: "", action: kind === "menu" || kind === "category" ? "start" : "" });
  const edit = (key: string, l: string) => {
    const item = data.items.find((i) => i.key === key && i.lang === l) ?? null;
    const sibling = data.items.find((i) => i.key === key);
    setEditing({ item, key, kind: sibling?.kind ?? kind, lang: l, body: item?.draft ?? item?.published ?? "", action: item?.action ?? sibling?.action ?? "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {bots.length > 1 && (
          <Select value={bot} onValueChange={setBot}>
            <SelectTrigger className="h-8 w-52 text-xs" aria-label="Bot"><SelectValue /></SelectTrigger>
            <SelectContent>{bots.map((b) => <SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Preview language"><LanguagesIcon className="size-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>{data.langs.map((l) => <SelectItem key={l} value={l}>{langName(l)}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={startNew}><PlusIcon /> New {data.kinds.find((k) => k.key === kind)?.label.toLowerCase()}</Button>
        {changed > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-200">{changed} unpublished change{changed === 1 ? "" : "s"}</Badge>}
      </div>
      {bot !== "default" && <StatusStrip>Anything this bot has no item for is said as the default bot says it.</StatusStrip>}
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr_20rem]">
        <nav data-wrap-tabs className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Kinds of content">
          {data.kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={cn("flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", kind === k.key ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}>
              {k.label}
              <span className="text-xs tabular-nums text-muted-foreground">{counts[k.key] ?? 0}</span>
            </button>
          ))}
        </nav>
        <section className="min-w-0 space-y-2" aria-label="Items">
          {!keys.length && <EmptyState title="Nothing of this kind yet" description="Add one with the New button." />}
          {keys.map((key, i) => {
            const rows = ofKind.filter((x) => x.key === key);
            const base = rows.find((r) => r.lang === "en") ?? rows[0];
            return (
              <article key={key} className={cn("space-y-2 rounded-xl border bg-card p-3", !base.enabled && "opacity-60")} data-content-key={key}>
                <header className="flex flex-wrap items-center gap-2">
                  <code className="text-xs">{key}</code>
                  {base.action && <Badge variant="outline" className="text-[10px]">{ACTIONS.find(([a]) => a === base.action)?.[1] ?? base.action}</Badge>}
                  <div className="ml-auto flex items-center gap-1">
                    {(kind === "menu" || kind === "category" || kind === "command") && (
                      <>
                        <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => move(i, -1)} aria-label={`Move ${key} up`}><ArrowUpIcon className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => move(i, 1)} aria-label={`Move ${key} down`}><ArrowDownIcon className="size-3.5" /></Button>
                      </>
                    )}
                    <Switch checked={base.enabled} onCheckedChange={async (v) => { const r = await A.enableSupportContentAction(base.id, v); if (!r.ok) toast.error(r.error); await load(); }} aria-label={`${key} on`} />
                  </div>
                </header>
                <ul className="space-y-1.5">
                  {data.langs.map((l) => {
                    const row = rows.find((r) => r.lang === l);
                    if (!row && !["en", "am"].includes(l)) return null;
                    return (
                      <li key={l} className="flex items-start gap-2 text-sm">
                        <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{langName(l)}</span>
                        {row ? (
                          <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => edit(key, l)}>
                            <span className="whitespace-pre-wrap break-words">{row.draft ?? row.published}</span>
                            {row.changed && <Badge variant="outline" className="ml-2 border-amber-500/40 text-[10px] text-amber-800 dark:text-amber-200">draft</Badge>}
                            {!row.published && <Badge variant="outline" className="ml-2 text-[10px]">not published</Badge>}
                          </button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => edit(key, l)}><LanguagesIcon /> Add {langName(l)}</Button>
                        )}
                        {row && <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => setHistory(row)} aria-label={`History of ${key} ${l}`}><HistoryIcon className="size-3.5" /></Button>}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>
        <Preview data={data} kind={kind} lang={lang} />
      </div>
      <Editor state={editing} langs={data.langs} kinds={data.kinds} onClose={() => setEditing(null)} onSaved={load} bot={bot} />
      <History item={history} onClose={() => setHistory(null)} onRestored={(it) => (setHistory(null), void load(), edit(it.key, it.lang))} />
    </div>
  );
}

// What a customer sees: the bot's welcome with the menu, or the chosen kind's text, in a Telegram chat and in the app.
function Preview({ data, kind, lang }: { data: Data; kind: string; lang: string }) {
  const text = (key: string) => {
    const r = data.items.find((i) => i.key === key && i.lang === lang) ?? data.items.find((i) => i.key === key && i.lang === "en");
    return r?.draft ?? r?.published ?? "";
  };
  const entries = (k: string) => [...new Set(data.items.filter((i) => i.kind === k && i.enabled).sort((a, b) => a.sort - b.sort).map((i) => i.key))].map((key) => ({ key, label: text(key) }));
  const showMenu = kind === "menu" || kind === "welcome" || kind === "button";
  const message = showMenu ? text("welcome") : kind === "category" ? text("topics.choose") : data.items.filter((i) => i.kind === kind && i.enabled).map((i) => i.key).filter((k, i, a) => a.indexOf(k) === i).map(text).join("\n\n");
  const buttons = showMenu ? entries("menu") : kind === "category" ? entries("category") : [];
  return (
    <aside className="space-y-3" aria-label="Preview">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Telegram</p>
        <div className="space-y-1.5 rounded-xl bg-[#d9e4ee] p-3 dark:bg-[#0e1621]" data-preview="telegram">
          <div className="max-w-[90%] whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-black shadow-sm dark:bg-[#182533] dark:text-white">{message || "…"}</div>
          {buttons.map((b) => <div key={b.key} className="rounded-md bg-white/70 px-2 py-1.5 text-center text-xs text-[#2a6fb0] dark:bg-[#22303f] dark:text-[#6ab3f3]">{b.label}</div>)}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Mini App</p>
        <div className="space-y-2 rounded-xl border bg-background p-3" data-preview="miniapp">
          <p className="text-sm font-medium">{message.split("\n")[0] || "…"}</p>
          <div className="grid grid-cols-2 gap-1.5">{buttons.map((b) => <div key={b.key} className="rounded-lg border px-2 py-2 text-xs">{b.label}</div>)}</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">The preview shows drafts. Customers see only published text.</p>
    </aside>
  );
}

function Editor({ state, langs, kinds, bot, onClose, onSaved }: { state: { item: ContentItem | null; key: string; kind: string; lang: string; body: string; action: string } | null; langs: string[]; kinds: { key: string; label: string }[]; bot: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [s, setS] = React.useState(state);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setS(state), [state]);
  if (!s) return null;
  const isNew = !s.item;
  const needsAction = s.kind === "menu" || s.kind === "category";
  const category = s.action.startsWith("category:") ? s.action.slice(9) : "";
  const url = s.action.startsWith("url:") ? s.action.slice(4) : "";
  const actionKind = s.action.startsWith("category:") ? "category" : s.action.startsWith("url:") ? "url" : s.action;
  const save = async (publish: boolean) => {
    setBusy(true);
    const r = await A.saveSupportContentAction({ id: s.item?.id ?? null, key: s.key, kind: s.kind, bot, lang: s.lang, body: s.body, action: needsAction ? s.action : s.action || null, publish });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(publish ? "Published. The bot says it now." : "Draft saved.");
    await onSaved();
    onClose();
  };
  const publishOnly = async () => {
    if (!s.item) return;
    setBusy(true);
    const r = await A.publishSupportContentAction(s.item.id);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Published.");
    await onSaved();
    onClose();
  };
  const remove = async (all: boolean) => {
    if (!s.item || !window.confirm(all ? `Delete ${s.key} in every language?` : `Delete the ${langName(s.lang)} text of ${s.key}?`)) return;
    const r = await A.deleteSupportContentAction(s.item.id, all);
    if (!r.ok) return void toast.error(r.error);
    await onSaved();
    onClose();
  };
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isNew ? "New content" : s.key}</SheetTitle>
          <SheetDescription>{langName(s.lang)}{s.item?.publishedAt ? ` · published ${new Date(s.item.publishedAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })}` : " · not published yet"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {isNew && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs">Key<Input value={s.key} onChange={(e) => setS({ ...s, key: e.target.value.toLowerCase() })} placeholder="menu.offers" /></label>
              <label className="space-y-1 text-xs">Kind
                <Select value={s.kind} onValueChange={(v) => setS({ ...s, kind: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{kinds.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="col-span-2 space-y-1 text-xs">Language
                <Input value={s.lang} onChange={(e) => setS({ ...s, lang: e.target.value.toLowerCase() })} placeholder="en, am, om…" list="content-langs" />
                <datalist id="content-langs">{langs.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</datalist>
              </label>
            </div>
          )}
          <label className="block space-y-1 text-xs">Text
            <Textarea value={s.body} onChange={(e) => setS({ ...s, body: e.target.value })} rows={s.kind === "menu" || s.kind === "button" || s.kind === "category" || s.kind === "command" ? 2 : 6} aria-label="Text" />
          </label>
          <p className="text-[11px] text-muted-foreground">Placeholders: {"{number}"} request number, {"{position}"} place in line, {"{minutes}"} usual wait, {"{agent}"} agent's first name, {"{topic}"} topic.</p>
          {needsAction && (
            <div className="space-y-2">
              <label className="block space-y-1 text-xs">When pressed
                <Select value={actionKind} onValueChange={(v) => setS({ ...s, action: v === "category" ? "category:person" : v === "url" ? "url:https://" : v })}>
                  <SelectTrigger className="h-9" aria-label="When pressed"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map(([a, l]) => <SelectItem key={a} value={a}>{l}</SelectItem>)}
                    <SelectItem value="category">Open a help category</SelectItem>
                    <SelectItem value="url">Open a web page</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {actionKind === "category" && <Input value={category} onChange={(e) => setS({ ...s, action: `category:${e.target.value.toLowerCase()}` })} placeholder="category key, e.g. payments" aria-label="Category key" />}
              {actionKind === "url" && <Input value={url} onChange={(e) => setS({ ...s, action: `url:${e.target.value}` })} placeholder="https://" aria-label="Web address" />}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => save(true)} disabled={busy}><SendIcon /> Save and publish</Button>
            <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save draft</Button>
            {s.item?.changed && <Button variant="ghost" onClick={publishOnly} disabled={busy}>Publish the saved draft</Button>}
          </div>
          {s.item && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(false)}><Trash2Icon /> Delete this language</Button>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(true)}><Trash2Icon /> Delete in every language</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function History({ item, onClose, onRestored }: { item: ContentItem | null; onClose: () => void; onRestored: (it: ContentItem) => void }) {
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof import("@/server/support-content").contentHistory>> | null>(null);
  React.useEffect(() => {
    setRows(null);
    if (item) void A.supportContentHistoryAction(item.id).then((r) => (r.ok ? setRows(r.data!) : toast.error(r.error)));
  }, [item]);
  return (
    <Sheet open={!!item} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>History of {item?.key}</SheetTitle>
          <SheetDescription>{item ? langName(item.lang) : ""} · each publish, newest first</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {!rows && <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading…</StatusStrip>}
          {rows?.map((v, i) => (
            <div key={v.id} className="space-y-1 rounded-lg border p-2 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {new Date(v.published_at).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })} · {v.by ?? v.note ?? "System"}
                {i === 0 && <Badge variant="outline" className="text-[10px]">current</Badge>}
                {i > 0 && <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={async () => { const r = await A.restoreSupportContentAction(v.id); if (!r.ok) return void toast.error(r.error); toast.success("Restored as the draft. Publish it to use it."); onRestored(r.data!); }}><UndoIcon /> Restore</Button>}
              </div>
              <p className="whitespace-pre-wrap break-words">{v.body}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
