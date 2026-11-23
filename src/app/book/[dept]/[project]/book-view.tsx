"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, DownloadIcon, Loader2Icon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { drawDiagrams } from "@/components/app/diagrams";

// The book on screen, with Print / Save as PDF once its diagrams are drawn.
export function BookView({ html, back, title }: { html: string; back: string; title: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current) return;
    void drawDiagrams(ref.current).finally(() => setReady(true));
  }, [html]);
  const saveHtml = () => {
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "")}</title><style>${css}</style></head><body>${ref.current?.outerHTML ?? ""}</body></html>`], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w-]+/g, "-")}.html`;
    a.click();
  };
  return (
    <div className="min-h-screen bg-[#eceef2] py-6 print:bg-white print:py-0">
      <div className="book-tools sticky top-0 z-10 mx-auto mb-4 flex max-w-[860px] flex-wrap items-center gap-2 rounded-xl border bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
        <Button size="sm" variant="ghost" asChild>
          <Link href={back}>
            <ArrowLeftIcon /> Roadmap
          </Link>
        </Button>
        <span className="mr-auto truncate text-sm font-medium text-neutral-700">{title}</span>
        <Button size="sm" variant="outline" onClick={saveHtml} disabled={!ready}>
          <DownloadIcon /> HTML
        </Button>
        <Button size="sm" onClick={() => window.print()} disabled={!ready} data-book-print>
          {ready ? <PrinterIcon /> : <Loader2Icon className="animate-spin" />} Print or save as PDF
        </Button>
      </div>
      <article ref={ref} className="book bg-white shadow-sm print:shadow-none" data-book dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
