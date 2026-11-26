"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, FileDownIcon, ImageIcon, Loader2Icon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFileAction, saveFileAction } from "@/app/actions/tools";
import { FileShelf, type SavedFile } from "@/components/app/tools/file-shelf";
import { exportPowerPoint } from "@/components/app/deck/pptx-export";
import type { Slide, SlideBody } from "@/lib/deck";
import type { DeckTemplate } from "@/lib/deck-templates";
import { cn } from "@/lib/utils";

type Deck = { title: string; subtitle: string; template: string; slides: Slide[] };
const KINDS: { kind: SlideBody["kind"]; label: string }[] = [
  { kind: "section", label: "Section title" },
  { kind: "bullets", label: "Bullet points" },
  { kind: "text", label: "Text" },
  { kind: "columns", label: "Two columns" },
  { kind: "table", label: "Table" },
  { kind: "numbers", label: "Big numbers" },
  { kind: "timeline", label: "Timeline" },
  { kind: "quote", label: "Quote" },
  { kind: "image", label: "Picture" },
  { kind: "closing", label: "Closing" },
];
const key = () => `custom:${Math.random().toString(36).slice(2, 10)}`;

function make(kind: SlideBody["kind"]): Slide {
  const body: SlideBody = (
    {
      section: { kind: "section", subtitle: "" },
      bullets: { kind: "bullets", items: ["First point", "Second point", "Third point"] },
      text: { kind: "text", text: "" },
      columns: { kind: "columns", left: { title: "Before", text: "" }, right: { title: "After", text: "" } },
      table: { kind: "table", columns: ["Item", "Value"], rows: [["", ""]] },
      numbers: { kind: "numbers", items: [{ label: "Measure", value: 0, unit: "" }] },
      timeline: { kind: "timeline", items: [{ date: "Q1", label: "Milestone", done: false }] },
      quote: { kind: "quote", text: "", by: "" },
      image: { kind: "image", src: "", caption: "" },
      closing: { kind: "closing", text: "Thank you", contact: "" },
    } as Record<string, SlideBody>
  )[kind]!;
  return { key: key(), group: "Deck", title: KINDS.find((k) => k.kind === kind)!.label, body, say: "" };
}

const STARTERS: { key: string; label: string; slides: () => Slide[] }[] = [
  { key: "blank", label: "Blank", slides: () => [make("bullets")] },
  {
    key: "update",
    label: "Monthly update",
    slides: () => [
      { ...make("numbers"), title: "This month in numbers", body: { kind: "numbers", items: [{ label: "Delivered", value: 0 }, { label: "In progress", value: 0 }, { label: "Late", value: 0 }] } },
      { ...make("bullets"), title: "Highlights" },
      { ...make("columns"), title: "Plan vs actual", body: { kind: "columns", left: { title: "Planned", text: "" }, right: { title: "Done", text: "" } } },
      { ...make("bullets"), title: "Risks and help needed" },
      { ...make("timeline"), title: "Next month" },
      make("closing"),
    ],
  },
  {
    key: "proposal",
    label: "Proposal",
    slides: () => [
      { ...make("section"), title: "The problem" },
      { ...make("bullets"), title: "What we propose" },
      { ...make("table"), title: "Budget", body: { kind: "table", columns: ["Item", "Cost (ETB)"], rows: [["", ""]] } },
      { ...make("timeline"), title: "Timeline" },
      { ...make("text"), title: "The decision we need" },
      make("closing"),
    ],
  },
  {
    key: "training",
    label: "Training",
    slides: () => [{ ...make("bullets"), title: "Today you will learn" }, { ...make("section"), title: "Part 1" }, { ...make("text"), title: "How it works" }, { ...make("quote"), title: "Remember" }, { ...make("bullets"), title: "Practice" }, make("closing")],
  },
];

