"use client";

// Knowledge base (Update 1.1): help articles and step-by-step how-to guides with YouTube videos. Filters, select
// several and act on them (leads), import from CSV, JSON, Markdown or a ZIP with a preview first, and export.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, DownloadIcon, PlusIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/support-desk";
import type { FullArticle, ImportLine } from "@/server/kb-guides";

const select = "h-9 rounded-md border bg-background px-2 text-sm";
type Filters = { q: string; status: string; category: string; kind: string };
type VideoField = { url: string; checked: { id: string; title: string | null } | null; error: string | null };
type Draft = { id: string | null; kind: "article" | "guide"; title: string; intro: string; category: string; keywords: string; published: boolean; video: VideoField; steps: { title: string; body: string; video: VideoField }[] };

const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const vf = (v: { id: string; title: string | null } | null): VideoField => ({ url: v ? ytUrl(v.id) : "", checked: v, error: null });
const blankStep = () => ({ title: "", body: "", video: vf(null) });

function draftOf(a: FullArticle | null, kind: "article" | "guide"): Draft {
  if (!a) return { id: null, kind, title: "", intro: "", category: "", keywords: "", published: false, video: vf(null), steps: kind === "guide" ? [blankStep(), blankStep()] : [] };
  return { id: a.id, kind: a.kind, title: a.title, intro: a.kind === "guide" ? a.intro : a.body, category: a.category ?? "", keywords: a.keywords, published: a.published, video: vf(a.video), steps: a.steps.map((s) => ({ title: s.title, body: s.body, video: vf(s.video) })) };
}

