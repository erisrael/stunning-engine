"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportTemplate } from "@/lib/dev-import-templates";

export function ImportTemplateButton({ template, label = "Download template", hint }: { template: ImportTemplate; label?: string; hint?: string }) {
  return <Button type="button" size="sm" variant="outline" title={hint ?? "Download, replace the example content, then import the file."} onClick={() => {
    const url = URL.createObjectURL(new Blob([template.text], { type: template.mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = template.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}><DownloadIcon /> {label}</Button>;
}
