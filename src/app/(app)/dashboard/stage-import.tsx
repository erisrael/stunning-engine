"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImportWizard, type TemplateInfo } from "../import-export/import-wizard";

// "Import my work" on a team dashboard: the team's own progress template in the import wizard.
export function StageImport({ template, stageLabel }: { template: TemplateInfo; stageLabel: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UploadIcon /> Import my work
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import {stageLabel.toLowerCase()} work done so far</DialogTitle>
            <DialogDescription>
              Download the template (or My parts, already listing what is waiting for you), fill it in, then upload it. You review every row before anything is saved.
            </DialogDescription>
          </DialogHeader>
          <ImportWizard templates={[template]} title={template.title} className="py-0 ring-0 [--card-spacing:0]" />
        </DialogContent>
      </Dialog>
    </>
  );
}
