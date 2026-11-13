"use client";

// The Telegram bot manager (Customer support, Bot manager): pick a bot, then its content library with sends now or
// on a schedule, forms and surveys with their results, the feedback inbox, and the bot's own texts and menu.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BotIcon, CalendarClockIcon, FileIcon, FileTextIcon, ImageIcon, LinkIcon, Loader2Icon, PlusIcon, SendIcon, Trash2Icon, VideoIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/bot-manager";
import type { BotForm, BotRow, ContentItem, Feedback, Push, Question } from "@/server/bot-manager";
import type { TelegramTexts } from "@/server/support-channels";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "content", label: "Content" },
  { key: "forms", label: "Forms and surveys" },
  { key: "feedback", label: "Feedback" },
  { key: "settings", label: "Bot settings" },
] as const;
const sel = "h-8 rounded-md border bg-background px-2 text-sm";
const KIND_ICON = { video: VideoIcon, pdf: FileTextIcon, document: FileIcon, image: ImageIcon, link: LinkIcon } as const;
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const go = async <T,>(key: string, p: () => Promise<{ ok: boolean; error?: string; data?: T }>, msg?: string) => {
    setBusy(key);
    const r = await p();
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (msg) toast.success(msg);
    router.refresh();
    return r;
  };
  return { busy, go };
}

export type BotManagerProps = {
  bots: BotRow[];
  bot: string;
  section: string;
  content: ContentItem[];
  pushes: Push[];
  forms: BotForm[];
  feedback: Feedback[];
  fstatus: string;
  texts: TelegramTexts | null;
  results: Awaited<ReturnType<typeof import("@/server/bot-manager").formResults>> | null;
  resultsId: string | null;
};

export function BotManager(p: BotManagerProps) {
  if (!p.bots.length)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No bots yet</CardTitle>
          <CardDescription>Connect the default bot on the Telegram tab, or a system&apos;s own bot on Connected systems. It then appears here.</CardDescription>
        </CardHeader>
      </Card>
    );
  const href = (q: Record<string, string>) => `/support?${new URLSearchParams({ tab: "bots", bot: p.bot, section: p.section, ...q })}`;
  return (
    <div className="space-y-4" data-bot-manager>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bots">
        {p.bots.map((b) => (
          <Link key={b.key} href={`/support?tab=bots&bot=${b.key}&section=${p.section}`} data-bot={b.key} className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm", b.key === p.bot ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted")}>
            <BotIcon className="size-4 text-muted-foreground" aria-hidden />
            <span>{b.name}</span>
            {b.username && <span className="text-muted-foreground">@{b.username}</span>}
            <span className="text-xs text-muted-foreground">{b.subscribers} subscribers</span>
            {b.newFeedback > 0 && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{b.newFeedback} new</span>}
          </Link>
        ))}
      </div>
      <div className="flex gap-1 border-b">
        {SECTIONS.map((s) => (
          <Link key={s.key} href={href({ section: s.key })} data-section={s.key} className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", p.section === s.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {s.label}
          </Link>
        ))}
      </div>
      {p.section === "content" && <ContentSection bot={p.bot} content={p.content} pushes={p.pushes} />}
      {p.section === "forms" && <FormsSection bot={p.bot} forms={p.forms} results={p.results} resultsId={p.resultsId} href={href} />}
      {p.section === "feedback" && <FeedbackSection feedback={p.feedback} status={p.fstatus} href={href} />}
      {p.section === "settings" && p.texts && <SettingsSection key={p.bot} bot={p.bot} texts={p.texts} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SendControls({ bot, target, label }: { bot: string; target: { contentId?: string; formId?: string }; label: string }) {
  const { busy, go } = useRun();
  const [at, setAt] = React.useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={!!busy} data-send-now onClick={() => confirm(`Send "${label}" to every subscriber now?`) && go("now", () => A.schedulePushAction(bot, target), "Sent")}>
        {busy === "now" ? <Loader2Icon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />} Send now
      </Button>
      <Input type="datetime-local" aria-label={`When to send ${label}`} className="h-8 w-auto" value={at} onChange={(e) => setAt(e.target.value)} />
      <Button size="sm" variant="outline" disabled={!at || !!busy} data-schedule onClick={() => go("at", () => A.schedulePushAction(bot, { ...target, sendAt: new Date(at).toISOString() }), "Scheduled").then((r) => r && setAt(""))}>
        <CalendarClockIcon className="size-3.5" /> Schedule
      </Button>
    </div>
  );
}

