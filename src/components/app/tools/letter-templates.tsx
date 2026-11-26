"use client";

// Choosing a kind of letter from the library (Tools and Correspondence): search, groups, and a look at the text.

import * as React from "react";
import { BookTextIcon, SearchIcon, SignatureIcon, StampIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LETTER_GROUPS, LETTER_LIBRARY, type LetterTemplate } from "@/lib/letter-library";
import { cn } from "@/lib/utils";

export function LetterTemplatePicker({ onPick, label = "Choose a kind of letter", size = "sm", variant = "outline" }: { onPick: (t: LetterTemplate) => void; label?: string; size?: "sm" | "default"; variant?: "outline" | "default" | "secondary" }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [group, setGroup] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<LetterTemplate | null>(null);
  const list = LETTER_LIBRARY.filter((t) => (!group || t.group === group) && (!q || `${t.label} ${t.hint} ${t.group} ${t.subject}`.toLowerCase().includes(q.toLowerCase())));
  const shown = hover ?? list[0] ?? null;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <BookTextIcon /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Letter templates</DialogTitle>
            <DialogDescription>{LETTER_LIBRARY.length} kinds of letter, each with its subject, wording and the details it needs. Picking one fills the letter; everything stays editable.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: offer, warning, invitation, tax, የሥራ ልምድ…" className="pl-8" autoFocus />
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={cn("rounded-full border px-2.5 py-0.5 text-xs", !group && "border-primary bg-primary/10 text-primary")} onClick={() => setGroup(null)}>
              All
            </button>
            {LETTER_GROUPS.map((g) => (
              <button key={g} type="button" className={cn("rounded-full border px-2.5 py-0.5 text-xs", group === g && "border-primary bg-primary/10 text-primary")} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          <div className="grid max-h-[60vh] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <ul className="space-y-1 overflow-y-auto pr-1">
              {list.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setHover(t)}
                    onFocus={() => setHover(t)}
                    onClick={() => (onPick(t), setOpen(false))}
                    className={cn("w-full rounded-md border px-3 py-2 text-left hover:border-primary hover:bg-primary/5", shown?.key === t.key && "border-primary/60")}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.label}
                      {t.needsSignature && <SignatureIcon className="size-3.5 text-muted-foreground" aria-label="Signed" />}
                      {t.needsStamp && <StampIcon className="size-3.5 text-muted-foreground" aria-label="Stamped" />}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t.group} · {t.hint}
                    </span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="p-4 text-sm text-muted-foreground">No letter matches.</li>}
            </ul>
            {shown && (
              <div className="hidden overflow-y-auto rounded-md border bg-white p-5 text-[12.5px] leading-relaxed text-slate-900 shadow-sm md:block">
                <p className="mb-3 font-bold underline underline-offset-2">Subject: {shown.subject}</p>
                <p className="mb-2">{shown.salutation}</p>
                {shown.body.split(/\n\s*\n/).map((p, i) => (
                  <p key={i} className="mb-2 whitespace-pre-line">
                    {p.split(/(\{\{[a-z0-9_]+\}\})/gi).map((part, j) => (/^\{\{/.test(part) ? <mark key={j} className="rounded bg-amber-100 px-0.5 text-amber-900">{shown.fields.find((f) => `{{${f.key}}}` === part)?.label ?? part.replace(/[{}]/g, "").replace(/_/g, " ")}</mark> : part))}
                  </p>
                ))}
                <p className="mt-3">{shown.closing}</p>
                <p className="mt-4 text-xs text-slate-500">Asks for: {shown.fields.map((f) => f.label).join(", ") || "nothing extra"}.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
