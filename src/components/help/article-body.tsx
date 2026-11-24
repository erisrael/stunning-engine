"use client";

// A help article or how-to guide for customers (help center page and the support widget): the text, numbered steps,
// and YouTube videos shown as a thumbnail that becomes the player when pressed (nothing loads from YouTube before).
// A guide can have one video for all its steps: it stays at the top while reading, and each step's time button plays
// it from that step's part.
import * as React from "react";
import { PlayIcon } from "lucide-react";
import { MiniMarkdown } from "@/lib/mini-markdown";

export type PublicVideo = { id: string; title: string | null; url: string; thumbnail: string; embed: string };
export type PublicArticle = { id: string; kind: "article" | "guide"; title: string; category: string | null; updated_at: string; body: string; intro: string; video: PublicVideo | null; steps: { title: string; body: string; video: PublicVideo | null; at?: number | null }[] };

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/** `seek` plays from a moment (seconds); a new `seek.n` jumps again even to the same moment. */
export function YouTube({ v, seek = null }: { v: PublicVideo; seek?: { at: number; n: number } | null }) {
  const [play, setPlay] = React.useState(false);
  React.useEffect(() => {
    if (seek) setPlay(true);
  }, [seek]);
  return (
    <div className="overflow-hidden rounded-lg border bg-black" data-youtube={v.id}>
      {play ? (
        <iframe
          key={seek ? `${seek.at}-${seek.n}` : "start"}
          className="aspect-video w-full"
          src={`${v.embed}?autoplay=1&rel=0&playsinline=1&modestbranding=1${seek ? `&start=${seek.at}` : ""}`}
          title={v.title ?? "Video"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
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
  const [seek, setSeek] = React.useState<{ at: number; n: number } | null>(null);
  const player = React.useRef<HTMLDivElement>(null);
  const playFrom = (at: number) => {
    setSeek((cur) => ({ at, n: (cur?.n ?? 0) + 1 }));
    player.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  // A guide's one video stays in view while its steps scroll (on the phone and in Telegram too).
  const sticky = a.kind === "guide" && !!a.video && a.steps.some((s) => s.at != null && !s.video);
  return (
    <div className={compact ? "space-y-3 text-sm" : "space-y-5 text-base"} data-article-body={a.kind}>
      {(a.kind === "guide" ? a.intro : a.body) && <MiniMarkdown text={a.kind === "guide" ? a.intro : a.body} />}
      {a.video && (
        <div ref={player} className={sticky ? "sticky top-0 z-10 -mx-1 bg-background/80 px-1 pb-1 backdrop-blur" : undefined} data-guide-player={sticky ? "" : undefined}>
          <YouTube v={a.video} seek={seek} />
        </div>
      )}
      {a.kind === "guide" && (
        <ol className="space-y-4" data-guide-steps>
          {a.steps.map((s, i) => (
            <li key={i} className="flex gap-3" data-guide-step={i + 1}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{s.title}</p>
                {s.body && <MiniMarkdown text={s.body} />}
                {s.video ? (
                  <YouTube v={s.video} />
                ) : a.video && s.at != null ? (
                  <button
                    type="button"
                    onClick={() => playFrom(s.at!)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition active:scale-95"
                    aria-label={`Play this step in the video, from ${clock(s.at)}`}
                    data-step-play={s.at}
                  >
                    <PlayIcon className="size-3.5 fill-current" aria-hidden /> {clock(s.at)}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
