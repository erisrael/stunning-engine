"use client";

import { SUPPORT_ICONS, SupportIcon, supportIconKey } from "@/lib/support-icons";
// Customer support settings for the help menu: the categories (English and Amharic, order, help-article category,
// queue), the routing rules, the Telegram bot (texts, live preview, webhook health), and the reports by category.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, Loader2Icon, PlusIcon, RefreshCwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { refreshTelegramAction, saveCategoriesAction, saveRoutesAction, saveTelegramTextsAction, telegramHealthAction } from "@/app/actions/support-help";
import type { HelpCategory, HelpRoute } from "@/server/support-help";
import type { TelegramTexts } from "@/server/support-channels";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/support";
import { cn } from "@/lib/utils";

type Queue = { id: string; name: string };
const sel = "h-8 rounded-md border bg-background px-2 text-sm";
const CHANNELS: Record<string, string> = { any: "Any channel", telegram: "Telegram", web: "Help page", widget: "App chat", email: "Email" };

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return {
    busy,
    save: async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => {
      setBusy(true);
      const r = await p;
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    },
  };
}

export function HelpMenuSetup({ categories, routes, queues, kbCategories }: { categories: HelpCategory[]; routes: HelpRoute[]; queues: Queue[]; kbCategories: string[] }) {
  const { busy, save } = useSave();
  const [cats, setCats] = React.useState(categories);
  const [rules, setRules] = React.useState(routes);
  React.useEffect(() => setCats(categories), [categories]);
  React.useEffect(() => setRules(routes), [routes]);
  const setCat = (i: number, patch: Partial<HelpCategory>) => setCats((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setCats((c) => {
    const n = [...c];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x!);
    return n;
  });
  const setRule = (i: number, patch: Partial<HelpRoute>) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-4" data-help-setup>
      <Card>
        <CardHeader>
          <CardTitle>Help menu</CardTitle>
          <CardDescription>The same menu on the Telegram bot and the help page. Each item shows the help articles of its category first; &quot;Still need help?&quot; opens a request in its queue (unless a routing rule below says otherwise).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <datalist id="kb-cats">
            {kbCategories.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">Order</th>
                  <th className="p-2 font-medium">On</th>
                  <th className="p-2 font-medium">Icon</th>
                  <th className="p-2 font-medium">English</th>
                  <th className="p-2 font-medium">Amharic</th>
                  <th className="p-2 font-medium">Articles from</th>
                  <th className="p-2 font-medium">Queue</th>
                  <th className="p-2 font-medium">Answers first</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c, i) => (
                  <tr key={c.key} className="border-t align-top" data-help-cat-row={c.key}>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.labelEn} up`} disabled={!i} onClick={() => move(i, -1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.labelEn} down`} disabled={i === cats.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDownIcon />
                      </Button>
                    </td>
                    <td className="p-2">
                      <Switch checked={c.active} onCheckedChange={(v) => setCat(i, { active: v })} aria-label={`Show ${c.labelEn}`} />
                    </td>
                    <td className="p-2">
                      <span className="flex items-center gap-1">
                        <SupportIcon name={c.icon} className="size-4 text-muted-foreground" />
                        <select className="h-8 rounded-md border bg-background px-1 text-xs" value={supportIconKey(c.icon)} onChange={(e) => setCat(i, { icon: e.target.value })} aria-label={`Icon of ${c.labelEn}`}>
                          {Object.entries(SUPPORT_ICONS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td className="space-y-1 p-2">
                      <Input className="h-8 min-w-36" value={c.labelEn} onChange={(e) => setCat(i, { labelEn: e.target.value })} aria-label={`English label of ${c.key}`} />
                      <Input className="h-7 text-xs" value={c.hintEn} onChange={(e) => setCat(i, { hintEn: e.target.value })} placeholder="Short hint" aria-label={`English hint of ${c.key}`} />
                    </td>
                    <td className="space-y-1 p-2">
                      <Input className="h-8 min-w-36" value={c.labelAm} onChange={(e) => setCat(i, { labelAm: e.target.value })} aria-label={`Amharic label of ${c.key}`} />
                      <Input className="h-7 text-xs" value={c.hintAm} onChange={(e) => setCat(i, { hintAm: e.target.value })} placeholder="አጭር ማብራሪያ" aria-label={`Amharic hint of ${c.key}`} />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 min-w-28" list="kb-cats" value={c.kbCategory ?? ""} onChange={(e) => setCat(i, { kbCategory: e.target.value || null })} placeholder={c.selfHelp ? "Most read" : "-"} aria-label={`Article category of ${c.labelEn}`} />
                    </td>
                    <td className="p-2">
                      <select className={sel} value={c.queueId ?? ""} onChange={(e) => setCat(i, { queueId: e.target.value || null })} aria-label={`Queue of ${c.labelEn}`}>
                        <option value="">By keywords</option>
                        {queues.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Switch checked={c.selfHelp} onCheckedChange={(v) => setCat(i, { selfHelp: v })} aria-label={`Show answers first for ${c.labelEn}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setCats([...cats, { key: `custom_${cats.length + 1}`, labelEn: "", labelAm: "", hintEn: "", hintAm: "", icon: "chat", kbCategory: null, queueId: null, selfHelp: true, sort: cats.length + 1, active: true }])}>
              <PlusIcon /> Add a menu item
            </Button>
            <Button size="sm" disabled={busy} onClick={() => save(saveCategoriesAction(cats), "Help menu saved")}>
              {busy && <Loader2Icon className="animate-spin" />} Save the menu
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing rules</CardTitle>
          <CardDescription>Checked from the top; the first rule that fits picks the queue. Leave words empty to match every request of that topic. Finance staff who are agents of a queue see only that queue&apos;s tickets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!rules.length && <p className="text-sm text-muted-foreground">No rules: each request goes to its menu item&apos;s queue, or by the queues&apos; keywords.</p>}
          {rules.map((r, i) => (
            <div key={r.id || i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm" data-help-route={i}>
              <span className="text-xs text-muted-foreground">{i + 1}.</span>
              <select className={sel} value={r.category ?? ""} onChange={(e) => setRule(i, { category: e.target.value || null })} aria-label="Topic">
                <option value="">Any topic</option>
                {cats.map((c) => (
                  <option key={c.key} value={c.key}>
                    <SupportIcon name={c.icon} className="inline size-3.5" /> {c.labelEn}
                  </option>
                ))}
              </select>
              <select className={sel} value={r.channel} onChange={(e) => setRule(i, { channel: e.target.value as HelpRoute["channel"] })} aria-label="Channel">
                {Object.entries(CHANNELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Input className="h-8 w-56" value={r.keywords.join(", ")} onChange={(e) => setRule(i, { keywords: e.target.value.split(",").map((x) => x.trim()) })} placeholder="Words, e.g. refund, telebirr" aria-label="Words" />
              <span className="text-xs text-muted-foreground">to</span>
              <select className={sel} value={r.queueId} onChange={(e) => setRule(i, { queueId: e.target.value })} aria-label="Queue">
                <option value="">Choose a queue</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
              <select className={sel} value={r.priority ?? ""} onChange={(e) => setRule(i, { priority: (e.target.value || null) as HelpRoute["priority"] })} aria-label="Priority">
                <option value="">Normal priority</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
              <span className="ml-auto flex">
                <Button size="icon-xs" variant="ghost" aria-label="Up" disabled={!i} onClick={() => setRules((x) => { const n = [...x]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })}>
                  <ArrowUpIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Remove rule" onClick={() => setRules((x) => x.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </span>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRules([...rules, { id: "", category: null, keywords: [], channel: "any", queueId: queues[0]?.id ?? "", priority: null, sort: rules.length + 1, active: true }])}>
              <PlusIcon /> Add a rule
            </Button>
            <Button size="sm" disabled={busy || rules.some((r) => !r.queueId)} onClick={() => save(saveRoutesAction(rules.map((r) => ({ ...r, keywords: r.keywords.filter(Boolean) }))), "Routing rules saved")}>
              {busy && <Loader2Icon className="animate-spin" />} Save the rules
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type Health = { connected: false } | { connected: true; bot: string | null; reachable: boolean; url: string | null; pending: number; lastError: string | null; buttons: boolean; miniApp: boolean };

export function TelegramSetup({ texts, categories, health: first, admin }: { texts: TelegramTexts; categories: HelpCategory[]; health: Health; admin: boolean }) {
  const { busy, save } = useSave();
  const [x, setX] = React.useState(texts);
  const [health, setHealth] = React.useState(first);
  const [checking, setChecking] = React.useState(false);
  const say = (en: string, am: string) => (x.lang === "en" ? en : x.lang === "am" ? am : `${en}\n${am}`);
  const cats = categories.filter((c) => c.active);
  const check = async () => {
    setChecking(true);
    const r = await telegramHealthAction();
    setChecking(false);
    if (r.ok && r.data) setHealth(r.data as Health);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]" data-telegram-setup>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Admin connects the bot with its token in Settings. Here you see whether Telegram reaches this site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-telegram-health>
            {!health.connected ? (
              <p className="text-muted-foreground">Not connected yet. Admin pastes the token from @BotFather on the Settings tab.</p>
            ) : (
              <>
                <p>
                  Bot <b>@{health.bot}</b> · {health.reachable ? "Telegram answers" : "Telegram did not answer"}
                </p>
                <ul className="space-y-1">
                  <Line ok={!!health.url} text={health.url ? `Webhook: ${health.url.replace(/\/telegram\/.+$/, "/telegram/…")}` : "No webhook set"} />
                  <Line ok={health.buttons} text={health.buttons ? "Menu buttons are delivered" : "Menu buttons are not delivered yet: press Update the bot"} />
                  <Line ok={health.miniApp} text={health.miniApp ? "The help center opens inside Telegram" : "The help center needs a public https address to open inside Telegram"} />
                  <Line ok={!health.lastError} text={health.lastError ? `Last error: ${health.lastError}` : "No delivery errors"} />
                  <Line ok={health.pending < 20} text={`${health.pending} updates waiting`} />
                </ul>
              </>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}>
                {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Check
              </Button>
              {admin && health.connected && (
                <Button size="sm" disabled={busy} onClick={async () => { await save(refreshTelegramAction(), "Bot updated: webhook, buttons and menu"); await check(); }}>
                  Update the bot
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What the bot says</CardTitle>
            <CardDescription>The buttons are the help menu (Help menu and routing tab). {"{number}"} becomes the request number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Label>Language</Label>
              <select className={sel} value={x.lang} onChange={(e) => setX({ ...x, lang: e.target.value as TelegramTexts["lang"] })} aria-label="Bot language">
                <option value="both">English and Amharic</option>
                <option value="en">English</option>
                <option value="am">Amharic</option>
              </select>
              <label className="flex items-center gap-2">
                <Switch checked={x.miniApp} onCheckedChange={(v) => setX({ ...x, miniApp: v })} /> Help center button (Mini App)
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={x.askPhone} onCheckedChange={(v) => setX({ ...x, askPhone: v })} /> Ask to share the phone number
              </label>
            </div>
            {(
              [
                ["welcome", "welcomeAm", "Welcome (with the menu)"],
                ["ask", "askAm", "After choosing a topic"],
                ["thanks", "thanksAm", "When a request is opened"],
              ] as const
            ).map(([en, amk, l]) => (
              <div key={en} className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`tg-${en}`}>{l} · English</Label>
                  <Textarea id={`tg-${en}`} rows={2} value={x[en]} onChange={(e) => setX({ ...x, [en]: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tg-${amk}`}>{l} · Amharic</Label>
                  <Textarea id={`tg-${amk}`} rows={2} value={x[amk]} onChange={(e) => setX({ ...x, [amk]: e.target.value })} />
                </div>
              </div>
            ))}
            <Button size="sm" disabled={busy} onClick={() => save(saveTelegramTextsAction(x), "Bot texts saved")}>
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
          </CardContent>
        </Card>
      </div>
      {/* A live preview of the chat, as the customer sees it. */}
      <div className="rounded-2xl border bg-[#d9e7ef] p-3 text-sm dark:bg-[#0e1621]" data-telegram-preview>
        <p className="mb-2 text-center text-xs text-muted-foreground">Preview</p>
        <div className="space-y-2">
          <div className="ml-auto w-fit rounded-xl rounded-br-sm bg-[#effdde] px-3 py-1.5 dark:bg-[#2b5278]">/start</div>
          <div className="w-fit max-w-[90%] rounded-xl rounded-bl-sm bg-background px-3 py-1.5 whitespace-pre-line">{say(x.welcome, x.welcomeAm)}</div>
          <div className="grid grid-cols-2 gap-1">
            {cats.map((c) => (
              <span key={c.key} className="truncate rounded-md bg-background/70 px-2 py-1.5 text-center text-xs">
                {x.lang === "am" ? c.labelAm : x.lang === "en" ? c.labelEn : `${c.labelEn} · ${c.labelAm}`}
              </span>
            ))}
            {x.miniApp && <span className="col-span-2 rounded-md bg-background/70 px-2 py-1.5 text-center text-xs">{x.lang === "am" ? "የእርዳታ ማዕከል" : "Open the help center"}</span>}
          </div>
          <div className="ml-auto w-fit rounded-xl rounded-br-sm bg-[#effdde] px-3 py-1.5 dark:bg-[#2b5278]">{cats[4] ? (x.lang === "am" ? cats[4].labelAm : cats[4].labelEn) : "Payments"}</div>
          <div className="w-fit max-w-[90%] rounded-xl rounded-bl-sm bg-background px-3 py-1.5 whitespace-pre-line">{say(x.ask, x.askAm)}</div>
          <div className="w-fit max-w-[90%] rounded-xl rounded-bl-sm bg-background px-3 py-1.5 whitespace-pre-line">{say(x.thanks, x.thanksAm).replaceAll("{number}", "1042")}</div>
        </div>
      </div>
    </div>
  );
}