function ContentSection({ bot, content, pushes }: { bot: string; content: ContentItem[]; pushes: Push[] }) {
  const router = useRouter();
  const { busy, go } = useRun();
  const [title, setTitle] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const add = async () => {
    if (file) {
      if (file.size > 20 * 1048576) return void toast.error("The file is larger than 20 MB. Upload it to YouTube or a drive and add the link instead.");
      setUploading(true);
      const q = new URLSearchParams({ bot, title, caption, name: file.name });
      const r = await fetch(`/api/support/bot-content?${q}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }).then((x) => x.json().catch(() => ({ error: "Upload failed" })));
      setUploading(false);
      if (r.error) return void toast.error(r.error);
    } else {
      const r = await go("add", () => A.saveLinkContentAction(bot, { title, caption, url }));
      if (!r) return;
    }
    toast.success("Added");
    setTitle("");
    setCaption("");
    setUrl("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add content</CardTitle>
          <CardDescription>A video, PDF, document or image up to 20 MB, or a link (a YouTube video, a drive folder). Customers open it from Resources in the bot&apos;s menu, and you can send it to every subscriber.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bc-title">Title</Label>
            <Input id="bc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How to reset your password" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bc-url">Link</Label>
            <Input id="bc-url" value={url} disabled={!!file} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/..." />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="bc-caption">Caption</Label>
            <Textarea id="bc-caption" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Input ref={fileRef} type="file" aria-label="File" data-content-file className="w-auto" accept="video/*,image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <span className="text-xs text-muted-foreground">{size(file.size)}</span>}
            <Button size="sm" disabled={!title.trim() || (!file && !url.trim()) || uploading || !!busy} onClick={add} data-add-content>
              {uploading || busy === "add" ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />} Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!content.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
          {content.map((c) => {
            const Icon = KIND_ICON[c.kind];
            return (
              <div key={c.id} data-content-item={c.title} className={cn("flex flex-wrap items-center gap-3 rounded-md border p-2", !c.active && "opacity-60")}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.kind === "link" ? c.url : (
                      <a className="underline" href={`/api/support/bot-file/${c.id}`} target="_blank" rel="noreferrer">
                        {c.fileName}
                      </a>
                    )}
                    {c.kind !== "link" && ` · ${size(c.size)}`} · opened or sent {c.sends} times{!c.active && " · hidden from the menu"}
                  </div>
                </div>
                <SendControls bot={bot} target={{ contentId: c.id }} label={c.title} />
                <div className="flex items-center gap-1.5 text-xs">
                  <Switch checked={c.active} aria-label={`Show ${c.title} in the menu`} onCheckedChange={(v) => go(`a${c.id}`, () => A.saveLinkContentAction(bot, { id: c.id, title: c.title, caption: c.caption, active: v }))} />
                  In menu
                </div>
                <Button size="icon" variant="ghost" aria-label={`Remove ${c.title}`} onClick={() => confirm(`Remove "${c.title}"?`) && go(`d${c.id}`, () => A.deleteContentAction(c.id), "Removed")}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message to every subscriber</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={3} aria-label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="New lessons for grade 6 are out." />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!msg.trim() || !!busy} onClick={() => confirm("Send this message to every subscriber now?") && go("msg", () => A.schedulePushAction(bot, { message: msg }), "Sent").then((r) => r && setMsg(""))}>
              <SendIcon className="size-3.5" /> Send now
            </Button>
            <MessageSchedule bot={bot} msg={msg} onDone={() => setMsg("")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sends</CardTitle>
          <CardDescription>Scheduled sends go out within a minute of their time. People who blocked the bot are left out.</CardDescription>
        </CardHeader>
        <CardContent>
          {!pushes.length ? (
            <p className="text-sm text-muted-foreground">No sends yet.</p>
          ) : (
            <table className="w-full text-sm" data-pushes>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">What</th>
                  <th className="font-normal">When</th>
                  <th className="font-normal">Status</th>
                  <th className="font-normal">Delivered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pushes.map((s) => (
                  <tr key={s.id} className="border-t" data-push={s.status}>
                    <td className="py-1.5">{s.what}</td>
                    <td>{when(s.sentAt ?? s.sendAt)}</td>
                    <td className="capitalize">{s.status}</td>
                    <td>{s.status === "sent" ? `${s.sent}${s.failed ? `, ${s.failed} failed` : ""}` : "-"}</td>
                    <td className="text-right">
                      {s.status === "scheduled" && (
                        <Button size="sm" variant="ghost" onClick={() => go(`c${s.id}`, () => A.cancelPushAction(s.id), "Cancelled")}>
                          <XIcon className="size-3.5" /> Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MessageSchedule({ bot, msg, onDone }: { bot: string; msg: string; onDone: () => void }) {
  const { busy, go } = useRun();
  const [at, setAt] = React.useState("");
  return (
    <>
      <Input type="datetime-local" aria-label="When to send the message" className="h-8 w-auto" value={at} onChange={(e) => setAt(e.target.value)} />
      <Button size="sm" variant="outline" disabled={!msg.trim() || !at || !!busy} onClick={() => go("at", () => A.schedulePushAction(bot, { message: msg, sendAt: new Date(at).toISOString() }), "Scheduled").then((r) => r && (setAt(""), onDone()))}>
        <CalendarClockIcon className="size-3.5" /> Schedule
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------

type Draft = { id?: string; kind: "form" | "survey"; title: string; intro: string; questions: (Question & { optionsText: string })[]; active: boolean };
const blankQ = (): Draft["questions"][number] => ({ text: "", type: "text", options: [], optionsText: "", required: true });
const toDraft = (f?: BotForm): Draft => (f ? { id: f.id, kind: f.kind, title: f.title, intro: f.intro ?? "", active: f.active, questions: f.questions.map((q) => ({ ...q, optionsText: q.options.join(", ") })) } : { kind: "survey", title: "", intro: "", active: true, questions: [blankQ()] });

function FormsSection({ bot, forms, results, resultsId, href }: { bot: string; forms: BotForm[]; results: BotManagerProps["results"]; resultsId: string | null; href: (q: Record<string, string>) => string }) {
  const { busy, go } = useRun();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const setQ = (i: number, patch: Partial<Draft["questions"][number]>) => setDraft((d) => d && { ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const save = async () => {
    if (!draft) return;
    const r = await go("save", () => A.saveFormAction(bot, { id: draft.id, kind: draft.kind, title: draft.title, intro: draft.intro, active: draft.active, questions: draft.questions.map((q) => ({ text: q.text, type: q.type, required: q.required, options: q.optionsText.split(",").map((o) => o.trim()) })) }), "Saved");
    if (r) setDraft(null);
  };
  return (
    <div className="space-y-4">
      {!draft && (
        <Button size="sm" onClick={() => setDraft(toDraft())} data-new-form>
          <PlusIcon className="size-3.5" /> New form or survey
        </Button>
      )}
      {draft && (
        <Card data-form-editor>
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? "Edit" : "New"} {draft.kind}</CardTitle>
            <CardDescription>Customers answer in the chat one question at a time. A choice or rating question shows buttons.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="bf-title">Title</Label>
                <Input id="bf-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bf-kind">Kind</Label>
                <select id="bf-kind" className={cn(sel, "h-9 w-full")} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                  <option value="survey">Survey</option>
                  <option value="form">Form</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bf-intro">Introduction</Label>
              <Textarea id="bf-intro" rows={2} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
            </div>
            {draft.questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded-md border p-2" data-question={i}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <Input className="min-w-48 flex-1" aria-label={`Question ${i + 1}`} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                  <select className={sel} aria-label={`Answer type ${i + 1}`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value as Question["type"] })}>
                    <option value="text">Written answer</option>
                    <option value="choice">Choice</option>
                    <option value="rating">Rating 1 to 5</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required
                  </label>
                  <Button size="icon" variant="ghost" aria-label={`Remove question ${i + 1}`} disabled={draft.questions.length < 2} onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
                {q.type === "choice" && <Input aria-label={`Choices ${i + 1}`} placeholder="Choices, separated by commas" value={q.optionsText} onChange={(e) => setQ(i, { optionsText: e.target.value })} />}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={draft.questions.length >= 20} onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQ()] })}>
                <PlusIcon className="size-3.5" /> Question
              </Button>
              <label className="flex items-center gap-1.5 text-sm">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} aria-label="Open for answers" /> Open for answers
              </label>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!draft.title.trim() || busy === "save"} onClick={save} data-save-form>
                {busy === "save" && <Loader2Icon className="size-3.5 animate-spin" />} Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!forms.length && !draft && <p className="text-sm text-muted-foreground">No forms yet. Customers see Forms and surveys in the bot&apos;s menu once one is open.</p>}
      {forms.map((f) => (
        <Card key={f.id} data-form={f.title}>
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {f.title} <span className="text-xs font-normal text-muted-foreground capitalize">{f.kind}{!f.active && ", closed"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {f.questions.length} questions · {f.responses} answered{f.started > f.responses ? `, ${f.started - f.responses} unfinished` : ""}
              </div>
            </div>
            {f.active && <SendControls bot={bot} target={{ formId: f.id }} label={f.title} />}
            <Button size="sm" variant="outline" asChild>
              <Link href={href({ form: f.id })} data-results>
                Results
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(f))}>
              Edit
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${f.title}`} onClick={() => confirm(`Remove "${f.title}" and all its answers?`) && go(`d${f.id}`, () => A.deleteFormAction(f.id), "Removed")}>
              <Trash2Icon className="size-4" />
            </Button>
          </CardContent>
        </Card>
      ))}

      {results && resultsId && <Results r={results} />}
    </div>
  );
}

