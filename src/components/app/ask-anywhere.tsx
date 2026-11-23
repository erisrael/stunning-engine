"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, MessageCircleQuestionIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { askQuestionAction } from "@/app/actions/collab";
import { getEligibleQuestionRecipientsAction } from "@/app/actions/question-routing";

type Target = { itemId: string | null; label: string; text: string };
type Person = { id: string; name: string; primaryRole: string };

// Right-click anywhere in the app: Ask a question about what is under the cursor (a work card, a row, a page). The
// question goes to someone the person may ask (src/server/question-routing.ts): for a team member that is their team,
// their own lead or head, or HR. Shift + right-click, text fields and places with their own menu keep the browser's.
export function AskAnywhere() {
  const pathname = usePathname();
  const [menu, setMenu] = React.useState<{ x: number; y: number; target: Target } | null>(null);
  const [ask, setAsk] = React.useState<Target | null>(null);
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [to, setTo] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.shiftKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (!el || !el.closest("main, [data-slot='sidebar-inset']")) return;
      if (el.closest("input, textarea, select, [contenteditable='true'], canvas, video, iframe, [data-slot='context-menu-trigger'], [data-no-ask]")) return;
      const link = el.closest<HTMLAnchorElement>("a[href^='/items/']");
      const card = el.closest<HTMLElement>("[data-item]");
      const m = (link?.getAttribute("href") ?? "").match(/^\/items\/([^/?#]+)/);
      const itemId = card?.dataset.item || m?.[1] || null;
      const holder = (card ?? link ?? el.closest<HTMLElement>("li, tr, article, [data-slot='card']")) as HTMLElement | null;
      const selected = window.getSelection()?.toString().trim() ?? "";
      const text = (selected || holder?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160);
      e.preventDefault();
      setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 100), target: { itemId, label: itemId ? "this part" : "this", text } });
    };
    const close = () => setMenu(null);
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const openAsk = async (t: Target) => {
    setMenu(null);
    setAsk(t);
    setQuestion("");
    if (!people) {
      const r = await getEligibleQuestionRecipientsAction();
      if (r.ok) setPeople((r.recipients ?? []) as Person[]);
      else toast.error(r.error ?? "Could not load who you can ask.");
    }
  };

  const send = async () => {
    if (!ask || !to || !question.trim()) return;
    setBusy(true);
    const r = await askQuestionAction({ itemId: ask.itemId, ownerId: to, question: question.trim(), contextType: ask.itemId ? "item" : "page", context: { path: pathname, about: ask.text || null } });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Question sent", { description: "It is in their Questions and your chat with them." });
    setAsk(null);
  };

  return (
    <>
      {menu && (
        <div role="menu" data-ask-menu className="fixed z-[80] min-w-52 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button role="menuitem" data-ask-open className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => openAsk(menu.target)}>
            <MessageCircleQuestionIcon className="size-4" /> Ask a question{menu.target.itemId ? " about this part" : ""}
          </button>
          {menu.target.text && (
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void navigator.clipboard?.writeText(menu.target.text);
                setMenu(null);
                toast.success("Copied");
              }}
            >
              <CopyIcon className="size-4" /> Copy text
            </button>
          )}
          <p className="px-2 pt-1 text-[11px] text-muted-foreground">Shift + right-click for the browser menu</p>
        </div>
      )}
      <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent data-ask-dialog>
          <DialogHeader>
            <DialogTitle>Ask a question</DialogTitle>
            <DialogDescription>{ask?.text ? `About: “${ask.text}”` : "About this page."} It goes to their Questions and your chat with them.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            Ask
            <select className="h-9 rounded-md border bg-background px-2" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Ask" data-ask-to>
              <option value="">{people ? (people.length ? "Choose a person" : "Nobody you can ask") : "Loading..."}</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Textarea rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" placeholder="What do you want to know?" data-ask-text />
          <p className="text-xs text-muted-foreground">Team members ask their team, their team lead or head, and HR. For Admin, use Feedback.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsk(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !to || !question.trim()} onClick={send} data-ask-send>
              Send question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
