"use client";

// The "Prompt" button on a task: the task as a ready prompt for an AI coding assistant, made in the app from the
// task, its specs and the team's rules, with no AI key (src/server/task-prompt.ts). Copy it, or download it.

import * as React from "react";
import { toast } from "sonner";
import { CopyIcon, DownloadIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { taskPromptAction } from "@/app/actions/departments";

const STYLES = [
  { key: "agent", label: "Coding agent (full)" },
  { key: "short", label: "Short" },
  { key: "review", label: "Code review" },
] as const;

export function TaskPromptButton({ dept, taskId, code }: { dept: string; taskId: string; code: string }) {
  const [open, setOpen] = React.useState(false);
  const [style, setStyle] = React.useState<(typeof STYLES)[number]["key"]>("agent");
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setText(null);
    void taskPromptAction(dept, taskId, style).then((r) => (r.ok ? setText(r.data as string) : (toast.error(r.error), setOpen(false))));
  }, [open, style, dept, taskId]);
  const copy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text).then(() => toast.success("Prompt copied"), () => toast.error("Copy it from the box"));
  };
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)} data-task-prompt={code}>
        <SparklesIcon className="size-3.5" /> Prompt
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-3xl" data-task-prompt-dialog>
            <DialogHeader>
              <DialogTitle>Prompt for {code}</DialogTitle>
              <DialogDescription>Made from the task, its specs and the team&apos;s rules, in the app. No AI key is used and nothing leaves the app until you paste it.</DialogDescription>
            </DialogHeader>
            <div className="inline-flex w-fit rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Kind of prompt">
              {STYLES.map((s) => (
                <button key={s.key} type="button" aria-pressed={style === s.key} onClick={() => setStyle(s.key)} className={cn("rounded px-2.5 py-1 text-xs font-medium text-muted-foreground", style === s.key && "bg-background text-foreground shadow-sm")}>
                  {s.label}
                </button>
              ))}
            </div>
            {text === null ? <Loader2Icon className="animate-spin" /> : <Textarea value={text} readOnly rows={20} className="font-mono text-xs" aria-label="Prompt" />}
            <div className="flex gap-2">
              <Button size="sm" disabled={!text} onClick={copy} className="gap-1.5">
                <CopyIcon className="size-3.5" /> Copy
              </Button>
              <Button size="sm" variant="outline" disabled={!text} className="gap-1.5" onClick={() => {
                const url = URL.createObjectURL(new Blob([text ?? ""], { type: "text/markdown" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `${code}-prompt.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <DownloadIcon className="size-3.5" /> Download (.md)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