// A YouTube link with a Check button: shows the thumbnail and title YouTube gives, or why it cannot be used.
function VideoInput({ v, onChange, label }: { v: VideoField; onChange: (v: VideoField) => void; label: string }) {
  const [busy, setBusy] = React.useState(false);
  const check = async () => {
    setBusy(true);
    const r = await A.checkVideoAction(v.url);
    setBusy(false);
    if (!r.ok) return void onChange({ ...v, checked: null, error: r.error ?? "Could not check." });
    const d = r.data as { ok: true; video: { id: string; title: string | null } } | { ok: false; error: string };
    onChange(d.ok ? { ...v, checked: d.video, error: null } : { ...v, checked: null, error: d.error });
  };
  return (
    <div className="space-y-1" data-video-input={label}>
      <div className="flex gap-2">
        <Input aria-label={label} placeholder="YouTube link (optional), e.g. https://youtu.be/..." value={v.url} onChange={(e) => onChange({ url: e.target.value, checked: null, error: null })} />
        <Button type="button" size="sm" variant="outline" disabled={busy || !v.url.trim()} onClick={check}>
          Check
        </Button>
      </div>
      {v.error && <p className="text-xs text-destructive">{v.error}</p>}
      {v.checked && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-video-ok={v.checked.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${v.checked.id}/default.jpg`} alt="" className="h-9 w-12 rounded object-cover" />
          <CheckCircle2Icon className="size-3.5 text-emerald-600" aria-hidden />
          <span className="truncate">{v.checked.title ?? "Video found"}</span>
        </div>
      )}
    </div>
  );
}

function Editor({ d0, lead, onClose }: { d0: Draft; lead: boolean; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = React.useState(d0);
  const [busy, setBusy] = React.useState(false);
  const setStep = (i: number, patch: Partial<Draft["steps"][number]>) => setD({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, by: number) => {
    const s = [...d.steps];
    const [x] = s.splice(i, 1);
    s.splice(i + by, 0, x!);
    setD({ ...d, steps: s });
  };
  // A checked video goes as the id (no second check); an unchecked link is checked by the server.
  const vid = (v: VideoField) => (v.checked && v.url === ytUrl(v.checked.id) ? { video: v.checked, videoUrl: null } : { video: null, videoUrl: v.checked ? null : v.url.trim() || null });
  const save = async () => {
    setBusy(true);
    const r = await A.saveKbArticleAction({
      id: d.id,
      kind: d.kind,
      title: d.title,
      intro: d.intro,
      body: d.intro,
      category: d.category,
      keywords: d.keywords,
      published: d.published,
      videoUrl: d.kind === "article" ? (d.video.checked ? ytUrl(d.video.checked.id) : d.video.url.trim() || null) : null,
      steps: d.kind === "guide" ? d.steps.map((s) => ({ title: s.title, body: s.body, ...vid(s.video) })) : [],
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Could not save.");
    toast.success(d.kind === "guide" ? "Guide saved" : "Article saved");
    onClose();
    router.refresh();
  };
  return (
    <Card className="border-primary/40" data-article-form={d.kind}>
      <CardHeader>
        <CardTitle className="text-base">{d.id ? "Edit" : "New"} {d.kind === "guide" ? "how-to guide" : "article"}</CardTitle>
        <CardDescription>Text can use **bold**, *italics*, [links](https://...) and lists starting with "- " or "1. ".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input aria-label="Article title" placeholder={d.kind === "guide" ? "How to pay your school fees in the app" : "How do I reset my password?"} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Category" placeholder="Category, e.g. Account" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
          <Input aria-label="Keywords" placeholder="Other words people use: login, sign in, forgot" value={d.keywords} onChange={(e) => setD({ ...d, keywords: e.target.value })} />
        </div>
        <Textarea aria-label={d.kind === "guide" ? "Introduction" : "Answer"} className={d.kind === "guide" ? "min-h-20" : "min-h-40"} placeholder={d.kind === "guide" ? "What this guide helps with (optional)" : "The answer"} value={d.intro} onChange={(e) => setD({ ...d, intro: e.target.value })} />
        {d.kind === "article" && <VideoInput label="Video" v={d.video} onChange={(video) => setD({ ...d, video })} />}
        {d.kind === "guide" && (
          <ol className="space-y-3" data-steps>
            {d.steps.map((s, i) => (
              <li key={i} className="space-y-2 rounded-lg border p-3" data-step={i + 1}>
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{i + 1}</span>
                  <Input aria-label={`Step ${i + 1} title`} placeholder="What to do, e.g. Open the Payments page" value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move step ${i + 1} down`} disabled={i === d.steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })}>
                    <XIcon />
                  </Button>
                </div>
                <Textarea aria-label={`Step ${i + 1} text`} className="min-h-16" placeholder="Details (optional)" value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} />
                <VideoInput label={`Step ${i + 1} video`} v={s.video} onChange={(video) => setStep(i, { video })} />
              </li>
            ))}
            <Button type="button" size="sm" variant="outline" disabled={d.steps.length >= 40} onClick={() => setD({ ...d, steps: [...d.steps, blankStep()] })}>
              <PlusIcon /> Add step
            </Button>
          </ol>
        )}
        {lead && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.published} onChange={(e) => setD({ ...d, published: e.target.checked })} /> Published (customers see it)
          </label>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !d.title.trim()} onClick={save}>
            {busy ? "Checking videos and saving..." : d.kind === "guide" ? "Save guide" : "Save article"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ImportResult = { preview: boolean; created: number; updated: number; skipped: number; lines: ImportLine[] };

function ImportCard() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [publish, setPublish] = React.useState("");
  const [res, setRes] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const send = async (preview: boolean) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return void toast.error("The file is larger than 5 MB.");
    setBusy(true);
    const q = new URLSearchParams({ name: file.name, ...(preview ? { preview: "1" } : {}), ...(publish ? { publish } : {}) });
    const r = await fetch(`/api/support/kb/import?${q}`, { method: "POST", body: file }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({ error: "Import failed" }))) as ImportResult & { error?: string }) : { error: "Could not reach the server." };
    setBusy(false);
    if (!r?.ok || "error" in j) return void toast.error(j.error ?? "Import failed");
    setRes(j);
    if (!preview) {
      toast.success(`Imported: ${j.created} new, ${j.updated} updated${j.skipped ? `, ${j.skipped} skipped` : ""}`);
      router.refresh();
    }
  };
  return (
    <Card data-kb-import>
      <CardHeader>
        <CardTitle className="text-base">Import and export</CardTitle>
        <CardDescription>
          CSV (columns title, body, category, keywords, published, video; for guides step1, step1_video, step2...), JSON (as the export), a Markdown file (&quot;## &quot; starts each step) or a ZIP of them. Up to 500 articles and 5 MB. An article with the same title is updated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            aria-label="Import file"
            accept=".csv,.json,.md,.markdown,.zip,.txt"
            className="w-72"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRes(null);
            }}
          />
          <select aria-label="Publish imported" className={select} value={publish} onChange={(e) => setPublish(e.target.value)}>
            <option value="">Published as in the file</option>
            <option value="1">Publish all</option>
            <option value="0">All as drafts</option>
          </select>
          <Button size="sm" variant="outline" disabled={!file || busy} onClick={() => send(true)}>
            Preview
          </Button>
          <Button size="sm" disabled={!file || busy || !res?.preview || res.created + res.updated === 0} onClick={() => send(false)} data-import-go>
            <UploadIcon /> Import
          </Button>
          <a href="/api/support/kb/export" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" data-kb-export>
            <DownloadIcon className="size-4" /> Export all (JSON)
          </a>
        </div>
        {res && (
          <div className="space-y-2" data-import-result={res.preview ? "preview" : "done"}>
            <p className="font-medium">
              {res.preview ? "Preview: " : "Done: "}
              {res.created} new, {res.updated} updated, {res.skipped} skipped{res.preview && " (videos are checked when you import)"}
            </p>
            <div className="max-h-72 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-1.5">Row</th>
                    <th className="p-1.5">Title</th>
                    <th className="p-1.5">Kind</th>
                    <th className="p-1.5">Category</th>
                    <th className="p-1.5">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {res.lines.map((l, i) => (
                    <tr key={i} className="border-t" data-import-line={l.action}>
                      <td className="p-1.5 text-muted-foreground">{l.source}</td>
                      <td className="p-1.5">{l.title}</td>
                      <td className="p-1.5">{l.kind === "guide" ? `Guide, ${l.steps} steps` : "Article"}</td>
                      <td className="p-1.5">{l.category ?? "-"}</td>
                      <td className={l.error ? "p-1.5 text-destructive" : "p-1.5"}>{l.error ? `Skipped: ${l.error}` : `${l.action === "create" ? "New" : "Update"}${l.published ? ", published" : ", draft"}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function KnowledgeBaseScreen({ list, lead, origin, categories, filters }: { list: FullArticle[]; lead: boolean; origin: string; categories: string[]; filters: Filters }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState<Draft | null>(null);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = React.useState("");
  const [q, setQ] = React.useState(filters.q);
  const [busy, setBusy] = React.useState(false);
  const go = (patch: Partial<Filters>) => {
    const s = new URLSearchParams({ tab: "kb", ...Object.fromEntries(Object.entries({ ...filters, ...patch }).filter(([, v]) => v)) });
    setSel(new Set());
    router.push(`/support?${s}`);
  };
  const ids = list.map((a) => a.id);
  const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
  const bulk = async (action: "publish" | "unpublish" | "delete" | "move") => {
    if (action === "delete" && !confirm(`Delete ${sel.size} article${sel.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy(true);
    const r = await A.bulkKbAction([...sel], action, action === "move" ? moveTo : null);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    const n = (r.data as { changed: number }).changed;
    toast.success(`${n} article${n === 1 ? "" : "s"} ${action === "move" ? "moved" : action === "delete" ? "deleted" : action + "ed"}`);
    setSel(new Set());
    router.refresh();
  };
  return (
    <div className="space-y-4" data-kb>
      {edit && <Editor key={edit.id ?? `new-${edit.kind}`} d0={edit} lead={lead} onClose={() => setEdit(null)} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Knowledge base</CardTitle>
          <CardDescription>Answers and how-to guides customers find in the app, the help center and the Telegram bot before asking. Agents write drafts; leads publish.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go({ q });
              }}
            >
              <Input aria-label="Search articles" placeholder="Search" className="w-48" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <select aria-label="Status" className={select} value={filters.status} onChange={(e) => go({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
            <select aria-label="Kind" className={select} value={filters.kind} onChange={(e) => go({ kind: e.target.value })}>
              <option value="">Articles and guides</option>
              <option value="article">Articles</option>
              <option value="guide">How-to guides</option>
            </select>
            <select aria-label="Category filter" className={select} value={filters.category} onChange={(e) => go({ category: e.target.value })}>
              <option value="">Any category</option>
              <option value="-">No category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {(filters.q || filters.status || filters.kind || filters.category) && (
              <Link href="/support?tab=kb" className="text-xs text-primary hover:underline" onClick={() => setQ("")}>
                Clear
              </Link>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEdit(draftOf(null, "article"))}>
                <PlusIcon /> New article
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEdit(draftOf(null, "guide"))}>
                <PlusIcon /> New guide
              </Button>
            </div>
          </div>

          {lead && sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2" data-bulk-bar>
              <span className="font-medium">{sel.size} chosen</span>
              <Button size="xs" disabled={busy} onClick={() => bulk("publish")}>
                Publish
              </Button>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => bulk("unpublish")}>
                Unpublish
              </Button>
              <Input aria-label="Move to category" list="kb-cats" placeholder="Category" className="h-7 w-36" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
              <datalist id="kb-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => bulk("move")}>
                Move
              </Button>
              <Button size="xs" variant="destructive" disabled={busy} onClick={() => bulk("delete")}>
                <Trash2Icon /> Delete
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setSel(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {lead && list.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" aria-label="Choose all" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(ids) : new Set())} /> Choose all {list.length}
            </label>
          )}
          {list.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 rounded border p-2" data-article={x.title}>
              {lead && (
                <input
                  type="checkbox"
                  aria-label={`Choose ${x.title}`}
                  checked={sel.has(x.id)}
                  onChange={(e) => {
                    const s = new Set(sel);
                    if (e.target.checked) s.add(x.id);
                    else s.delete(x.id);
                    setSel(s);
                  }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{x.title}</span> {x.category && <span className="text-xs text-muted-foreground">· {x.category}</span>}
                {x.kind === "guide" && <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary">guide · {x.steps.length} steps</span>}
                {(x.video || x.steps.some((s) => s.video)) && <span className="ml-1 rounded bg-muted px-1 text-[10px]">video</span>}
                {!x.published && <span className="ml-1 rounded bg-muted px-1 text-[10px]">draft</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {x.views} reads · {x.helpful} helpful · {x.not_helpful} not
              </span>
              {x.published && (
                <a className="text-xs text-primary hover:underline" href={`${origin}/help/${x.id}`} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
              <Button size="xs" variant="ghost" onClick={() => setEdit(draftOf(x, x.kind))}>
                Edit
              </Button>
            </div>
          ))}
          {!list.length && <p className="text-muted-foreground">{filters.q || filters.status || filters.kind || filters.category ? "Nothing matches these filters." : "No articles yet. Start with the questions customers ask most."}</p>}
        </CardContent>
      </Card>
      {lead && <ImportCard />}
    </div>
  );
}
