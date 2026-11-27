"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BotIcon, CheckIcon, LinkIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { searchRecordsAction } from "@/app/actions/tools";
import type { LinkRef } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { SectionTabs } from "@/components/app/section-tabs";

// The tab row across the apps (hidden while the sidebar, which lists them, is open).
export function ToolsNav({ apps, active }: { apps: { key: string; label: string; href: string }[]; active: string }) {
  return <SectionTabs label="Tools" active={active} tabs={[{ key: "hub", label: "All tools", href: "/tools" }, ...apps]} />;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string, ext: string) => `${(s || "untitled").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "untitled"}.${ext}`;

// CSV with every cell quoted; cells that a spreadsheet would run as a formula (= + - @) get a leading apostrophe.
export function toCsv(headers: string[], rows: string[][]) {
  const cell = (v: string) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("The browser did not allow copying. Select the text and copy it.");
  }
}

// "Copy context for ChatGPT / Gemini / Claude": shows the Markdown, lets the person add a request, then copies it.
export function CopyAiButton({ build, label = "Copy context for AI", size = "sm" }: { build: (ask: string) => string; label?: string; size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [ask, setAsk] = React.useState("");
  const text = open ? build(ask) : "";
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <BotIcon /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Copy context for ChatGPT, Gemini or Claude</DialogTitle>
            <DialogDescription>Paste it into any AI chat, free or paid. Nothing is sent anywhere from here, and no API key is needed.</DialogDescription>
          </DialogHeader>
          <Textarea value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What should the AI do? (for example: Summarise what is late and draft a message to the team)" rows={2} />
          <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{text}</pre>
          <DialogFooter>
            <span className="mr-auto self-center text-xs text-muted-foreground">{text.length.toLocaleString()} characters</span>
            <Button
              onClick={async () => {
                await copyText(text, "Copied. Paste it into your AI chat.");
                setOpen(false);
              }}
            >
              <CheckIcon /> Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Hit = { id: string; code: string; title: string; teacher: string | null; stage: string | null };

// Links a note, task or reminder to a production item, found by its code, title or teacher.
export function RecordPicker({ value, onChange, disabled }: { value: LinkRef; onChange: (v: LinkRef) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await searchRecordsAction(q);
      setBusy(false);
      if (!r.ok) return setNote(r.error);
      setHits((r.data as Hit[]) ?? []);
      setNote((r.data as Hit[]).length ? null : "Nothing found (or outside what you can see).");
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value)
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
        <LinkIcon className="size-3 shrink-0" />
        <Link href={`/items/${value.id}`} className="truncate hover:underline">
          {value.label}
        </Link>
        {!disabled && (
          <button type="button" aria-label="Remove link" onClick={() => onChange(null)} className="rounded p-0.5 hover:bg-muted">
            <XIcon className="size-3" />
          </button>
        )}
      </span>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="h-7 text-xs">
          <LinkIcon /> Link to a record
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, title or teacher" className="h-8 pl-7" />
          {busy && <Loader2Icon className="absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <ul className="mt-2 max-h-64 overflow-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange({ kind: "item", id: h.id, label: `${h.code} · ${h.title}${h.teacher ? ` (${h.teacher})` : ""}` });
                  setOpen(false);
                  setQ("");
                }}
              >
                <span className="font-mono text-xs">{h.code}</span> {h.title}
                <span className="block text-xs text-muted-foreground">{[h.teacher, h.stage].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
        {note && <p className="px-2 py-1 text-xs text-muted-foreground">{note}</p>}
      </PopoverContent>
    </Popover>
  );
}

// Opens the saved file named in the address (?file=…), once: links from the Claude and ChatGPT connectors and from
// elsewhere in the app land on the file itself.
export function useOpenFromLink(open: (id: string) => void) {
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    const id = new URLSearchParams(window.location.search).get("file");
    if (id && /^[\w-]{3,64}$/.test(id)) open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
