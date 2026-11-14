"use client";

// Search settings (Admin): every settings screen by its name, what it holds and the words people use; "/" focuses it.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ADMIN_INDEX, searchAdmin, type AdminEntry } from "@/lib/admin-index";
import { cn } from "@/lib/utils";

const hrefOf = (e: AdminEntry) => e.href ?? `/admin?tab=${e.tab}`;

export function AdminSearch({ rights }: { rights: { users: boolean; data: boolean; settings: boolean } }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [at, setAt] = React.useState(0);
  const ref = React.useRef<HTMLInputElement>(null);
  const list = React.useMemo(() => ADMIN_INDEX.filter((e) => e.need === "any" || rights[e.need]), [rights]);
  const hits = React.useMemo(() => searchAdmin(q, list).slice(0, 8), [q, list]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (e: AdminEntry) => {
    setOpen(false);
    setQ("");
    router.push(hrefOf(e));
  };
  return (
    <div className="relative w-full sm:w-80" data-admin-search>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={ref}
        role="combobox"
        aria-expanded={open && !!q}
        aria-controls="admin-search-results"
        aria-label="Search settings"
        placeholder="Search settings (press /)"
        className="pl-8"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(hits.length - 1, i + 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
          else if (e.key === "Enter" && hits[at]) (e.preventDefault(), go(hits[at]!));
          else if (e.key === "Escape") (setOpen(false), ref.current?.blur());
        }}
      />
      {open && q.trim() && (
        <div id="admin-search-results" role="listbox" className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg sm:w-[26rem]">
          {!hits.length && <p className="p-3 text-sm text-muted-foreground">No settings match “{q}”.</p>}
          {hits.map((e, i) => (
            <Link
              key={hrefOf(e)}
              href={hrefOf(e)}
              role="option"
              aria-selected={i === at}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => (setOpen(false), setQ(""))}
              onMouseEnter={() => setAt(i)}
              className={cn("block border-b px-3 py-2 last:border-b-0", i === at && "bg-muted")}
              data-admin-hit={e.label}
            >
              <span className="block text-sm font-medium">
                {e.label} <span className="text-xs font-normal text-muted-foreground">· {e.group}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">{e.description}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// The open screen's title and what it holds, above its cards.
export function AdminSectionHead({ tab }: { tab: string }) {
  const e = ADMIN_INDEX.find((x) => x.tab === tab);
  if (!e) return null;
  return (
    <div className="space-y-0.5" data-admin-section={tab}>
      <h2 className="text-base font-semibold">{e.label}</h2>
      <p className="text-sm text-muted-foreground">{e.description}</p>
    </div>
  );
}