// A miniature of the slide in the template's colours (the export draws the full design).
function Thumb({ s, t, title }: { s: Slide; t: DeckTemplate; title?: boolean }) {
  const b = s.body;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded border text-left" style={{ background: title || b.kind === "section" || b.kind === "closing" ? t.colors.primary : t.colors.background, color: title || b.kind === "section" || b.kind === "closing" ? "#fff" : t.colors.text, fontFamily: t.fonts.body }}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: t.colors.primary }} />
      <div className="p-[6%]">
        <p className="truncate text-[min(2.2vw,15px)] font-semibold" style={{ fontFamily: t.fonts.heading }}>
          {s.title}
        </p>
        <div className="mt-1 space-y-0.5 text-[min(1.4vw,10px)] opacity-80">
          {b.kind === "bullets" && b.items.slice(0, 5).map((i, n) => <p key={n} className="truncate">• {i}</p>)}
          {b.kind === "text" && <p className="line-clamp-4">{b.text}</p>}
          {b.kind === "section" && <p>{b.subtitle}</p>}
          {b.kind === "closing" && <p>{b.text}</p>}
          {b.kind === "quote" && <p className="italic">“{b.text}”</p>}
          {b.kind === "numbers" && (
            <div className="flex gap-2">
              {b.items.map((i, n) => (
                <span key={n} className="font-bold" style={{ color: t.colors.primary }}>
                  {i.value}
                  {i.unit}
                </span>
              ))}
            </div>
          )}
          {b.kind === "columns" && (
            <div className="grid grid-cols-2 gap-2">
              <p className="truncate">{b.left.title}</p>
              <p className="truncate">{b.right.title}</p>
            </div>
          )}
          {b.kind === "table" && <p>{b.columns.join(" · ")}</p>}
          {b.kind === "timeline" && <p className="truncate">{b.items.map((i) => i.label).join(" → ")}</p>}
          {b.kind === "image" && (b.src ? <img src={b.src} alt="" className="max-h-16 rounded" /> : <ImageIcon className="size-4" />)}
        </div>
      </div>
    </div>
  );
}

const lines = (v: string) => v.split("\n");

function SlideFields({ s, onChange }: { s: Slide; onChange: (s: Slide) => void }) {
  const b = s.body;
  const body = (nb: SlideBody) => onChange({ ...s, body: nb });
  switch (b.kind) {
    case "section":
      return <Input value={b.subtitle ?? ""} onChange={(e) => body({ ...b, subtitle: e.target.value })} placeholder="Subtitle" aria-label="Subtitle" />;
    case "bullets":
      return <Textarea value={b.items.join("\n")} onChange={(e) => body({ ...b, items: lines(e.target.value).slice(0, 12) })} rows={6} placeholder="One point per line" aria-label="Points" />;
    case "text":
      return <Textarea value={b.text} onChange={(e) => body({ ...b, text: e.target.value })} rows={6} aria-label="Text" />;
    case "quote":
      return (
        <div className="space-y-2">
          <Textarea value={b.text} onChange={(e) => body({ ...b, text: e.target.value })} rows={3} aria-label="Quote" />
          <Input value={b.by ?? ""} onChange={(e) => body({ ...b, by: e.target.value })} placeholder="Who said it" aria-label="By" />
        </div>
      );
    case "closing":
      return (
        <div className="space-y-2">
          <Input value={b.text} onChange={(e) => body({ ...b, text: e.target.value })} aria-label="Closing text" />
          <Input value={b.contact ?? ""} onChange={(e) => body({ ...b, contact: e.target.value })} placeholder="Contact (email, phone)" aria-label="Contact" />
        </div>
      );
    case "columns":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="space-y-1">
              <Input value={b[side].title} onChange={(e) => body({ ...b, [side]: { ...b[side], title: e.target.value } })} aria-label={`${side} title`} />
              <Textarea value={b[side].text} onChange={(e) => body({ ...b, [side]: { ...b[side], text: e.target.value } })} rows={5} aria-label={`${side} text`} />
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="space-y-1">
          <Input value={b.columns.join(" | ")} onChange={(e) => body({ ...b, columns: e.target.value.split("|").map((x) => x.trim()) })} placeholder="Column | Column" aria-label="Columns, separated by |" />
          <Textarea value={b.rows.map((r) => r.join(" | ")).join("\n")} onChange={(e) => body({ ...b, rows: lines(e.target.value).slice(0, 15).map((l) => l.split("|").map((x) => x.trim())) })} rows={6} placeholder="One row per line, cells separated by |" aria-label="Rows" />
        </div>
      );
    case "numbers":
      return (
        <div className="space-y-1">
          {b.items.map((it, n) => (
            <div key={n} className="flex gap-1">
              <Input value={it.label} onChange={(e) => body({ ...b, items: b.items.map((x, j) => (j === n ? { ...x, label: e.target.value } : x)) })} placeholder="Label" aria-label="Label" />
              <Input type="number" value={it.value} onChange={(e) => body({ ...b, items: b.items.map((x, j) => (j === n ? { ...x, value: Number(e.target.value) } : x)) })} className="w-28" aria-label="Value" />
              <Input value={it.unit ?? ""} onChange={(e) => body({ ...b, items: b.items.map((x, j) => (j === n ? { ...x, unit: e.target.value } : x)) })} className="w-16" placeholder="%" aria-label="Unit" />
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => body({ ...b, items: b.items.filter((_, j) => j !== n) })}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          {b.items.length < 6 && (
            <Button size="sm" variant="ghost" onClick={() => body({ ...b, items: [...b.items, { label: "", value: 0 }] })}>
              <PlusIcon /> Number
            </Button>
          )}
        </div>
      );
    case "timeline":
      return (
        <Textarea
          value={b.items.map((i) => `${i.date} | ${i.label}${i.done ? " | done" : ""}`).join("\n")}
          onChange={(e) =>
            body({
              ...b,
              items: lines(e.target.value)
                .slice(0, 10)
                .map((l) => {
                  const [date = "", label = "", done = ""] = l.split("|").map((x) => x.trim());
                  return { date, label, done: /^done$/i.test(done) };
                }),
            })
          }
          rows={6}
          placeholder="When | What | done"
          aria-label="Timeline, one step per line"
        />
      );
    case "image":
      return (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <ImageIcon className="size-4" /> {b.src ? "Change picture" : "Choose a picture"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2_000_000) return toast.error("Use a picture under 2 MB.");
                const r = new FileReader();
                r.onload = () => body({ ...b, src: String(r.result) });
                r.readAsDataURL(f);
              }}
            />
          </label>
          <Input value={b.caption ?? ""} onChange={(e) => body({ ...b, caption: e.target.value })} placeholder="Caption" aria-label="Caption" />
        </div>
      );
    default:
      return null;
  }
}