function Line({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={cn("flex items-start gap-1.5", !ok && "text-[var(--st-paused-fg)]")}>
      {ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#188038]" /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />} {text}
    </li>
  );
}

type ReportRow = { name: string; tickets: number; solved: number; late: number; firstResponseMin: number | null; resolveMin: number | null; rating: number | null };
const dur = (m: number | null) => (m == null ? "-" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 144) / 10} d`);

export function CategoryReport({ r }: { r: { total: number; byCategory: ReportRow[]; byChannel: ReportRow[]; byQueue: ReportRow[] } }) {
  const [by, setBy] = React.useState<"byCategory" | "byChannel" | "byQueue">("byCategory");
  const rows = r[by];
  return (
    <Card data-category-report>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Requests by topic, channel and queue</CardTitle>
          <CardDescription>{r.total} requests opened in the range. Times are averages from opening.</CardDescription>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["byCategory", "Topic"],
              ["byChannel", "Channel"],
              ["byQueue", "Queue"],
            ] as const
          ).map(([k, l]) => (
            <Button key={k} size="sm" variant={by === k ? "default" : "outline"} onClick={() => setBy(k)}>
              {l}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{by === "byCategory" ? "Topic" : by === "byChannel" ? "Channel" : "Queue"}</th>
                <th className="p-2 text-right font-medium">Requests</th>
                <th className="p-2 text-right font-medium">Solved</th>
                <th className="p-2 text-right font-medium">Late</th>
                <th className="p-2 text-right font-medium">First answer</th>
                <th className="p-2 text-right font-medium">Solved in</th>
                <th className="p-2 text-right font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((x) => (
                <tr key={x.name} className="border-t">
                  <td className="p-2">{x.name}</td>
                  <td className="p-2 text-right">{x.tickets}</td>
                  <td className="p-2 text-right">{x.solved}</td>
                  <td className={cn("p-2 text-right", x.late > 0 && "text-[var(--st-paused-fg)]")}>{x.late}</td>
                  <td className="p-2 text-right">{dur(x.firstResponseMin)}</td>
                  <td className="p-2 text-right">{dur(x.resolveMin)}</td>
                  <td className="p-2 text-right">{x.rating ?? "-"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    No requests in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
