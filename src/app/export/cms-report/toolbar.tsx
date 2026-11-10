"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Not printed: back, orientation, and Save as PDF (the browser's print dialog).
export function CmsReportToolbar({ fileTitle, landscape, note }: { fileTitle: string; landscape: boolean; note?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  React.useEffect(() => {
    document.title = fileTitle;
  }, [fileTitle]);
  const setOrientation = (v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("orientation", v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-[#292d34] shadow-sm">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/legacy-cms?view=reports">
          <ArrowLeftIcon /> Back to reports
        </Link>
      </Button>
      <div className="flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Orientation">
        {[
          ["portrait", "Portrait"],
          ["landscape", "Landscape"],
        ].map(([v, l]) => {
          const on = (v === "landscape") === landscape;
          return (
            <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setOrientation(v)} className={`rounded px-2.5 py-1 ${on ? "bg-[#074924] text-white" : "text-[#656f7d]"}`}>
              {l}
            </button>
          );
        })}
      </div>
      <span className="ml-auto text-xs text-[#656f7d]">{note ?? "In the print dialog choose Save as PDF, margins Default, Background graphics on."}</span>
      <Button size="sm" onClick={() => window.print()}>
        <PrinterIcon /> Save as PDF
      </Button>
    </div>
  );
}
