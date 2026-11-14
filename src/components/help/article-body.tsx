"use client";

// A help article or how-to guide for customers (help center page and the support widget): the text, numbered steps,
// and YouTube videos shown as a thumbnail that becomes the player when pressed (nothing loads from YouTube before).
import * as React from "react";
import { PlayIcon } from "lucide-react";
import { MiniMarkdown } from "@/lib/mini-markdown";

export type PublicVideo = { id: string; title: string | null; url: string; thumbnail: string; embed: string };
export type PublicArticle = { id: string; kind: "article" | "guide"; title: string; category: string | null; updated_at: string; body: string; intro: string; video: PublicVideo | null; steps: { title: string; body: string; video: PublicVideo | null }[] };

export function YouTube({ v }: { v: PublicVideo }) {
  const [play, setPlay] = React.useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-black" data-youtube={v.id}>
      {play ? (
        <iframe className="aspect-video w-full" src={`${v.embed}?autoplay=1&rel=0`} title={v.title ?? "Video"} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <button type="button" className="group relative block aspect-video w-full" onClick={() => setPlay(true)} aria-label={`Play ${v.title ?? "the video"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumbnail} alt="" className="size-full object-cover opacity-90 group-hover:opacity-100" loading="lazy" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white">
              <PlayIcon className="size-6 fill-current" aria-hidden />
            </span>
          </span>
          {v.title && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-3 py-1.5 text-left text-xs text-white">{v.title}</span>}
        </button>
      )}
    </div>
  );
}

export function ArticleBody({ a, compact = false }: { a: PublicArticle; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3 text-sm" : "space-y-5 text-base"} data-article-body={a.kind}>
      {(a.kind === "guide" ? a.intro : a.body) && <MiniMarkdown text={a.kind === "guide" ? a.intro : a.body} />}
      {a.video && <YouTube v={a.video} />}
      {a.kind === "guide" && (
        <ol className="space-y-4" data-guide-steps>
          {a.steps.map((s, i) => (
            <li key={i} className="flex gap-3" data-guide-step={i + 1}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{s.title}</p>
                {s.body && <MiniMarkdown text={s.body} />}
                {s.video && <YouTube v={s.video} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
