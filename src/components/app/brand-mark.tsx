import { MyseedLogo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

// The site's logo: the picture Admin uploaded (Branding), or the Myseed mark.
export function BrandMark({ logo, version, className }: { logo: boolean; version?: string; className?: string }) {
  if (!logo) return <MyseedLogo className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- a small picture from the database
  return <img src={`/api/branding/logo?v=${version ?? "0"}`} alt="" className={cn("shrink-0 object-contain", className)} />;
}