function Results({ r }: { r: NonNullable<BotManagerProps["results"]> }) {
  return (
    <Card data-form-results>
      <CardHeader>
        <CardTitle className="text-base">Results: {r.title}</CardTitle>
        <CardDescription>{r.responses.length} finished responses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {r.summary.map((s, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-sm font-medium">
              {i + 1}. {s.question} <span className="text-xs font-normal text-muted-foreground">{s.answered} answers{"average" in s && s.average !== null ? `, average ${s.average}` : ""}</span>
            </div>
            {"counts" in s &&
              s.counts!.map((c) => {
                const max = Math.max(1, ...s.counts!.map((x) => x.n));
                return (
                  <div key={c.option} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-xs" title={`${c.option}: ${c.n}`}>
                    <span className="truncate">{c.option}</span>
                    <span className="h-3 rounded-sm bg-muted">
                      <span className="block h-3 rounded-sm bg-primary" style={{ width: `${(c.n / max) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{c.n}</span>
                  </div>
                );
              })}
          </div>
        ))}
        {!!r.responses.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-normal">Who</th>
                  <th className="pr-2 font-normal">When</th>
                  {r.questions.map((q, i) => (
                    <th key={i} className="pr-2 font-normal">
                      {i + 1}. {q.text.slice(0, 30)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.responses.map((x) => (
                  <tr key={x.id} className="border-t align-top" data-response>
                    <td className="py-1 pr-2">
                      {x.name}
                      {x.phone && <div className="text-muted-foreground">{x.phone}</div>}
                    </td>
                    <td className="pr-2 whitespace-nowrap">{when(x.at)}</td>
                    {r.questions.map((_, i) => (
                      <td key={i} className="pr-2">
                        {x.answers[i] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const FB_STATUS = [
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "escalated", label: "Escalated" },
  { key: "all", label: "All" },
];

function FeedbackSection({ feedback, status, href }: { feedback: Feedback[]; status: string; href: (q: Record<string, string>) => string }) {
  const { busy, go } = useRun();
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {FB_STATUS.map((s) => (
          <Link key={s.key} href={href({ fstatus: s.key })} data-fstatus={s.key} className={cn("rounded-md border px-2.5 py-1 text-sm", status === s.key ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted")}>
            {s.label}
          </Link>
        ))}
      </div>
      {!feedback.length && <p className="text-sm text-muted-foreground">No feedback here. Customers send it with Send feedback in the bot&apos;s menu or /feedback.</p>}
      {feedback.map((f) => (
        <Card key={f.id} data-feedback={f.status}>
          <CardContent className="space-y-2 p-3">
            <p className="text-sm whitespace-pre-wrap">{f.body}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {f.customer}
                {f.phone && ` · ${f.phone}`} · {when(f.createdAt)}
              </span>
              <span className="rounded border px-1.5 capitalize">{f.status}</span>
              <span className="flex-1" />
              {f.status === "escalated" && f.ticketId ? (
                <Link className="text-primary underline" href={`/support?ticket=${f.ticketId}`}>
                  Ticket #{f.ticketNumber}
                </Link>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go(`s${f.id}`, () => A.setFeedbackStatusAction(f.id, f.status === "new" ? "reviewed" : "new"), f.status === "new" ? "Marked reviewed" : "Marked new")}>
                    {f.status === "new" ? "Mark reviewed" : "Mark new"}
                  </Button>
                  <Button size="sm" disabled={!!busy} data-escalate onClick={() => go(`e${f.id}`, () => A.escalateFeedbackAction(f.id), "Ticket opened")}>
                    {busy === `e${f.id}` && <Loader2Icon className="size-3.5 animate-spin" />} Escalate to ticket
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

const TEXT_FIELDS: { key: keyof TelegramTexts; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "welcomeAm", label: "Welcome (Amharic)" },
  { key: "ask", label: "Ask for the question" },
  { key: "askAm", label: "Ask for the question (Amharic)" },
  { key: "thanks", label: "Request received ({number} is its number)" },
  { key: "thanksAm", label: "Request received (Amharic)" },
  { key: "feedbackAsk", label: "Ask for feedback" },
  { key: "feedbackAskAm", label: "Ask for feedback (Amharic)" },
  { key: "feedbackThanks", label: "Feedback received" },
  { key: "feedbackThanksAm", label: "Feedback received (Amharic)" },
];
const SWITCHES: { key: "resources" | "surveys" | "feedback" | "callback" | "askPhone"; label: string }[] = [
  { key: "resources", label: "Resources button (the content library)" },
  { key: "surveys", label: "Forms and surveys button" },
  { key: "feedback", label: "Send feedback button" },
  { key: "callback", label: "Call me back button (a call-back request in the call center)" },
  { key: "askPhone", label: "Ask for the phone number before a question" },
];

function SettingsSection({ bot, texts }: { bot: string; texts: TelegramTexts }) {
  const { busy, go } = useRun();
  const [x, setX] = React.useState(texts);
  return (
    <Card data-bot-settings>
      <CardHeader>
        <CardTitle className="text-base">What this bot says</CardTitle>
        <CardDescription>{bot === "default" ? "The default support bot. Connected systems' bots use these until they have their own." : "This system's bot. Until saved here it uses the default bot's texts."} The help categories come from Help menu and routing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="bs-lang">Language</Label>
          <select id="bs-lang" className={cn(sel, "h-9")} value={x.lang} onChange={(e) => setX({ ...x, lang: e.target.value as TelegramTexts["lang"] })}>
            <option value="both">English and Amharic</option>
            <option value="en">English</option>
            <option value="am">Amharic</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`bs-${f.key}`}>{f.label}</Label>
              <Textarea id={`bs-${f.key}`} rows={2} value={String(x[f.key])} onChange={(e) => setX({ ...x, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {SWITCHES.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <Switch checked={x[s.key]} onCheckedChange={(v) => setX({ ...x, [s.key]: v })} aria-label={s.label} /> {s.label}
            </label>
          ))}
        </div>
        <Button size="sm" disabled={busy === "save"} data-save-bot-settings onClick={() => go("save", () => A.saveBotTextsAction(bot, x), "Saved")}>
          {busy === "save" && <Loader2Icon className="size-3.5 animate-spin" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}
