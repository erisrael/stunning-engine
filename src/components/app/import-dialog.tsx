"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImportWizard, type TemplateInfo } from "@/app/(app)/import-export/import-wizard";

// The import wizard in a dialog, limited to the templates that fit the page it is opened from.
export function ImportDialog({ templates, label, title, description }: { templates: TemplateInfo[]; label: string; title: string; description: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UploadIcon /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ImportWizard templates={templates} title={templates.length === 1 ? templates[0].title : "Choose what to import"} className="py-0 ring-0 [--card-spacing:0]" />
        </DialogContent>
      </Dialog>
    </>
  );
}
