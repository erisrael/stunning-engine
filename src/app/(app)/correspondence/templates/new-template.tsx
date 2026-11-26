"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createTemplateAction } from "@/app/actions/correspondence";
import { PAPER_SIZES } from "@/lib/corr-template";

export function NewTemplateButton({ templates }: { templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", description: "", size: "A4", copyOf: "" });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon /> New template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>Starts from the company letterhead (logo, colours, contacts), or as a copy of another template.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name (e.g. HR letters)" aria-label="Name" />
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What it is for" aria-label="Description" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} aria-label="Paper">
              {Object.entries(PAPER_SIZES).map(([k, p]) => <option key={k} value={k}>{p.label} ({p.w} × {p.h} mm)</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.copyOf} onChange={(e) => setF({ ...f, copyOf: e.target.value })} aria-label="Copy of">
              <option value="">From the company letterhead</option>
              {templates.map((t) => <option key={t.id} value={t.id}>Copy of {t.name}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button disabled={!f.name.trim()} onClick={async () => { const r = await createTemplateAction({ name: f.name, description: f.description, size: f.size, copyOf: f.copyOf || null }); if (!r.ok) return toast.error(r.error); router.push(`/correspondence/templates/${r.data as string}`); }}>
              Create and open the designer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
