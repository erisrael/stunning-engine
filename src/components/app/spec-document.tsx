"use client";

// A document from Specs and docs as a company document: the header with the logo and name, the document control
// table, the contents and the formatted Markdown (src/lib/spec-doc.ts, shared with the PDF and HTML export).

import * as React from "react";
import { useRouter } from "next/navigation";
import { SPEC_CSS, specArticleHtml, type SpecDocInput } from "@/lib/spec-doc";
import { cn } from "@/lib/utils";
import { useDiagrams } from "./diagrams";

export function SpecDocument({ doc, className, editable = false }: { doc: SpecDocInput; className?: string; editable?: boolean }) {
  const router = useRouter();
  const html = React.useMemo(() => specArticleHtml(doc), [doc]);
  const box = React.useRef<HTMLDivElement>(null);
  // Mermaid diagrams drawn as pictures; draw.io pictures open in draw.io for people who may edit.
  const editor = useDiagrams(box, html, editable);
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    // Another document in the library opens here, without leaving the page.
    const to = a.getAttribute("data-doc-link");
    if (to) {
      e.preventDefault();
      router.push(to);
      return;
    }
    // The contents scroll to the section instead of changing the address.
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      e.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  return (
    <>
      <style href="myseed-spec-doc" precedence="medium">
        {SPEC_CSS}
      </style>
      <div ref={box} className={cn("min-w-0", className)} data-spec-doc onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {editor}
    </>
  );
}