export function DecksClient({ files: initialFiles, templates, defaultTemplate, workspace }: { files: SavedFile[]; templates: DeckTemplate[]; defaultTemplate: string; workspace: string }) {
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [deck, setDeck] = React.useState<Deck | null>(null);
  const [cur, setCur] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const t = templates.find((x) => x.id === deck?.template) ?? templates.find((x) => x.id === defaultTemplate) ?? templates[0]!;
  const setSlides = (slides: Slide[]) => deck && setDeck({ ...deck, slides });

  if (!deck)
    return (
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <FileShelf
          kind="deck"
          files={files}
          setFiles={setFiles}
          current={id}
          newLabel="New deck"
          onNew={() => setDeck(null)}
          onOpen={async (fid) => {
            const r = await getFileAction("deck", fid);
            if (!r.ok) return toast.error(r.error);
            const f = r.data as { id: string; data: Deck };
            setId(f.id);
            setDeck({ title: f.data.title ?? "Presentation", subtitle: f.data.subtitle ?? "", template: f.data.template ?? defaultTemplate, slides: f.data.slides ?? [] });
            setCur(0);
          }}
        />
        <div className="space-y-3">
          <p className="text-sm font-medium">Start from</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STARTERS.map((s) => (
              <button key={s.key} type="button" onClick={() => (setId(null), setDeck({ title: s.key === "blank" ? "Presentation" : s.label, subtitle: workspace, template: defaultTemplate, slides: s.slides() }), setCur(0))} className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.slides().length} slides</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  const s = deck.slides[cur];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDeck(null)}>
          ← Decks
        </Button>
        <Input value={deck.title} onChange={(e) => setDeck({ ...deck, title: e.target.value })} className="w-60 font-medium" aria-label="Deck title" />
        <Input value={deck.subtitle} onChange={(e) => setDeck({ ...deck, subtitle: e.target.value })} className="w-60" placeholder="Subtitle" aria-label="Subtitle" />
        <Select value={t.id} onValueChange={(v) => setDeck({ ...deck, template: v })}>
          <SelectTrigger className="w-48" aria-label="Design">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={busy === "save"}
            onClick={async () => {
              setBusy("save");
              const r = await saveFileAction("deck", { id: id ?? undefined, title: deck.title, data: deck });
              setBusy(null);
              if (!r.ok) return toast.error(r.error);
              const nid = r.data as string;
              setId(nid);
              setFiles([{ id: nid, title: deck.title, updated_at: new Date().toISOString() }, ...files.filter((f) => f.id !== nid)]);
              toast.success("Deck saved");
            }}
          >
            <SaveIcon /> Save
          </Button>
          <Button
            disabled={busy === "pptx" || !deck.slides.length}
            onClick={async () => {
              setBusy("pptx");
              try {
                await exportPowerPoint({ title: deck.title, subtitle: deck.subtitle, slides: deck.slides, template: t, workspace, fileName: deck.title });
              } catch {
                toast.error("The PowerPoint file could not be made.");
              }
              setBusy(null);
            }}
          >
            {busy === "pptx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} PowerPoint (.pptx)
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <ol className="max-h-[70vh] space-y-2 overflow-auto pr-1">
          <li>
            <Thumb s={{ key: "cover", group: "", title: deck.title, body: { kind: "section", subtitle: deck.subtitle }, say: "" }} t={t} title />
            <span className="text-[11px] text-muted-foreground">Cover</span>
          </li>
          {deck.slides.map((x, i) => (
            <li key={x.key}>
              <button type="button" className={cn("block w-full rounded ring-offset-2", i === cur && "ring-2 ring-primary")} onClick={() => setCur(i)} aria-label={`Slide ${i + 1}: ${x.title}`}>
                <Thumb s={x} t={t} />
              </button>
              <span className="text-[11px] text-muted-foreground">
                {i + 1}. {x.title}
              </span>
            </li>
          ))}
        </ol>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <Button
                key={k.kind}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const next = [...deck.slides.slice(0, cur + 1), make(k.kind), ...deck.slides.slice(cur + 1)];
                  setSlides(next);
                  setCur(Math.min(next.length - 1, cur + 1));
                }}
              >
                <PlusIcon className="size-3" /> {k.label}
              </Button>
            ))}
          </div>
          {s ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={s.title} onChange={(e) => setSlides(deck.slides.map((x, i) => (i === cur ? { ...x, title: e.target.value } : x)))} className="min-w-48 flex-1 font-medium" aria-label="Slide title" />
                  <Button size="icon" variant="ghost" aria-label="Move up" disabled={cur === 0} onClick={() => { const n = deck.slides.slice(); [n[cur - 1], n[cur]] = [n[cur]!, n[cur - 1]!]; setSlides(n); setCur(cur - 1); }}>
                    <ArrowUpIcon />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" disabled={cur >= deck.slides.length - 1} onClick={() => { const n = deck.slides.slice(); [n[cur + 1], n[cur]] = [n[cur]!, n[cur + 1]!]; setSlides(n); setCur(cur + 1); }}>
                    <ArrowDownIcon />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Duplicate slide" onClick={() => { setSlides([...deck.slides.slice(0, cur + 1), { ...structuredClone(s), key: key() }, ...deck.slides.slice(cur + 1)]); setCur(cur + 1); }}>
                    <CopyIcon />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Remove slide" onClick={() => { setSlides(deck.slides.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); }}>
                    <Trash2Icon />
                  </Button>
                </div>
                <SlideFields s={s} onChange={(ns) => setSlides(deck.slides.map((x, i) => (i === cur ? ns : x)))} />
                <Textarea value={s.note ?? ""} onChange={(e) => setSlides(deck.slides.map((x, i) => (i === cur ? { ...x, note: e.target.value } : x)))} rows={2} placeholder="Speaker notes" aria-label="Speaker notes" />
                <div className="mx-auto max-w-2xl">
                  <Thumb s={s} t={t} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Add a slide above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
