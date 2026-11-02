"use client";

// The banner at the top of a section's main page (Admin, Branding): a picture, or a colour with a title and a line.
import { usePathname } from "next/navigation";
import type { BannerView } from "@/server/branding";

export function SectionBanner({ banners }: { banners: BannerView[] }) {
  const pathname = usePathname();
  const b = banners.find((x) => x.path === pathname);
  if (!b) return null;
  const bg = b.image ? `center / cover no-repeat url("${b.image}")` : b.color?.startsWith("#") ? `linear-gradient(120deg, ${b.color}, ${b.color}cc)` : undefined;
  return (
    <div
      className="no-print relative mb-4 flex min-h-24 items-end overflow-hidden rounded-2xl border px-5 py-4 sm:min-h-32"
      style={{ background: bg ?? "linear-gradient(120deg, var(--primary), color-mix(in oklab, var(--primary) 55%, #000))" }}
      data-section-banner={b.key}
    >
      {(b.title || b.text) && (
        <div className={b.image ? "rounded-xl bg-black/45 px-3 py-2 text-white backdrop-blur-sm" : "text-white"}>
          {b.title && <p className="text-lg font-semibold sm:text-xl">{b.title}</p>}
          {b.text && <p className="text-sm opacity-90">{b.text}</p>}
        </div>
      )}
    </div>
  );
}
